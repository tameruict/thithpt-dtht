# Kế hoạch nâng cấp toàn bộ Web thi THPT lên production

> Cập nhật triển khai: 2026-08-21. Kế hoạch được khôi phục từ lần audit gần nhất và đang được triển khai theo hướng live DB là nguồn chuẩn, migration forward-only và không đẩy DDL chưa kiểm chứng thẳng lên production.

## 1. Mục tiêu và hiện trạng đã xác minh

- Đích triển khai: **Vercel + Supabase Branch/Staging**, lấy **database live làm nguồn chuẩn**.
- Chỉ còn hai vai trò: **admin** và **student**; tự đăng ký bằng email/Google, dùng key để thi.
- Tách **tự luyện** khỏi phòng thi chính thức; giữ nền tảng để tích hợp mua key sau này.
- Baseline ngày 2026-08-21: typecheck, lint, build và 32 unit test đều đạt.
- Các vấn đề cần ưu tiên:
  - Repo có 53 migration nhưng remote có 63; lệch 25 migration phía remote và 15 migration phía local.
  - Frontend đang gọi các RPC chưa tồn tại trên live DB, gồm `get_active_exam_session_full`, `register_r2_asset` và nhóm RPC ghép đề.
  - Hai phòng đã publish chưa đủ đề/câu hỏi; phòng tự luyện đang bị trộn vào danh sách thi.
  - Supabase có cảnh báo bảo mật, cảnh báo index chưa dùng và key có trạng thái chưa phản ánh thời hạn thực.
  - Cron chấm bài chạy mỗi 30 giây tạo log dày dù dữ liệu phiên thi còn ít.
  - Baseline `npm audit --omit=dev` có 4 lỗ hổng mức high; Next.js 16.2.7 cần nâng tối thiểu lên 16.3.1.

## 2. Trình tự triển khai

### Giai đoạn A — Đồng bộ database và vá nền tảng

- Sao lưu schema, dữ liệu và cấu hình Auth; tạo Supabase branch từ trạng thái live và dùng dữ liệu seed đã ẩn thông tin cá nhân.
- Chạy `supabase migration fetch --linked`; đưa các migration local-only xung đột ra khỏi thư mục active, tạo migration forward-only mô tả phần schema live chưa có trong lịch sử.
- Không dùng `migration repair` trên production; repo và remote phải có danh sách migration giống hệt nhau trước khi phát triển tiếp.
- Nâng Next.js/eslint-config-next lên 16.3.1, cập nhật các bản vá React, Supabase SDK và dependency tương thích; sau đó đọc lại hướng dẫn tương ứng trong `node_modules/next/dist/docs/`.
- Regenerate `types/supabase.ts` từ MCP/CLI và truyền `Database` generic vào toàn bộ browser/server client; loại bỏ các ép kiểu `unknown` không cần thiết.
- Mọi bảng/RPC mới phải có `GRANT` tối thiểu và RLS rõ ràng; migration extension không pin phiên bản.

### Giai đoạn B — Bảo mật, phân quyền và tính toàn vẹn dữ liệu

- Chuyển toàn bộ quyền “staff” thành **admin-only**:
  - Ở lần phát hành đầu, `private.is_staff()` trở thành wrapper của `private.is_admin()` để tương thích rollback.
  - Xóa mọi nhánh `teacher` trong frontend, RPC, policy và README.
  - Sau thời gian ổn định, thay enum bằng `student | admin` trong migration riêng.
- Mọi trang và mutation `/admin` kiểm tra quyền tại server-side DAL/Server Action; Proxy chỉ refresh session và redirect lạc quan.
- Rà soát từng `SECURITY DEFINER`: giữ `search_path=''`, kiểm tra `auth.uid()`/quyền admin, thu hẹp `EXECUTE`; revoke các hàm nội bộ không cần gọi từ Data API.
- Di chuyển `pg_jsonschema` khỏi `public`; revoke anon khỏi các view quản trị.
- Bật Cloudflare Turnstile cho đăng ký, đăng nhập và reset mật khẩu; đặt mật khẩu tối thiểu 10 ký tự, yêu cầu chữ+số, bật leaked-password protection và secure password change.
- Thêm CSP, security headers, rate limit cho Auth/Server Actions và structured audit log cho mọi thao tác admin.
- Upload R2 trở thành giao dịch có bù trừ: nếu đăng ký DB thất bại thì xóa object vừa upload; lưu thêm kích thước ảnh để giảm layout shift.

### Giai đoạn C — Chuẩn hóa domain thi, tự luyện và key

- Thêm `exam_rooms.mode = exam | practice` và trạng thái readiness được tính từ paper mặc định, số câu hỏi, blueprint và thời gian mở.
- Chuyển `PRACTICE-MATH` sang `practice`; danh sách thi chỉ trả phòng `exam` đủ readiness.
- Phòng đã publish nhưng thiếu câu hỏi phải bị hạ về draft hoặc bổ sung đề trước khi hiển thị.
- Khôi phục `get_active_exam_session_full`; triển khai đầy đủ các RPC authoring/compose/R2 mà frontend đang gọi.
- Harden tự luyện bằng RPC mới nhận bộ lọc, không nhận danh sách UUID câu hỏi tùy ý:
  - Server tự chọn câu approved, đúng môn/dạng/phạm vi.
  - Chi phí mặc định giữ theo hành vi hiện tại: 3 lượt key cho một phiên tự luyện; kỳ thi chính thức dùng 1 lượt.
- Chuẩn hóa `effective_key_status` để hết hạn được phản ánh ngay cả khi cột status chưa được cron cập nhật.
- Chấm trắc nghiệm/đúng-sai/trả lời ngắn ngay khi submit; cron chỉ làm recovery mỗi 5 phút. Thêm `grading_status` để kết quả có thể hiển thị “chờ chấm tự luận”.
- Giới hạn `cron.job_run_details` còn 14 ngày và dọn log cũ hằng ngày.
- Không xóa cứng môn, phòng, câu hỏi hoặc key trong UI; dùng archive/soft-delete và ghi audit.

### Giai đoạn D — Cấu trúc lại Next.js và UX toàn hệ thống

- Chuyển root layout về Server Component; chỉ theme, toast và tương tác nhỏ nằm trong Client Provider.
- Server Component chịu trách nhiệm auth và tải dữ liệu ban đầu; client island chỉ xử lý form, autosave, timer và tương tác.
- Thay Zustand auth/profile bằng session Supabase làm nguồn chuẩn; Zustand chỉ lưu theme, zoom và draft bài làm được namespace theo user/session.
- Chuẩn hóa route:
  - `/join/[roomId]`
  - `/exam/[sessionId]`
  - `/result/[sessionId]`
  - `/practice/[subjectCode]`
  - Giữ redirect tương thích cho `/room-key`, `/exam`, `/result` cũ trong một phiên bản.
- Luồng thi:
  - Resume bằng session ID được kiểm tra ownership trên server.
  - Autosave theo batch, cảnh báo khi còn dữ liệu dirty, khóa một tab làm bài chính và phục hồi draft sau mất mạng.
  - Timer vẫn dựa trên `due_at` phía server; submit phải flush đáp án trước khi đóng phiên.
  - Kết quả phân biệt đã chấm, chờ chấm tự luận và lỗi chấm.
- Tách trang admin lớn thành các route kết quả, câu hỏi, phòng, key, học viên, soạn đề và ghép đề; dùng phân trang/cursor và server-side search thay vì tải 500 bản ghi rồi lọc trên trình duyệt.
- Giữ nhận diện hồng hiện tại nhưng thống nhất design token, card, form, dialog, toast và trạng thái loading/error/empty.
- Sửa liên kết label-input, tab semantics, focus trap, thông báo `aria-live`, bảng responsive, độ tương phản và reduced-motion.
- Lazy-load CodeMirror/KaTeX theo route; dùng metadata API, error boundary và `next/image` với domain R2 được kiểm soát.

## 3. API và mô hình dữ liệu mới

- `user_role`: đích cuối chỉ `student | admin`; release đầu giữ giá trị cũ để tương thích rollback nhưng mọi quyền staff trở thành admin-only.
- `exam_rooms.mode`: `exam | practice`.
- `subjects.practice_attempt_cost`: mặc định `3`.
- `exam_sessions.grading_status`: `pending_auto | pending_manual | scored | failed`.
- Các RPC chính:
  - `get_subjects_dashboard()` trả riêng exam rooms, practice availability, attempt balance và readiness.
  - `get_active_exam_session_full(session_id)` chỉ cho chủ phiên đang hoạt động hoặc admin.
  - `start_practice_session(subject_code, question_count, knowledge_fields, difficulties)` tự chọn và kiểm tra câu hỏi ở server.
- Nền tảng mua key, chưa bật checkout:
  - `key_products`: gói lượt thi/luyện và giá.
  - `purchase_orders`: snapshot sản phẩm, số tiền, trạng thái và idempotency key.
  - `payment_events`: sự kiện gateway bất biến và chống xử lý lặp.
  - `exam_keys.source_order_id`: liên kết entitlement được cấp sau thanh toán.
  - Feature flag `KEY_PURCHASE_ENABLED=false`; client không được tự đánh dấu đơn paid hoặc tự cấp key.

## 4. Kiểm thử và tiêu chí nghiệm thu

- Database/pgTAP:
  - Ma trận quyền anon/student A/student B/admin trên mọi bảng, view và RPC.
  - Chặn IDOR khi đọc session, đáp án, kết quả hoặc sửa hồ sơ người khác.
  - Kiểm thử đồng thời join/key quota, autosave, submit, chấm điểm và webhook idempotency.
  - Không phòng `exam` nào được publish nếu thiếu paper mặc định hoặc thiếu câu hỏi.
- Ứng dụng:
  - Unit/integration cho DAL, Server Actions, mapping RPC, scoring UI, draft recovery và error boundary.
  - Playwright E2E cho đăng ký, đăng nhập, profile, chọn phòng, nhập key, làm bài, reload/resume, nộp, xem kết quả, tự luyện và toàn bộ admin CRUD/archive.
  - OAuth Google smoke test riêng trên preview.
  - Axe + keyboard test tại 390×844, tablet và desktop.
- Cổng chất lượng bắt buộc:
  - `npx tsc --noEmit`
  - `npm run lint -- --max-warnings=0`
  - `npm test`
  - `supabase test db`
  - `npm run test:e2e`
  - `npm run build`
  - `npm audit --omit=dev` không còn high/critical.
- Load test bằng token test có sẵn:
  - 500 học viên đồng thời, autosave trung bình mỗi 10 giây và một đợt submit đồng loạt.
  - Tỷ lệ lỗi dưới 1%; p95 autosave dưới 800 ms, join dưới 1,5 giây, submit dưới 2 giây.
- Vercel preview phải nối đúng Supabase branch; theo dõi Web Vitals, join/submit success rate, autosave failure, RPC latency và Supabase advisors.
- Promote production theo hướng additive/dual-compatible; giữ khả năng rollback Vercel ngay lập tức. Các migration phá tương thích chỉ chạy sau một release ổn định.

## 5. Giả định đã khóa

- Database live là nguồn chuẩn; không replay mù 15 migration local-only đang xung đột.
- Chỉ có admin và học viên; snapshot audit có 1 admin, 20 student và không có teacher.
- Giữ mô hình key toàn cục và số lượt sử dụng; mua key chỉ chuẩn bị domain, chưa tích hợp cổng thanh toán thật.
- Tự luyện là sản phẩm riêng, không xuất hiện như một phòng thi dùng key thông thường.
- Giữ nhận diện giao diện hiện tại, ưu tiên độ tin cậy, bảo mật, khả năng sử dụng và hiệu năng.
- Các file log đang bị xóa trong working tree là thay đổi có sẵn và không được khôi phục hoặc đưa vào phạm vi triển khai.

## 6. Trạng thái triển khai 2026-08-21

- [x] Chụp baseline và chạy typecheck/lint/unit/build/audit.
- [x] Xác minh live migration/schema/advisor; live vẫn là nguồn chuẩn.
- [x] Fetch lịch sử migration live, quarantine 15 migration local-only và giữ chúng để audit.
- [x] Nâng dependency vá bảo mật nền tảng.
- [ ] Áp dụng migration production-foundation lên staging (Supabase hiện trả 402 vì project chưa có Branching).
- [x] Hoàn tất đợt app/DAL/security header/route/practice UI/R2 compensation.
- [x] Chạy typecheck, lint, 36 unit test, build, audit, DB dry-run, 18 pgTAP trong transaction rollback và kiểm thử rollback trên worktree riêng.
- [ ] Cấu hình secret Turnstile + leaked-password protection trên staging rồi phát hành Vercel preview.
