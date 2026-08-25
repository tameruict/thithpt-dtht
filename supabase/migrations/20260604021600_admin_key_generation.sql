alter table public.key_batches
  add column if not exists expires_at timestamptz;
alter table public.key_batches
  add column if not exists total_attempts int not null default 3;
alter table public.key_batches
  drop constraint if exists key_batches_total_attempts_positive;
alter table public.key_batches
  add constraint key_batches_total_attempts_positive
  check (total_attempts > 0);
create index if not exists key_batches_room_created_idx
  on public.key_batches(exam_room_id, created_at desc);
create index if not exists exam_keys_expires_status_idx
  on public.exam_keys(expires_at, status)
  where expires_at is not null;
insert into public.exam_rooms (
  blueprint_id,
  subject_code,
  code,
  name,
  duration_minutes,
  status,
  total_attempts_default,
  published_at
)
select
  b.id,
  b.subject_code,
  'ROOM_' || b.code,
  'Phòng thi THPT ' || b.exam_year || ' - ' || s.name,
  b.duration_minutes,
  'published'::public.exam_room_status,
  3,
  now()
from public.exam_blueprints b
join public.subjects s on s.code = b.subject_code
where b.status = 'published'
on conflict (code) do update
set
  blueprint_id = excluded.blueprint_id,
  subject_code = excluded.subject_code,
  name = excluded.name,
  duration_minutes = excluded.duration_minutes,
  status = case
    when public.exam_rooms.status = 'archived' then public.exam_rooms.status
    else excluded.status
  end,
  total_attempts_default = excluded.total_attempts_default,
  published_at = coalesce(public.exam_rooms.published_at, excluded.published_at),
  updated_at = now();
create or replace view public.admin_exam_room_options
with (security_invoker = true)
as
select
  er.id,
  er.code,
  er.name,
  er.subject_code,
  s.name as subject_name,
  er.duration_minutes,
  er.status,
  er.total_attempts_default,
  er.ends_at
from public.exam_rooms er
join public.subjects s on s.code = er.subject_code
where private.is_staff()
  and er.status <> 'archived';
create or replace view public.admin_exam_key_overview
with (security_invoker = true)
as
select
  ek.id,
  ek.code,
  ek.exam_room_id,
  er.name as exam_room_name,
  er.subject_code,
  s.name as subject_name,
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
  kb.expires_at as batch_expires_at
from public.exam_keys ek
join public.exam_rooms er on er.id = ek.exam_room_id
join public.subjects s on s.code = er.subject_code
left join public.students st on st.id = ek.assigned_to
left join public.key_batches kb on kb.id = ek.batch_id
where private.is_staff();
create or replace function public.generate_exam_keys(
  p_exam_room_id uuid,
  p_quantity int,
  p_expires_at timestamptz default null,
  p_note text default null
)
returns table (
  id uuid,
  code text,
  exam_room_id uuid,
  batch_id uuid,
  subject_code text,
  exam_room_name text,
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
  v_room record;
  v_batch_id uuid;
  v_code text;
  v_key public.exam_keys%rowtype;
  v_counter int;
  v_retry int;
begin
  if (select auth.uid()) is null then
    raise exception 'Not authenticated' using errcode = '28000';
  end if;

  if not private.is_staff() then
    raise exception 'Only staff can generate exam keys' using errcode = '42501';
  end if;

  if p_exam_room_id is null then
    raise exception 'Exam room is required';
  end if;

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Quantity must be between 1 and 500';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Key expiry must be in the future';
  end if;

  select
    er.id,
    er.name,
    er.subject_code,
    er.status,
    er.total_attempts_default,
    b.exam_year
  into v_room
  from public.exam_rooms er
  join public.exam_blueprints b on b.id = er.blueprint_id
  where er.id = p_exam_room_id;

  if v_room.id is null then
    raise exception 'Exam room not found';
  end if;

  if v_room.status = 'archived' then
    raise exception 'Cannot generate keys for archived exam room';
  end if;

  insert into public.key_batches as kb (
    exam_room_id,
    quantity,
    note,
    created_by,
    expires_at,
    total_attempts
  )
  values (
    p_exam_room_id,
    p_quantity,
    nullif(trim(p_note), ''),
    (select auth.uid()),
    p_expires_at,
    v_room.total_attempts_default
  )
  returning kb.id into v_batch_id;

  for v_counter in 1..p_quantity loop
    v_retry := 0;

    loop
      v_retry := v_retry + 1;
      v_code := upper(
        v_room.subject_code
        || '-'
        || v_room.exam_year::text
        || '-'
        || substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 10)
      );

      begin
        insert into public.exam_keys (
          code,
          exam_room_id,
          batch_id,
          total_attempts,
          expires_at,
          status
        )
        values (
          v_code,
          p_exam_room_id,
          v_batch_id,
          v_room.total_attempts_default,
          p_expires_at,
          'unused'
        )
        returning * into v_key;

        id := v_key.id;
        code := v_key.code;
        exam_room_id := v_key.exam_room_id;
        batch_id := v_key.batch_id;
        subject_code := v_room.subject_code;
        exam_room_name := v_room.name;
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
revoke all on function public.generate_exam_keys(uuid, int, timestamptz, text)
  from public, anon;
grant execute on function public.generate_exam_keys(uuid, int, timestamptz, text)
  to authenticated;
grant select on public.admin_exam_room_options to authenticated;
grant select on public.admin_exam_key_overview to authenticated;
