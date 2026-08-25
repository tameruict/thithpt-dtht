update public.exam_rooms er
set subject_code = eb.subject_code,
    updated_at = now()
from public.exam_blueprints eb
where eb.id = er.blueprint_id
  and er.subject_code is distinct from eb.subject_code;
alter table public.exam_rooms
  drop constraint if exists exam_rooms_blueprint_id_subject_code_fkey;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'exam_rooms_blueprint_id_fkey'
      and conrelid = 'public.exam_rooms'::regclass
  ) then
    alter table public.exam_rooms
      add constraint exam_rooms_blueprint_id_fkey
      foreign key (blueprint_id)
      references public.exam_blueprints(id)
      on delete restrict;
  end if;
end;
$$;
create or replace function private.fn_sync_room_subject_code()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_subject_code text;
begin
  select eb.subject_code
    into v_subject_code
  from public.exam_blueprints eb
  where eb.id = new.blueprint_id;

  if v_subject_code is null then
    raise exception 'EXAM_BLUEPRINT_NOT_FOUND';
  end if;

  new.subject_code := v_subject_code;
  return new;
end;
$$;
drop trigger if exists trg_sync_room_subject_code on public.exam_rooms;
create trigger trg_sync_room_subject_code
  before insert or update of blueprint_id, subject_code
  on public.exam_rooms
  for each row
  execute function private.fn_sync_room_subject_code();
create or replace view public.v_exam_rooms_full
with (security_invoker = true)
as
select
  er.id,
  er.blueprint_id,
  eb.subject_code,
  er.code,
  er.name,
  er.duration_minutes,
  er.status,
  er.price_vnd,
  er.total_attempts_default,
  er.starts_at,
  er.ends_at,
  er.published_at,
  er.settings,
  er.blueprint_snapshot,
  er.created_by,
  er.created_at,
  er.updated_at,
  eb.code as blueprint_code,
  eb.name as blueprint_name,
  s.name as subject_name,
  s.exam_group as subject_exam_group
from public.exam_rooms er
join public.exam_blueprints eb on eb.id = er.blueprint_id
join public.subjects s on s.code = eb.subject_code;
grant select on public.v_exam_rooms_full to authenticated;
comment on function private.fn_sync_room_subject_code() is
  'Keeps exam_rooms.subject_code derived from exam_rooms.blueprint_id.';
comment on view public.v_exam_rooms_full is
  'Exam rooms with subject and blueprint details derived through the room blueprint.';
notify pgrst, 'reload schema';
