
-- The earlier REVOKE from anon/authenticated was ineffective because EXECUTE is granted to
-- PUBLIC by default. Revoke from PUBLIC, then re-grant only where genuinely needed.
-- Cron + functions are owned by postgres, which can always execute regardless of grants.

revoke execute on function public.expire_overdue_exam_sessions() from public, anon, authenticated;
revoke execute on function public.get_active_session()            from public, anon, authenticated;
revoke execute on function public.get_session_review(uuid)        from public, anon, authenticated;

grant  execute on function public.get_active_session()            to authenticated;
grant  execute on function public.get_session_review(uuid)        to authenticated;
;
