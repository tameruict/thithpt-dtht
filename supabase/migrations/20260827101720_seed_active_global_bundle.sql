-- Initial live catalog product. The global scope is enforced by migration
-- 20260827094655: these attempts can be spent on any official exam room or
-- practice session.
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
  'BUNDLE-10',
  'Gói 10 lượt toàn hệ thống',
  'bundle',
  10,
  125000,
  'VND',
  true,
  30,
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
