-- QB_FIX_20260914-3: grant service_role EXECUTE on the questions
-- content-hash trigger chain. Same rationale as the previous migration:
-- service_role already bypasses RLS; this only lets server-side
-- maintenance update question content without tripping the trigger.
grant execute on function private.set_question_content_hash() to service_role;
grant execute on function private.normalized_question_hash(text) to service_role;
grant execute on function private.normalized_question_content(text) to service_role;
