-- entitlements.kind hien CHECK chi cho phep 'solution_access'. Can them 'vip_subscription'
-- de fulfillment cua goi VIP-WEEK/MONTH/YEAR insert duoc.
alter table public.entitlements drop constraint if exists entitlements_kind_check;
alter table public.entitlements
  add constraint entitlements_kind_check
  check (kind in ('solution_access', 'vip_subscription'));

-- private.fulfill_purchase_order: giu nguyen ten ham + chu ky (webhook TS goi khong doi).
-- Them nhanh moi o DAU ham: neu key_products.product_kind = 'subscription' thi cap
-- entitlements (kind='vip_subscription') thay vi cap exam_keys. Neu student dang co
-- entitlement VIP con han, CONG DON thoi gian (expires_at += valid_days) thay vi ghi de,
-- nhat quan voi get_user_access() (lay entitlement co expires_at lon nhat).
-- Nhanh 'bundle' cu (cap exam_keys) GIU NGUYEN, khong doi gi.
create or replace function private.fulfill_purchase_order(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
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
  -- subscription (VIP theo thoi gian) qua entitlements --------------------------
  product_row public.key_products%rowtype;
  v_plan_code text;
  v_existing_entitlement_id uuid;
  v_existing_expires_at timestamptz;
  v_new_entitlement_expires_at timestamptz;
begin
  if nullif(trim(p_provider), '') is null then
    raise exception 'PAYMENT_PROVIDER_REQUIRED';
  end if;

  select * into order_row from public.purchase_orders where id = p_order_id for update;
  if not found then raise exception 'PURCHASE_ORDER_NOT_FOUND'; end if;
  if order_row.status in ('cancelled', 'refunded') then raise exception 'PURCHASE_ORDER_NOT_PAYABLE'; end if;

  payment_reference := lower(trim(p_provider)) || ':' || coalesce(nullif(trim(p_provider_reference), ''), order_row.payment_code);

  -- SUBSCRIPTION: cap/gia han VIP qua entitlements, KHONG cap exam_keys -----------
  if order_row.product_snapshot ->> 'product_kind' = 'subscription' then
    select * into product_row from public.key_products where id = order_row.product_id;

    valid_days := coalesce(
      nullif(order_row.product_snapshot ->> 'valid_days', '')::integer,
      product_row.valid_days
    );
    if valid_days is null or valid_days <= 0 then
      raise exception 'SUBSCRIPTION_VALID_DAYS_INVALID';
    end if;

    v_plan_code := product_row.metadata ->> 'plan_code';

    -- Da fulfill roi (idempotent qua webhook retry) -> khong cong don lan nua.
    if order_row.status = 'fulfilled' then
      return jsonb_build_object('order_id', p_order_id, 'status', 'fulfilled', 'subscription', true, 'already_fulfilled', true);
    end if;

    select ent.id, ent.expires_at
      into v_existing_entitlement_id, v_existing_expires_at
    from public.entitlements ent
    where ent.user_id = order_row.student_id
      and ent.kind = 'vip_subscription'
      and ent.revoked_at is null
      and ent.expires_at > now()
    order by ent.expires_at desc
    limit 1
    for update;

    if v_existing_entitlement_id is not null then
      -- Con han: cong don them valid_days vao expires_at hien tai, khong mat thoi gian con lai.
      v_new_entitlement_expires_at := v_existing_expires_at + make_interval(days => valid_days);

      update public.entitlements
      set expires_at = v_new_entitlement_expires_at,
          source_order_id = order_row.id,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('plan_code', v_plan_code)
      where id = v_existing_entitlement_id;
    else
      v_new_entitlement_expires_at := now() + make_interval(days => valid_days);

      insert into public.entitlements (
        user_id, kind, scope, source_order_id, granted_at, expires_at, metadata
      ) values (
        order_row.student_id, 'vip_subscription', 'global', order_row.id, now(), v_new_entitlement_expires_at,
        jsonb_build_object('plan_code', v_plan_code)
      );
    end if;

    update public.purchase_orders
    set status = 'fulfilled',
        provider = coalesce(provider, lower(trim(p_provider))),
        provider_order_ref = coalesce(provider_order_ref, nullif(trim(p_provider_reference), '')),
        paid_at = coalesce(paid_at, now()),
        fulfilled_at = coalesce(fulfilled_at, now()),
        failure_code = null, updated_at = now()
    where id = p_order_id;

    return jsonb_build_object(
      'order_id', p_order_id, 'status', 'fulfilled', 'subscription', true,
      'plan_code', v_plan_code, 'expires_at', v_new_entitlement_expires_at
    );
  end if;

  -- BUNDLE (luong cu, khong doi): cap exam_keys theo luot -------------------------
  attempt_count := greatest((order_row.product_snapshot ->> 'attempt_count')::integer, 1);
  valid_days := nullif(order_row.product_snapshot ->> 'valid_days', '')::integer;
  expiry := case when valid_days is null then null else now() + make_interval(days => valid_days) end;

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

revoke all on function private.fulfill_purchase_order(uuid, text, text) from public, anon, authenticated;

notify pgrst, 'reload schema';
