-- Giai đoạn 1 — Slice A: Dashboard kết quả thi cho giáo viên/quản trị.
--
-- Bối cảnh: dashboard admin hứa "theo dõi học viên" nhưng chưa có nơi xem điểm/
-- lượt thi. exam_sessions không có policy cho staff đọc phiên của thí sinh khác,
-- nên dùng RPC SECURITY DEFINER tự kiểm private.is_staff() (giống các RPC khác)
-- thay vì view security_invoker.
--
-- Trả về danh sách phiên thi (mới nhất trước) kèm tên thí sinh, phòng, môn, điểm,
-- trạng thái, mốc thời gian — đủ cho bảng + thống kê + xuất CSV ở client.
-- Không lộ đáp án/câu trả lời (đó là phạm vi trang review, làm sau).

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
