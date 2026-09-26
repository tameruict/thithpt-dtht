-- Fix get_active_exam_session_full / get_session_review_core_20260821 so they
-- also work for "direct exam" sessions created by start_exam_session(), which
-- have exam_room_id = null and exam_id = <exams.id>. Both functions used an
-- INNER JOIN on exam_rooms keyed by exam_room_id, so a null exam_room_id
-- produced zero rows and the RPC silently returned NULL -> /exam/[sessionId]
-- and /result/[sessionId] broke for every session created via the new
-- exam-bank flow. Switched to LEFT JOIN exam_rooms + LEFT JOIN exams (by
-- exam_id) and build the 'room'/session label fields from whichever source is
-- present. save_session_answers and score_exam_session do not join
-- exam_rooms at all, so they are untouched.

CREATE OR REPLACE FUNCTION public.get_active_exam_session_full(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  caller_id uuid := (select auth.uid());
  owner_id uuid;
  session_status text;
  due_at_value timestamptz;
  result_value jsonb;
begin
  if caller_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select session.student_id, session.status::text, session.due_at
    into owner_id, session_status, due_at_value
  from public.exam_sessions session
  where session.id = p_session_id;

  if owner_id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if owner_id <> caller_id and not private.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if session_status = 'in_progress'
     and due_at_value is not null
     and due_at_value <= now()
  then
    update public.exam_sessions
    set status = 'submitted',
        submitted_at = coalesce(due_at, now()),
        grading_status = 'pending_auto',
        client_info = client_info || jsonb_build_object('finalized', 'auto_expired'),
        updated_at = now()
    where id = p_session_id
      and status = 'in_progress';
    session_status := 'submitted';
  end if;

  if session_status <> 'in_progress' and not private.is_admin() then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id,
      'status', session.status,
      'attempt_number', session.attempt_number,
      'started_at', session.started_at,
      'due_at', session.due_at,
      'submitted_at', session.submitted_at,
      'score', session.score,
      'max_score', session.max_score,
      'exam_room_id', session.exam_room_id,
      'grading_status', session.grading_status
    ),
    'room', case
      when room.id is not null then jsonb_build_object(
        'id', room.id,
        'code', room.code,
        'name', room.name,
        'duration_minutes', room.duration_minutes,
        'status', room.status,
        'mode', room.mode,
        'price_vnd', room.price_vnd,
        'total_attempts_default', room.total_attempts_default,
        'starts_at', room.starts_at,
        'ends_at', room.ends_at,
        'published_at', room.published_at,
        'blueprint_code', blueprint.code,
        'blueprint_name', blueprint.name,
        'subject_code', room.subject_code,
        'subject_name', subject.name
      )
      when exam.id is not null then jsonb_build_object(
        'id', exam.id,
        'code', exam.code,
        'name', exam.title,
        'duration_minutes', exam.duration_minutes,
        'status', exam.status,
        'mode', null,
        'price_vnd', 0,
        'total_attempts_default', null,
        'starts_at', null,
        'ends_at', null,
        'published_at', null,
        'blueprint_code', null,
        'blueprint_name', null,
        'subject_code', exam.subject_code,
        'subject_name', subject.name
      )
      else null
    end,
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', session_question.id,
          'question_seq', session_question.question_seq,
          'display_no', coalesce(
            session_question.display_no,
            session_question.question_seq::text
          ),
          'max_points', session_question.max_points,
          'question_id', question.id,
          'code', question.code,
          'type', question.type,
          'content', question.content,
          'image_url', question.image_url,
          'image_alt_text', (
            select asset.alt_text
            from public.question_assets asset
            where asset.question_id = question.id
              and asset.kind = 'image'
              and (question.image_url is null or asset.url = question.image_url)
            order by asset.display_order
            limit 1
          ),
          'image_width_px', (
            select registry.width_px
            from public.r2_assets registry
            where registry.public_url = question.image_url
            limit 1
          ),
          'image_height_px', (
            select registry.height_px
            from public.r2_assets registry
            where registry.public_url = question.image_url
            limit 1
          ),
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', option.id,
                'seq', option.seq,
                'label', option.label,
                'content', option.content,
                'image_url', option.image_url,
                'image_alt_text', option.image_alt_text,
                'image_width_px', (
                  select registry.width_px
                  from public.r2_assets registry
                  where registry.public_url = option.image_url
                  limit 1
                ),
                'image_height_px', (
                  select registry.height_px
                  from public.r2_assets registry
                  where registry.public_url = option.image_url
                  limit 1
                )
              )
              order by
                coalesce(array_position(session_question.option_order, option.id), 32767),
                option.seq
            )
            from public.question_options option
            where option.question_id = question.id
          ), '[]'::jsonb),
          'true_false_items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'seq', item.seq,
                'label', item.label,
                'content', item.content
              ) order by item.seq
            )
            from public.question_true_false_items item
            where item.question_id = question.id
          ), '[]'::jsonb)
        ) order by session_question.question_seq
      )
      from public.exam_session_questions session_question
      join public.questions question on question.id = session_question.question_id
      where session_question.session_id = session.id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_question_id', answer.session_question_id,
          'answer_json', answer.answer_json,
          'selected_option_id', answer.selected_option_id,
          'short_answer_text', answer.short_answer_text,
          'is_correct', answer.is_correct,
          'earned_points', answer.earned_points
        )
      )
      from public.session_answers answer
      join public.exam_session_questions answer_question
        on answer_question.id = answer.session_question_id
      where answer_question.session_id = session.id
        and answer.student_id = session.student_id
    ), '[]'::jsonb)
  )
  into result_value
  from public.exam_sessions session
  left join public.exam_rooms room on room.id = session.exam_room_id
  left join public.exams exam on exam.id = session.exam_id
  left join public.exam_blueprints blueprint on blueprint.id = room.blueprint_id
  left join public.subjects subject on subject.code = coalesce(room.subject_code, exam.subject_code)
  where session.id = p_session_id;

  return result_value;
end;
$function$;

CREATE OR REPLACE FUNCTION public.get_session_review_core_20260821(p_session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_student uuid;
  v_status text;
  v_score numeric;
  v_due timestamptz;
  v_duration integer;
  v_room_deleted_at timestamptz;
  v_caller uuid := (select auth.uid());
  v_now timestamptz := now();
  v_result jsonb;
begin
  select
    session.student_id,
    session.status::text,
    session.score,
    session.due_at,
    coalesce(room.duration_minutes, exam.duration_minutes),
    room.deleted_at
  into v_student, v_status, v_score, v_due, v_duration, v_room_deleted_at
  from public.exam_sessions session
  left join public.exam_rooms room on room.id = session.exam_room_id
  left join public.exams exam on exam.id = session.exam_id
  where session.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_caller is null
     or (v_caller <> v_student and not private.is_admin()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status = 'in_progress' then
    if coalesce(v_due, v_now) <= v_now then
      update public.exam_sessions
      set status = 'submitted',
          submitted_at = coalesce(v_due, v_now),
          client_info = client_info ||
            jsonb_build_object('finalized', 'auto_expired'),
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
        'id', session.id,
        'status', session.status,
        'attempt_number', session.attempt_number,
        'started_at', session.started_at,
        'submitted_at', session.submitted_at,
        'due_at', session.due_at,
        'scored_at', session.scored_at,
        'score', session.score,
        'max_score', session.max_score,
        'exam_room_id', session.exam_room_id,
        'room_name', coalesce(room.name, exam.title),
        'room_code', coalesce(room.code, exam.code),
        'room_deleted', room.deleted_at is not null,
        'duration_minutes', coalesce(room.duration_minutes, exam.duration_minutes),
        'subject_code', coalesce(room.subject_code, exam.subject_code),
        'subject_name', subject.name,
        'blueprint_code', blueprint.code,
        'blueprint_name', blueprint.name
      )
      from public.exam_sessions session
      left join public.exam_rooms room on room.id = session.exam_room_id
      left join public.exams exam on exam.id = session.exam_id
      left join public.subjects subject on subject.code = coalesce(room.subject_code, exam.subject_code)
      left join public.exam_blueprints blueprint
        on blueprint.id = room.blueprint_id
      where session.id = p_session_id
    ),
    'questions', case
      when v_room_deleted_at is not null then '[]'::jsonb
      else coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', session_question.id,
            'question_seq', session_question.question_seq,
            'display_no', coalesce(
              session_question.display_no,
              session_question.question_seq::text
            ),
            'max_points', session_question.max_points,
            'question_id', question.id,
            'code', question.code,
            'type', question.type,
            'content', question.content,
            'image_url', question.image_url,
            'image_alt_text', (
              select asset.alt_text
              from public.question_assets asset
              where asset.question_id = question.id
                and asset.kind = 'image'
                and (question.image_url is null or asset.url = question.image_url)
              order by asset.display_order
              limit 1
            ),
            'options', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', option.id,
                  'seq', option.seq,
                  'label', option.label,
                  'content', option.content,
                  'image_url', option.image_url,
                  'image_alt_text', option.image_alt_text,
                  'correct', exists(
                    select 1
                    from public.question_correct_options correct
                    where correct.question_id = question.id
                      and correct.option_id = option.id
                  )
                ) order by option.seq
              )
              from public.question_options option
              where option.question_id = question.id
            ), '[]'::jsonb),
            'true_false_items', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', item.id,
                  'seq', item.seq,
                  'label', item.label,
                  'content', item.content,
                  'correct_value', (
                    select answer.correct_value
                    from public.question_true_false_answer_keys answer
                    where answer.question_id = question.id
                      and answer.item_id = item.id
                  )
                ) order by item.seq
              )
              from public.question_true_false_items item
              where item.question_id = question.id
            ), '[]'::jsonb),
            'short_answer_keys', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'display', coalesce(
                    answer.display_value,
                    answer.normalized_text,
                    answer.numeric_value::text
                  ),
                  'answer_type', answer.answer_type
                ) order by answer.is_primary desc nulls last
              )
              from public.question_short_answer_keys answer
              where answer.question_id = question.id
            ), '[]'::jsonb),
            'answer', (
              select jsonb_build_object(
                'answer_json', answer.answer_json,
                'selected_option_id', answer.selected_option_id,
                'short_answer_text', answer.short_answer_text,
                'is_correct', answer.is_correct,
                'earned_points', answer.earned_points
              )
              from public.session_answers answer
              where answer.session_question_id = session_question.id
                and answer.student_id = v_student
              limit 1
            )
          ) order by session_question.question_seq
        )
        from public.exam_session_questions session_question
        join public.questions question
          on question.id = session_question.question_id
        where session_question.session_id = p_session_id
      ), '[]'::jsonb)
    end
  ) into v_result;

  return v_result;
end;
$function$;
