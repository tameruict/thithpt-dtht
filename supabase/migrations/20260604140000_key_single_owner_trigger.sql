create or replace function private.fn_exam_keys_guard_owner()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.assigned_to is distinct from new.assigned_to
    and old.assigned_to is not null
    and new.assigned_to is not null
    and old.assigned_to <> new.assigned_to
  then
    raise exception 'KEY_ALREADY_ASSIGNED'
      using errcode = 'P0001',
            hint = 'KEY_ALREADY_ASSIGNED';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_exam_keys_guard_owner on public.exam_keys;
create trigger trg_exam_keys_guard_owner
  before update of assigned_to on public.exam_keys
  for each row
  execute function private.fn_exam_keys_guard_owner();
comment on function private.fn_exam_keys_guard_owner() is
  'Prevents moving an assigned exam key directly from one student to another. Staff can reset assigned_to to null first.';
