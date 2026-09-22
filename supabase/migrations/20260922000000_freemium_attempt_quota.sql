-- Freemium theo lượt: mỗi thí sinh có hạn mức lượt thi miễn phí; hết thì tiêu
-- lượt từ key đã mua. Đồng thời sửa lỗi start_free_exam_session lọc
-- room.mode = 'official' (enum chỉ có 'exam'|'practice') khiến RPC luôn lỗi.

-- 1) Hạn mức lượt miễn phí trên students.
alter table public.students
  add column if not exists free_exam_quota integer not null default 3,
  add column if not exists free_exam_used integer not null default 0;

alter table public.students
  drop constraint if exists students_free_exam_used_nonneg;
alter table public.students
  add constraint students_free_exam_used_nonneg
  check (free_exam_used >= 0 and free_exam_quota >= 0);

-- 2) Trạng thái lượt còn lại cho UI (dashboard KPI + CTA mua gói).
create or replace function public.get_attempt_status()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_student uuid := (select auth.uid());
  v_free_quota integer := 0;
  v_free_used integer := 0;
  v_key_remaining integer := 0;
begin
  if v_student is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select coalesce(s.free_exam_quota, 0), coalesce(s.free_exam_used, 0)
    into v_free_quota, v_free_used
  from public.students s
  where s.id = v_student;

  select coalesce(sum(greatest(k.total_attempts - k.used_attempts, 0)), 0)
    into v_key_remaining
  from public.exam_keys k
  where k.assigned_to = v_student
    and k.deleted_at is null
    and k.status in ('unused', 'active')
    and k.used_attempts < k.total_attempts
    and (k.expires_at is null or k.expires_at > now());

  return jsonb_build_object(
    'free_quota', v_free_quota,
    'free_used', v_free_used,
    'free_remaining', greatest(v_free_quota - v_free_used, 0),
    'key_remaining', v_key_remaining,
    'total_remaining', greatest(v_free_quota - v_free_used, 0) + v_key_remaining
  );
end;
$$;

revoke all on function public.get_attempt_status() from public, anon;
grant execute on function public.get_attempt_status() to authenticated;

-- 3) start_free_exam_session: fix enum 'exam' + gate freemium (free trước, key sau).
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
  -- Freemium gate state.
  v_free_quota integer := 0;
  v_free_used integer := 0;
  v_charge_key_id uuid;
  v_charge_source text;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  insert into public.students (id, full_name)
  select pr.id, pr.full_name
  from public.profiles pr
  where pr.id = student_id
  on conflict (id) do nothing;

  subject_code := nullif(upper(trim(p_subject_code)), '');
  requested_room_id := p_exam_room_id;

  if requested_room_id is not null then
    select
      room.id, room.subject_code, room.duration_minutes,
      readiness.is_ready, readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.id = requested_room_id
      and room.mode = 'exam'
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select
      room.id, room.subject_code, room.duration_minutes,
      readiness.is_ready, readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.subject_code = subject_code
      and room.mode = 'exam'
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

  -- Resume an active session for free (does not consume a new attempt).
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

  -- Freemium gate: a brand-new attempt costs one unit. Free allowance first,
  -- then a purchased key assigned to this student. No unit -> block with a code
  -- the UI turns into a "buy attempts" prompt.
  select coalesce(s.free_exam_quota, 0), coalesce(s.free_exam_used, 0)
    into v_free_quota, v_free_used
  from public.students s
  where s.id = student_id
  for update;

  if v_free_quota - v_free_used > 0 then
    v_charge_source := 'free';
  else
    select k.id into v_charge_key_id
    from public.exam_keys k
    where k.assigned_to = student_id
      and k.deleted_at is null
      and k.status in ('unused', 'active')
      and k.used_attempts < k.total_attempts
      and (k.expires_at is null or k.expires_at > now_at)
    order by k.expires_at nulls last, k.created_at
    limit 1
    for update skip locked;

    if v_charge_key_id is null then
      raise exception 'NO_ATTEMPTS_REMAINING';
    end if;
    v_charge_source := 'key';
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
    key_id, student_id, exam_room_id, paper_id, attempt_number,
    status, started_at, due_at
  )
  values (
    v_charge_key_id, student_id, room_id, paper_id, attempt_number,
    'in_progress', now_at, now_at + make_interval(mins => coalesce(v_duration, 50))
  )
  returning id into session_id;

  -- Commit the charge now that the session exists.
  if v_charge_source = 'free' then
    update public.students
    set free_exam_used = free_exam_used + 1, updated_at = now_at
    where id = student_id;
  else
    update public.exam_keys
    set used_attempts = used_attempts + 1,
        status = case
          when used_attempts + 1 >= total_attempts then 'exhausted'::public.exam_key_status
          else 'active'::public.exam_key_status end,
        activated_at = coalesce(activated_at, now_at),
        updated_at = now_at
    where id = v_charge_key_id;

    insert into public.exam_key_usage_ledger (
      key_id, student_id, session_id, attempts, reason, idempotency_key
    ) values (
      v_charge_key_id, student_id, session_id, 1, 'exam',
      'free_flow:' || session_id::text
    )
    on conflict (idempotency_key) do nothing;
  end if;

  update public.exam_sessions
  set shuffle_config = jsonb_build_object(
    'version', 1,
    'seed', session_id::text,
    'shuffleQuestions', 'within_difficulty',
    'shuffleOptions', true
  )
  where id = session_id;

  insert into public.exam_session_questions (
    session_id, blueprint_section_id, question_id, question_seq,
    display_no, option_order, max_points
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
  set client_info = jsonb_build_object('flow', 'free_exam', 'charge_source', v_charge_source)
  where id = session_id;

  return session_id;
end;
$function$;

revoke all on function public.start_free_exam_session(text, uuid) from public, anon;
grant execute on function public.start_free_exam_session(text, uuid) to authenticated;
