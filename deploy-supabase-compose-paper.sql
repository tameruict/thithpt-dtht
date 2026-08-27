-- ============================================================================
-- DEPLOY: Dựng đề từ ngân hàng (Phase D) — 3 RPC compose_*
--
-- Cách chạy: Supabase Dashboard > SQL Editor > New query > dán > Run.
-- An toàn: chỉ tạo hàm mới (create or replace), không đụng dữ liệu.
-- Bật trang /admin/compose: gắn/gỡ câu ngân hàng vào paper nháp.
--
-- Các hàm map câu -> section theo (blueprint_id, question_type), chỉ cho phép
-- sửa paper.status='draft'; insert vẫn đi qua trigger
-- ensure_exam_room_question_matches_blueprint sẵn có.
-- ============================================================================

create or replace function private.compose_paper_json(p_paper_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $function$
  select jsonb_build_object(
    'paper', (
      select jsonb_build_object(
        'id', p.id,
        'label', coalesce(p.label, p.paper_code),
        'status', p.status::text,
        'subjectCode', r.subject_code,
        'roomName', r.name,
        'blueprintId', p.blueprint_id
      )
      from public.exam_room_papers p
      join public.exam_rooms r on r.id = p.exam_room_id
      where p.id = p_paper_id
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sectionId', s.id,
          'sectionCode', s.section_code,
          'title', s.title,
          'type', s.question_type::text,
          'displayedCount', s.displayed_question_count,
          'placedCount', (
            select count(*)
            from public.exam_room_questions q
            where q.paper_id = p_paper_id and q.blueprint_section_id = s.id
          ),
          'questions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'questionId', qq.id,
                'code', qq.code,
                'difficulty', qq.difficulty,
                'content', left(qq.content, 240),
                'seq', erq.seq
              ) order by erq.seq
            )
            from public.exam_room_questions erq
            join public.questions qq on qq.id = erq.question_id
            where erq.paper_id = p_paper_id and erq.blueprint_section_id = s.id
          ), '[]'::jsonb)
        ) order by s.seq
      )
      from public.exam_blueprint_sections s
      where s.blueprint_id = (
        select blueprint_id from public.exam_room_papers where id = p_paper_id
      )
    ), '[]'::jsonb)
  );
$function$;

revoke all on function private.compose_paper_json(uuid) from public, anon;

create or replace function public.get_paper_composition(p_paper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;
  return private.compose_paper_json(p_paper_id);
end;
$function$;

create or replace function public.compose_add_questions(
  p_paper_id uuid,
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_room_id uuid;
  v_blueprint_id uuid;
  v_status text;
  v_subject text;
  v_qid uuid;
  v_type public.question_type;
  v_qsubject text;
  v_section_id uuid;
  v_seq int;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select p.exam_room_id, p.blueprint_id, p.status::text, r.subject_code
    into v_room_id, v_blueprint_id, v_status, v_subject
  from public.exam_room_papers p
  join public.exam_rooms r on r.id = p.exam_room_id
  where p.id = p_paper_id;

  if v_room_id is null then
    raise exception 'PAPER_NOT_FOUND';
  end if;
  if v_status <> 'draft' then
    raise exception 'PAPER_IS_IMMUTABLE';
  end if;

  foreach v_qid in array coalesce(p_question_ids, array[]::uuid[])
  loop
    select q.type, q.subject_code into v_type, v_qsubject
    from public.questions q where q.id = v_qid;

    if v_type is null then continue; end if;
    if v_qsubject <> v_subject then continue; end if;

    if exists (
      select 1 from public.exam_room_questions e
      where e.paper_id = p_paper_id and e.question_id = v_qid
    ) then
      continue;
    end if;

    select s.id into v_section_id
    from public.exam_blueprint_sections s
    where s.blueprint_id = v_blueprint_id
      and s.question_type = v_type
    order by s.seq
    limit 1;

    if v_section_id is null then continue; end if;

    select coalesce(max(e.seq), 0) + 1 into v_seq
    from public.exam_room_questions e
    where e.paper_id = p_paper_id and e.blueprint_section_id = v_section_id;

    insert into public.exam_room_questions (
      exam_room_id, paper_id, blueprint_section_id, question_id, seq, is_required
    )
    values (
      v_room_id, p_paper_id, v_section_id, v_qid, v_seq, true
    )
    on conflict do nothing;
  end loop;

  return private.compose_paper_json(p_paper_id);
end;
$function$;

create or replace function public.compose_remove_question(
  p_paper_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_status text;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select p.status::text into v_status
  from public.exam_room_papers p where p.id = p_paper_id;

  if v_status is null then
    raise exception 'PAPER_NOT_FOUND';
  end if;
  if v_status <> 'draft' then
    raise exception 'PAPER_IS_IMMUTABLE';
  end if;

  delete from public.exam_room_questions
  where paper_id = p_paper_id and question_id = p_question_id;

  return private.compose_paper_json(p_paper_id);
end;
$function$;

revoke all on function public.get_paper_composition(uuid) from public, anon;
revoke all on function public.compose_add_questions(uuid, uuid[]) from public, anon;
revoke all on function public.compose_remove_question(uuid, uuid) from public, anon;
grant execute on function public.get_paper_composition(uuid) to authenticated;
grant execute on function public.compose_add_questions(uuid, uuid[]) to authenticated;
grant execute on function public.compose_remove_question(uuid, uuid) to authenticated;

notify pgrst, 'reload schema';
-- ============================================================================
-- HẾT. Sau khi Run: vào /admin/compose, chọn 1 paper nháp, lọc ngân hàng,
-- tick câu -> "Thêm vào đề". Lỗi gì gửi nguyên văn.
-- ============================================================================
