-- Sửa lỗi: vào phòng thi báo
--   insert or update on table "exam_sessions" violates foreign key constraint
--   "exam_sessions_student_id_fkey"
--
-- Nguyên nhân: trigger handle_new_user chỉ tạo dòng public.profiles chứ KHÔNG
-- tạo dòng public.students. Tài khoản đăng nhập bằng Google (và một số tài khoản
-- email chưa hoàn tất lưu hồ sơ) vì thế không có dòng students. Khi join_exam
-- insert exam_sessions.student_id = auth.uid() thì FK -> students(id) thất bại.
--
-- Khắc phục 3 lớp (đều idempotent):
--   1. handle_new_user: tạo luôn dòng students cho mọi tài khoản mới.
--   2. join_exam: tự tạo dòng students từ profiles nếu còn thiếu (lưới an toàn).
--   3. Backfill: tạo dòng students cho các tài khoản đang bị thiếu.

-- 1) handle_new_user -----------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    'student'
  )
  on conflict (id) do nothing;

  -- Mọi tài khoản đều là thí sinh khi mới tạo (admin được nâng quyền sau).
  -- Tạo sẵn dòng students để vào phòng thi không vướng FK.
  insert into public.students (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;

  return new;
end;
$$;

-- 2) join_exam: thêm lưới an toàn tạo dòng students nếu thiếu -------------------
create or replace function public.join_exam(
  p_code text,
  p_subject_code text default null::text,
  p_exam_room_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  key_record record;
  session_id uuid;
  student_id uuid;
  subject_code text;
  requested_room_id uuid;
  room_id uuid;
  room_subject_code text;
  paper_id uuid;
  now_at timestamptz := now();
  v_duration integer;
  v_active_session uuid;
  v_active_room uuid;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lưới an toàn: bảo đảm có dòng students trước khi tạo phiên thi. Tài khoản
  -- đăng nhập Google (hoặc tạo trước khi handle_new_user tạo students) chỉ có
  -- dòng profiles -> nếu không sẽ vướng exam_sessions_student_id_fkey bên dưới.
  insert into public.students (id, full_name)
  select pr.id, pr.full_name
  from public.profiles pr
  where pr.id = student_id
  on conflict (id) do nothing;

  if nullif(trim(p_code), '') is null then
    raise exception 'KEY_NOT_FOUND';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');
  requested_room_id := p_exam_room_id;

  select
    key.id,
    key.assigned_to,
    key.total_attempts,
    key.used_attempts,
    key.status,
    key.expires_at
  into key_record
  from public.exam_keys key
  where key.code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if key_record.expires_at is not null and key_record.expires_at < now_at then
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

  if requested_room_id is not null then
    select room.id, room.subject_code, room.duration_minutes
      into room_id, room_subject_code, v_duration
    from public.exam_rooms room
    where room.id = requested_room_id
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select room.id, room.subject_code, room.duration_minutes
      into room_id, room_subject_code, v_duration
    from public.exam_rooms room
    where room.subject_code = subject_code
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at)
    order by room.published_at desc nulls last, room.created_at desc
    limit 1;
  end if;

  if room_id is null then
    raise exception 'ROOM_NOT_AVAILABLE';
  end if;

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH';
  end if;

  -- Finalize overdue sessions before deciding whether to resume or block.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
      client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = now_at
  from public.exam_rooms rm
  where s.student_id = student_id
    and s.status = 'in_progress'
    and rm.id = s.exam_room_id
    and coalesce(
      s.due_at,
      s.started_at + make_interval(mins => rm.duration_minutes)
    ) <= now_at;

  select s.id, s.exam_room_id
    into v_active_session, v_active_room
  from public.exam_sessions s
  where s.student_id = student_id
    and s.status = 'in_progress'
  order by s.started_at desc
  limit 1;

  if v_active_session is not null then
    if v_active_room = room_id then
      return v_active_session;
    else
      raise exception 'SESSION_ALREADY_ACTIVE';
    end if;
  end if;

  select paper.id
    into paper_id
  from public.exam_room_papers paper
  where paper.exam_room_id = room_id
    and paper.status = 'published'
  order by paper.is_default desc, paper.display_order, paper.created_at
  limit 1;

  if paper_id is null then
    raise exception 'PAPER_NOT_AVAILABLE';
  end if;

  if not exists (
    select 1
    from public.exam_room_questions placement
    where placement.paper_id = paper_id
  ) then
    raise exception 'PAPER_HAS_NO_QUESTIONS';
  end if;

  update public.exam_keys
  set
    assigned_to = student_id,
    used_attempts = used_attempts + 1,
    status = case
      when used_attempts + 1 >= total_attempts
        then 'exhausted'::public.exam_key_status
      else 'active'::public.exam_key_status
    end,
    activated_at = coalesce(activated_at, now_at),
    updated_at = now_at
  where id = key_record.id;

  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status,
    started_at,
    due_at
  )
  values (
    key_record.id,
    student_id,
    room_id,
    paper_id,
    key_record.used_attempts + 1,
    'in_progress',
    now_at,
    now_at + make_interval(mins => coalesce(v_duration, 50))
  )
  returning id into session_id;

  update public.exam_sessions
  set shuffle_config = jsonb_build_object(
    'version', 1,
    'seed', session_id::text,
    'shuffleQuestions', 'within_difficulty',
    'shuffleOptions', true
  )
  where id = session_id;

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    display_no,
    option_order,
    max_points
  )
  with placements as (
    select
      placement.blueprint_section_id,
      placement.question_id,
      placement.points_override,
      section.seq as section_seq,
      section.max_points_per_question,
      question.type as question_type,
      question.difficulty,
      md5(
        session_id::text || ':' ||
        placement.blueprint_section_id::text || ':' ||
        question.difficulty::text || ':' ||
        placement.question_id::text
      ) as tie_breaker
    from public.exam_room_questions placement
    join public.exam_blueprint_sections section
      on section.id = placement.blueprint_section_id
    join public.questions question
      on question.id = placement.question_id
    where placement.paper_id = paper_id
  ),
  ordered as (
    select
      placements.*,
      row_number() over (
        order by
          placements.section_seq,
          placements.difficulty,
          placements.tie_breaker
      ) as display_seq
    from placements
  )
  select
    session_id,
    ordered.blueprint_section_id,
    ordered.question_id,
    ordered.display_seq,
    ordered.display_seq::text,
    case
      when ordered.question_type = 'multiple_choice' then coalesce(
        (
          select array_agg(option_row.id order by option_row.sort_key)::uuid[]
          from (
            select
              option.id,
              case
                when count(*) over () = 4
                  and not private.has_option_self_reference(ordered.question_id)
                then md5(
                  session_id::text || ':' ||
                  ordered.question_id::text || ':' ||
                  option.id::text
                )
                else lpad(option.seq::text, 4, '0')
              end as sort_key
            from public.question_options option
            where option.question_id = ordered.question_id
          ) option_row
        ),
        '{}'::uuid[]
      )
      else '{}'::uuid[]
    end,
    coalesce(ordered.points_override, ordered.max_points_per_question)
  from ordered
  order by ordered.display_seq;

  update public.students
  set current_key_id = key_record.id,
      updated_at = now_at
  where id = student_id
    and current_key_id is null;

  return session_id;
end;
$function$;

revoke all on function public.join_exam(text, text, uuid)
  from public, anon;

grant execute on function public.join_exam(text, text, uuid)
  to authenticated;

-- 3) Backfill: tạo dòng students cho các tài khoản đang thiếu ------------------
insert into public.students (id, full_name)
select p.id, p.full_name
from public.profiles p
left join public.students s on s.id = p.id
where s.id is null;

notify pgrst, 'reload schema';
