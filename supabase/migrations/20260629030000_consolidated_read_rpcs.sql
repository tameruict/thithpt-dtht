-- Nhóm 2 — Gộp round-trip thành 1 RPC (tăng tốc read-path tới Supabase Mumbai).
--
-- Bối cảnh: web đang CSR, mỗi trang nối nhiều round-trip tới region Mumbai
-- (~60-120ms/lượt). Hai trang nặng nhất:
--   * /exam: fetchExamSessionData chạy 3 chặng NỐI TIẾP (session -> questions+room
--     -> answers) = 3 RTT.
--   * /subjects: 3-4 request song song (subjects, rooms, profile, active_session).
-- Hai RPC dưới gộp toàn bộ về 1 round-trip mỗi trang, dữ liệu build sẵn ở DB.
--
-- Bảo mật: cả hai là SECURITY DEFINER (đi vòng RLS để gộp join) nên TỰ kiểm tra
-- quyền bằng auth.uid(); chỉ cấp execute cho authenticated (thu hồi public/anon).

-- 1) get_exam_session_full(p_session_id) --------------------------------------
-- Thay fetchExamSessionData: trả session + room + danh sách câu hỏi (KÈM đáp án
-- đã chọn của chính thí sinh) trong 1 lượt. KHÔNG lộ đáp án đúng — đây là lúc
-- đang làm bài, khác hẳn get_session_review (chỉ lộ đáp án sau khi nộp).
-- Chỉ đọc, không mutate: trang /exam tự quyết định hết-giờ dựa trên due_at.
create or replace function public.get_exam_session_full(p_session_id uuid)
returns jsonb
language plpgsql
stable
security definer set search_path to ''
as $function$
declare
  v_student uuid;
  v_caller uuid := (select auth.uid());
  v_result jsonb;
begin
  select s.student_id into v_student
  from public.exam_sessions s
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  -- Chỉ chủ phiên (hoặc staff) mới đọc được. RLS bị bypass trong DEFINER nên
  -- phải tự chốt quyền ở đây.
  if v_caller is not null
     and v_caller <> v_student
     and not private.is_staff() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', s.id,
        'status', s.status,
        'attempt_number', s.attempt_number,
        'started_at', s.started_at,
        'due_at', s.due_at,
        'submitted_at', s.submitted_at,
        'score', s.score,
        'max_score', s.max_score,
        'exam_room_id', s.exam_room_id
      )
      from public.exam_sessions s
      where s.id = p_session_id
    ),
    'room', (
      select jsonb_build_object(
        'id', rm.id,
        'code', rm.code,
        'name', rm.name,
        'duration_minutes', rm.duration_minutes,
        'status', rm.status,
        'price_vnd', rm.price_vnd,
        'total_attempts_default', rm.total_attempts_default,
        'starts_at', rm.starts_at,
        'ends_at', rm.ends_at,
        'published_at', rm.published_at,
        'blueprint_code', bp.code,
        'blueprint_name', bp.name,
        'subject_code', rm.subject_code,
        'subject_name', sub.name
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
                'image_alt_text', o.image_alt_text
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
                'content', t.content
              ) order by t.seq
            )
            from public.question_true_false_items t
            where t.question_id = q.id
          ), '[]'::jsonb)
        ) order by esq.question_seq
      )
      from public.exam_session_questions esq
      join public.questions q on q.id = esq.question_id
      where esq.session_id = p_session_id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_question_id', a.session_question_id,
          'answer_json', a.answer_json,
          'selected_option_id', a.selected_option_id,
          'short_answer_text', a.short_answer_text,
          'is_correct', a.is_correct,
          'earned_points', a.earned_points
        )
      )
      from public.session_answers a
      join public.exam_session_questions esq on esq.id = a.session_question_id
      where esq.session_id = p_session_id
        and a.student_id = v_student
    ), '[]'::jsonb)
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_exam_session_full(uuid) from public, anon;
grant execute on function public.get_exam_session_full(uuid) to authenticated;

-- 2) get_subjects_dashboard() -------------------------------------------------
-- Thay 3-4 request của /subjects bằng 1: danh sách môn đang mở + phòng đã
-- publish (dùng chung để đếm số phòng/môn ở client) + profile của chính người
-- gọi + phiên đang làm dở. Cũng tự kết thúc phiên quá hạn của người gọi (giống
-- get_active_session) để banner "Tiếp tục" không hiện nhầm phiên hết giờ.
create or replace function public.get_subjects_dashboard()
returns jsonb
language plpgsql
security definer set search_path to ''
as $function$
declare
  v_student uuid := (select auth.uid());
  v_now timestamptz := now();
  v_result jsonb;
begin
  if v_student is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Dọn phiên quá hạn của chính người gọi trước khi đọc active_session.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
      client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = v_now
  from public.exam_rooms rm
  where s.student_id = v_student
    and s.status = 'in_progress'
    and rm.id = s.exam_room_id
    and coalesce(
      s.due_at,
      s.started_at + make_interval(mins => rm.duration_minutes)
    ) <= v_now;

  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', sub.code,
          'name', sub.name,
          'default_duration_minutes', sub.default_duration_minutes,
          'is_compulsory', sub.is_compulsory,
          'is_active', sub.is_active
        ) order by sub.is_compulsory desc, sub.name
      )
      from public.subjects sub
      where sub.is_active = true
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', rm.id,
          'code', rm.code,
          'name', rm.name,
          'duration_minutes', rm.duration_minutes,
          'status', rm.status,
          'price_vnd', rm.price_vnd,
          'total_attempts_default', rm.total_attempts_default,
          'starts_at', rm.starts_at,
          'ends_at', rm.ends_at,
          'published_at', rm.published_at,
          'blueprint_code', bp.code,
          'blueprint_name', bp.name,
          'subject_code', rm.subject_code,
          'subject_name', sub.name
        ) order by sub.name, rm.published_at desc
      )
      from public.exam_rooms rm
      join public.exam_blueprints bp on bp.id = rm.blueprint_id
      join public.subjects sub on sub.code = rm.subject_code
      where rm.status = 'published'
    ), '[]'::jsonb),
    'profile', (
      select jsonb_build_object(
        'id', p.id,
        'email', p.email::text,
        'role', p.role::text,
        'full_name', p.full_name,
        'avatar_url', p.avatar_url
      )
      from public.profiles p
      where p.id = v_student
    ),
    'active_session', (
      select jsonb_build_object(
        'session_id', s.id,
        'exam_room_id', s.exam_room_id,
        'room_name', rm.name,
        'room_code', rm.code,
        'subject_name', sub.name,
        'started_at', s.started_at,
        'due_at', s.due_at
      )
      from public.exam_sessions s
      join public.exam_rooms rm on rm.id = s.exam_room_id
      left join public.subjects sub on sub.code = rm.subject_code
      where s.student_id = v_student
        and s.status = 'in_progress'
      order by s.started_at desc
      limit 1
    )
  )
  into v_result;

  return v_result;
end;
$function$;

revoke all on function public.get_subjects_dashboard() from public, anon;
grant execute on function public.get_subjects_dashboard() to authenticated;

notify pgrst, 'reload schema';
