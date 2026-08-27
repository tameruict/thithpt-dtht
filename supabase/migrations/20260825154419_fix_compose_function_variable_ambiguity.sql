-- Remove PL/pgSQL variable/column ambiguity from compose_add_questions.

create or replace function public.compose_add_questions(
  p_paper_id uuid,
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_room_id uuid;
  v_blueprint_id uuid;
  paper_status text;
  v_subject_code text;
  v_question_id uuid;
  v_question_type public.question_type;
  v_question_subject text;
  v_section_id uuid;
  v_next_sequence integer;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select paper.exam_room_id, paper.blueprint_id, paper.status::text, room.subject_code
    into v_room_id, v_blueprint_id, paper_status, v_subject_code
  from public.exam_room_papers paper
  join public.exam_rooms room on room.id = paper.exam_room_id
  where paper.id = p_paper_id;

  if v_room_id is null then raise exception 'PAPER_NOT_FOUND'; end if;
  if paper_status <> 'draft' then raise exception 'PAPER_IS_IMMUTABLE'; end if;

  foreach v_question_id in array coalesce(p_question_ids, array[]::uuid[])
  loop
    select question.type, question.subject_code
      into v_question_type, v_question_subject
    from public.questions question
    where question.id = v_question_id
      and question.status = 'approved'
      and question.deleted_at is null;

    if v_question_type is null or v_question_subject <> v_subject_code then
      continue;
    end if;

    if exists (
      select 1 from public.exam_room_questions room_question
      where room_question.paper_id = p_paper_id
        and room_question.question_id = v_question_id
    ) then
      continue;
    end if;

    select section.id into v_section_id
    from public.exam_blueprint_sections section
    where section.blueprint_id = v_blueprint_id
      and section.question_type = v_question_type
    order by section.seq
    limit 1;

    if v_section_id is null then continue; end if;

    select coalesce(max(room_question.seq), 0) + 1
      into v_next_sequence
    from public.exam_room_questions room_question
    where room_question.paper_id = p_paper_id
      and room_question.blueprint_section_id = v_section_id;

    insert into public.exam_room_questions (
      exam_room_id,
      paper_id,
      blueprint_section_id,
      question_id,
      seq,
      is_required
    ) values (
      v_room_id,
      p_paper_id,
      v_section_id,
      v_question_id,
      v_next_sequence,
      true
    )
    on conflict do nothing;
  end loop;

  return private.compose_paper_json(p_paper_id);
end;
$$;

revoke all on function public.compose_add_questions(uuid, uuid[]) from public, anon;
grant execute on function public.compose_add_questions(uuid, uuid[]) to authenticated;
