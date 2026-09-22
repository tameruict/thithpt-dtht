-- Đồng bộ repo ↔ production cho luồng checkout (mua/nạp key).
--
-- Bối cảnh: 4-arg public.create_purchase_order (coupon + top-up) và bản
-- private.fulfill_purchase_order có xử lý top-up đã tồn tại trên DB production
-- nhưng KHÔNG có trong repo migrations — repo chỉ còn bản 2-arg cũ
-- (20260821114952) và bản fulfill 3-arg không hỗ trợ top-up (20260825141704).
-- Kèm theo đó, 4 cột thương mại trên purchase_orders (coupon_code,
-- discount_amount, original_amount, target_key_id) cũng chỉ có trên prod.
--
-- Hệ quả: một `supabase db push` lên môi trường mới sẽ dựng lại checkout HỎNG
-- (app gọi RPC 4 tham số nhưng chỉ có bản 2 tham số → PostgREST PGRST202, và
-- fulfill top-up sẽ đúc key mới thay vì cộng lượt). File này tái lập đúng trạng
-- thái production, hoàn toàn idempotent nên chạy lại trên prod là no-op.

-- 1) Cột thương mại trên purchase_orders (prod đã có; IF NOT EXISTS → no-op prod).
alter table public.purchase_orders
  add column if not exists coupon_code text,
  add column if not exists discount_amount integer not null default 0,
  add column if not exists original_amount integer,
  add column if not exists target_key_id uuid;

-- FK target_key_id → exam_keys (ON DELETE SET NULL). Postgres không hỗ trợ
-- ADD CONSTRAINT IF NOT EXISTS cho FK, nên bọc trong DO guard theo cột.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    join pg_attribute a
      on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
    where c.conrelid = 'public.purchase_orders'::regclass
      and c.contype = 'f'
      and a.attname = 'target_key_id'
  ) then
    alter table public.purchase_orders
      add constraint purchase_orders_target_key_id_fkey
      foreign key (target_key_id) references public.exam_keys(id) on delete set null;
  end if;
end
$$;

-- 2) Cột device-bind còn sót trên prod (đã ngừng dùng nhưng vẫn tồn tại) —
-- thêm để schema mới khớp production, không ảnh hưởng checkout.
alter table public.exam_keys
  add column if not exists bound_device_hash text,
  add column if not exists bound_at timestamptz;

-- 3) Bỏ overload 2-arg cũ (prod đã drop ở 20260914061756, file này thiếu trong repo).
drop function if exists public.create_purchase_order(uuid, text);

-- 4) create_purchase_order (4 tham số) — bản production: coupon + top-up + TRIAL-3 gate.
create or replace function public.create_purchase_order(
  p_product_id uuid,
  p_idempotency_key text,
  p_coupon_code text default null::text,
  p_target_key_id uuid default null::uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  current_student_id uuid := (select auth.uid());
  product_row public.key_products%rowtype;
  existing_order public.purchase_orders%rowtype;
  coupon_row public.coupons%rowtype;
  target_key public.exam_keys%rowtype;
  order_id uuid;
  payment_code text;
  normalized_coupon text := upper(trim(coalesce(p_coupon_code, '')));
  base_price integer;
  discount integer := 0;
  final_amount integer;
  user_coupon_uses integer := 0;
begin
  if current_student_id is null
     or not exists (
       select 1 from public.profiles profile
       where profile.id = current_student_id and profile.role = 'student'
     ) then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if nullif(trim(p_idempotency_key), '') is null or length(trim(p_idempotency_key)) > 120 then
    raise exception 'IDEMPOTENCY_KEY_INVALID';
  end if;

  if normalized_coupon is not null and normalized_coupon <> '' and length(normalized_coupon) > 32 then
    raise exception 'COUPON_INVALID';
  end if;

  select * into existing_order from public.purchase_orders
  where purchase_orders.student_id = current_student_id
    and purchase_orders.idempotency_key = trim(p_idempotency_key);
  if found then
    return jsonb_build_object(
      'order_id', existing_order.id,
      'payment_code', existing_order.payment_code,
      'amount', existing_order.amount,
      'currency', existing_order.currency,
      'status', existing_order.status,
      'expires_at', existing_order.expires_at,
      'product_snapshot', existing_order.product_snapshot
    );
  end if;

  select * into product_row from public.key_products
  where id = p_product_id and is_active and archived_at is null
  for update;
  if not found then raise exception 'PRODUCT_NOT_AVAILABLE'; end if;
  if product_row.currency <> 'VND' then raise exception 'PAYMENT_CURRENCY_UNSUPPORTED'; end if;

  base_price := product_row.price_amount;

  -- TRIAL-3: gioi han 1 lan/user (tinh ca pending/paid/fulfilled, bo failed/cancelled/refunded)
  if product_row.code = 'TRIAL-3' then
    if exists (
      select 1 from public.purchase_orders o
      join public.key_products kp on kp.id = o.product_id
      where o.student_id = current_student_id
        and kp.code = 'TRIAL-3'
        and o.status in ('pending','paid','fulfilled')
    ) then
      raise exception 'TRIAL_ALREADY_USED';
    end if;
  end if;

  -- validate target key (top-up) neu co
  if p_target_key_id is not null then
    select * into target_key from public.exam_keys where id = p_target_key_id for update;
    if not found then raise exception 'TARGET_KEY_NOT_FOUND'; end if;
    if target_key.assigned_to is not null and target_key.assigned_to <> current_student_id then
      raise exception 'TARGET_KEY_NOT_OWNED';
    end if;
    if target_key.status = 'revoked' or target_key.deleted_at is not null then
      raise exception 'TARGET_KEY_REVOKED';
    end if;
  end if;

  -- validate coupon neu co
  if normalized_coupon is not null and normalized_coupon <> '' then
    select * into coupon_row from public.coupons where code = normalized_coupon for update;
    if not found then raise exception 'COUPON_NOT_FOUND'; end if;
    if not coupon_row.is_active then raise exception 'COUPON_INACTIVE'; end if;
    if coupon_row.valid_from is not null and now() < coupon_row.valid_from then raise exception 'COUPON_NOT_STARTED'; end if;
    if coupon_row.valid_to is not null and now() > coupon_row.valid_to then raise exception 'COUPON_EXPIRED'; end if;
    if coupon_row.max_uses is not null and coupon_row.used_count >= coupon_row.max_uses then raise exception 'COUPON_EXHAUSTED'; end if;
    if base_price < coupon_row.min_order_amount then raise exception 'COUPON_MIN_ORDER_NOT_MET'; end if;

    select count(*) into user_coupon_uses from public.purchase_orders
    where student_id = current_student_id and coupon_code = normalized_coupon
      and status in ('pending','paid','fulfilled');
    if user_coupon_uses >= coupon_row.per_user_limit then raise exception 'COUPON_PER_USER_LIMIT'; end if;

    if coupon_row.discount_type = 'fixed' then
      discount := least(coupon_row.discount_value, base_price);
    else
      discount := (base_price * coupon_row.discount_value) / 100;
      if coupon_row.max_discount is not null then discount := least(discount, coupon_row.max_discount); end if;
      discount := least(discount, base_price);
    end if;

    update public.coupons set used_count = used_count + 1, updated_at = now() where id = coupon_row.id;
  end if;

  final_amount := base_price - discount;
  if final_amount < 1000 then raise exception 'COUPON_DISCOUNT_TOO_HIGH'; end if;

  order_id := extensions.gen_random_uuid();
  payment_code := 'THPT' || upper(replace(substr(order_id::text, 1, 12), '-', ''));

  insert into public.purchase_orders (
    id, student_id, product_id, status, amount, currency, product_snapshot,
    idempotency_key, payment_code, expires_at, coupon_code, discount_amount, original_amount, target_key_id
  ) values (
    order_id, current_student_id, product_row.id, 'pending', final_amount, product_row.currency,
    jsonb_build_object(
      'id', product_row.id, 'code', product_row.code, 'name', product_row.name,
      'product_kind', product_row.product_kind, 'attempt_count', product_row.attempt_count,
      'price_amount', product_row.price_amount, 'currency', product_row.currency,
      'valid_days', product_row.valid_days,
      'coupon_code', case when normalized_coupon = '' then null else normalized_coupon end,
      'discount_amount', discount, 'original_amount', base_price,
      'target_key_id', p_target_key_id
    ),
    trim(p_idempotency_key), payment_code, now() + interval '24 hours',
    case when normalized_coupon = '' then null else normalized_coupon end,
    discount, base_price, p_target_key_id
  )
  on conflict (idempotency_key) do nothing;

  select * into existing_order from public.purchase_orders purchase
  where purchase.id = order_id
     or (purchase.student_id = current_student_id and purchase.idempotency_key = trim(p_idempotency_key));
  if not found then raise exception 'PURCHASE_ORDER_CREATE_FAILED'; end if;

  return jsonb_build_object(
    'order_id', existing_order.id, 'payment_code', existing_order.payment_code,
    'amount', existing_order.amount, 'currency', existing_order.currency,
    'status', existing_order.status, 'expires_at', existing_order.expires_at,
    'product_snapshot', existing_order.product_snapshot
  );
end;
$function$;

grant execute on function public.create_purchase_order(uuid, text, text, uuid) to authenticated, service_role;

-- 5) fulfill_purchase_order (private) — bản production có nhánh TOP-UP (cong luot
-- vao key cu + ghi key_topups) truoc khi roi vao nhanh dúc key BUY moi.
create or replace function private.fulfill_purchase_order(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text default null::text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  order_row public.purchase_orders%rowtype;
  key_row public.exam_keys%rowtype;
  target_row public.exam_keys%rowtype;
  key_id uuid;
  key_code text;
  expiry timestamptz;
  attempt_count integer;
  valid_days integer;
  payment_reference text;
  new_total integer;
  new_expiry timestamptz;
begin
  if nullif(trim(p_provider), '') is null then
    raise exception 'PAYMENT_PROVIDER_REQUIRED';
  end if;

  select * into order_row from public.purchase_orders where id = p_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if order_row.status in ('cancelled', 'refunded') then raise exception 'PURCHASE_ORDER_NOT_PAYABLE'; end if;

  attempt_count := greatest((order_row.product_snapshot ->> 'attempt_count')::integer, 1);
  valid_days := nullif(order_row.product_snapshot ->> 'valid_days', '')::integer;
  expiry := case when valid_days is null then null else now() + make_interval(days => valid_days) end;
  payment_reference := lower(trim(p_provider)) || ':' || coalesce(nullif(trim(p_provider_reference), ''), order_row.payment_code);

  -- TOP-UP: cong luot + gia han vao key cu, khong sinh key moi
  if order_row.target_key_id is not null then
    select * into target_row from public.exam_keys where id = order_row.target_key_id for update;
    if not found then raise exception 'TARGET_KEY_NOT_FOUND'; end if;
    if target_row.status = 'revoked' or target_row.deleted_at is not null then
      raise exception 'TARGET_KEY_REVOKED';
    end if;

    new_total := target_row.total_attempts + attempt_count;
    if valid_days is null then
      new_expiry := target_row.expires_at;
    elsif target_row.expires_at is null or target_row.expires_at < now() then
      new_expiry := now() + make_interval(days => valid_days);
    else
      new_expiry := target_row.expires_at + make_interval(days => valid_days);
    end if;

    update public.exam_keys
    set total_attempts = new_total,
        expires_at = new_expiry,
        assigned_to = coalesce(assigned_to, order_row.student_id),
        status = case
          when used_attempts < new_total and (new_expiry is null or new_expiry > now()) then 'active'::public.exam_key_status
          else status end,
        price_paid = price_paid + order_row.amount,
        updated_at = now()
    where id = target_row.id;

    insert into public.key_topups (key_id, order_id, added_attempts, extended_days)
    values (target_row.id, p_order_id, attempt_count, valid_days)
    on conflict (order_id) do nothing;

    update public.purchase_orders
    set status = 'fulfilled',
        provider = coalesce(provider, lower(trim(p_provider))),
        provider_order_ref = coalesce(provider_order_ref, nullif(trim(p_provider_reference), '')),
        paid_at = coalesce(paid_at, now()),
        fulfilled_at = coalesce(fulfilled_at, now()),
        failure_code = null, updated_at = now()
    where id = p_order_id;

    return jsonb_build_object('order_id', p_order_id, 'status', 'fulfilled', 'key_id', target_row.id, 'key_code', target_row.code, 'topup', true);
  end if;

  select * into key_row from public.exam_keys where source_order_id = p_order_id for update;

  if not found then
    insert into public.students (id, full_name)
    select profile.id, profile.full_name from public.profiles as profile
    where profile.id = order_row.student_id
    on conflict (id) do nothing;

    loop
      key_id := extensions.gen_random_uuid();
      key_code := 'BUY-' || upper(replace(substr(key_id::text, 1, 16), '-', ''));
      begin
        insert into public.exam_keys (
          id, code, exam_room_id, batch_id, assigned_to, total_attempts, used_attempts,
          status, expires_at, price_paid, payment_ref, is_public, source_order_id
        ) values (
          key_id, key_code, null, null, order_row.student_id, attempt_count, 0,
          'unused', expiry, order_row.amount, payment_reference, false, p_order_id
        );
        exit;
      exception when unique_violation then key_id := null;
      end;
    end loop;
  else
    key_id := key_row.id;
    key_code := key_row.code;
  end if;

  update public.purchase_orders
  set status = 'fulfilled',
      provider = coalesce(provider, lower(trim(p_provider))),
      provider_order_ref = coalesce(provider_order_ref, nullif(trim(p_provider_reference), '')),
      paid_at = coalesce(paid_at, now()),
      fulfilled_at = coalesce(fulfilled_at, now()),
      failure_code = null, updated_at = now()
  where id = p_order_id;

  return jsonb_build_object('order_id', p_order_id, 'status', 'fulfilled', 'key_id', key_id, 'key_code', key_code);
end;
$function$;
