-- Giai đoạn 1 — Slice D: Chấm tự luận.
--
-- Câu tự luận (type='essay') được score_exam_session để lại grader='pending'
-- (earned_points = null) chờ giáo viên chấm tay. Hai RPC dưới cho phép staff:
--   1. get_pending_essays(): liệt kê các bài tự luận đã nộp còn chờ chấm, kèm
--      nội dung câu hỏi + bài làm của thí sinh.
--   2. grade_essay_answer(): đặt điểm cho một bài, rồi tính LẠI tổng điểm phiên
--      (nguyên tử) từ mọi earned_points hiện có.
-- Cả hai SECURITY DEFINER, tự kiểm private.is_staff().

create or replace function public.get_pending_essays(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      sa.id                                             as answer_id,
      esq.session_id                                    as session_id,
      st.full_name                                      as student_name,
      rm.name                                           as room_name,
      sub.name                                          as subject_name,
      coalesce(esq.display_no, esq.question_seq::text)  as display_no,
      esq.max_points                                    as max_points,
      q.content                                         as question_content,
      coalesce(sa.short_answer_text, sa.answer_json ->> 'value') as student_answer,
      sa.earned_points                                  as earned_points,
      s.submitted_at                                    as submitted_at
    from public.session_answers sa
    join public.exam_session_questions esq on esq.id = sa.session_question_id
    join public.exam_sessions s on s.id = esq.session_id
    join public.questions q on q.id = esq.question_id
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = sa.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where q.type = 'essay'
      and s.status = 'submitted'
      and coalesce(sa.grader ->> 'type', 'pending') <> 'manual'
    order by s.submitted_at desc nulls last
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_pending_essays(integer) from public, anon;
grant execute on function public.get_pending_essays(integer) to authenticated;

create or replace function public.grade_essay_answer(p_answer_id uuid, p_points numeric)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session_id uuid;
  v_max_points numeric;
  v_q_type text;
  v_total numeric;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  if p_points is null or p_points < 0 then
    raise exception 'INVALID_POINTS';
  end if;

  select esq.session_id, esq.max_points, q.type::text
    into v_session_id, v_max_points, v_q_type
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  join public.questions q on q.id = esq.question_id
  where sa.id = p_answer_id;

  if v_session_id is null then
    raise exception 'ANSWER_NOT_FOUND';
  end if;

  if v_q_type <> 'essay' then
    raise exception 'NOT_AN_ESSAY';
  end if;

  if p_points > v_max_points then
    raise exception 'POINTS_EXCEED_MAX';
  end if;

  update public.session_answers
     set earned_points = p_points,
         is_correct = (p_points >= v_max_points),
         grader = jsonb_build_object('type', 'manual', 'by', (select auth.uid()), 'at', now()),
         updated_at = now()
   where id = p_answer_id;

  -- Tính lại tổng điểm phiên từ mọi câu đã có earned_points (null bị bỏ qua).
  select coalesce(sum(sa.earned_points), 0)
    into v_total
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  where esq.session_id = v_session_id;

  update public.exam_sessions
     set score      = v_total,
         scored_at  = now(),
         updated_at = now()
   where id = v_session_id;

  return v_total;
end;
$function$;

revoke all on function public.grade_essay_answer(uuid, numeric) from public, anon;
grant execute on function public.grade_essay_answer(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';
