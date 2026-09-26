-- Cho phep product_kind = 'subscription' (truoc day CHECK chi cho 'bundle').
alter table public.key_products drop constraint if exists key_products_product_kind_check;
alter table public.key_products
  add constraint key_products_product_kind_check
  check (product_kind in ('bundle', 'subscription'));

-- Archive 5 goi luot cu (khong xoa, chi tat is_active + ghi archived_at). Idempotent.
update public.key_products
set is_active = false, archived_at = coalesce(archived_at, now()), updated_at = now()
where code in ('TRIAL-3', 'BUNDLE-3', 'BUNDLE-10', 'VIP-1Y', 'BUNDLE-30');

-- Seed 3 goi VIP theo thoi gian (subscription). attempt_count la NOT NULL + CHECK > 0
-- tren key_products, nhung khong duoc dung cho subscription (subscription cap quyen qua
-- bang entitlements, khong qua exam_keys/attempt_count) -> dat 999999 lam gia tri "khong
-- ap dung" de thoa man constraint, code doc du lieu subscription phai bo qua cot nay.
insert into public.key_products (code, name, product_kind, attempt_count, price_amount, currency, valid_days, is_active, archived_at, metadata)
values
  ('VIP-WEEK',  'Goi VIP Tuan',  'subscription', 999999, 29000,  'VND', 7,   true, null, jsonb_build_object('plan_code', 'WEEK',  'kind', 'vip_subscription')),
  ('VIP-MONTH', 'Goi VIP Thang', 'subscription', 999999, 79000,  'VND', 30,  true, null, jsonb_build_object('plan_code', 'MONTH', 'kind', 'vip_subscription')),
  ('VIP-YEAR',  'Goi VIP Nam',   'subscription', 999999, 199000, 'VND', 365, true, null, jsonb_build_object('plan_code', 'YEAR',  'kind', 'vip_subscription'))
on conflict (code) do nothing;
