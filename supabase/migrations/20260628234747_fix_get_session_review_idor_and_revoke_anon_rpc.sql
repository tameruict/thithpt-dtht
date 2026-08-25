
-- #1 IDOR: deny anonymous callers (auth.uid() IS NULL skipped the ownership check before)
-- #2 Revoke RPC EXECUTE from anon (and cron-only fn from authenticated too)

create or replace function public.get_session_review(p_session_id uuid)
 returns jsonb
 language plpgsql
 security definer
 set search_path to ''
as $function$
declare
  v_student uuid;
  v_status text;
  v_score numeric;
  v_due timestamptz;
  v_duration integer;
  v_caller uuid := (select auth.uid());
  v_now timestamptz := now();
  v_result jsonb;
begin
  select s.student_id, s.status::text, s.score, s.due_at, rm.duration_minutes
    into v_student, v_status, v_score, v_due, v_duration
  from public.exam_sessions s
  join public.exam_rooms rm on rm.id = s.exam_room_id
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  -- Ownership gate: anonymous (v_caller IS NULL) is now rejected; only the
  -- owning student or staff may read the review.
  if v_caller is null
     or (v_caller <> v_student and not private.is_staff()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status = 'in_progress' then
    if coalesce(v_due, v_now) <= v_now then
      update public.exam_sessions
      set status = 'submitted',
          submitted_at = coalesce(v_due, v_now),
          client_info = client_info || jsonb_build_object('finalized', 'auto_expired'),
          updated_at = v_now
      where id = p_session_id;
      v_status := 'submitted';
    else
      raise exception 'SESSION_NOT_ENDED';
    end if;
  end if;

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
                  select 1 from public.question_correct_options c
                  where c.question_id = q.id and c.option_id = o.id
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
                  where k.question_id = q.id and k.item_id = t.id
                )
              ) order by t.seq
            )
            from public.question_true_false_items t
            where t.question_id = q.id
          ), '[]'::jsonb),
          'short_answer_keys', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'display', coalesce(sak.display_value, sak.normalized_text, sak.numeric_value::text),
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

revoke execute on function public.expire_overdue_exam_sessions() from anon, authenticated;
revoke execute on function public.get_session_review(uuid)        from anon;
revoke execute on function public.get_active_session()            from anon;
;
