begin;
delete from public.session_answers where session_question_id in (select esq.id from public.exam_session_questions esq join public.exam_sessions s on s.id=esq.session_id where s.client_info->>'audit_run'='audit-20260825-500');
delete from public.session_tf_item_answers where session_question_id in (select esq.id from public.exam_session_questions esq join public.exam_sessions s on s.id=esq.session_id where s.client_info->>'audit_run'='audit-20260825-500');
delete from public.exam_session_questions where session_id in (select id from public.exam_sessions where client_info->>'audit_run'='audit-20260825-500');
delete from public.exam_sessions where client_info->>'audit_run'='audit-20260825-500';
delete from public.exam_keys where code like 'AUDIT-audit-20260825-500-%';
delete from public.key_batches where note='audit-20260825-500';
delete from auth.users where email like 'audit-20260825-500-%';
commit;