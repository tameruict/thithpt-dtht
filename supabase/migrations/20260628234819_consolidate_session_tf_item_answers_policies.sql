
-- #5 Collapse overlapping permissive policies so each (role, action) has exactly one.
-- Keep the granular stfia_* set; drop the older redundant owner_read + staff_write(ALL).
-- staff_write(ALL) only uniquely provided staff INSERT, so fold is_staff into the student upsert.

drop policy if exists session_tf_item_answers_owner_read on public.session_tf_item_answers;
drop policy if exists session_tf_item_answers_staff_write on public.session_tf_item_answers;

drop policy if exists stfia_student_upsert_own on public.session_tf_item_answers;
create policy stfia_student_upsert_own
  on public.session_tf_item_answers
  for insert
  to authenticated
  with check (
    private.is_staff()
    or exists (
      select 1
      from public.exam_session_questions esq
      join public.exam_sessions es on es.id = esq.session_id
      where esq.id = session_tf_item_answers.session_question_id
        and es.student_id = (select auth.uid())
        and es.status = 'in_progress'::exam_session_status
    )
  );
;
