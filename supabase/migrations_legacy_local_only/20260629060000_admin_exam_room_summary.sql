-- Giai đoạn 1 — Slice B: Quản lý phòng thi.
--
-- View tóm tắt phòng thi cho màn quản trị: phòng + tên môn + tên blueprint +
-- số paper + số câu hỏi (đếm qua exam_room_questions). security_invoker=true để
-- RLS của bảng nền áp cho người gọi; where private.is_staff() chốt staff-only
-- (non-staff nhận rỗng). Staff có policy đọc exam_rooms/papers/questions nên các
-- subquery đếm chạy đúng.
--
-- CRUD phòng vẫn qua PostgREST trực tiếp (exam_rooms có policy is_staff cho
-- insert/update/delete). View này chỉ phục vụ hiển thị danh sách.

create or replace view public.admin_exam_room_summary
with (security_invoker = true) as
select
  er.id,
  er.code,
  er.name,
  er.subject_code,
  sub.name                as subject_name,
  er.blueprint_id,
  bp.code                 as blueprint_code,
  bp.name                 as blueprint_name,
  er.duration_minutes,
  er.status,
  er.price_vnd,
  er.total_attempts_default,
  er.starts_at,
  er.ends_at,
  er.published_at,
  er.created_at,
  (select count(*) from public.exam_room_papers p where p.exam_room_id = er.id)     as paper_count,
  (select count(*) from public.exam_room_questions q where q.exam_room_id = er.id)   as question_count
from public.exam_rooms er
left join public.subjects sub on sub.code = er.subject_code
left join public.exam_blueprints bp on bp.id = er.blueprint_id
where private.is_staff();

grant select on public.admin_exam_room_summary to authenticated;

notify pgrst, 'reload schema';
