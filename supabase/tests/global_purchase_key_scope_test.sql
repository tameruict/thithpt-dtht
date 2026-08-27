begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

select is(
  (select count(*)::bigint from public.key_products where product_kind <> 'bundle'),
  0::bigint,
  'all paid catalog products use the bundle scope'
);

select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.key_products'::regclass
      and conname = 'key_products_product_kind_check'
      and pg_get_constraintdef(oid) like '%product_kind = ''bundle''%'
  ),
  1::bigint,
  'database restricts paid product scope to bundle'
);

select is(
  (
    select count(*)::bigint
    from pg_constraint
    where conrelid = 'public.exam_keys'::regclass
      and conname = 'exam_keys_purchased_global_scope'
      and pg_get_constraintdef(oid) like '%source_order_id IS NULL%exam_room_id IS NULL%'
  ),
  1::bigint,
  'purchased keys must remain global rather than room-scoped'
);

select is(
  (
    select count(*)::bigint
    from public.exam_keys
    where source_order_id is not null
      and exam_room_id is not null
  ),
  0::bigint,
  'no purchased key is restricted to one exam room'
);

select ok(
  coalesce(
    col_description('public.key_products'::regclass, (
      select ordinal_position
      from information_schema.columns
      where table_schema = 'public'
        and table_name = 'key_products'
        and column_name = 'product_kind'
    )),
    ''
  ) like '%official exams and practice sessions%',
  'catalog scope is documented as shared exam and practice attempts'
);

select * from finish();

rollback;
