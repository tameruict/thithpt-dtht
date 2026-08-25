alter table public.key_batches
  alter column exam_room_id drop not null;
alter table public.exam_keys
  alter column exam_room_id drop not null;
update public.exam_keys
set exam_room_id = null
where exam_room_id is not null;
update public.key_batches
set exam_room_id = null
where exam_room_id is not null;
drop index if exists public.key_batches_room_created_idx;
create index if not exists key_batches_created_idx
  on public.key_batches(created_at desc);
drop policy if exists "Published exam rooms are readable" on public.exam_rooms;
create policy "Published exam rooms are readable"
on public.exam_rooms
for select
to authenticated
using (
  private.is_staff()
  or status = 'published'
);
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
  )
);
create or replace view public.admin_exam_key_overview
with (security_invoker = true)
as
select
  ek.id,
  ek.code,
  ek.exam_room_id,
  coalesce(er.name, 'Dùng cho mọi phòng thi') as exam_room_name,
  er.subject_code,
  coalesce(s.name, 'Tất cả môn') as subject_name,
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
left join public.exam_rooms er on er.id = ek.exam_room_id
left join public.subjects s on s.code = er.subject_code
left join public.students st on st.id = ek.assigned_to
left join public.key_batches kb on kb.id = ek.batch_id
where private.is_staff();
drop function if exists public.generate_exam_keys(uuid, int, timestamptz, text);
drop function if exists public.generate_exam_keys(int, timestamptz, text, int);
create or replace function public.generate_exam_keys(
  p_quantity int,
  p_expires_at timestamptz default null,
  p_note text default null,
  p_total_attempts int default 3
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

  if p_quantity is null or p_quantity < 1 or p_quantity > 500 then
    raise exception 'Quantity must be between 1 and 500';
  end if;

  if p_total_attempts is null or p_total_attempts < 1 or p_total_attempts > 20 then
    raise exception 'Total attempts must be between 1 and 20';
  end if;

  if p_expires_at is not null and p_expires_at <= now() then
    raise exception 'Key expiry must be in the future';
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
    null,
    p_quantity,
    nullif(trim(p_note), ''),
    (select auth.uid()),
    p_expires_at,
    p_total_attempts
  )
  returning kb.id into v_batch_id;

  for v_counter in 1..p_quantity loop
    v_retry := 0;

    loop
      v_retry := v_retry + 1;
      v_code := upper(
        'THPT-2026-'
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
          null,
          v_batch_id,
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
revoke all on function public.generate_exam_keys(int, timestamptz, text, int)
  from public, anon;
grant execute on function public.generate_exam_keys(int, timestamptz, text, int)
  to authenticated;
grant select on public.admin_exam_key_overview to authenticated;
