-- Free student access: exam sessions no longer require a room key.

alter table public.exam_sessions
  alter column key_id drop not null;

create or replace function public.start_free_exam_session(
  p_subject_code text default null::text,
  p_exam_room_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  attempt_number integer;
  session_id uuid;
  student_id uuid;
  subject_code text;
  requested_room_id uuid;
  room_id uuid;
  room_subject_code text;
  paper_id uuid;
  now_at timestamptz := now();
  v_duration integer;
  v_active_session uuid;
  v_active_room uuid;
  room_ready boolean;
  room_readiness_reason text;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lưới an toàn: bảo đảm có dòng students trước khi tạo phiên thi. Tài khoản
  -- đăng nhập Google (hoặc tạo trước khi handle_new_user tạo students) chỉ có
  -- dòng profiles -> nếu không sẽ vướng exam_sessions_student_id_fkey bên dưới.
  insert into public.students (id, full_name)
  select pr.id, pr.full_name
  from public.profiles pr
  where pr.id = student_id
  on conflict (id) do nothing;

  subject_code := nullif(upper(trim(p_subject_code)), '');
  requested_room_id := p_exam_room_id;

  if requested_room_id is not null then
    select
      room.id,
      room.subject_code,
      room.duration_minutes,
      readiness.is_ready,
      readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.id = requested_room_id
      and room.mode = 'official'
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select
      room.id,
      room.subject_code,
      room.duration_minutes,
      readiness.is_ready,
      readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.subject_code = subject_code
      and room.mode = 'official'
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at)
    order by room.published_at desc nulls last, room.created_at desc
    limit 1;
  end if;

  if room_id is null then
    raise exception 'ROOM_NOT_AVAILABLE';
  end if;

  if not coalesce(room_ready, false) then
    if room_readiness_reason = 'question_content_needs_review' then
      raise exception 'QUESTION_CONTENT_NEEDS_REVIEW';
    end if;
    raise exception 'ROOM_NOT_READY';
  end if;

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'SUBJECT_MISMATCH';
  end if;

  -- Finalize overdue sessions before deciding whether to resume or block.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
      grading_status = 'pending_auto',
      grading_error = null,
      client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = now_at
  from public.exam_rooms rm
  where s.student_id = student_id
    and s.status = 'in_progress'
    and rm.id = s.exam_room_id
    and coalesce(
      s.due_at,
      s.started_at + make_interval(mins => rm.duration_minutes)
    ) <= now_at;

  select s.id, s.exam_room_id
    into v_active_session, v_active_room
  from public.exam_sessions s
  where s.student_id = student_id
    and s.status = 'in_progress'
  order by s.started_at desc
  limit 1;

  if v_active_session is not null then
    if v_active_room = room_id then
      return v_active_session;
    else
      raise exception 'SESSION_ALREADY_ACTIVE';
    end if;
  end if;

  select paper.id
    into paper_id
  from public.exam_room_papers paper
  where paper.exam_room_id = room_id
    and paper.status = 'published'
  order by paper.is_default desc, paper.display_order, paper.created_at
  limit 1;

  if paper_id is null then
    raise exception 'PAPER_NOT_AVAILABLE';
  end if;

  if not exists (
    select 1
    from public.exam_room_questions placement
    where placement.paper_id = paper_id
  ) then
    raise exception 'PAPER_HAS_NO_QUESTIONS';
  end if;

  select coalesce(max(s.attempt_number), 0) + 1
    into attempt_number
  from public.exam_sessions s
  where s.student_id = student_id
    and s.exam_room_id = room_id;

  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status,
    started_at,
    due_at
  )
  values (
    null,
    student_id,
    room_id,
    paper_id,
    attempt_number,
    'in_progress',
    now_at,
    now_at + make_interval(mins => coalesce(v_duration, 50))
  )
  returning id into session_id;

  update public.exam_sessions
  set shuffle_config = jsonb_build_object(
    'version', 1,
    'seed', session_id::text,
    'shuffleQuestions', 'within_difficulty',
    'shuffleOptions', true
  )
  where id = session_id;

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    display_no,
    option_order,
    max_points
  )
  with placements as (
    select
      placement.blueprint_section_id,
      placement.question_id,
      placement.points_override,
      section.seq as section_seq,
      section.max_points_per_question,
      question.type as question_type,
      question.difficulty,
      md5(
        session_id::text || ':' ||
        placement.blueprint_section_id::text || ':' ||
        question.difficulty::text || ':' ||
        placement.question_id::text
      ) as tie_breaker
    from public.exam_room_questions placement
    join public.exam_blueprint_sections section
      on section.id = placement.blueprint_section_id
    join public.questions question
      on question.id = placement.question_id
    where placement.paper_id = paper_id
  ),
  ordered as (
    select
      placements.*,
      row_number() over (
        order by
          placements.section_seq,
          placements.difficulty,
          placements.tie_breaker
      ) as display_seq
    from placements
  )
  select
    session_id,
    ordered.blueprint_section_id,
    ordered.question_id,
    ordered.display_seq,
    ordered.display_seq::text,
    case
      when ordered.question_type = 'multiple_choice' then coalesce(
        (
          select array_agg(option_row.id order by option_row.sort_key)::uuid[]
          from (
            select
              option.id,
              case
                when count(*) over () = 4
                  and not private.has_option_self_reference(ordered.question_id)
                then md5(
                  session_id::text || ':' ||
                  ordered.question_id::text || ':' ||
                  option.id::text
                )
                else lpad(option.seq::text, 4, '0')
              end as sort_key
            from public.question_options option
            where option.question_id = ordered.question_id
          ) option_row
        ),
        '{}'::uuid[]
      )
      else '{}'::uuid[]
    end,
    coalesce(ordered.points_override, ordered.max_points_per_question)
  from ordered
  order by ordered.display_seq;

  update public.exam_sessions
  set client_info = jsonb_build_object('flow', 'free_exam')
  where id = session_id;

  return session_id;
end;
$function$;

revoke all on function public.start_free_exam_session(text, uuid) from public, anon;

grant execute on function public.start_free_exam_session(text, uuid) to authenticated;



-- Practice sessions are also free and unlimited.

create or replace function public.start_practice_session(
  p_subject_code text,
  p_question_count integer default 20,
  p_knowledge_field_ids bigint[] default null,
  p_difficulties smallint[] default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_variable
declare
  student_id uuid := (select auth.uid());
  subject_code text := nullif(upper(trim(p_subject_code)), '');
  requested_count integer := least(greatest(coalesce(p_question_count, 20), 5), 50);
  practice_room_id uuid;
  practice_blueprint_id uuid;
  session_id uuid := extensions.gen_random_uuid();
  attempt_number integer;
  selected_count integer;
begin
  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if subject_code is null then
    raise exception 'SUBJECT_REQUIRED';
  end if;

  select room.id, room.blueprint_id
    into practice_room_id, practice_blueprint_id
  from public.exam_rooms room
  join public.subjects subject on subject.code = room.subject_code
  join public.v_exam_room_readiness readiness on readiness.id = room.id
  where room.subject_code = subject_code
    and room.mode = 'practice'
    and readiness.is_ready
  order by room.published_at desc nulls last
  limit 1;

  if practice_room_id is null then
    raise exception 'PRACTICE_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.exam_sessions session
    where session.student_id = student_id
      and session.status = 'in_progress'
  ) then
    raise exception 'SESSION_ALREADY_ACTIVE';
  end if;

  insert into public.students (id, full_name)
  select profile.id, profile.full_name
  from public.profiles profile
  where profile.id = student_id
  on conflict (id) do nothing;

  -- Practice is free: no key balance checks or deductions.

  select coalesce(max(session.attempt_number), 0) + 1
    into attempt_number
  from public.exam_sessions session
  where session.student_id = student_id
    and session.exam_room_id = practice_room_id;

  perform set_config('app.session_start_flow', 'practice', true);

  insert into public.exam_sessions (
    id,
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status,
    grading_status,
    client_info,
    shuffle_config
  ) values (
    session_id,
    null,
    student_id,
    practice_room_id,
    null,
    attempt_number,
    'in_progress',
    'pending_auto',
    jsonb_build_object('flow', 'practice'),
    jsonb_build_object(
      'version', 2,
      'seed', session_id::text,
      'shuffleQuestions', 'server_random',
      'shuffleOptions', true,
      'filters', jsonb_build_object(
        'knowledgeFieldIds', to_jsonb(p_knowledge_field_ids),
        'difficulties', to_jsonb(p_difficulties)
      )
    )
  );

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    display_no,
    option_order,
    max_points
  )
  with selected as (
    select
      question.id as question_id,
      question.type as question_type,
      section.id as section_id,
      section.max_points_per_question as max_points
    from public.questions question
    join lateral (
      select blueprint_section.id, blueprint_section.max_points_per_question
      from public.exam_blueprint_sections blueprint_section
      where blueprint_section.blueprint_id = practice_blueprint_id
        and blueprint_section.question_type = question.type
      order by blueprint_section.seq
      limit 1
    ) section on true
    where question.subject_code = subject_code
      and question.status = 'approved'
      and question.content_quality_status <> 'needs_review'
      and question.deleted_at is null
      and (
        p_knowledge_field_ids is null
        or cardinality(p_knowledge_field_ids) = 0
        or question.knowledge_field_id = any(p_knowledge_field_ids)
      )
      and (
        p_difficulties is null
        or cardinality(p_difficulties) = 0
        or question.difficulty = any(p_difficulties)
      )
    order by random()
    limit requested_count
  ),
  numbered as (
    select selected.*, row_number() over ()::integer as sequence_number
    from selected
  )
  select
    session_id,
    numbered.section_id,
    numbered.question_id,
    numbered.sequence_number,
    numbered.sequence_number::text,
    case
      when numbered.question_type = 'multiple_choice' then coalesce((
        select array_agg(option.id order by md5(
          session_id::text || ':' || numbered.question_id::text || ':' || option.id::text
        ))::uuid[]
        from public.question_options option
        where option.question_id = numbered.question_id
      ), '{}'::uuid[])
      else '{}'::uuid[]
    end,
    numbered.max_points
  from numbered;

  get diagnostics selected_count = row_count;
  if selected_count <> requested_count then
    raise exception 'INSUFFICIENT_APPROVED_QUESTIONS';
  end if;

  update public.exam_sessions
  set max_score = (
    select sum(session_question.max_points)
    from public.exam_session_questions session_question
    where session_question.session_id = session_id
  )
  where id = session_id;

  return session_id;
end;
$$;



