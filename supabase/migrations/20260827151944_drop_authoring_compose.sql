-- Remove the retired authoring and paper-composition APIs.  The exam runtime
-- tables (exam_room_papers, exam_room_questions and r2_assets) remain intact.

drop trigger if exists trg_questions_prevent_duplicate_authoring_revision
  on public.questions;

drop function if exists public.save_authoring_document(uuid, bigint, text);
drop function if exists public.publish_authoring_document(uuid, bigint, jsonb);
drop function if exists public.create_exam_paper_successor(uuid);
drop function if exists public.get_paper_composition(uuid);
drop function if exists public.compose_add_questions(uuid, uuid[]);
drop function if exists public.compose_remove_question(uuid, uuid);
drop function if exists public.register_r2_asset(
  text, text, text, text, text, bigint, integer, integer, text
);

drop function if exists private.compose_paper_json(uuid);
drop function if exists private.publish_authoring_document_core(uuid, bigint, jsonb);
drop function if exists private.resolve_authoring_image(jsonb);
drop function if exists private.prevent_duplicate_authoring_revision();

drop table if exists public.exam_authoring_documents;

notify pgrst, 'reload schema';
