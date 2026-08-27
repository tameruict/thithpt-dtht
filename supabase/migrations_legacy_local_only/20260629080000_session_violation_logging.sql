-- Giai đoạn 3 — Chống gian lận (ghi log, không cưỡng chế).
--
-- Trước đây trang /exam đếm số lần rời tab ở state React cục bộ, không ghi DB,
-- giáo viên không thấy được. Migration này:
--   1. Thêm cột exam_sessions.violation_count để tích luỹ số lần vi phạm
--      (rời tab / thoát toàn màn hình).
--   2. RPC record_session_event(): thí sinh gọi khi vi phạm; chỉ ghi cho phiên
--      của chính mình đang in_progress. SECURITY DEFINER (students không có
--      quyền UPDATE exam_sessions trực tiếp).
--   3. Cập nhật get_exam_results() để trả violation_count cho dashboard.

alter table public.exam_sessions
  add column if not exists violation_count integer not null default 0;

create or replace function public.record_session_event(
  p_session_id uuid,
  p_type text default 'tab_switch'
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student uuid;
  v_status text;
  v_count integer;
begin
  select s.student_id, s.status::text
    into v_student, v_status
  from public.exam_sessions s
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_student <> (select auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  -- Chỉ ghi khi đang thi; phiên đã nộp/hết giờ thì bỏ qua (không lỗi).
  if v_status <> 'in_progress' then
    return null;
  end if;

  update public.exam_sessions
     set violation_count = violation_count + 1,
         client_info = client_info || jsonb_build_object(
           'last_event',
           jsonb_build_object('type', coalesce(nullif(trim(p_type), ''), 'tab_switch'), 'at', now())
         ),
         updated_at = now()
   where id = p_session_id
   returning violation_count into v_count;

  return v_count;
end;
$function$;

revoke all on function public.record_session_event(uuid, text) from public, anon;
grant execute on function public.record_session_event(uuid, text) to authenticated;

-- Cập nhật get_exam_results: thêm violation_count vào từng dòng kết quả.
create or replace function public.get_exam_results(
  p_subject_code text default null,
  p_exam_room_id uuid default null,
  p_status text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_subject text := nullif(trim(p_subject_code), '');
  v_status text := nullif(trim(p_status), '');
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last, r.started_at desc),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      s.id                            as session_id,
      s.student_id                    as student_id,
      st.full_name                    as student_name,
      st.school_name                  as school_name,
      s.exam_room_id                  as exam_room_id,
      rm.name                         as room_name,
      rm.code                         as room_code,
      rm.subject_code                 as subject_code,
      sub.name                        as subject_name,
      s.attempt_number                as attempt_number,
      s.status::text                  as status,
      s.score                         as score,
      s.max_score                     as max_score,
      s.violation_count               as violation_count,
      s.started_at                    as started_at,
      s.submitted_at                  as submitted_at,
      s.scored_at                     as scored_at,
      (s.client_info ->> 'finalized') as finalized
    from public.exam_sessions s
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = s.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where (v_subject is null or rm.subject_code = v_subject)
      and (p_exam_room_id is null or s.exam_room_id = p_exam_room_id)
      and (v_status is null or s.status::text = v_status)
    order by s.submitted_at desc nulls last, s.started_at desc
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_exam_results(text, uuid, text, integer) from public, anon;
grant execute on function public.get_exam_results(text, uuid, text, integer) to authenticated;

notify pgrst, 'reload schema';
