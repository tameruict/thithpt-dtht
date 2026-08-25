alter function public.publish_authoring_document(uuid, bigint, jsonb)
  rename to publish_authoring_document_core;

revoke all on function public.publish_authoring_document_core(uuid, bigint, jsonb)
  from public, anon;
grant execute on function public.publish_authoring_document_core(uuid, bigint, jsonb)
  to authenticated;

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

  select subject_code
    into document_subject_code
  from public.exam_authoring_documents
  where id = p_document_id;

  if document_subject_code is null then
    raise exception 'AUTHORING_DOCUMENT_NOT_FOUND';
  end if;

  publish_result := public.publish_authoring_document_core(
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
