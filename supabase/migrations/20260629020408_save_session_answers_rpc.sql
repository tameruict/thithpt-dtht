-- Save a batch of answers without trusting a client-supplied student_id.
--
-- SECURITY INVOKER is intentional: the insert/update still has to pass the
-- existing session_answers RLS policies. The function only derives ownership
-- from auth.uid() and constrains every question to the requested active session.
create or replace function public.save_session_answers(
  p_session_id uuid,
  p_answers jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_student_id uuid := (select auth.uid());
  v_expected_count integer;
  v_saved_count integer;
begin
  if v_student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if jsonb_typeof(p_answers) <> 'array' then
    raise exception 'INVALID_ANSWERS_PAYLOAD';
  end if;

  v_expected_count := jsonb_array_length(p_answers);
  if v_expected_count = 0 then
    return;
  end if;

  if not exists (
    select 1
    from public.exam_sessions session
    where session.id = p_session_id
      and session.student_id = v_student_id
      and session.status = 'in_progress'
      and (session.due_at is null or session.due_at > now())
  ) then
    raise exception 'SESSION_NOT_WRITABLE';
  end if;

  insert into public.session_answers as answer (
    session_question_id,
    student_id,
    selected_option_id,
    short_answer_text,
    answer_json,
    submitted_at
  )
  select
    question.id,
    v_student_id,
    input.selected_option_id,
    input.short_answer_text,
    coalesce(input.answer_json, '{}'::jsonb),
    now()
  from jsonb_to_recordset(p_answers) as input (
    session_question_id uuid,
    selected_option_id uuid,
    short_answer_text text,
    answer_json jsonb
  )
  join public.exam_session_questions question
    on question.id = input.session_question_id
   and question.session_id = p_session_id
  on conflict (session_question_id) do update
  set selected_option_id = excluded.selected_option_id,
      short_answer_text = excluded.short_answer_text,
      answer_json = excluded.answer_json,
      submitted_at = excluded.submitted_at,
      updated_at = now()
  where answer.student_id = v_student_id;

  get diagnostics v_saved_count = row_count;
  if v_saved_count <> v_expected_count then
    raise exception 'ANSWER_SESSION_MISMATCH';
  end if;
end;
$function$;

revoke all on function public.save_session_answers(uuid, jsonb)
  from public, anon;
grant execute on function public.save_session_answers(uuid, jsonb)
  to authenticated;

notify pgrst, 'reload schema';
