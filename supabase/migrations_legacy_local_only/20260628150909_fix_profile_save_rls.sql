-- Fix profile saving for authenticated students.
--
-- The previous profiles_no_self_role_escalation policy read public.profiles
-- from inside a policy on public.profiles. On Postgres RLS this can recurse
-- while the profile update runs, which blocks the student profile save flow.
-- Keep role escalation protection in a trigger instead, where OLD/NEW are
-- available without querying the protected row through RLS.

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'::public.user_role
  );
$$;

create or replace function private.prevent_non_admin_profile_role_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.role is distinct from new.role and not private.is_admin() then
    raise exception 'Only admins can change profile roles'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_prevent_non_admin_role_change
  on public.profiles;

create trigger profiles_prevent_non_admin_role_change
before update of role on public.profiles
for each row execute function private.prevent_non_admin_profile_role_change();

drop policy if exists profiles_no_self_role_escalation
  on public.profiles;

drop policy if exists "Profile updates are owner-limited or staff"
  on public.profiles;

create policy "Profile updates are owner-limited or staff"
on public.profiles
for update
to authenticated
using (
  id = (select auth.uid())
  or private.is_staff()
)
with check (
  id = (select auth.uid())
  or private.is_staff()
);

grant usage on schema public to authenticated;
grant usage on schema private to authenticated;

grant select, insert, update, delete
  on table public.profiles, public.students
  to authenticated;

revoke all on function private.is_admin() from public, anon;
grant execute on function private.is_admin() to authenticated;

revoke all on function private.prevent_non_admin_profile_role_change()
  from public, anon;
