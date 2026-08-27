-- Quản lý vòng đời phiên thi: "1 tài khoản chỉ 1 đề đang làm", resume cùng phòng,
-- hạn chót do server quản (due_at), tự kết thúc phiên quá giờ.
--
-- Thay đổi:
--   1. join_exam: tự finalize phiên quá hạn của thí sinh; nếu còn phiên đang làm
--      cùng phòng -> trả lại id đó (resume, không trừ lượt); khác phòng -> chặn
--      bằng SESSION_ALREADY_ACTIVE; phiên mới luôn set due_at = now + duration.
--   2. get_active_session(): trả phiên còn-giờ của thí sinh (cho banner "Tiếp tục").
--   3. expire_overdue_exam_sessions(): cron quét phiên quá hạn -> submitted.
--   4. Backfill due_at cho dữ liệu cũ + lịch cron 1 phút/lần.

-- 1) join_exam -----------------------------------------------------------------
create or replace function public.join_exam(p_code text, p_subject_code text default null::text)
returns uuid
language plpgsql
security definer set search_path to ''
as $function$
#variable_conflict use_variable
declare
  key_record record;
  session_id uuid;
  student_id uuid;
  subject_code text;
  room_id uuid;
  room_subject_code text;
  paper_id uuid;
  now_at timestamptz := now();
  v_duration integer;
  v_active_session uuid;
  v_active_room uuid;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');

  select
    key.id,
    key.exam_room_id,
    key.paper_id,
    key.assigned_to,
    key.total_attempts,
    key.used_attempts,
    key.status,
    key.expires_at
  into key_record
  from public.exam_keys key
  where key.code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if key_record.expires_at is not null and key_record.expires_at < now_at then
    raise exception 'KEY_EXPIRED';
  end if;

  if key_record.assigned_to is not null
    and key_record.assigned_to <> student_id
  then
    raise exception 'KEY_ASSIGNED_TO_OTHER';
  end if;

  if key_record.used_attempts >= key_record.total_attempts then
    raise exception 'KEY_NO_ATTEMPTS_LEFT';
  end if;

  -- Resolve the room. Keys are room-scoped (exam_keys.exam_room_id is set for
  -- room/paper keys); only legacy subject-only keys fall back to a lookup.
  if key_record.exam_room_id is not null then
    select room.id, room.subject_code, room.duration_minutes
      into room_id, room_subject_code, v_duration
    from public.exam_rooms room
    where room.id = key_record.exam_room_id
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select room.id, room.subject_code, room.duration_minutes
      into room_id, room_subject_code, v_duration
    from public.exam_rooms room
    where room.subject_code = subject_code
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at)
    order by room.published_at desc nulls last, room.created_at desc
    limit 1;
  end if;

  if room_id is null then
    raise exception 'ROOM_NOT_AVAILABLE';
  end if;

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH';
  end if;

  -- ===========================================================================
  -- Quản lý phiên: 1 tài khoản chỉ 1 đề đang làm + resume.
  -- ===========================================================================
  -- (a) Tự kết thúc các phiên in_progress đã quá hạn của thí sinh. Hạn chót lấy
  --     theo due_at; dữ liệu cũ chưa có due_at thì suy ra từ started_at + duration.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
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

  -- (b) Còn phiên đang làm (trong giờ) không? Cùng phòng -> resume; khác phòng -> chặn.
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

  -- Resolve the paper via room_papers (a shared paper must be attached to room).
  if key_record.paper_id is not null then
    select rp.paper_id
      into paper_id
    from public.room_papers rp
    join public.exam_room_papers paper on paper.id = rp.paper_id
    where rp.exam_room_id = room_id
      and rp.paper_id = key_record.paper_id
      and paper.status = 'published';
  else
    select rp.paper_id
      into paper_id
    from public.room_papers rp
    join public.exam_room_papers paper on paper.id = rp.paper_id
    where rp.exam_room_id = room_id
      and paper.status = 'published'
    order by rp.is_default desc, rp.display_order, paper.created_at
    limit 1;
  end if;

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

  update public.exam_keys
  set
    assigned_to = student_id,
    used_attempts = used_attempts + 1,
    status = case
      when used_attempts + 1 >= total_attempts
        then 'exhausted'::public.exam_key_status
      else 'active'::public.exam_key_status
    end,
    activated_at = coalesce(activated_at, now_at),
    updated_at = now_at
  where id = key_record.id;

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
    key_record.id,
    student_id,
    room_id,
    paper_id,
    key_record.used_attempts + 1,
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

  update public.students
  set current_key_id = key_record.id,
      updated_at = now_at
  where id = student_id
    and current_key_id is null;

  return session_id;
end;
$function$;

-- 2) get_active_session() ------------------------------------------------------
create or replace function public.get_active_session()
returns jsonb
language plpgsql
security definer set search_path to ''
as $function$
declare
  v_student uuid := (select auth.uid());
  v_now timestamptz := now();
  v_result jsonb;
begin
  if v_student is null then
    return null;
  end if;

  -- Tự kết thúc phiên quá hạn trước khi trả về phiên còn-giờ.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
      client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = v_now
  from public.exam_rooms rm
  where s.student_id = v_student
    and s.status = 'in_progress'
    and rm.id = s.exam_room_id
    and coalesce(
      s.due_at,
      s.started_at + make_interval(mins => rm.duration_minutes)
    ) <= v_now;

  select jsonb_build_object(
    'session_id', s.id,
    'exam_room_id', s.exam_room_id,
    'room_name', rm.name,
    'room_code', rm.code,
    'subject_name', sub.name,
    'started_at', s.started_at,
    'due_at', s.due_at
  )
  into v_result
  from public.exam_sessions s
  join public.exam_rooms rm on rm.id = s.exam_room_id
  left join public.subjects sub on sub.code = rm.subject_code
  where s.student_id = v_student
    and s.status = 'in_progress'
  order by s.started_at desc
  limit 1;

  return v_result;
end;
$function$;

-- 3) expire_overdue_exam_sessions() -------------------------------------------
create or replace function public.expire_overdue_exam_sessions()
returns integer
language plpgsql
security definer set search_path to ''
as $function$
declare
  v_count integer;
begin
  with upd as (
    update public.exam_sessions as s
    set status = 'submitted',
        submitted_at = coalesce(
          s.due_at,
          s.started_at + make_interval(mins => rm.duration_minutes)
        ),
        client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
        updated_at = now()
    from public.exam_rooms rm
    where s.status = 'in_progress'
      and rm.id = s.exam_room_id
      and coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ) <= now()
    returning 1
  )
  select count(*) into v_count from upd;
  return v_count;
end;
$function$;

-- 4) Backfill due_at + lịch cron ----------------------------------------------
update public.exam_sessions as s
set due_at = s.started_at + make_interval(mins => rm.duration_minutes)
from public.exam_rooms rm
where rm.id = s.exam_room_id
  and s.due_at is null;

grant execute on function public.get_active_session() to authenticated;
grant execute on function public.expire_overdue_exam_sessions() to authenticated;

-- Chạy mỗi phút để dọn các phiên hết giờ (kể cả khi thí sinh không quay lại).
select cron.schedule(
  'expire-overdue-exam-sessions',
  '* * * * *',
  $cron$select public.expire_overdue_exam_sessions();$cron$
)
where not exists (
  select 1 from cron.job where jobname = 'expire-overdue-exam-sessions'
);
