-- Restore the asynchronous submit contract after the production foundation
-- migration reintroduced synchronous scoring into submit_exam_session.
-- Submission must only transition state; the cron/lazy scorer handles grading.

create or replace function public.submit_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_status text;
begin
  select session.student_id, session.status::text
    into v_student_id, v_status
  from public.exam_sessions session
  where session.id = p_session_id;

  if v_student_id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_student_id <> (select auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status <> 'in_progress' then
    return;
  end if;

  update public.exam_sessions
  set status = 'submitted',
      submitted_at = now(),
      grading_status = 'pending_auto',
      grading_error = null,
      updated_at = now()
  where id = p_session_id
    and student_id = v_student_id
    and status = 'in_progress';
end;
$$;

revoke all on function public.submit_exam_session(uuid) from public, anon;
grant execute on function public.submit_exam_session(uuid) to authenticated;
