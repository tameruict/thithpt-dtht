begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

select is(
  (select count(*)::bigint from public.key_products where code = 'BUNDLE-10'),
  1::bigint,
  'BUNDLE-10 exists exactly once'
);

select is(
  (select product_kind from public.key_products where code = 'BUNDLE-10'),
  'bundle',
  'BUNDLE-10 uses global bundle scope'
);

select is(
  (select attempt_count from public.key_products where code = 'BUNDLE-10'),
  10,
  'BUNDLE-10 grants ten shared attempts'
);

select is(
  (select price_amount from public.key_products where code = 'BUNDLE-10'),
  125000,
  'BUNDLE-10 costs 125000 VND'
);

select is(
  (select valid_days from public.key_products where code = 'BUNDLE-10'),
  30,
  'BUNDLE-10 remains valid for thirty days after fulfillment'
);

select ok(
  coalesce((
    select is_active and archived_at is null and currency = 'VND'
    from public.key_products
    where code = 'BUNDLE-10'
  ), false),
  'BUNDLE-10 is active, unarchived, and purchasable in VND'
);

select * from finish();

rollback;
