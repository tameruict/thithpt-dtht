# TỔNG KẾT DỰ ÁN WEB THI THPT — TIẾN ĐỘ & PHẦN CÒN LÀM

> Mục đích: file này để bàn giao cho một AI agent khác tiếp tục làm. Đọc kỹ các phần "Đã xong", "Trạng thái hiện tại", và "Các phần còn lại" trước khi code. Mọi thứ dưới đây đã được xác minh trực tiếp trên code + database live (Supabase + Vercel).

---

## 0. THÔNG TIN KẾT NỐI & MÔI TRƯỜNG

- **Repo**: `E:\Web-thi-thpt` (Git, branch `main`, user `tamatm11`).
- **Stack**: Next.js 16.3.1 (App Router) + React 19.2.8 + TypeScript + Zustand 5 + CSS Modules (KHÔNG dùng Tailwind). Supabase (Postgres + RLS + Auth), deploy trên Vercel.
- **Vercel**: team `tamatm11's projects` (slug `tamatm11s-projects`, id `team_BD6wluWHZcDFurt23k70zRm0`), plan **hobby**.
- **Thanh toán**: ThueAPIBank (ngân hàng Việt Nam), mô hình **polling** qua Supabase Edge Function `poll-thueapibank` (KHÔNG dùng webhook SePay nữa).
- **Supabase MCP** đã sẵn sàng dùng: `mcp__supabase__*` (execute_sql, apply_migration, list_tables, get_advisors, generate_typescript_types...).
- **Quy tắc sống còn**: AGENTS.md yêu cầu đọc docs trong `node_modules/next/dist/docs/` trước khi viết code Next.js. Database live là nguồn chuẩn; migration phải **forward-only**, chạy trên Supabase branch rồi mới merge.

---

## 1. CẤU TRÚC THƯ MỤC QUAN TRỌNG

```
src/
  app/
    admin/                      # Admin: authoring(cần xóa), compose(cần xóa), key-products, purchases, content-quality
    exam/[sessionId]/           # Trang làm bài (client component nặng)
    result/[sessionId]/         # Trang kết quả/xem lại
    practice/[subjectCode]/     # Tự luyện
    purchase/                   # Mua key (checkout)
    room-key/                   # Nhập mã phòng thi
    join/[roomId]/              # Vào phòng
    api/admin/payments/poll/    # Route poll thanh toán (admin-gated)
  components/question/QuestionRenderer.tsx  # Renderer câu hỏi dùng chung (exam + result + authoring cũ)
  lib/
    supabase/                   # client, server, admin(requireAdmin), proxy(middleware), database(types), exam-data, env, session
    payments/                   # config.ts, *.test.ts (checkout logic)
    r2/                         # client.ts (ĐÃ XÓA ở phần A)
    authoring/                  # (ĐÃ XÓA ở phần A)
  store/useExamStore.ts         # Zustand: theme, zoom, draft bài làm
  styles/                       # *.module.css
supabase/
  migrations/                   # 74 migration forward-only
  functions/poll-thueapibank/   # Edge Function polling thanh toán
```

---

## 2. TRẠNG THÁI DATABASE LIVE (đã query thực tế)

### Bảng (row counts)
- `questions`: 2420 | `exam_rooms`: 4 | `exam_sessions`: 15 | `exam_room_questions`: 44
- `exam_keys`: 7 | `key_products`: 1 | `purchase_orders`: 0 | `payment_events`: 6
- `profiles`/`students`: 21 | `subjects`: 2 (MATH active, PHYSICS scaffold)

### Phát hiện cốt lõi (QUAN TRỌNG cho các phần còn lại)
1. **Câu hỏi trùng**: 46 nhóm trùng nội dung trong MATH (~100 dòng, 54 dòng dư). Cột `questions.content_hash` **tồn tại nhưng NULL cho toàn bộ 2420 dòng** → chưa có cơ chế chặn trùng.
2. **Xóa phòng thi**: FK `exam_sessions.exam_room_id → exam_rooms` = **RESTRICT** (chặn hard-delete). `exam_rooms` đã có cột `deleted_at` (soft-delete sẵn). `exam_room_questions`, `exam_room_generation_rules`, `key_batches`, `exam_room_papers`, `room_papers` = CASCADE theo phòng. `exam_keys` = RESTRICT theo phòng.
3. **Xem lại bài làm**: `get_session_review_core_20260821()` JOIN chặt `exam_rooms` và nhồi mảng `questions`. Nếu phòng bị xóa cứng row → hàm vỡ. → Dùng **soft-delete** (giữ row) là an toàn nhất.
4. **Bảo mật**: 24+ RPC `SECURITY DEFINER` cho `authenticated` gọi được (Supabase advisor WARN). Leaked-password protection **TẮT**. `user_role` enum còn giá trị `teacher` (nên chỉ còn `student | admin`).
5. **RPC authoring/compose cần xóa**: `save_authoring_document`, `publish_authoring_document`, `create_exam_paper_successor`, `get_paper_composition`, `compose_add_questions`, `compose_remove_question`, `register_r2_asset`, `private.compose_paper_json`, `private.resolve_authoring_image`, trigger `trg_questions_prevent_duplicate_authoring_revision`, bảng `exam_authoring_documents`.

### Các RPC chính còn giữ (KHÔNG xóa)
`join_exam`, `start_practice_session`, `submit_exam_session`, `score_exam_session`, `get_active_exam_session_full`, `get_session_review`, `get_exam_results`, `get_pending_essays`, `activate_exam_key`, `record_session_event`, `generate_exam_keys`, `grade_essay_answer`, `create_purchase_order`, `reconcile_purchase_order`, `revoke_purchase_order`, `process_bank_payment`.

---

## 3. PHẦN ĐÃ LÀM XONG (Phần A — Xóa soạn đề) — khoảng 90% xong

**Quyết định chốt của user**: xóa hoàn toàn tính năng soạn đề.

### Đã xóa (git rm staged):
- `src/app/admin/authoring/` (page, actions, AuthoringWorkspace, ImportModal, LatexEditor, QuestionFormModal)
- `src/app/admin/compose/` (page, actions, ComposeWorkspace)
- `src/lib/authoring/` (toàn bộ + 3 test)
- `src/lib/r2/client.ts` (chỉ authoring dùng)
- `src/styles/authoring.module.css`, `src/styles/compose.module.css`
- `scripts/import-paddle-md.ts`

### Đã sửa code:
- `src/app/admin/AdminDashboardClient.tsx`: xóa nav link `/admin/authoring` (Soạn đề), xóa nút "Mở trang soạn đề", sửa mô tả "Soạn đề..." → "Mở môn học...". **Giữ nguyên** panel "Ngân hàng câu hỏi" (id="compose") vì nó đọc bảng `questions` dùng chung, vẫn cần để admin duyệt/archived câu hỏi.
- `src/app/admin/content-quality/ContentQualityClient.tsx`: không còn link authoring (đã sạch).
- `src/lib/supabase/database.ts`: đã bỏ union member + signatures của `register_r2_asset`, `get_paper_composition`, `compose_add_questions`, `compose_remove_question` (file này là generated types, đã regen thủ công một phần).

### Đã verify:
- `npx tsc --noEmit` → **exit 0 (pass)**.
- Không còn reference `authoring`/`compose`/`r2/client` nào trong `src/`.

### ⚠️ CÒN THIẾU Ở PHẦN A (phải làm tiếp):
1. **Migration DB**: tạo migration forward-only `supabase/migrations/20260827XX_drop_authoring_compose.sql` để:
   - `DROP FUNCTION` các RPC authoring/compose kể trên (có `IF EXISTS`).
   - `DROP TABLE public.exam_authoring_documents` (cascade policies/trigger).
   - Xóa regex `^authoring/` khỏi R2 object-key allowlist trong `production_foundation_v1.sql` (dòng ~1569).
   - Bỏ `compose_*`/`register_r2_asset` khỏi grant-whitelist RPC (dòng ~1897-1912 của production_foundation).
   - **KHÔNG xóa** `exam_room_papers`, `exam_room_questions`, `r2_assets` (exam-flow dùng).
   - Enum `source_type` value `'authoring'` (constraint) — để sau (optional).
2. **Regen `database.ts` chính thức** qua `mcp__supabase__generate_typescript_types` (thay vì sửa tay) để đồng bộ với DB sau khi drop. Typecheck lại.
3. **Chạy tests**: `npm test` phải pass (các test authoring đã xóa khỏi scope).

---

## 4. CÁC PHẦN CÒN LẠI (chưa làm)

### PHẦN B — Phòng thi + lịch sử thi (user đã CHỐT: soft-delete)
**Yêu cầu**: xóa phòng = soft-delete (set `deleted_at`). Phòng còn sống → xem điểm + bài làm đầy đủ. Phòng đã xóa → **CHỈ xem lại ĐIỂM** (không đề, không bài làm, không đáp án).

**Cách làm**:
- Giữ nguyên FK RESTRICT, KHÔNG đổi sang SET NULL, KHÔNG xóa row.
- `get_session_review_core_20260821()`: nếu `rm.deleted_at IS NOT NULL` → trả `questions = []`, session vẫn lấy qua JOIN row còn. Xem file `src/app/result/page.tsx` (đã có nhánh `isPractice` ẩn đáp án, tái dùng pattern): khi `questions` rỗng, hiện "Phòng thi đã bị gỡ — chỉ hiển thị điểm" và ẩn section "Xem lại bài làm & đáp án".
- `get_exam_results`: đảm bảo `left join exam_rooms` + `coalesce` xử lý phòng đã soft-delete.
- Đảm bảo `get_subjects_dashboard`, `admin_exam_room_summary`, `fetchExamRoomById` (exam-data.ts:535) filter `deleted_at IS NULL` → phòng ẩn khỏi mọi danh sách thi.
- UI admin: `handleDeleteRoom` (AdminDashboardClient.tsx:1049) đã set `deleted_at` — giữ, tinh chỉnh confirm rõ: "Phòng sẽ ẩn; thí sinh chỉ còn xem điểm, không xem được bài làm."
- **Verify**: tạo phòng → thi/nộp → admin soft-delete → phòng biến khỏi `/subjects`; thí sinh `/result/[sessionId]` xem được CHỈ ĐIỂM, không crash.

### PHẦN C — Dọn câu hỏi trùng (user CHỐT: soft-delete + map FK)
**Hiện trạng**: 46 nhóm trùng MATH, 54 dòng dư. `content_hash` toàn NULL.

**Cách làm** (migration forward-only, chạy trên branch):
1. Backfill: `UPDATE questions SET content_hash = md5(normalize(content)) WHERE content_hash IS NULL` (hàm normalize: trim, chuẩn hóa `\r\n`, khoảng trắng).
2. Script gộp: với mỗi `(subject_code, content_hash)` trùng, giữ 1 bản (ưu tiên `status='approved'`), **soft-delete** bản dư (`deleted_at=now(), status='archived'`). **Trước khi xóa dư, map FK** trong `exam_room_questions`/`exam_session_questions`/`session_answers` về bản giữ để không mất lịch sử thi.
3. Thêm `CREATE UNIQUE INDEX` partial chặn tái phát: `ON questions(subject_code, content_hash) WHERE deleted_at IS NULL AND content_hash IS NOT NULL`.
4. Code tạo/import câu hỏi (`scripts/`, `question-bank/`) phải set `content_hash` khi insert.
- **Verify**: query lại HAVING count>1 → 0 nhóm; đếm `exam_room_questions`/`exam_session_questions` không đổi.

### PHẦN D — Bảo mật
- Rà 24 RPC SECURITY DEFINER: RPC **admin-only** (`grade_essay_answer`, `get_exam_results`, `get_pending_essays`, `score_exam_session`, `reconcile_purchase_order`, `revoke_purchase_order`) → thêm gate `if not private.is_admin() then raise 'PERMISSION_DENIED';` hoặc `REVOKE EXECUTE FROM authenticated`. Đảm bảo `search_path=''`. RPC **student-owned** (`get_active_exam_session_full`, `get_session_review`, `join_exam`, `submit_exam_session`, `activate_exam_key`, `record_session_event`) → xác nhận có ownership check (`auth.uid()` = chủ).
- Bật **leaked-password protection** (Supabase Auth settings dashboard).
- Xóa `teacher` khỏi `user_role` enum (chỉ còn `student | admin`). `private.is_staff()` đã là wrapper `is_admin()`.
- Verify `SUPABASE_SECRET_KEY`, `R2_*`, `THUEAPIBANK_*` chỉ server, không lọt client bundle.
- **Verify**: `mcp__supabase__get_advisors(security)` giảm cảnh báo; `npm audit --omit=dev` không còn high/critical.

### PHẦN E — Hoàn thiện nạp tiền / mua key
**Hiện trạng**: luồng poll đầy đủ (Edge Function có lease, timing-safe secret, sha256 payload, `process_bank_payment`). `KEY_PURCHASE_ENABLED=false`. Đã seed global key bundle (commit 7fc41c3).

**Cần làm**:
1. Bật `KEY_PURCHASE_ENABLED=true` trên staging trước (Vercel env + Supabase secrets: `THUEAPIBANK_API_KEY`, `THUEAPIBANK_CONTRACT_JSON`). Production sau khi staging pass.
2. UX `src/app/purchase/PurchaseClient.tsx`: hiển thị gói `key_products` (bundle, active, VND); hiện mã thanh toán `payment_code`/số tài khoản; auto-poll tới `status=paid`; nút "Đã chuyển, kiểm tra"; xử lý đơn hết hạn, sai mã, hiển thị key cấp sau paid.
3. Kiểm thử e2e trên staging: mua gói → chuyển khoản sandbox → poll cấp key → dùng key thi. Verify `payment_events` bất biến, `purchase_orders` idempotency, `exam_keys.source_order_id` gắn đúng.
4. `next.config.ts` có rewrite `/purchase → /join/__purchase` — xác nhận route `/purchase` thật thắng rewrite hoặc dỡ bỏ.

### PHẦN F — Redesign giao diện làm bài (style thi thật BGD/quốc gia)
**Hiện trạng**: tone hồng `#d84f76`, nền chấm bi, custom cursor, blur, emoji `⏱`.

**Cách làm**:
- `src/app/globals.css`: đổi token sang giấy trắng/chữ đen/tương phản cao; bỏ `body::before` grid decor, custom cursor (globals.css:426-454), view-transition blur. Giữ `--answer-font` + zoom A-/A+.
- `src/styles/exam.module.css`: redesign header (SBD/mã đề/môn/thời gian kiểu giấy thi), thay emoji timer bằng icon lucide `Timer`. Toolbar tách bạch (điều hướng | zoom | đếm | xem lại), bỏ `<select>` zoom thừa. **Xóa CSS chết**: `.floatingActions`, `.answerOption/.answers`, `.questionBlock/.questionTitle/.questionType`, `.passageNote`.
- `src/app/exam/page.tsx` (header 743-796, toolbar 798-843): giữ logic (timer autosave anti-cheat), chỉ đổi visual.
- `src/app/result/page.tsx`: thay inline `style={{}}` (dòng ~544,588,610) thành class module.
- `src/app/practice/[subjectCode]/PracticeClient.tsx`: làm lại card chọn khối thi.
- **Verify**: `npm run dev` → thi thử → check 390×844/tablet/desktop; `npm run lint`, `npx tsc --noEmit`.

### PHẦN G — Quản lý key hoàn thiện
- `effective_key_status` phản ánh hết hạn ngay (hàm RPC trả `expired` nếu `expires_at < now()` dù cột `status='active'`).
- Verify `process_bank_payment`/`reconcile_purchase_order` gắn `source_order_id` + cấp key từ bundle. Hiển thị key mới sau mua trong "Quản lý key".
- Thống nhất màu/trạng thái bảng key (unused/active/exhausted/expired/revoked) dark mode.
- Kiểm thử quota: public key N lượt, nhiều TK dùng chung, chặn hết lượt, gia hạn.

---

## 5. THỨ TỰ ƯU TIÊN & GATE CHẤT LƯỢNG

| STT | Phần | Rủi ro | Trạng thái |
|---|---|---|---|
| A | Xóa soạn đề | Thấp | **~90% (còn migration + regen types)** |
| B | Phòng thi + lịch sử | TB | Chờ làm |
| C | Câu trùng | TB | Chờ làm |
| D | Bảo mật | Thấp-TB | Chờ làm |
| E | Nạp tiền | TB | Chờ làm |
| F | Redesign UI | TB | Chờ làm |
| G | Quản lý key | Thấp | Chờ làm |

**Quality gate sau mỗi phần**: `npx tsc --noEmit` + `npm run lint -- --max-warnings=0` + `npm test` + `npm run build` + (DB parts) `mcp__supabase__get_advisors(security)`.

**Lưu ý chạy song song**: mỗi phần nên làm trong **git worktree riêng** để không đụng `database.ts`/types. Merge về main sau khi từng phần pass gate.

---

## 6. CÁC LỖ HỔNG / LƯU Ý ĐÃ GHI NHẬN
- `exam_authoring_documents` có 2 row hiện tại — nếu drop table cần xử lý data (nhưng feature xóa hẳn nên drop OK).
- `admin_exam_room_summary`, `admin_exam_key_overview`, `get_exam_results`, `student_key_summary` là các view/function admin dùng — giữ nguyên khi xóa authoring.
- Cảnh báo performance cũ: cron chấm bài mỗi 30s, log dày — không phải ưu tiên cao.
- `.gitignore` + git status có nhiều file `artifacts/` và `*.md` planning không liên quan — bỏ qua khi làm.
