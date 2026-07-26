# Web thi THPT

Nền tảng thi trắc nghiệm trực tuyến cho kỳ thi tốt nghiệp THPT (theo cấu trúc đề 2026): thí sinh vào phòng thi bằng key, làm bài có tính giờ, nộp và xem kết quả; giáo viên/quản trị soạn đề, quản lý phòng thi, cấp key, theo dõi kết quả và chấm tự luận.

## Công nghệ

- **Next.js 16 + React 19** (App Router). ⚠️ Bản Next.js trong repo có thay đổi so với tài liệu công khai — **đọc `node_modules/next/dist/docs/` trước khi viết code Next.js** (xem `AGENTS.md`).
- **Supabase** — Postgres (RLS + RPC), Auth (email/mật khẩu + Google OAuth), lịch cron.
- **Zustand** (state), **KaTeX** (render công thức), **CodeMirror** (trình soạn LaTeX).
- **Cloudflare R2** — lưu ảnh câu hỏi/đồ thị (URL HTTPS ổn định).

## Chức năng chính

**Thí sinh:** đăng nhập → chọn môn → chọn phòng → nhập key → làm bài (trắc nghiệm, đúng/sai, trả lời ngắn, tự luận) → nộp → xem kết quả. Server làm chủ thời gian (`due_at`), tự nộp khi hết giờ, tự lưu và resume bài dở.

**Giáo viên/Quản trị (`/admin`):** dashboard kết quả (lọc + thống kê + xuất CSV), quản lý phòng thi, vòng đời key (thu hồi/gia hạn/xoá), ngân hàng câu hỏi (lọc + đổi trạng thái), chấm tự luận, và trình soạn đề LaTeX (`/admin/authoring`) với preview + autosave + publish nguyên tử.

## Cài đặt

Tạo `.env.local` ở thư mục gốc:

```bash
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your_supabase_publishable_key
```

> Dự án cũ có thể dùng `NEXT_PUBLIC_SUPABASE_ANON_KEY` thay cho `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.

Cài phụ thuộc và chạy dev:

```bash
npm ci
npm run dev
```

Mở [http://localhost:3000](http://localhost:3000).

## Cơ sở dữ liệu (Supabase)

Áp schema cho môi trường local (Docker + Supabase CLI):

```bash
npx supabase db reset
```

Đẩy migration mới lên project remote đã link:

```bash
npx supabase db push
```

Migration nằm trong `supabase/migrations/`. Tài khoản quản trị được bootstrap theo email cấu hình trong migration `20260604100000_fix_auth_roles_and_triggers.sql`; các tài khoản khác mặc định role `student` (nâng quyền `teacher`/`admin` trong bảng `profiles`).

## Kiểm thử & chất lượng

Chạy đủ các cổng trước khi commit:

```bash
npx tsc --noEmit
npm run lint -- --max-warnings=0
npm test
npm run build
```

## Cấu trúc thư mục

```text
src/
  app/            # Route (App Router): /, /register, /subjects, /exam, /result, /admin, ...
  components/     # QuestionRenderer (KaTeX + ảnh), UI dùng chung
  lib/
    supabase/     # client/server, exam-data (RPC), auth
    authoring/    # DSL LaTeX: parser, templates, import
  store/          # Zustand (useExamStore)
  styles/         # CSS modules
supabase/migrations/  # Toàn bộ schema + RPC + RLS (nguồn chân lý của DB)
```

## Tài liệu liên quan

- `AGENTS.md` — lưu ý về bản Next.js đã chỉnh sửa.
- `KE_HOACH_LUU_TRU_DE_THI.md` — kế hoạch nạp hàng trăm đề `.docx` vào ngân hàng câu hỏi (PaddleOCR-VL → LaTeX → DSL → publish).
- `AUTHORING_WORKLOG.md` — nhật ký triển khai trình soạn đề.
