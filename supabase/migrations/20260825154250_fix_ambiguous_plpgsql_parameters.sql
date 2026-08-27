-- Fix PL/pgSQL variable/column ambiguity surfaced by the live DB linter.
-- All functions retain their existing signatures and authorization behavior.

create or replace function public.get_subjects_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  p_student_id uuid := (select auth.uid());
  v_now timestamptz := now();
  result_value jsonb;
begin
  if p_student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.exam_sessions session
  set status = 'submitted',
      submitted_at = coalesce(
        session.due_at,
        session.started_at + make_interval(mins => room.duration_minutes)
      ),
      grading_status = 'pending_auto',
      client_info = session.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = v_now
  from public.exam_rooms room
  where session.student_id = p_student_id
    and session.status = 'in_progress'
    and room.id = session.exam_room_id
    and coalesce(
      session.due_at,
      session.started_at + make_interval(mins => room.duration_minutes)
    ) <= v_now;

  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', subject.code,
          'name', subject.name,
          'default_duration_minutes', subject.default_duration_minutes,
          'is_compulsory', subject.is_compulsory,
          'is_active', subject.is_active,
          'practice_attempt_cost', subject.practice_attempt_cost
        ) order by subject.is_compulsory desc, subject.name
      )
      from public.subjects subject
      where subject.is_active
        and subject.deleted_at is null
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', room.id,
          'code', room.code,
          'name', room.name,
          'duration_minutes', room.duration_minutes,
          'status', room.status,
          'mode', room.mode,
          'price_vnd', room.price_vnd,
          'total_attempts_default', room.total_attempts_default,
          'starts_at', room.starts_at,
          'ends_at', room.ends_at,
          'published_at', room.published_at,
          'blueprint_code', blueprint.code,
          'blueprint_name', blueprint.name,
          'subject_code', room.subject_code,
          'subject_name', subject.name,
          'readiness_reason', readiness.readiness_reason
        ) order by subject.name, room.published_at desc
      )
      from public.exam_rooms room
      join public.v_exam_room_readiness readiness on readiness.id = room.id
      join public.exam_blueprints blueprint on blueprint.id = room.blueprint_id
      join public.subjects subject on subject.code = room.subject_code
      where room.mode = 'exam'
        and readiness.is_ready
    ), '[]'::jsonb),
    'practice', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subject_code', subject.code,
          'subject_name', subject.name,
          'room_id', room.id,
          'room_name', room.name,
          'attempt_cost', subject.practice_attempt_cost,
          'approved_question_count', readiness.approved_practice_question_count,
          'available', readiness.is_ready
        ) order by subject.name
      )
      from public.subjects subject
      left join lateral (
        select practice_room.*
        from public.exam_rooms practice_room
        where practice_room.subject_code = subject.code
          and practice_room.mode = 'practice'
          and practice_room.deleted_at is null
        order by practice_room.published_at desc nulls last
        limit 1
      ) room on true
      left join public.v_exam_room_readiness readiness on readiness.id = room.id
      where subject.is_active
        and subject.deleted_at is null
    ), '[]'::jsonb),
    'attempt_balance', coalesce((
      select sum(effective_key.remaining_attempts)
      from public.v_exam_keys_effective effective_key
      where effective_key.assigned_to = p_student_id
        and effective_key.effective_status in ('unused', 'active')
    ), 0),
    'profile', (
      select jsonb_build_object(
        'id', profile.id,
        'email', profile.email::text,
        'role', profile.role::text,
        'full_name', profile.full_name,
        'avatar_url', profile.avatar_url
      )
      from public.profiles profile
      where profile.id = p_student_id
    ),
    'active_session', (
      select jsonb_build_object(
        'session_id', session.id,
        'exam_room_id', session.exam_room_id,
        'room_name', room.name,
        'room_code', room.code,
        'room_mode', room.mode,
        'subject_name', subject.name,
        'started_at', session.started_at,
        'due_at', session.due_at
      )
      from public.exam_sessions session
      join public.exam_rooms room on room.id = session.exam_room_id
      left join public.subjects subject on subject.code = room.subject_code
      where session.student_id = p_student_id
        and session.status = 'in_progress'
      order by session.started_at desc
      limit 1
    )
  ) into result_value;

  return result_value;
end;
$$;

revoke all on function public.get_subjects_dashboard() from public, anon;
grant execute on function public.get_subjects_dashboard() to authenticated;

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
  room_id uuid;
  blueprint_id uuid;
  paper_status text;
  subject_code text;
  v_question_id uuid;
  question_type public.question_type;
  question_subject text;
  section_id uuid;
  next_sequence integer;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select paper.exam_room_id, paper.blueprint_id, paper.status::text, room.subject_code
    into room_id, blueprint_id, paper_status, subject_code
  from public.exam_room_papers paper
  join public.exam_rooms room on room.id = paper.exam_room_id
  where paper.id = p_paper_id;

  if room_id is null then raise exception 'PAPER_NOT_FOUND'; end if;
  if paper_status <> 'draft' then raise exception 'PAPER_IS_IMMUTABLE'; end if;

  foreach v_question_id in array coalesce(p_question_ids, array[]::uuid[])
  loop
    select question.type, question.subject_code
      into question_type, question_subject
    from public.questions question
    where question.id = v_question_id
      and question.status = 'approved'
      and question.deleted_at is null;

    if question_type is null or question_subject <> subject_code then
      continue;
    end if;

    if exists (
      select 1 from public.exam_room_questions room_question
      where room_question.paper_id = p_paper_id
        and room_question.question_id = v_question_id
    ) then
      continue;
    end if;

    select section.id into section_id
    from public.exam_blueprint_sections section
    where section.blueprint_id = blueprint_id
      and section.question_type = question_type
    order by section.seq
    limit 1;

    if section_id is null then continue; end if;

    select coalesce(max(room_question.seq), 0) + 1
      into next_sequence
    from public.exam_room_questions room_question
    where room_question.paper_id = p_paper_id
      and room_question.blueprint_section_id = section_id;

    insert into public.exam_room_questions (
      exam_room_id,
      paper_id,
      blueprint_section_id,
      question_id,
      seq,
      is_required
    ) values (
      room_id,
      p_paper_id,
      section_id,
      v_question_id,
      next_sequence,
      true
    )
    on conflict do nothing;
  end loop;

  return private.compose_paper_json(p_paper_id);
end;
$$;

revoke all on function public.compose_add_questions(uuid, uuid[]) from public, anon;
grant execute on function public.compose_add_questions(uuid, uuid[]) to authenticated;

create or replace function public.grade_essay_answer(
  p_answer_id uuid,
  p_points numeric
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_session_id uuid;
  max_points numeric;
  question_type text;
  total_score numeric;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_points is null or p_points < 0 then
    raise exception 'INVALID_POINTS';
  end if;

  select session_question.session_id, session_question.max_points, question.type::text
    into v_session_id, max_points, question_type
  from public.session_answers answer
  join public.exam_session_questions session_question
    on session_question.id = answer.session_question_id
  join public.questions question on question.id = session_question.question_id
  where answer.id = p_answer_id;

  if v_session_id is null then
    raise exception 'ANSWER_NOT_FOUND';
  end if;

  if question_type <> 'essay' then
    raise exception 'NOT_AN_ESSAY';
  end if;

  if p_points > max_points then
    raise exception 'POINTS_EXCEED_MAX';
  end if;

  update public.session_answers
  set earned_points = p_points,
      is_correct = (p_points >= max_points),
      grader = jsonb_build_object(
        'type', 'manual',
        'by', (select auth.uid()),
        'at', now()
      ),
      updated_at = now()
  where id = p_answer_id;

  select coalesce(sum(answer.earned_points), 0)
    into total_score
  from public.session_answers answer
  join public.exam_session_questions session_question
    on session_question.id = answer.session_question_id
  where session_question.session_id = v_session_id;

  update public.exam_sessions
  set score = total_score,
      updated_at = now()
  where id = v_session_id;

  perform private.refresh_exam_grading_status(v_session_id);
  return total_score;
end;
$$;

revoke all on function public.grade_essay_answer(uuid, numeric) from public, anon;
grant execute on function public.grade_essay_answer(uuid, numeric) to authenticated;
