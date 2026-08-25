-- Exam keys are no longer scoped to exam rooms or paper variants.
-- A key controls ownership/quota only; the selected room is resolved when joining.

update public.key_batches
set exam_room_id = null
where exam_room_id is not null;

update public.exam_keys
set exam_room_id = null,
    paper_id = null,
    updated_at = now()
where exam_room_id is not null
   or paper_id is not null;

comment on column public.exam_keys.exam_room_id is
  'Deprecated: exam keys are global across published exam rooms. The concrete room is stored on exam_sessions.';

comment on column public.exam_keys.paper_id is
  'Deprecated: exam keys no longer preselect a paper. The paper is chosen from the selected exam room at join time.';

comment on column public.exam_keys.is_public is
  'When true, the key can be used by multiple accounts in any published exam room and total_attempts is a shared global quota. When false, the key is claimed by the first account but still works across rooms for that account.';

comment on column public.key_batches.exam_room_id is
  'Deprecated: key batches are global across exam rooms.';

create or replace function private.fn_exam_keys_sync_paper_room()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.exam_room_id := null;
  new.paper_id := null;
  return new;
end;
$$;

comment on function private.fn_exam_keys_sync_paper_room() is
  'Keeps exam keys unscoped by clearing deprecated room and paper references.';

drop trigger if exists trg_exam_keys_sync_paper_room on public.exam_keys;
create trigger trg_exam_keys_sync_paper_room
  before insert or update of exam_room_id, paper_id
  on public.exam_keys
  for each row
  execute function private.fn_exam_keys_sync_paper_room();

create or replace view public.admin_exam_key_overview
with (security_invoker = true)
as
select
  ek.id,
  ek.code,
  ek.exam_room_id,
  'Dùng cho mọi phòng thi'::text as exam_room_name,
  null::text as subject_code,
  'Tất cả môn'::text as subject_name,
  ek.batch_id,
  ek.assigned_to,
  st.full_name as student_name,
  ek.total_attempts,
  ek.used_attempts,
  greatest(ek.total_attempts - ek.used_attempts, 0) as remaining_attempts,
  ek.status,
  ek.expires_at,
  ek.created_at,
  kb.quantity as batch_quantity,
  kb.expires_at as batch_expires_at,
  ek.is_public
from public.exam_keys ek
left join public.students st on st.id = ek.assigned_to
left join public.key_batches kb on kb.id = ek.batch_id
where private.is_staff();

create or replace view public.student_key_summary
with (security_invoker = true)
as
select
  st.id as student_id,
  p.email as gmail,
  st.full_name,
  st.school_name,
  st.province_name,
  st.district_name,
  st.phone,
  st.current_key_id,
  k.code as current_key_code,
  k.status as current_key_status,
  k.exam_room_id,
  null::text as exam_room_code,
  case when k.id is null then null else 'Dùng cho mọi phòng thi' end as exam_room_name,
  null::text as subject_code,
  k.total_attempts,
  k.used_attempts,
  greatest(k.total_attempts - k.used_attempts, 0) as remaining_attempts,
  (k.used_attempts > 0) as current_key_has_been_used,
  k.expires_at as current_key_expires_at,
  coalesce(key_stats.assigned_key_count, 0) as assigned_key_count,
  coalesce(key_stats.used_key_count, 0) as used_key_count,
  coalesce(key_stats.exhausted_key_count, 0) as exhausted_key_count
from public.students st
left join public.profiles p on st.id = p.id
left join lateral (
  select ek.*
  from public.exam_keys ek
  where (
      ek.assigned_to = st.id
      or (ek.is_public and ek.id = st.current_key_id)
    )
    and (st.current_key_id is null or ek.id = st.current_key_id)
  order by coalesce(ek.id = st.current_key_id, false) desc, ek.created_at desc
  limit 1
) k on true
left join lateral (
  select
    count(*)::int as assigned_key_count,
    count(*) filter (where ek.used_attempts > 0)::int as used_key_count,
    count(*) filter (where ek.status = 'exhausted')::int as exhausted_key_count
  from public.exam_keys ek
  where ek.assigned_to = st.id
) key_stats on true;

drop function if exists public.generate_exam_keys(uuid, int, timestamptz, text);

create or replace function public.generate_exam_keys(
  p_exam_room_id uuid,
  p_quantity int,
  p_expires_at timestamptz,
  p_note text,
  p_total_attempts int,
  p_is_public boolean
)
returns table (
  id uuid,
  code text,
  exam_room_id uuid,
  batch_id uuid,
  subject_code text,
  exam_room_name text,
  is_public boolean,
  total_attempts int,
  used_attempts int,
  status public.exam_key_status,
  expires_at timestamptz,
  created_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_exam_year int;
  v_batch_id uuid;
  v_code text;
  v_code_prefix text;
  v_key public.exam_keys%rowtype;
  v_counter int;
  v_retry int;
  v_now timestamptz := now();
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not private.is_staff() then
    raise exception 'Only staff can generate exam keys' using errcode = '42501';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Quantity must be between 1 and 500';
  end if;

  if p_total_attempts is null or p_total_attempts < 1 or p_total_attempts > 100000 then
    raise exception 'Total attempts must be between 1 and 100000';
  end if;

  if p_is_public is null then
    raise exception 'Key visibility is required';
  end if;

  if p_expires_at is not null and p_expires_at <= v_now then
    raise exception 'Key expiry must be in the future';
  end if;

  select max(eb.exam_year)::int
    into v_exam_year
  from public.exam_blueprints eb
  where eb.status = 'published';

  v_exam_year := coalesce(v_exam_year, extract(year from v_now)::int);
  v_code_prefix := case
    when p_is_public then 'PUB-THPT-'
    else 'KEY-THPT-'
  end || v_exam_year::text || '-';

  insert into public.key_batches as kb (
    exam_room_id,
    quantity,
    note,
    created_by,
    expires_at,
    total_attempts,
    is_public
  )
  values (
    null,
    p_quantity,
    nullif(trim(p_note), ''),
    (select auth.uid()),
    p_expires_at,
    p_total_attempts,
    p_is_public
  )
  returning kb.id into v_batch_id;

  for v_counter in 1..p_quantity loop
    v_retry := 0;

    loop
      v_retry := v_retry + 1;
      v_code := upper(
        v_code_prefix
        || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10)
      );

      begin
        insert into public.exam_keys (
          code,
          exam_room_id,
          paper_id,
          batch_id,
          is_public,
          total_attempts,
          expires_at,
          status
        )
        values (
          v_code,
          null,
          null,
          v_batch_id,
          p_is_public,
          p_total_attempts,
          p_expires_at,
          'unused'
        )
        returning * into v_key;

        id := v_key.id;
        code := v_key.code;
        exam_room_id := null;
        batch_id := v_key.batch_id;
        subject_code := null;
        exam_room_name := 'Dùng cho mọi phòng thi';
        is_public := v_key.is_public;
        total_attempts := v_key.total_attempts;
        used_attempts := v_key.used_attempts;
        status := v_key.status;
        expires_at := v_key.expires_at;
        created_at := v_key.created_at;

        return next;
        exit;
      exception
        when unique_violation then
          if v_retry >= 5 then
            raise;
          end if;
      end;
    end loop;
  end loop;
end;
$$;

revoke all on function public.generate_exam_keys(uuid, int, timestamptz, text, int, boolean)
  from public, anon;

grant execute on function public.generate_exam_keys(uuid, int, timestamptz, text, int, boolean)
  to authenticated;

drop function if exists public.activate_exam_key(text);

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
  end if;

  update public.students
  set current_key_id = v_key.id,
      updated_at = v_now
  where id = v_student_id
    and current_key_id is null;

  select ek.status::text
    into v_status
  from public.exam_keys ek
  where ek.id = v_key.id;

  return jsonb_build_object(
    'success', true,
    'key_id', v_key.id,
    'exam_room_id', null,
    'paper_id', null,
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

drop function if exists public.join_exam(text, text);

create or replace function public.join_exam(
  p_code text,
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
  key_record record;
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
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if nullif(trim(p_code), '') is null then
    raise exception 'KEY_NOT_FOUND';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');
  requested_room_id := p_exam_room_id;

  select
    key.id,
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

  if requested_room_id is not null then
    select room.id, room.subject_code, room.duration_minutes
      into room_id, room_subject_code, v_duration
    from public.exam_rooms room
    where room.id = requested_room_id
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

  -- Finalize overdue sessions before deciding whether to resume or block.
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

revoke all on function public.join_exam(text, text, uuid)
  from public, anon;

grant execute on function public.join_exam(text, text, uuid)
  to authenticated;

comment on function public.activate_exam_key(text, text) is
  'Claims an exam key for the authenticated student without binding it to a room.';

comment on function public.join_exam(text, text, uuid) is
  'Claims an exam key, resolves the selected room at join time, creates or resumes an exam session, and copies questions.';

grant select on public.admin_exam_key_overview to authenticated;
grant select on public.student_key_summary to authenticated;

notify pgrst, 'reload schema';
