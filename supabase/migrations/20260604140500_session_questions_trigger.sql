create or replace function public.trg_populate_session_questions()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_paper_blueprint_id uuid;
begin
  -- Retrieve the blueprint for the paper
  if new.paper_id is null then
    -- Fallback to room blueprint if no paper_id is provided
    select blueprint_id into v_paper_blueprint_id
    from public.exam_rooms
    where id = new.exam_room_id;
  else
    select blueprint_id into v_paper_blueprint_id
    from public.exam_room_papers
    where id = new.paper_id;
  end if;

  if v_paper_blueprint_id is null then
    raise exception 'BLUEPRINT_NOT_FOUND' using hint = 'Could not determine blueprint for session questions';
  end if;

  -- Insert questions from the room that match the paper's blueprint
  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    max_points
  )
  select
    new.id,
    erq.blueprint_section_id,
    erq.question_id,
    erq.seq,
    coalesce(erq.points_override, ebs.max_points_per_question)
  from public.exam_room_questions erq
  join public.exam_blueprint_sections ebs on ebs.id = erq.blueprint_section_id
  where erq.exam_room_id = new.exam_room_id
    and ebs.blueprint_id = v_paper_blueprint_id;

  return new;
end;
$$;
revoke all on function public.trg_populate_session_questions() from public, anon;
drop trigger if exists trg_exam_sessions_populate_questions on public.exam_sessions;
create trigger trg_exam_sessions_populate_questions
  after insert on public.exam_sessions
  for each row
  execute function public.trg_populate_session_questions();
