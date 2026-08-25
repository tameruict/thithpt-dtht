-- RPC đăng ký một object R2 đã upload vào registry public.r2_assets, để
-- private.resolve_authoring_image chấp nhận URL khi publish câu hỏi.
--
-- SECURITY DEFINER: chèn bỏ qua RLS (bảng r2_assets chỉ có policy read/update
-- cho staff, không có INSERT policy trong repo). Chỉ ghi các cột chắc chắn tồn
-- tại: public_url, content_type, size_bytes, uploaded_by, linked_to_type.
-- Idempotent theo public_url.

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

  -- Idempotent: URL đã đăng ký thì cập nhật metadata, giữ nguyên id.
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
