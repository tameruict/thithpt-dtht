drop function if exists public.join_exam(text);
create or replace function public.join_exam(
  p_code text,
  p_subject_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_key_record record;
  v_room_record record;
  v_session_id uuid;
  v_student_id uuid;
  v_subject_code text;
begin
  v_student_id := auth.uid();
  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_code), '') is null then
    raise exception 'KEY_NOT_FOUND';
  end if;

  v_subject_code := nullif(upper(trim(p_subject_code)), '');

  select id, exam_room_id, assigned_to, total_attempts, used_attempts, status, expires_at
  into v_key_record
  from public.exam_keys
  where code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if v_key_record.status = 'revoked' then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if v_key_record.status = 'expired'
    or (v_key_record.expires_at is not null and v_key_record.expires_at < now())
  then
    raise exception 'KEY_EXPIRED';
  end if;

  if v_key_record.assigned_to is not null and v_key_record.assigned_to <> v_student_id then
    raise exception 'KEY_ASSIGNED_TO_OTHER';
  end if;

  if v_key_record.status = 'exhausted'
    or v_key_record.used_attempts >= v_key_record.total_attempts
  then
    raise exception 'KEY_NO_ATTEMPTS_LEFT';
  end if;

  if v_key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if v_key_record.exam_room_id is not null then
    select er.id, er.subject_code
    into v_room_record
    from public.exam_rooms er
    where er.id = v_key_record.exam_room_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= now())
      and (er.ends_at is null or er.ends_at > now());

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE';
    end if;

    if v_subject_code is not null and v_room_record.subject_code <> v_subject_code then
      raise exception 'KEY_SUBJECT_MISMATCH';
    end if;
  else
    if v_subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select er.id, er.subject_code
    into v_room_record
    from public.exam_rooms er
    where er.subject_code = v_subject_code
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= now())
      and (er.ends_at is null or er.ends_at > now())
    order by er.published_at desc nulls last, er.created_at desc
    limit 1;

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE';
    end if;
  end if;

  update public.exam_keys
  set assigned_to = v_student_id,
      used_attempts = used_attempts + 1,
      status = case
        when used_attempts + 1 >= total_attempts then 'exhausted'::public.exam_key_status
        else 'active'::public.exam_key_status
      end,
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_key_record.id;

  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    attempt_number,
    status
  ) values (
    v_key_record.id,
    v_student_id,
    v_room_record.id,
    v_key_record.used_attempts + 1,
    'in_progress'
  ) returning id into v_session_id;

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    max_points
  )
  select
    v_session_id,
    erq.blueprint_section_id,
    erq.question_id,
    erq.seq,
    coalesce(erq.points_override, ebs.max_points_per_question)
  from public.exam_room_questions erq
  join public.exam_blueprint_sections ebs on ebs.id = erq.blueprint_section_id
  where erq.exam_room_id = v_room_record.id;

  update public.students
  set current_key_id = v_key_record.id
  where id = v_student_id and current_key_id is null;

  return v_session_id;
end;
$$;
revoke all on function public.join_exam(text, text)
  from public, anon;
grant execute on function public.join_exam(text, text)
  to authenticated;
notify pgrst, 'reload schema';
