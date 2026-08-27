create table if not exists public.exam_room_papers (
  id uuid primary key default extensions.gen_random_uuid(),
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  blueprint_id uuid not null references public.exam_blueprints(id) on delete restrict,
  paper_code text not null,
  label text,
  is_default boolean not null default false,
  display_order smallint not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_room_id, paper_code)
);
create unique index if not exists uq_exam_room_papers_default
  on public.exam_room_papers(exam_room_id)
  where is_default = true;
create index if not exists idx_exam_room_papers_room
  on public.exam_room_papers(exam_room_id, display_order);
create index if not exists idx_exam_room_papers_blueprint
  on public.exam_room_papers(blueprint_id);
alter table public.exam_room_papers enable row level security;
grant select, insert, update, delete
  on public.exam_room_papers
  to authenticated;
grant select, insert, update, delete
  on public.exam_room_papers
  to service_role;
drop policy if exists "exam_room_papers_read_published" on public.exam_room_papers;
create policy "exam_room_papers_read_published"
on public.exam_room_papers
for select
to authenticated
using (
  private.is_staff()
  or exists (
    select 1
    from public.exam_rooms er
    where er.id = exam_room_id
      and er.status = 'published'
  )
);
drop policy if exists "exam_room_papers_staff_write" on public.exam_room_papers;
create policy "exam_room_papers_staff_write"
on public.exam_room_papers
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create or replace function private.ensure_exam_room_paper_matches_room()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_room_subject_code text;
  v_blueprint_subject_code text;
begin
  select er.subject_code
    into v_room_subject_code
  from public.exam_rooms er
  where er.id = new.exam_room_id;

  if v_room_subject_code is null then
    raise exception 'EXAM_ROOM_NOT_FOUND';
  end if;

  select eb.subject_code
    into v_blueprint_subject_code
  from public.exam_blueprints eb
  where eb.id = new.blueprint_id;

  if v_blueprint_subject_code is null then
    raise exception 'EXAM_BLUEPRINT_NOT_FOUND';
  end if;

  if v_blueprint_subject_code <> v_room_subject_code then
    raise exception 'PAPER_SUBJECT_MISMATCH';
  end if;

  new.paper_code := upper(trim(new.paper_code));

  if new.paper_code = '' then
    raise exception 'PAPER_CODE_REQUIRED';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_exam_room_papers_validate on public.exam_room_papers;
create trigger trg_exam_room_papers_validate
  before insert or update of exam_room_id, blueprint_id, paper_code
  on public.exam_room_papers
  for each row
  execute function private.ensure_exam_room_paper_matches_room();
drop trigger if exists trg_exam_room_papers_updated_at on public.exam_room_papers;
create trigger trg_exam_room_papers_updated_at
  before update on public.exam_room_papers
  for each row
  execute function private.touch_updated_at();
insert into public.exam_room_papers (
  exam_room_id,
  blueprint_id,
  paper_code,
  label,
  is_default,
  display_order
)
select
  er.id,
  er.blueprint_id,
  'DEFAULT',
  'Default paper',
  not exists (
    select 1
    from public.exam_room_papers existing_default
    where existing_default.exam_room_id = er.id
      and existing_default.is_default
  ),
  0
from public.exam_rooms er
where not exists (
  select 1
  from public.exam_room_papers erp
  where erp.exam_room_id = er.id
    and erp.paper_code = 'DEFAULT'
);
create or replace function private.ensure_exam_room_question_matches_blueprint()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  room_record record;
  section_record record;
  question_record record;
begin
  select er.blueprint_id, er.subject_code
    into room_record
  from public.exam_rooms er
  where er.id = new.exam_room_id;

  if room_record.blueprint_id is null then
    raise exception 'Exam room not found';
  end if;

  select bs.blueprint_id, bs.question_type
    into section_record
  from public.exam_blueprint_sections bs
  where bs.id = new.blueprint_section_id;

  if section_record.blueprint_id is null then
    raise exception 'Blueprint section not found';
  end if;

  select q.subject_code, q.type
    into question_record
  from public.questions q
  where q.id = new.question_id;

  if question_record.subject_code is null then
    raise exception 'Question not found';
  end if;

  if section_record.blueprint_id <> room_record.blueprint_id
    and not exists (
      select 1
      from public.exam_room_papers erp
      where erp.exam_room_id = new.exam_room_id
        and erp.blueprint_id = section_record.blueprint_id
    )
  then
    raise exception 'Blueprint section does not belong to an exam room paper';
  end if;

  if question_record.subject_code <> room_record.subject_code then
    raise exception 'Question subject does not match exam room subject';
  end if;

  if question_record.type <> section_record.question_type then
    raise exception 'Question type does not match blueprint section type';
  end if;

  return new;
end;
$$;
comment on table public.exam_room_papers is
  'Paper variants available in an exam room. Each paper references a blueprint for the same subject.';
notify pgrst, 'reload schema';
