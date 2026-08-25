alter table public.knowledge_fields
  add constraint knowledge_fields_id_subject_code_key
  unique (id, subject_code);

alter table public.knowledge_fields
  drop constraint knowledge_fields_parent_id_fkey;

alter table public.knowledge_fields
  add constraint knowledge_fields_parent_subject_fkey
  foreign key (parent_id, subject_code)
  references public.knowledge_fields(id, subject_code)
  on delete set null (parent_id)
  not valid;

alter table public.questions
  drop constraint questions_knowledge_field_id_fkey;

alter table public.questions
  add constraint questions_knowledge_field_subject_fkey
  foreign key (knowledge_field_id, subject_code)
  references public.knowledge_fields(id, subject_code)
  on delete set null (knowledge_field_id)
  not valid;

alter table public.knowledge_fields
  add constraint knowledge_fields_slug_canonical
  check (
    slug = lower(btrim(slug))
    and length(slug) between 1 and 80
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  )
  not valid;

alter table public.knowledge_fields
  validate constraint knowledge_fields_parent_subject_fkey;
alter table public.questions
  validate constraint questions_knowledge_field_subject_fkey;
alter table public.knowledge_fields
  validate constraint knowledge_fields_slug_canonical;

create or replace function public.publish_authoring_document(
  p_document_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  publish_result jsonb;
  document_mode text;
  document_subject_code text;
  question_payload jsonb;
  question_ordinality bigint;
  published_question_id uuid;
  knowledge_slug text;
  resolved_knowledge_field_id bigint;
begin
  if not private.is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  select mode, subject_code
    into document_mode, document_subject_code
  from public.exam_authoring_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'AUTHORING_DOCUMENT_NOT_FOUND';
  end if;

  if nullif(p_payload ->> 'mode', '') is distinct from document_mode
    or nullif(upper(trim(p_payload ->> 'subjectCode')), '')
      is distinct from document_subject_code
  then
    raise exception 'AUTHORING_DOCUMENT_PAYLOAD_MISMATCH';
  end if;

  publish_result := private.publish_authoring_document_core(
    p_document_id,
    p_expected_revision,
    p_payload
  );

  for question_payload, question_ordinality in
    select value, ordinality
    from jsonb_array_elements(p_payload -> 'questions') with ordinality
  loop
    published_question_id :=
      (publish_result -> 'questionIds' ->> (question_ordinality - 1)::integer)::uuid;
    knowledge_slug :=
      nullif(lower(trim(question_payload ->> 'knowledgeFieldSlug')), '');
    resolved_knowledge_field_id := null;

    if knowledge_slug is not null then
      select field.id
        into resolved_knowledge_field_id
      from public.knowledge_fields field
      where field.subject_code = document_subject_code
        and field.slug = knowledge_slug;

      if resolved_knowledge_field_id is null then
        raise exception 'KNOWLEDGE_FIELD_NOT_FOUND:%', knowledge_slug;
      end if;
    end if;

    update public.questions question
    set
      knowledge_field_id = resolved_knowledge_field_id,
      metadata = question.metadata || jsonb_strip_nulls(
        jsonb_build_object('knowledge_field_slug', knowledge_slug)
      )
    where question.id = published_question_id;
  end loop;

  return publish_result;
end;
$$;

revoke all on function public.publish_authoring_document(uuid, bigint, jsonb)
  from public, anon;
grant execute on function public.publish_authoring_document(uuid, bigint, jsonb)
  to authenticated;

notify pgrst, 'reload schema';;
