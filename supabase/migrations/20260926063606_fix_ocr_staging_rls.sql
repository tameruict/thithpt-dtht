-- Vá lỗ hổng bảo mật: public.ocr_import_staging đang TẮT RLS, anon/authenticated
-- (bất kỳ ai có anon key) đọc/ghi được bảng staging OCR nội bộ. Bảng này chỉ dùng
-- transient trong pipeline OCR import (service_role), không phục vụ client nào.
-- Bật RLS + chỉ cho service_role full access, không cấp quyền nào cho anon/authenticated.

alter table public.ocr_import_staging enable row level security;

drop policy if exists "service_role_full_access" on public.ocr_import_staging;
create policy "service_role_full_access"
  on public.ocr_import_staging
  as permissive
  for all
  to service_role
  using (true)
  with check (true);

-- Không tạo policy nào cho anon/authenticated => mặc định bị chặn hoàn toàn.
