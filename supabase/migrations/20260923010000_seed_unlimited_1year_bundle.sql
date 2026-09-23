-- Gói VIP "làm lại vĩnh viễn 1 năm": 200k, không giới hạn lượt làm lại trong 365
-- ngày. attempt_count đặt rất lớn (999999) để biểu diễn "không giới hạn" — UI
-- (describePurchaseAttempts / UNLIMITED_ATTEMPT_THRESHOLD trong PurchaseClient.tsx)
-- đổi con số này thành chữ "Không giới hạn lượt làm lại" + gắn nhãn "Đáng mua nhất".
-- Idempotent: on conflict (code) do update để chạy lại an toàn ở prod.
insert into public.key_products (
  code,
  name,
  product_kind,
  attempt_count,
  price_amount,
  currency,
  is_active,
  valid_days,
  archived_at
)
values (
  'VIP-1Y',
  'Gói VIP — làm lại không giới hạn 1 năm',
  'bundle',
  999999,
  200000,
  'VND',
  true,
  365,
  null
)
on conflict (code) do update
set name = excluded.name,
    product_kind = excluded.product_kind,
    attempt_count = excluded.attempt_count,
    price_amount = excluded.price_amount,
    currency = excluded.currency,
    is_active = excluded.is_active,
    valid_days = excluded.valid_days,
    archived_at = null,
    updated_at = now();

notify pgrst, 'reload schema';
