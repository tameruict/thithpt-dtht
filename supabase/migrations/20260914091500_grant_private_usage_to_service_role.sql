-- QB_FIX_20260914-2: allow service_role to run the questions content-hash
-- trigger chain (private.set_question_content_hash ->
-- private.normalized_question_hash). The trigger resolves the nested helper
-- by name at execution time, which requires USAGE ON SCHEMA private.
-- service_role already bypasses RLS, so this grants no new data access;
-- it only un-breaks server-side maintenance (content audit/fix scripts).
-- Authenticated/anon roles are deliberately NOT granted.
grant usage on schema private to service_role;
