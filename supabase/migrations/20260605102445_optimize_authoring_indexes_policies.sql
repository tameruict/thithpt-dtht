create index if not exists idx_exam_authoring_documents_created_by
  on public.exam_authoring_documents(created_by);
create index if not exists idx_exam_authoring_documents_updated_by
  on public.exam_authoring_documents(updated_by);
create index if not exists idx_exam_authoring_documents_materialized_question
  on public.exam_authoring_documents(materialized_question_id)
  where materialized_question_id is not null;
create index if not exists idx_exam_room_papers_source
  on public.exam_room_papers(source_paper_id)
  where source_paper_id is not null;
create index if not exists idx_exam_room_questions_room
  on public.exam_room_questions(exam_room_id);
drop policy if exists authoring_documents_staff_write
  on public.exam_authoring_documents;
drop policy if exists authoring_documents_staff_insert
  on public.exam_authoring_documents;
create policy authoring_documents_staff_insert
  on public.exam_authoring_documents
  for insert to authenticated
  with check (
    private.is_staff()
    and created_by = (select auth.uid())
    and updated_by = (select auth.uid())
  );
drop policy if exists authoring_documents_staff_update
  on public.exam_authoring_documents;
create policy authoring_documents_staff_update
  on public.exam_authoring_documents
  for update to authenticated
  using (private.is_staff())
  with check (
    private.is_staff()
    and updated_by = (select auth.uid())
  );
drop policy if exists authoring_documents_staff_delete
  on public.exam_authoring_documents;
create policy authoring_documents_staff_delete
  on public.exam_authoring_documents
  for delete to authenticated
  using (private.is_staff());
notify pgrst, 'reload schema';
