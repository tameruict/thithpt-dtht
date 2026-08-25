-- Block students from reading any submitted answer key while they still have
-- another live exam session. This check belongs in the SECURITY DEFINER RPC:
-- UI redirects and RLS on the answer-key tables cannot protect this bypass.

-- get_exam_session_full is intended only for resuming the live attempt, but
-- its original contract also accepted submitted session IDs. Put a guarded
-- entry point in front of it and remove direct client access to the old RPC.
create or replace function public.get_active_exam_session_full(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path to ''
as $function$
declare
  v_caller uuid := (select auth.uid());
  v_student uuid;
  v_status text;
  v_due timestamptz;
  v_started timestamptz;
  v_duration integer;
  v_is_staff boolean := false;
begin
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_is_staff := private.is_staff();

  select
    session.student_id,
    session.status::text,
    session.due_at,
    session.started_at,
    room.duration_minutes
  into v_student, v_status, v_due, v_started, v_duration
  from public.exam_sessions session
  join public.exam_rooms room on room.id = session.exam_room_id
  where session.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_caller <> v_student and not v_is_staff then
    raise exception 'PERMISSION_DENIED';
  end if;

  if not v_is_staff and (
    v_status <> 'in_progress'
    or coalesce(
      v_due,
      v_started + make_interval(mins => v_duration)
    ) <= now()
  ) then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  return public.get_exam_session_full(p_session_id);
end;
$function$;

revoke all on function public.get_exam_session_full(uuid)
  from public, anon, authenticated;
revoke all on function public.get_active_exam_session_full(uuid)
  from public, anon;
grant execute on function public.get_active_exam_session_full(uuid)
  to authenticated;

-- A direct PostgREST query against session_answers used to reveal a previous
-- attempt's selected option plus is_correct/earned_points. Keep current-draft
-- answers readable for resume, but hide completed answers while any live exam
-- exists for the student.
drop policy if exists "Answers visible to owner or staff"
  on public.session_answers;
drop policy if exists session_answers_read_guarded
  on public.session_answers;

create policy session_answers_read_guarded
on public.session_answers
for select
to authenticated
using (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.exam_session_questions target_question
      join public.exam_sessions target_session
        on target_session.id = target_question.session_id
      where target_question.id = session_answers.session_question_id
        and target_session.student_id = (select auth.uid())
        and (
          target_session.status = 'in_progress'
          or not exists (
            select 1
            from public.exam_sessions active_session
            join public.exam_rooms active_room
              on active_room.id = active_session.exam_room_id
            where active_session.student_id = (select auth.uid())
              and active_session.status = 'in_progress'
              and coalesce(
                active_session.due_at,
                active_session.started_at
                  + make_interval(mins => active_room.duration_minutes)
              ) > now()
          )
        )
    )
  )
);

-- Some environments have the detailed true/false answer table from a remote
-- migration that is not present in every local history. Apply the same guard
-- when the table exists, without making local resets depend on that table.
do $do$
begin
  if to_regclass('public.session_tf_item_answers') is not null then
    execute 'drop policy if exists stfia_student_read_own on public.session_tf_item_answers';
    execute 'drop policy if exists stfia_student_read_guarded on public.session_tf_item_answers';
    execute $policy$
      create policy stfia_student_read_guarded
      on public.session_tf_item_answers
      for select
      to authenticated
      using (
        private.is_staff()
        or exists (
          select 1
          from public.exam_session_questions target_question
          join public.exam_sessions target_session
            on target_session.id = target_question.session_id
          where target_question.id = session_tf_item_answers.session_question_id
            and target_session.student_id = (select auth.uid())
            and (
              target_session.status = 'in_progress'
              or not exists (
                select 1
                from public.exam_sessions active_session
                join public.exam_rooms active_room
                  on active_room.id = active_session.exam_room_id
                where active_session.student_id = (select auth.uid())
                  and active_session.status = 'in_progress'
                  and coalesce(
                    active_session.due_at,
                    active_session.started_at
                      + make_interval(mins => active_room.duration_minutes)
                  ) > now()
              )
            )
        )
      )
    $policy$;
  end if;
end;
$do$;

create or replace function public.get_session_review(p_session_id uuid)
returns jsonb
language plpgsql
security definer set search_path to ''
as $function$
declare
  v_student uuid;
  v_status text;
  v_score numeric;
  v_due timestamptz;
  v_duration integer;
  v_caller uuid := (select auth.uid());
  v_is_staff boolean := false;
  v_now timestamptz := now();
  v_result jsonb;
begin
  -- Functions are executable by PUBLIC by default in PostgreSQL. Never let a
  -- missing JWT fall through an ownership check in a SECURITY DEFINER RPC.
  if v_caller is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  v_is_staff := private.is_staff();

  select s.student_id, s.status::text, s.score, s.due_at, rm.duration_minutes
    into v_student, v_status, v_score, v_due, v_duration
  from public.exam_sessions s
  join public.exam_rooms rm on rm.id = s.exam_room_id
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_caller <> v_student and not v_is_staff then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Preserve the existing lifecycle behavior for the requested session.
  if v_status = 'in_progress' then
    if coalesce(
      v_due,
      (select s.started_at + make_interval(mins => v_duration)
       from public.exam_sessions s
       where s.id = p_session_id)
    ) <= v_now then
      update public.exam_sessions
      set status = 'submitted',
          submitted_at = coalesce(
            v_due,
            started_at + make_interval(mins => v_duration),
            v_now
          ),
          client_info = client_info || jsonb_build_object('finalized', 'auto_expired'),
          updated_at = v_now
      where id = p_session_id;
      v_status := 'submitted';
    else
      raise exception 'SESSION_NOT_ENDED';
    end if;
  end if;

  -- Staff may review for support/grading. A student may not read answer keys
  -- from any completed attempt while any other attempt still has time left.
  if not v_is_staff and exists (
    select 1
    from public.exam_sessions active_session
    join public.exam_rooms active_room
      on active_room.id = active_session.exam_room_id
    where active_session.student_id = v_caller
      and active_session.status = 'in_progress'
      and coalesce(
        active_session.due_at,
        active_session.started_at
          + make_interval(mins => active_room.duration_minutes)
      ) > v_now
  ) then
    raise exception 'ACTIVE_EXAM_IN_PROGRESS';
  end if;

  -- Score only after the authorization guard so a blocked review has no
  -- answer-related side effects.
  if v_status = 'submitted' and v_score is null then
    perform public.score_exam_session(p_session_id);
  end if;

  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'attempt_number', s.attempt_number,
        'started_at', s.started_at,
        'submitted_at', s.submitted_at,
        'due_at', s.due_at,
        'scored_at', s.scored_at,
        'score', s.score,
        'max_score', s.max_score,
        'exam_room_id', s.exam_room_id,
        'room_name', rm.name,
        'room_code', rm.code,
        'duration_minutes', rm.duration_minutes,
        'subject_code', rm.subject_code,
        'subject_name', sub.name,
        'blueprint_code', bp.code,
        'blueprint_name', bp.name
      )
      from public.exam_sessions s
      join public.exam_rooms rm on rm.id = s.exam_room_id
      left join public.subjects sub on sub.code = rm.subject_code
      left join public.exam_blueprints bp on bp.id = rm.blueprint_id
      where s.id = p_session_id
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', esq.id,
          'question_seq', esq.question_seq,
          'display_no', coalesce(esq.display_no, esq.question_seq::text),
          'max_points', esq.max_points,
          'question_id', q.id,
          'code', q.code,
          'type', q.type,
          'content', q.content,
          'image_url', q.image_url,
          'image_alt_text', (
            select qa.alt_text
            from public.question_assets qa
            where qa.question_id = q.id
              and qa.kind = 'image'
              and (q.image_url is null or qa.url = q.image_url)
            order by qa.display_order
            limit 1
          ),
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', o.id,
                'seq', o.seq,
                'label', o.label,
                'content', o.content,
                'image_url', o.image_url,
                'image_alt_text', o.image_alt_text,
                'correct', exists(
                  select 1
                  from public.question_correct_options c
                  where c.question_id = q.id
                    and c.option_id = o.id
                )
              ) order by o.seq
            )
            from public.question_options o
            where o.question_id = q.id
          ), '[]'::jsonb),
          'true_false_items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', t.id,
                'seq', t.seq,
                'label', t.label,
                'content', t.content,
                'correct_value', (
                  select k.correct_value
                  from public.question_true_false_answer_keys k
                  where k.question_id = q.id
                    and k.item_id = t.id
                )
              ) order by t.seq
            )
            from public.question_true_false_items t
            where t.question_id = q.id
          ), '[]'::jsonb),
          'short_answer_keys', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'display', coalesce(
                  sak.display_value,
                  sak.normalized_text,
                  sak.numeric_value::text
                ),
                'answer_type', sak.answer_type
              ) order by sak.is_primary desc nulls last
            )
            from public.question_short_answer_keys sak
            where sak.question_id = q.id
          ), '[]'::jsonb),
          'answer', (
            select jsonb_build_object(
              'answer_json', a.answer_json,
              'selected_option_id', a.selected_option_id,
              'short_answer_text', a.short_answer_text,
              'is_correct', a.is_correct,
              'earned_points', a.earned_points
            )
            from public.session_answers a
            where a.session_question_id = esq.id
              and a.student_id = v_student
            limit 1
          )
        ) order by esq.question_seq
      )
      from public.exam_session_questions esq
      join public.questions q on q.id = esq.question_id
      where esq.session_id = p_session_id
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

-- SECURITY DEFINER functions must not inherit PostgreSQL's default PUBLIC
-- execute privilege. Only authenticated callers can enter the function, and
-- the body still performs ownership and active-session authorization checks.
revoke all on function public.get_session_review(uuid) from public, anon;
grant execute on function public.get_session_review(uuid) to authenticated;

notify pgrst, 'reload schema';
