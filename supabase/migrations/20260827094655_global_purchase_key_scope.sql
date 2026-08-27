-- Every paid catalog item issues a global pool of attempts. Those attempts are
-- intentionally shared by official exam rooms and server-generated practice
-- sessions. Legacy exam/practice catalog rows are normalized before the
-- constraint is narrowed, while historical orders remain fulfillable.

update public.key_products
set product_kind = 'bundle',
    updated_at = now()
where product_kind <> 'bundle';

alter table public.key_products
  drop constraint if exists key_products_product_kind_check;

alter table public.key_products
  add constraint key_products_product_kind_check
  check (product_kind = 'bundle') not valid;

alter table public.key_products
  validate constraint key_products_product_kind_check;

alter table public.exam_keys
  drop constraint if exists exam_keys_purchased_global_scope;

alter table public.exam_keys
  add constraint exam_keys_purchased_global_scope
  check (source_order_id is null or exam_room_id is null) not valid;

alter table public.exam_keys
  validate constraint exam_keys_purchased_global_scope;

comment on column public.key_products.product_kind is
  'Paid catalog scope. All purchasable products are bundle: attempts work for official exams and practice sessions.';

comment on constraint exam_keys_purchased_global_scope on public.exam_keys is
  'Keys fulfilled from purchase orders are global and cannot be restricted to one exam room.';

notify pgrst, 'reload schema';
