-- Quyết định sản phẩm (2026-09-26): public toàn bộ 295 đề trong ngân hàng đề
-- thi ngay, chấp nhận rủi ro chất lượng nội dung thay vì chặn 100% người dùng.
--
-- Bối cảnh: guard_session_question_content_quality() (thêm ở
-- 20260821022816_math_content_database_v2.sql) raise exception
-- 'QUESTION_CONTENT_NEEDS_REVIEW' cho MỌI câu hỏi có
-- content_quality_status = 'needs_review' khi insert vào
-- exam_session_questions. Toàn bộ 7532/7532 câu hỏi gắn với 295 đề hiện đang
-- ở trạng thái này (chưa qua soát chất lượng thủ công) — nghĩa là 0/295 đề
-- có thể bắt đầu làm bài dưới cơ chế gate cũ. Luồng "phòng thi" cũ né được
-- guard này vì exam_room_content_readiness (20260827042714) chỉ chọn câu đã
-- verified/legacy vào phòng — không áp dụng cho luồng "làm đề trực tiếp" mới
-- (start_exam_session), vốn dùng toàn bộ câu hỏi của 1 đề.
--
-- Quyết định: TẮT trigger (không xoá function/trigger definition) để không
-- chặn học sinh, đồng thời vẫn giữ được khả năng BẬT LẠI khi có kế hoạch soát
-- chất lượng nội dung (liên quan vấn đề đã biết: OCR/docx tới ~43% câu
-- true/false sai đáp án — xem ghi chú nội bộ "true-false-data-quality").
alter table public.exam_session_questions
  disable trigger guard_session_question_content_quality;

comment on trigger guard_session_question_content_quality on public.exam_session_questions is
  'DISABLED 2026-09-26: quyết định sản phẩm cho phép public 295 đề dù content_quality_status=needs_review trên toàn bộ câu hỏi. Bật lại (enable trigger) sau khi có kế hoạch soát chất lượng nội dung.';
