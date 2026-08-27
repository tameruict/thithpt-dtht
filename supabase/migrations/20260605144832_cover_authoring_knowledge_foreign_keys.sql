create index if not exists knowledge_fields_parent_subject_idx
  on public.knowledge_fields(parent_id, subject_code);

create index if not exists questions_knowledge_field_subject_idx
  on public.questions(knowledge_field_id, subject_code);

drop index if exists public.idx_knowledge_fields_parent_id;
drop index if exists public.idx_questions_knowledge_field_id;;
