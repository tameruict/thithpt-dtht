-- ============================================================================
-- DEPLOY PHẦN A (AN TOÀN — chỉ thêm mới) — Web thi THPT, 2026-07-26
--
-- File này KHÔNG có Phần B (không đụng hàm chấm điểm đang chạy trên remote).
-- Bằng chứng: remote đã có sẵn score_exam_session -> KHÔNG cần vá GĐ0.
--
-- Có "drop ... if exists" trước mỗi hàm/view để tránh lỗi 42P13 "cannot change
-- return type" nếu remote đã có hàm cùng tên (do drift). An toàn vì các hàm/view
-- này chỉ được frontend gọi qua RPC, không có object DB nào phụ thuộc.
--
-- Cách chạy: Supabase Dashboard > SQL Editor > New query > dán > Run.
-- Bật: dashboard kết quả thi, quản lý phòng thi, chấm tự luận, log chống gian lận.
-- ============================================================================

-- 1) Cột phụ trợ -------------------------------------------------------------
alter table public.exam_sessions
  add column if not exists scored_at timestamptz;

alter table public.exam_sessions
  add column if not exists violation_count integer not null default 0;


-- 2) record_session_event(): log rời tab / thoát toàn màn hình ---------------
drop function if exists public.record_session_event(uuid, text);
create function public.record_session_event(
  p_session_id uuid,
  p_type text default 'tab_switch'
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student uuid;
  v_status text;
  v_count integer;
begin
  select s.student_id, s.status::text
    into v_student, v_status
  from public.exam_sessions s
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_student <> (select auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status <> 'in_progress' then
    return null;
  end if;

  update public.exam_sessions
     set violation_count = violation_count + 1,
         client_info = client_info || jsonb_build_object(
           'last_event',
           jsonb_build_object('type', coalesce(nullif(trim(p_type), ''), 'tab_switch'), 'at', now())
         ),
         updated_at = now()
   where id = p_session_id
   returning violation_count into v_count;

  return v_count;
end;
$function$;

revoke all on function public.record_session_event(uuid, text) from public, anon;
grant execute on function public.record_session_event(uuid, text) to authenticated;


-- 3) get_exam_results(): dashboard kết quả (kèm violation_count) --------------
drop function if exists public.get_exam_results(text, uuid, text, integer);
create function public.get_exam_results(
  p_subject_code text default null,
  p_exam_room_id uuid default null,
  p_status text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_subject text := nullif(trim(p_subject_code), '');
  v_status text := nullif(trim(p_status), '');
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last, r.started_at desc),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      s.id                            as session_id,
      s.student_id                    as student_id,
      st.full_name                    as student_name,
      st.school_name                  as school_name,
      s.exam_room_id                  as exam_room_id,
      rm.name                         as room_name,
      rm.code                         as room_code,
      rm.subject_code                 as subject_code,
      sub.name                        as subject_name,
      s.attempt_number                as attempt_number,
      s.status::text                  as status,
      s.score                         as score,
      s.max_score                     as max_score,
      s.violation_count               as violation_count,
      s.started_at                    as started_at,
      s.submitted_at                  as submitted_at,
      s.scored_at                     as scored_at,
      (s.client_info ->> 'finalized') as finalized
    from public.exam_sessions s
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = s.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where (v_subject is null or rm.subject_code = v_subject)
      and (p_exam_room_id is null or s.exam_room_id = p_exam_room_id)
      and (v_status is null or s.status::text = v_status)
    order by s.submitted_at desc nulls last, s.started_at desc
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_exam_results(text, uuid, text, integer) from public, anon;
grant execute on function public.get_exam_results(text, uuid, text, integer) to authenticated;


-- 4) admin_exam_room_summary: view quản lý phòng thi -------------------------
drop view if exists public.admin_exam_room_summary;
create view public.admin_exam_room_summary
with (security_invoker = true) as
select
  er.id,
  er.code,
  er.name,
  er.subject_code,
  sub.name                as subject_name,
  er.blueprint_id,
  bp.code                 as blueprint_code,
  bp.name                 as blueprint_name,
  er.duration_minutes,
  er.status,
  er.price_vnd,
  er.total_attempts_default,
  er.starts_at,
  er.ends_at,
  er.published_at,
  er.created_at,
  (select count(*) from public.exam_room_papers p where p.exam_room_id = er.id)     as paper_count,
  (select count(*) from public.exam_room_questions q where q.exam_room_id = er.id)   as question_count
from public.exam_rooms er
left join public.subjects sub on sub.code = er.subject_code
left join public.exam_blueprints bp on bp.id = er.blueprint_id
where private.is_staff();

grant select on public.admin_exam_room_summary to authenticated;


-- 5) Chấm tự luận: get_pending_essays + grade_essay_answer -------------------
drop function if exists public.get_pending_essays(integer);
create function public.get_pending_essays(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      sa.id                                             as answer_id,
      esq.session_id                                    as session_id,
      st.full_name                                      as student_name,
      rm.name                                           as room_name,
      sub.name                                          as subject_name,
      coalesce(esq.display_no, esq.question_seq::text)  as display_no,
      esq.max_points                                    as max_points,
      q.content                                         as question_content,
      coalesce(sa.short_answer_text, sa.answer_json ->> 'value') as student_answer,
      sa.earned_points                                  as earned_points,
      s.submitted_at                                    as submitted_at
    from public.session_answers sa
    join public.exam_session_questions esq on esq.id = sa.session_question_id
    join public.exam_sessions s on s.id = esq.session_id
    join public.questions q on q.id = esq.question_id
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = sa.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where q.type = 'essay'
      and s.status = 'submitted'
      and coalesce(sa.grader ->> 'type', 'pending') <> 'manual'
    order by s.submitted_at desc nulls last
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_pending_essays(integer) from public, anon;
grant execute on function public.get_pending_essays(integer) to authenticated;

drop function if exists public.grade_essay_answer(uuid, numeric);
create function public.grade_essay_answer(p_answer_id uuid, p_points numeric)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session_id uuid;
  v_max_points numeric;
  v_q_type text;
  v_total numeric;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  if p_points is null or p_points < 0 then
    raise exception 'INVALID_POINTS';
  end if;

  select esq.session_id, esq.max_points, q.type::text
    into v_session_id, v_max_points, v_q_type
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  join public.questions q on q.id = esq.question_id
  where sa.id = p_answer_id;

  if v_session_id is null then
    raise exception 'ANSWER_NOT_FOUND';
  end if;

  if v_q_type <> 'essay' then
    raise exception 'NOT_AN_ESSAY';
  end if;

  if p_points > v_max_points then
    raise exception 'POINTS_EXCEED_MAX';
  end if;

  update public.session_answers
     set earned_points = p_points,
         is_correct = (p_points >= v_max_points),
         grader = jsonb_build_object('type', 'manual', 'by', (select auth.uid()), 'at', now()),
         updated_at = now()
   where id = p_answer_id;

  select coalesce(sum(sa.earned_points), 0)
    into v_total
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  where esq.session_id = v_session_id;

  update public.exam_sessions
     set score      = v_total,
         scored_at  = now(),
         updated_at = now()
   where id = v_session_id;

  return v_total;
end;
$function$;

revoke all on function public.grade_essay_answer(uuid, numeric) from public, anon;
grant execute on function public.grade_essay_answer(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- HẾT PHẦN A. KHÔNG chạy Phần B (remote đã có score_exam_session).
-- Sau khi chạy: vào /admin (admin/teacher) kiểm tra Kết quả thi / Phòng thi /
-- Chấm tự luận. Lỗi gì gửi lại nguyên văn để đối chiếu.
-- ============================================================================
