create or replace function private.prevent_duplicate_authoring_revision()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  document_id uuid;
  source_revision bigint;
  published_revision bigint;
begin
  document_id := nullif(new.metadata ->> 'authoring_document_id', '')::uuid;
  source_revision :=
    nullif(new.metadata ->> 'authoring_revision', '')::bigint;

  if document_id is null or source_revision is null then
    return new;
  end if;

  select document.published_revision
    into published_revision
  from public.exam_authoring_documents document
  where document.id = document_id;

  if published_revision = source_revision then
    raise exception 'AUTHORING_REVISION_ALREADY_PUBLISHED';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_questions_prevent_duplicate_authoring_revision
  on public.questions;
create trigger trg_questions_prevent_duplicate_authoring_revision
  before insert on public.questions
  for each row
  execute function private.prevent_duplicate_authoring_revision();
revoke all on function private.prevent_duplicate_authoring_revision()
  from public, anon, authenticated;
notify pgrst, 'reload schema';
