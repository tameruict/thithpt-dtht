-- ============================================================================
-- DEPLOY: register_r2_asset — Phase A (upload ảnh R2 trong trình soạn đề)
--
-- Cách chạy: Supabase Dashboard > SQL Editor > New query > dán > Run.
-- An toàn: chỉ tạo 1 hàm mới, không đụng dữ liệu.
--
-- >>> NẾU Run bị lỗi kiểu 'column "..." of relation "r2_assets" does not exist'
--     hoặc 'null value in column "..." violates not-null constraint' <<<
--     nghĩa là bảng r2_assets trên remote có thêm cột bắt buộc mà file này chưa
--     ghi. Hãy chạy CÂU CHẨN ĐOÁN bên dưới (bỏ comment) rồi gửi lại kết quả để
--     điều chỉnh danh sách cột INSERT cho khớp.
-- ============================================================================

-- ---- CÂU CHẨN ĐOÁN (tuỳ chọn, chỉ đọc) -------------------------------------
-- select column_name, data_type, is_nullable, column_default
-- from information_schema.columns
-- where table_schema = 'public' and table_name = 'r2_assets'
-- order by ordinal_position;
-- ----------------------------------------------------------------------------

create or replace function public.register_r2_asset(
  p_public_url text,
  p_content_type text,
  p_size_bytes bigint
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_id uuid;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  if p_public_url !~ '^https://'
    or position('?' in p_public_url) > 0
    or position('#' in p_public_url) > 0
  then
    raise exception 'IMAGE_URL_MUST_BE_STABLE_HTTPS';
  end if;

  if p_content_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif') then
    raise exception 'IMAGE_CONTENT_TYPE_NOT_ALLOWED';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'IMAGE_SIZE_NOT_ALLOWED';
  end if;

  update public.r2_assets
     set content_type = p_content_type,
         size_bytes = p_size_bytes
   where public_url = p_public_url
   returning id into v_id;

  if v_id is not null then
    return v_id;
  end if;

  insert into public.r2_assets (
    public_url,
    content_type,
    size_bytes,
    uploaded_by,
    linked_to_type
  )
  values (
    p_public_url,
    p_content_type,
    p_size_bytes,
    (select auth.uid()),
    'other'
  )
  returning id into v_id;

  return v_id;
end;
$function$;

revoke all on function public.register_r2_asset(text, text, bigint) from public, anon;
grant execute on function public.register_r2_asset(text, text, bigint) to authenticated;

notify pgrst, 'reload schema';
-- ============================================================================
-- HẾT. Sau khi Run xong: vào /admin/authoring > Chèn ảnh > tab "Tải ảnh lên",
-- chọn 1 ảnh nhỏ để thử. Nếu lỗi, gửi lại nguyên văn dòng lỗi.
-- ============================================================================
