alter table public.exam_keys
  add column if not exists paper_id uuid;
alter table public.exam_sessions
  add column if not exists paper_id uuid;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_keys_paper_id_fkey'
      and conrelid = 'public.exam_keys'::regclass
  ) then
    alter table public.exam_keys
      add constraint exam_keys_paper_id_fkey
      foreign key (paper_id)
      references public.exam_room_papers(id)
      on delete set null;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_sessions_paper_id_fkey'
      and conrelid = 'public.exam_sessions'::regclass
  ) then
    alter table public.exam_sessions
      add constraint exam_sessions_paper_id_fkey
      foreign key (paper_id)
      references public.exam_room_papers(id)
      on delete restrict;
  end if;
end;
$$;
comment on column public.exam_keys.paper_id is
  'Preassigned paper variant for this key. Null means the session chooses a paper from the selected room.';
comment on column public.exam_sessions.paper_id is
  'Paper variant used by this concrete exam session.';
create index if not exists idx_exam_keys_paper
  on public.exam_keys(paper_id)
  where paper_id is not null;
create index if not exists idx_exam_sessions_paper
  on public.exam_sessions(paper_id)
  where paper_id is not null;
create or replace function private.fn_exam_keys_sync_paper_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_paper_room_id uuid;
begin
  if new.paper_id is null then
    return new;
  end if;

  select erp.exam_room_id
    into v_paper_room_id
  from public.exam_room_papers erp
  where erp.id = new.paper_id;

  if v_paper_room_id is null then
    raise exception 'PAPER_NOT_FOUND';
  end if;

  if new.exam_room_id is null then
    new.exam_room_id := v_paper_room_id;
  elsif new.exam_room_id <> v_paper_room_id then
    raise exception 'KEY_PAPER_ROOM_MISMATCH'
      using hint = 'KEY_PAPER_ROOM_MISMATCH';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_exam_keys_sync_paper_room on public.exam_keys;
create trigger trg_exam_keys_sync_paper_room
  before insert or update of exam_room_id, paper_id
  on public.exam_keys
  for each row
  execute function private.fn_exam_keys_sync_paper_room();
drop policy if exists "Users can start sessions for their active keys" on public.exam_sessions;
create policy "Users can start sessions for their active keys"
on public.exam_sessions
for insert
to authenticated
with check (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.exam_keys k
      where k.id = key_id
        and k.assigned_to = (select auth.uid())
        and k.status in ('unused', 'active')
        and k.used_attempts < k.total_attempts
        and (k.expires_at is null or k.expires_at > now())
    )
    and exists (
      select 1
      from public.exam_rooms er
      where er.id = exam_room_id
        and er.status = 'published'
    )
    and (
      public.exam_sessions.paper_id is null
      or exists (
        select 1
        from public.exam_room_papers erp
        where erp.id = public.exam_sessions.paper_id
          and erp.exam_room_id = public.exam_sessions.exam_room_id
      )
    )
  )
);
drop function if exists public.activate_exam_key(text);
drop function if exists public.activate_exam_key(text, text);
create or replace function public.activate_exam_key(
  p_key_code text,
  p_subject_code text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_key record;
  v_subject_code text;
  v_room_id uuid;
  v_room_subject_code text;
  v_room_blueprint_id uuid;
  v_paper_id uuid;
  v_paper_blueprint_id uuid;
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

  v_subject_code := nullif(upper(trim(p_subject_code)), '');

  select
    ek.id,
    ek.exam_room_id,
    ek.paper_id,
    ek.assigned_to,
    ek.total_attempts,
    ek.used_attempts,
    ek.status,
    ek.expires_at
  into v_key
  from public.exam_keys ek
  where ek.code = upper(trim(p_key_code))
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

  if v_key.paper_id is not null then
    select
      er.id,
      er.subject_code,
      er.blueprint_id,
      erp.id,
      erp.blueprint_id
    into
      v_room_id,
      v_room_subject_code,
      v_room_blueprint_id,
      v_paper_id,
      v_paper_blueprint_id
    from public.exam_room_papers erp
    join public.exam_rooms er on er.id = erp.exam_room_id
    where erp.id = v_key.paper_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE'
        using hint = 'ROOM_NOT_AVAILABLE';
    end if;

    if v_key.exam_room_id is not null and v_key.exam_room_id <> v_room_id then
      raise exception 'KEY_ROOM_MISMATCH'
        using hint = 'KEY_ROOM_MISMATCH';
    end if;
  elsif v_key.exam_room_id is not null then
    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.id = v_key.exam_room_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE'
        using hint = 'ROOM_NOT_AVAILABLE';
    end if;
  elsif v_subject_code is not null then
    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.subject_code = v_subject_code
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now)
    order by er.published_at desc nulls last, er.created_at desc
    limit 1;

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE'
        using hint = 'ROOM_NOT_AVAILABLE';
    end if;
  end if;

  if v_room_id is not null and v_subject_code is not null and v_room_subject_code <> v_subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH'
      using hint = 'KEY_SUBJECT_MISMATCH';
  end if;

  if v_room_id is not null and v_paper_id is null then
    select erp.id, erp.blueprint_id
      into v_paper_id, v_paper_blueprint_id
    from public.exam_room_papers erp
    where erp.exam_room_id = v_room_id
    order by erp.is_default desc, erp.display_order, erp.created_at
    limit 1;
  end if;

  if v_paper_blueprint_id is null then
    v_paper_blueprint_id := v_room_blueprint_id;
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
    'exam_room_id', v_room_id,
    'paper_id', v_paper_id,
    'paper_blueprint_id', v_paper_blueprint_id,
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
revoke all on function public.activate_exam_key(text, text)
  from public, anon;
grant execute on function public.activate_exam_key(text, text)
  to authenticated;
drop function if exists public.join_exam(text);
drop function if exists public.join_exam(text, text);
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
  v_session_id uuid;
  v_student_id uuid;
  v_subject_code text;
  v_room_id uuid;
  v_room_subject_code text;
  v_room_blueprint_id uuid;
  v_paper_id uuid;
  v_paper_blueprint_id uuid;
  v_now timestamptz := now();
begin
  v_student_id := (select auth.uid());

  if v_student_id is null then
    raise exception 'Not authenticated';
  end if;

  if nullif(trim(p_code), '') is null then
    raise exception 'KEY_NOT_FOUND';
  end if;

  v_subject_code := nullif(upper(trim(p_subject_code)), '');

  select
    ek.id,
    ek.exam_room_id,
    ek.paper_id,
    ek.assigned_to,
    ek.total_attempts,
    ek.used_attempts,
    ek.status,
    ek.expires_at
  into v_key_record
  from public.exam_keys ek
  where ek.code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if v_key_record.status = 'revoked' then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if v_key_record.status = 'expired'
    or (v_key_record.expires_at is not null and v_key_record.expires_at < v_now)
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

  if v_key_record.paper_id is not null then
    select
      er.id,
      er.subject_code,
      er.blueprint_id,
      erp.id,
      erp.blueprint_id
    into
      v_room_id,
      v_room_subject_code,
      v_room_blueprint_id,
      v_paper_id,
      v_paper_blueprint_id
    from public.exam_room_papers erp
    join public.exam_rooms er on er.id = erp.exam_room_id
    where erp.id = v_key_record.paper_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE';
    end if;

    if v_key_record.exam_room_id is not null and v_key_record.exam_room_id <> v_room_id then
      raise exception 'KEY_ROOM_MISMATCH';
    end if;

    if v_subject_code is not null and v_room_subject_code <> v_subject_code then
      raise exception 'KEY_SUBJECT_MISMATCH';
    end if;
  elsif v_key_record.exam_room_id is not null then
    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.id = v_key_record.exam_room_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE';
    end if;

    if v_subject_code is not null and v_room_subject_code <> v_subject_code then
      raise exception 'KEY_SUBJECT_MISMATCH';
    end if;
  else
    if v_subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.subject_code = v_subject_code
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at is null or er.ends_at > v_now)
    order by er.published_at desc nulls last, er.created_at desc
    limit 1;

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE';
    end if;
  end if;

  if v_paper_id is null then
    select erp.id, erp.blueprint_id
      into v_paper_id, v_paper_blueprint_id
    from public.exam_room_papers erp
    where erp.exam_room_id = v_room_id
    order by erp.is_default desc, erp.display_order, erp.created_at
    limit 1;
  end if;

  if v_paper_blueprint_id is null then
    v_paper_blueprint_id := v_room_blueprint_id;
  end if;

  update public.exam_keys
  set assigned_to = v_student_id,
      used_attempts = used_attempts + 1,
      status = case
        when used_attempts + 1 >= total_attempts then 'exhausted'::public.exam_key_status
        else 'active'::public.exam_key_status
      end,
      activated_at = coalesce(activated_at, v_now),
      updated_at = v_now
  where id = v_key_record.id;

  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status
  ) values (
    v_key_record.id,
    v_student_id,
    v_room_id,
    v_paper_id,
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
  where erq.exam_room_id = v_room_id
    and ebs.blueprint_id = v_paper_blueprint_id;

  update public.students
  set current_key_id = v_key_record.id,
      updated_at = v_now
  where id = v_student_id
    and current_key_id is null;

  return v_session_id;
end;
$$;
revoke all on function public.join_exam(text, text)
  from public, anon;
grant execute on function public.join_exam(text, text)
  to authenticated;
comment on function public.activate_exam_key(text, text) is
  'Claims an exam key for the authenticated student and resolves the available room/paper when possible.';
comment on function public.join_exam(text, text) is
  'Claims an exam key, resolves the room paper, creates an exam session, and copies questions for that paper blueprint.';
notify pgrst, 'reload schema';
