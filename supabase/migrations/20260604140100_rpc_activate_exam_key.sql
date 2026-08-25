drop function if exists public.activate_exam_key(text);
drop function if exists public.activate_exam_key(text, text);
create or replace function public.activate_exam_key(p_key_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_key public.exam_keys%rowtype;
  v_now timestamptz := now();
  v_error_hint text;
  v_status text;
begin
  v_student_id := (select auth.uid());

  if v_student_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0002',
            hint = 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1
    from public.students st
    where st.id = v_student_id
  ) then
    raise exception 'NOT_STUDENT'
      using errcode = 'P0002',
            hint = 'NOT_STUDENT';
  end if;

  if nullif(trim(p_key_code), '') is null then
    raise exception 'KEY_NOT_FOUND'
      using errcode = 'P0003',
            hint = 'KEY_NOT_FOUND';
  end if;

  select *
    into v_key
  from public.exam_keys
  where code = upper(trim(p_key_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND'
      using errcode = 'P0003',
            hint = 'KEY_NOT_FOUND';
  end if;

  if v_key.status = 'revoked' then
    raise exception 'KEY_REVOKED'
      using errcode = 'P0004',
            hint = 'KEY_REVOKED';
  end if;

  if v_key.status = 'expired'
    or (v_key.expires_at is not null and v_key.expires_at < v_now)
  then
    raise exception 'KEY_EXPIRED'
      using errcode = 'P0005',
            hint = 'KEY_EXPIRED';
  end if;

  if v_key.status = 'exhausted'
    or v_key.used_attempts >= v_key.total_attempts
  then
    raise exception 'KEY_EXHAUSTED'
      using errcode = 'P0006',
            hint = 'KEY_EXHAUSTED';
  end if;

  if v_key.assigned_to is not null and v_key.assigned_to <> v_student_id then
    raise exception 'KEY_ALREADY_ASSIGNED'
      using errcode = 'P0007',
            hint = 'KEY_ALREADY_ASSIGNED';
  end if;

  if v_key.assigned_to is null then
    update public.exam_keys
    set assigned_to = v_student_id,
        status = 'active'::public.exam_key_status,
        activated_at = v_now,
        updated_at = v_now
    where id = v_key.id;

    update public.students
    set current_key_id = v_key.id,
        updated_at = v_now
    where id = v_student_id
      and current_key_id is null;
  end if;

  select ek.status::text
    into v_status
  from public.exam_keys ek
  where ek.id = v_key.id;

  return jsonb_build_object(
    'success', true,
    'key_id', v_key.id,
    'exam_room_id', v_key.exam_room_id,
    'status', coalesce(v_status, 'active'),
    'total_attempts', v_key.total_attempts,
    'used_attempts', v_key.used_attempts
  );
exception
  when others then
    get stacked diagnostics v_error_hint = PG_EXCEPTION_HINT;

    return jsonb_build_object(
      'success', false,
      'error', SQLERRM,
      'hint', coalesce(v_error_hint, 'UNKNOWN_ERROR')
    );
end;
$$;
revoke all on function public.activate_exam_key(text)
  from public, anon;
grant execute on function public.activate_exam_key(text)
  to authenticated;
comment on function public.activate_exam_key(text) is
  'Claims an exam key for the authenticated student without creating an exam session.';
notify pgrst, 'reload schema';
