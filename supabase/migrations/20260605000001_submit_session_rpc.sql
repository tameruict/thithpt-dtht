-- Migration: Thêm RPC submit_exam_session
-- Cho phép học sinh nộp bài và cập nhật trạng thái session thành 'submitted'.
-- Cần thiết vì exam/page.tsx trước đây chỉ navigate sang /result mà không ghi DB.

create or replace function public.submit_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  -- Cập nhật status session sang 'submitted'
  -- Chỉ cho phép chính học sinh sở hữu session và chỉ khi session đang 'in_progress'
  update public.exam_sessions
  set status       = 'submitted',
      submitted_at = now(),
      updated_at   = now()
  where id         = p_session_id
    and student_id = (select auth.uid())
    and status     = 'in_progress';

  -- Không throw lỗi nếu session đã submitted (idempotent)
  -- để tránh block UX khi học sinh bấm nộp bài nhiều lần
end;
$$;
-- Revoke quyền mặc định, chỉ authenticated mới gọi được
revoke all on function public.submit_exam_session(uuid) from public, anon;
grant execute on function public.submit_exam_session(uuid) to authenticated;
-- Thông báo PostgREST reload schema để nhận diện function mới
notify pgrst, 'reload schema';
