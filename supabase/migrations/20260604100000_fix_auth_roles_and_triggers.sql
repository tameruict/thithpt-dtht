-- 1. Fix tamatm6713@gmail.com role
update public.profiles
set role = 'admin'
where email = 'tamatm6713@gmail.com';
-- 2. Fix policies that incorrectly used anon/public role
drop policy if exists "Public catalog is readable" on public.subjects;
create policy "Public catalog is readable"
on public.subjects
for select
to authenticated
using (is_active or private.is_staff());
drop policy if exists "Subject tracks are readable" on public.subject_tracks;
create policy "Subject tracks are readable"
on public.subject_tracks
for select
to authenticated
using (is_active or private.is_staff());
drop policy if exists "Published blueprints are readable" on public.exam_blueprints;
create policy "Published blueprints are readable"
on public.exam_blueprints
for select
to authenticated
using (status = 'published' or private.is_staff());
drop policy if exists "Blueprint sections are readable" on public.exam_blueprint_sections;
create policy "Blueprint sections are readable"
on public.exam_blueprint_sections
for select
to authenticated
using (
  private.is_staff()
  or
  exists (
    select 1
    from public.exam_blueprints b
    where b.id = blueprint_id
      and b.status = 'published'
  )
);
-- Revoke permissions from anon to prevent unauthenticated access
revoke usage on schema public from anon;
revoke usage on schema private from anon;
revoke execute on all functions in schema private from anon;
revoke select on public.subjects from anon;
revoke select on public.subject_tracks from anon;
revoke select on public.exam_blueprints from anon;
revoke select on public.exam_blueprint_sections from anon;
revoke select on public.exam_blueprint_score_summary from anon;
-- 3. Add handle_new_user trigger
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'student'
  );
  return new;
end;
$$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
