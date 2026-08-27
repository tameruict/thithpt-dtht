
-- =====================================================================
-- FIX 1: One-time cleanup — đánh dấu ngay các key đã quá hạn
-- =====================================================================
UPDATE public.exam_keys
SET
  status    = 'expired'::public.exam_key_status,
  updated_at = now()
WHERE expires_at IS NOT NULL
  AND expires_at < now()
  AND status IN ('unused'::public.exam_key_status, 'active'::public.exam_key_status);

-- =====================================================================
-- FIX 2: Cascade trigger — khi key_batches.expires_at thay đổi,
--         tự động cập nhật exam_keys tương ứng
-- =====================================================================
CREATE OR REPLACE FUNCTION private.fn_cascade_batch_expires_to_keys()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  IF OLD.expires_at IS DISTINCT FROM NEW.expires_at THEN
    UPDATE public.exam_keys
    SET
      -- Lấy expiry sớm nhất giữa key cũ và batch mới
      expires_at = CASE
        WHEN NEW.expires_at IS NULL THEN expires_at          -- batch bỏ expiry → giữ key-level
        WHEN expires_at IS NULL OR NEW.expires_at < expires_at THEN NEW.expires_at
        ELSE expires_at
      END,
      -- Auto-expire nếu batch expiry mới đã qua
      status = CASE
        WHEN NEW.expires_at IS NOT NULL
             AND NEW.expires_at <= now()
             AND status IN ('unused'::public.exam_key_status, 'active'::public.exam_key_status)
          THEN 'expired'::public.exam_key_status
        ELSE status
      END,
      updated_at = now()
    WHERE batch_id = NEW.id
      AND status NOT IN (
        'revoked'::public.exam_key_status,
        'exhausted'::public.exam_key_status,
        'expired'::public.exam_key_status
      );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cascade_batch_expires_to_keys ON public.key_batches;
CREATE TRIGGER trg_cascade_batch_expires_to_keys
  AFTER UPDATE OF expires_at ON public.key_batches
  FOR EACH ROW
  EXECUTE FUNCTION private.fn_cascade_batch_expires_to_keys();

-- =====================================================================
-- FIX 3: Cập nhật join_exam — kiểm tra BOTH key-level và batch-level expiry
-- =====================================================================
CREATE OR REPLACE FUNCTION public.join_exam(
  p_code        text,
  p_subject_code text DEFAULT NULL::text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
#variable_conflict use_variable
declare
  key_record          record;
  session_id          uuid;
  student_id          uuid;
  subject_code        text;
  room_id             uuid;
  room_subject_code   text;
  paper_id            uuid;
  now_at              timestamptz := now();
  effective_expires   timestamptz;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');

  -- JOIN key_batches để lấy batch-level expiry
  select
    key.id,
    key.exam_room_id,
    key.paper_id,
    key.assigned_to,
    key.total_attempts,
    key.used_attempts,
    key.status,
    key.expires_at,
    kb.expires_at as batch_expires_at
  into key_record
  from public.exam_keys key
  left join public.key_batches kb on kb.id = key.batch_id
  where key.code = upper(trim(p_code))
  for update of key;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  -- Effective expiry = min(key.expires_at, batch.expires_at), NULL = vô hạn
  effective_expires := least(
    coalesce(key_record.expires_at,       'infinity'::timestamptz),
    coalesce(key_record.batch_expires_at, 'infinity'::timestamptz)
  );

  if effective_expires < now_at then
    raise exception 'KEY_EXPIRED';
  end if;

  if key_record.assigned_to is not null
    and key_record.assigned_to <> student_id
  then
    raise exception 'KEY_ASSIGNED_TO_OTHER';
  end if;

  if key_record.used_attempts >= key_record.total_attempts then
    raise exception 'KEY_NO_ATTEMPTS_LEFT';
  end if;

  -- Xác định phòng thi và paper
  if key_record.paper_id is not null then
    select room.id, room.subject_code, paper.id
      into room_id, room_subject_code, paper_id
    from public.exam_room_papers paper
    join public.exam_rooms room on room.id = paper.exam_room_id
    where paper.id = key_record.paper_id
      and paper.status = 'published'
      and room.status  = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at   is null or room.ends_at   >  now_at);
  elsif key_record.exam_room_id is not null then
    select room.id, room.subject_code
      into room_id, room_subject_code
    from public.exam_rooms room
    where room.id = key_record.exam_room_id
      and room.status  = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at   is null or room.ends_at   >  now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select room.id, room.subject_code
      into room_id, room_subject_code
    from public.exam_rooms room
    where room.subject_code = subject_code
      and room.status  = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at   is null or room.ends_at   >  now_at)
    order by room.published_at desc nulls last, room.created_at desc
    limit 1;
  end if;

  if room_id is null then
    raise exception 'ROOM_NOT_AVAILABLE';
  end if;

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH';
  end if;

  if paper_id is null then
    select paper.id
      into paper_id
    from public.exam_room_papers paper
    where paper.exam_room_id = room_id
      and paper.status = 'published'
    order by paper.is_default desc, paper.display_order, paper.created_at
    limit 1;
  end if;

  if paper_id is null then
    raise exception 'PAPER_NOT_AVAILABLE';
  end if;

  -- Cập nhật key
  update public.exam_keys
  set
    assigned_to   = student_id,
    used_attempts = used_attempts + 1,
    status        = case
      when used_attempts + 1 >= total_attempts
        then 'exhausted'::public.exam_key_status
      else 'active'::public.exam_key_status
    end,
    activated_at  = coalesce(activated_at, now_at),
    updated_at    = now_at
  where id = key_record.id;

  -- Tạo session
  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status
  )
  values (
    key_record.id,
    student_id,
    room_id,
    paper_id,
    key_record.used_attempts + 1,
    'in_progress'
  )
  returning id into session_id;

  -- Copy câu hỏi vào session
  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    max_points
  )
  select
    session_id,
    placement.blueprint_section_id,
    placement.question_id,
    placement.seq,
    coalesce(placement.points_override, section.max_points_per_question)
  from public.exam_room_questions placement
  join public.exam_blueprint_sections section
    on section.id = placement.blueprint_section_id
  where placement.paper_id = paper_id
  order by placement.seq;

  -- Gắn key hiện tại cho student nếu chưa có
  update public.students
  set current_key_id = key_record.id,
      updated_at     = now_at
  where id = student_id
    and current_key_id is null;

  return session_id;
end;
$function$;

-- =====================================================================
-- FIX 4: Cập nhật activate_exam_key — kiểm tra BOTH key & batch expiry
-- =====================================================================
CREATE OR REPLACE FUNCTION public.activate_exam_key(
  p_key_code     text,
  p_subject_code text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $function$
declare
  v_student_id       uuid;
  v_key              record;
  v_subject_code     text;
  v_room_id          uuid;
  v_room_subject_code text;
  v_room_blueprint_id uuid;
  v_paper_id         uuid;
  v_paper_blueprint_id uuid;
  v_now              timestamptz := now();
  v_error_hint       text;
  v_status           text;
  v_effective_expires timestamptz;
begin
  v_student_id := (select auth.uid());

  if v_student_id is null then
    raise exception 'NOT_AUTHENTICATED'
      using errcode = 'P0002', hint = 'NOT_AUTHENTICATED';
  end if;

  if not exists (
    select 1 from public.students st where st.id = v_student_id
  ) then
    raise exception 'NOT_STUDENT'
      using errcode = 'P0002', hint = 'NOT_STUDENT';
  end if;

  if nullif(trim(p_key_code), '') is null then
    raise exception 'KEY_NOT_FOUND'
      using errcode = 'P0003', hint = 'KEY_NOT_FOUND';
  end if;

  v_subject_code := nullif(upper(trim(p_subject_code)), '');

  -- JOIN key_batches để lấy batch-level expiry
  select
    ek.id,
    ek.exam_room_id,
    ek.paper_id,
    ek.assigned_to,
    ek.total_attempts,
    ek.used_attempts,
    ek.status,
    ek.expires_at,
    kb.expires_at as batch_expires_at
  into v_key
  from public.exam_keys ek
  left join public.key_batches kb on kb.id = ek.batch_id
  where ek.code = upper(trim(p_key_code))
  for update of ek;

  if not found then
    raise exception 'KEY_NOT_FOUND'
      using errcode = 'P0003', hint = 'KEY_NOT_FOUND';
  end if;

  if v_key.status = 'revoked' then
    raise exception 'KEY_REVOKED'
      using errcode = 'P0004', hint = 'KEY_REVOKED';
  end if;

  -- Effective expiry = min(key.expires_at, batch.expires_at)
  v_effective_expires := least(
    coalesce(v_key.expires_at,       'infinity'::timestamptz),
    coalesce(v_key.batch_expires_at, 'infinity'::timestamptz)
  );

  if v_key.status = 'expired' or v_effective_expires < v_now then
    raise exception 'KEY_EXPIRED'
      using errcode = 'P0005', hint = 'KEY_EXPIRED';
  end if;

  if v_key.status = 'exhausted'
    or v_key.used_attempts >= v_key.total_attempts
  then
    raise exception 'KEY_EXHAUSTED'
      using errcode = 'P0006', hint = 'KEY_EXHAUSTED';
  end if;

  if v_key.assigned_to is not null and v_key.assigned_to <> v_student_id then
    raise exception 'KEY_ALREADY_ASSIGNED'
      using errcode = 'P0007', hint = 'KEY_ALREADY_ASSIGNED';
  end if;

  -- Xác định phòng thi
  if v_key.paper_id is not null then
    select
      er.id, er.subject_code, er.blueprint_id,
      erp.id, erp.blueprint_id
    into
      v_room_id, v_room_subject_code, v_room_blueprint_id,
      v_paper_id, v_paper_blueprint_id
    from public.exam_room_papers erp
    join public.exam_rooms er on er.id = erp.exam_room_id
    where erp.id = v_key.paper_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at   is null or er.ends_at   >  v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE' using hint = 'ROOM_NOT_AVAILABLE';
    end if;

    if v_key.exam_room_id is not null and v_key.exam_room_id <> v_room_id then
      raise exception 'KEY_ROOM_MISMATCH' using hint = 'KEY_ROOM_MISMATCH';
    end if;
  elsif v_key.exam_room_id is not null then
    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.id = v_key.exam_room_id
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at   is null or er.ends_at   >  v_now);

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE' using hint = 'ROOM_NOT_AVAILABLE';
    end if;
  elsif v_subject_code is not null then
    select er.id, er.subject_code, er.blueprint_id
      into v_room_id, v_room_subject_code, v_room_blueprint_id
    from public.exam_rooms er
    where er.subject_code = v_subject_code
      and er.status = 'published'
      and (er.starts_at is null or er.starts_at <= v_now)
      and (er.ends_at   is null or er.ends_at   >  v_now)
    order by er.published_at desc nulls last, er.created_at desc
    limit 1;

    if not found then
      raise exception 'ROOM_NOT_AVAILABLE' using hint = 'ROOM_NOT_AVAILABLE';
    end if;
  end if;

  if v_room_id is not null and v_subject_code is not null
    and v_room_subject_code <> v_subject_code
  then
    raise exception 'KEY_SUBJECT_MISMATCH' using hint = 'KEY_SUBJECT_MISMATCH';
  end if;

  if v_room_id is not null and v_paper_id is null then
    select erp.id, erp.blueprint_id
      into v_paper_id, v_paper_blueprint_id
    from public.exam_room_papers erp
    where erp.exam_room_id = v_room_id
    order by erp.is_default desc, erp.display_order, erp.created_at
    limit 1;
  end if;

  if v_paper_blueprint_id is null then
    v_paper_blueprint_id := v_room_blueprint_id;
  end if;

  -- Assign key nếu chưa có owner
  if v_key.assigned_to is null then
    update public.exam_keys
    set assigned_to  = v_student_id,
        status       = 'active'::public.exam_key_status,
        activated_at = v_now,
        updated_at   = v_now
    where id = v_key.id;

    update public.students
    set current_key_id = v_key.id,
        updated_at     = v_now
    where id = v_student_id
      and current_key_id is null;
  end if;

  select ek.status::text into v_status
  from public.exam_keys ek
  where ek.id = v_key.id;

  return jsonb_build_object(
    'success',            true,
    'key_id',            v_key.id,
    'exam_room_id',      v_room_id,
    'paper_id',          v_paper_id,
    'paper_blueprint_id', v_paper_blueprint_id,
    'status',            coalesce(v_status, 'active'),
    'total_attempts',    v_key.total_attempts,
    'used_attempts',     v_key.used_attempts
  );
exception
  when others then
    get stacked diagnostics v_error_hint = PG_EXCEPTION_HINT;
    return jsonb_build_object(
      'success', false,
      'error',   SQLERRM,
      'hint',    coalesce(v_error_hint, 'UNKNOWN_ERROR')
    );
end;
$function$;
;
