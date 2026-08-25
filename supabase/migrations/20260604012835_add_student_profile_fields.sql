alter table public.students
  add column if not exists date_of_birth date,
  add column if not exists gender text;
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'students_gender_check'
      and conrelid = 'public.students'::regclass
  ) then
    alter table public.students
      add constraint students_gender_check
      check (
        gender is null
        or gender in ('male', 'female', 'other')
      );
  end if;
end $$;
drop policy if exists "Staff updates students"
on public.students;
drop policy if exists "Students update their own student row"
on public.students;
drop policy if exists "Students and staff update students"
on public.students;
create policy "Students and staff update students"
on public.students
for update
to authenticated
using (id = (select auth.uid()) or private.is_staff())
with check (id = (select auth.uid()) or private.is_staff());
