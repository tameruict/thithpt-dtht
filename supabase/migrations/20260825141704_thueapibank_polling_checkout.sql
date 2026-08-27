-- Replace the provider-specific webhook path with a generic, idempotent bank
-- payment processor and a leased ThueAPIBank polling state machine.
--
-- This migration is intentionally forward-only. The preceding checkout
-- migration has not been applied to production yet, but staging applies both
-- migrations in order so this file only generalizes the resulting contract.

create table if not exists public.payment_provider_state (
  provider text primary key check (provider ~ '^[a-z0-9][a-z0-9_-]{1,31}$'),
  cursor text,
  locked_until timestamptz,
  lock_owner uuid,
  last_polled_at timestamptz,
  last_success_at timestamptz,
  last_error_code text,
  auto_fulfillment_enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

insert into public.payment_provider_state (provider)
values ('thueapibank')
on conflict (provider) do nothing;

alter table public.payment_provider_state enable row level security;

drop policy if exists payment_provider_state_admin_read
  on public.payment_provider_state;
create policy payment_provider_state_admin_read
on public.payment_provider_state for select to authenticated
using (private.is_admin());

revoke all on public.payment_provider_state from anon, authenticated;
grant select on public.payment_provider_state to authenticated;

drop trigger if exists payment_provider_state_updated_at
  on public.payment_provider_state;
create trigger payment_provider_state_updated_at
before update on public.payment_provider_state
for each row execute function private.touch_updated_at();

alter table public.payment_events
  add column if not exists transaction_at timestamptz,
  add column if not exists direction text,
  add column if not exists amount integer,
  add column if not exists content text,
  add column if not exists account_number text,
  add column if not exists bank_code text,
  add column if not exists provider_reference text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'payment_events_direction_valid'
      and conrelid = 'public.payment_events'::regclass
  ) then
    alter table public.payment_events
      add constraint payment_events_direction_valid
      check (direction is null or direction in ('in', 'out'));
  end if;
end
$$;

create index if not exists payment_events_provider_transaction_idx
  on public.payment_events (provider, transaction_at desc);

create or replace function private.fulfill_purchase_order(
  p_order_id uuid,
  p_provider text,
  p_provider_reference text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  order_row public.purchase_orders%rowtype;
  key_row public.exam_keys%rowtype;
  key_id uuid;
  key_code text;
  expiry timestamptz;
  attempt_count integer;
  valid_days integer;
  payment_reference text;
begin
  if nullif(trim(p_provider), '') is null then
    raise exception 'PAYMENT_PROVIDER_REQUIRED';
  end if;

  select *
  into order_row
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND';
  end if;

  if order_row.status in ('cancelled', 'refunded') then
    raise exception 'PURCHASE_ORDER_NOT_PAYABLE';
  end if;

  attempt_count := greatest(
    (order_row.product_snapshot ->> 'attempt_count')::integer,
    1
  );
  valid_days := nullif(order_row.product_snapshot ->> 'valid_days', '')::integer;
  expiry := case
    when valid_days is null then null
    else now() + make_interval(days => valid_days)
  end;
  payment_reference := lower(trim(p_provider)) || ':' || coalesce(
    nullif(trim(p_provider_reference), ''),
    order_row.payment_code
  );

  select *
  into key_row
  from public.exam_keys
  where source_order_id = p_order_id
  for update;

  if not found then
    insert into public.students (id, full_name)
    select profile.id, profile.full_name
    from public.profiles as profile
    where profile.id = order_row.student_id
    on conflict (id) do nothing;

    loop
      key_id := extensions.gen_random_uuid();
      key_code := 'BUY-' || upper(replace(substr(key_id::text, 1, 16), '-', ''));
      begin
        insert into public.exam_keys (
          id,
          code,
          exam_room_id,
          batch_id,
          assigned_to,
          total_attempts,
          used_attempts,
          status,
          expires_at,
          price_paid,
          payment_ref,
          is_public,
          source_order_id
        ) values (
          key_id,
          key_code,
          null,
          null,
          order_row.student_id,
          attempt_count,
          0,
          'unused',
          expiry,
          order_row.amount,
          payment_reference,
          false,
          p_order_id
        );
        exit;
      exception
        when unique_violation then
          key_id := null;
      end;
    end loop;
  else
    key_id := key_row.id;
    key_code := key_row.code;
  end if;

  update public.purchase_orders
  set status = 'fulfilled',
      provider = coalesce(provider, lower(trim(p_provider))),
      provider_order_ref = coalesce(
        provider_order_ref,
        nullif(trim(p_provider_reference), '')
      ),
      paid_at = coalesce(paid_at, now()),
      fulfilled_at = coalesce(fulfilled_at, now()),
      failure_code = null,
      updated_at = now()
  where id = p_order_id;

  return jsonb_build_object(
    'order_id', p_order_id,
    'status', 'fulfilled',
    'key_id', key_id,
    'key_code', key_code
  );
end;
$$;

revoke all on function private.fulfill_purchase_order(uuid, text, text)
  from public, anon, authenticated;

create or replace function public.process_bank_payment(
  p_provider text,
  p_provider_event_id text,
  p_transaction_at timestamptz,
  p_direction text,
  p_amount integer,
  p_content text,
  p_payment_code text,
  p_account_number text,
  p_expected_account_number text,
  p_bank_code text,
  p_expected_bank_code text,
  p_provider_reference text,
  p_payload jsonb,
  p_payload_sha256 text
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  order_row public.purchase_orders%rowtype;
  event_row public.payment_events%rowtype;
  result jsonb;
  existing_status text;
  existing_key_code text;
  normalized_provider text := lower(trim(coalesce(p_provider, '')));
  normalized_payment_code text := upper(trim(coalesce(p_payment_code, '')));
  normalized_direction text := lower(trim(coalesce(p_direction, '')));
  normalized_account text := regexp_replace(
    coalesce(p_account_number, ''),
    '[[:space:]]+',
    '',
    'g'
  );
  expected_account text := regexp_replace(
    coalesce(p_expected_account_number, ''),
    '[[:space:]]+',
    '',
    'g'
  );
  normalized_bank text := upper(trim(coalesce(p_bank_code, '')));
  expected_bank text := upper(trim(coalesce(p_expected_bank_code, '')));
  content_codes text[];
  event_type text;
  processing_error text;
begin
  if normalized_provider !~ '^[a-z0-9][a-z0-9_-]{1,31}$' then
    raise exception 'PAYMENT_PROVIDER_INVALID';
  end if;
  if nullif(trim(p_provider_event_id), '') is null then
    raise exception 'PROVIDER_EVENT_ID_REQUIRED';
  end if;
  if p_transaction_at is null then
    raise exception 'TRANSACTION_TIME_REQUIRED';
  end if;
  if p_payload_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'PAYLOAD_HASH_INVALID';
  end if;

  select *
  into event_row
  from public.payment_events
  where provider = normalized_provider
    and provider_event_id = trim(p_provider_event_id);

  if found then
    select purchase.status, key.code
    into existing_status, existing_key_code
    from public.purchase_orders as purchase
    left join public.exam_keys as key on key.source_order_id = purchase.id
    where purchase.id = event_row.order_id;

    return jsonb_build_object(
      'duplicate', true,
      'accepted', event_row.processing_error is null,
      'event_id', event_row.id,
      'order_id', event_row.order_id,
      'status', coalesce(existing_status, 'unmatched'),
      'key_code', existing_key_code
    );
  end if;

  select array_agg(matches[1])
  into content_codes
  from regexp_matches(
    upper(coalesce(p_content, '')),
    '(THPT[A-Z0-9]{8,24})',
    'g'
  ) as matches;

  if coalesce(array_length(content_codes, 1), 0) <> 1
     or content_codes[1] <> normalized_payment_code then
    event_type := 'invalid_payment_code';
    processing_error := 'PAYMENT_CODE_INVALID_OR_AMBIGUOUS';
  end if;

  if processing_error is null then
    select *
    into order_row
    from public.purchase_orders
    where upper(payment_code) = normalized_payment_code
    for update;

    if not found then
      event_type := 'unmatched';
      processing_error := 'PAYMENT_CODE_NOT_FOUND';
    end if;
  end if;

  if processing_error is null then
    if normalized_direction <> 'in' then
      event_type := 'invalid_transfer';
      processing_error := 'TRANSFER_TYPE_NOT_IN';
    elsif p_amount is null or p_amount <> order_row.amount then
      event_type := 'invalid_amount';
      processing_error := 'PAYMENT_AMOUNT_MISMATCH';
    elsif normalized_account = '' or expected_account = ''
       or normalized_account <> expected_account then
      event_type := 'invalid_account';
      processing_error := 'PAYMENT_ACCOUNT_MISMATCH';
    elsif expected_bank <> '' and normalized_bank <> expected_bank then
      event_type := 'invalid_bank';
      processing_error := 'PAYMENT_BANK_MISMATCH';
    elsif p_transaction_at < order_row.created_at then
      event_type := 'invalid_time';
      processing_error := 'TRANSACTION_BEFORE_ORDER';
    elsif order_row.expires_at is not null
       and p_transaction_at > order_row.expires_at then
      event_type := 'expired_order';
      processing_error := 'PURCHASE_ORDER_EXPIRED';
    elsif order_row.status not in ('pending', 'paid') then
      event_type := 'invalid_order_state';
      processing_error := 'PURCHASE_ORDER_NOT_PENDING';
    else
      event_type := 'payment_received';
    end if;
  end if;

  insert into public.payment_events (
    order_id,
    provider,
    provider_event_id,
    event_type,
    payload_sha256,
    payload,
    transaction_at,
    direction,
    amount,
    content,
    account_number,
    bank_code,
    provider_reference,
    received_at,
    processed_at,
    processing_error
  ) values (
    order_row.id,
    normalized_provider,
    trim(p_provider_event_id),
    event_type,
    lower(p_payload_sha256),
    coalesce(p_payload, '{}'::jsonb),
    p_transaction_at,
    case when normalized_direction in ('in', 'out') then normalized_direction else null end,
    p_amount,
    left(coalesce(p_content, ''), 1000),
    nullif(normalized_account, ''),
    nullif(normalized_bank, ''),
    nullif(trim(p_provider_reference), ''),
    now(),
    now(),
    processing_error
  );

  if processing_error is not null then
    if processing_error = 'PURCHASE_ORDER_EXPIRED' and order_row.id is not null then
      update public.purchase_orders
      set status = 'failed',
          failed_at = now(),
          failure_code = processing_error,
          updated_at = now()
      where id = order_row.id and status = 'pending';
    end if;

    return jsonb_build_object(
      'duplicate', false,
      'accepted', false,
      'status', coalesce(order_row.status, 'unmatched'),
      'order_id', order_row.id,
      'error', processing_error
    );
  end if;

  update public.purchase_orders
  set status = case when status = 'pending' then 'paid' else status end,
      provider = normalized_provider,
      provider_order_ref = coalesce(
        nullif(trim(p_provider_reference), ''),
        trim(p_provider_event_id)
      ),
      paid_at = coalesce(paid_at, p_transaction_at),
      updated_at = now()
  where id = order_row.id;

  result := private.fulfill_purchase_order(
    order_row.id,
    normalized_provider,
    coalesce(nullif(trim(p_provider_reference), ''), trim(p_provider_event_id))
  );

  return jsonb_build_object(
    'duplicate', false,
    'accepted', true,
    'event_id', (
      select id
      from public.payment_events
      where provider = normalized_provider
        and provider_event_id = trim(p_provider_event_id)
    )
  ) || result;
exception
  when unique_violation then
    select *
    into event_row
    from public.payment_events
    where provider = normalized_provider
      and provider_event_id = trim(p_provider_event_id);

    return jsonb_build_object(
      'duplicate', true,
      'accepted', event_row.processing_error is null,
      'event_id', event_row.id,
      'order_id', event_row.order_id
    );
end;
$$;

revoke all on function public.process_bank_payment(
  text, text, timestamptz, text, integer, text, text, text, text,
  text, text, text, jsonb, text
) from public, anon, authenticated;
grant execute on function public.process_bank_payment(
  text, text, timestamptz, text, integer, text, text, text, text,
  text, text, text, jsonb, text
) to service_role;

create or replace function public.claim_payment_provider_lease(
  p_provider text,
  p_owner uuid,
  p_lease_seconds integer default 20,
  p_force boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  state_row public.payment_provider_state%rowtype;
begin
  if p_owner is null then
    raise exception 'LEASE_OWNER_REQUIRED';
  end if;
  if p_lease_seconds < 5 or p_lease_seconds > 120 then
    raise exception 'LEASE_DURATION_INVALID';
  end if;

  insert into public.payment_provider_state (provider)
  values (lower(trim(p_provider)))
  on conflict (provider) do nothing;

  select *
  into state_row
  from public.payment_provider_state
  where provider = lower(trim(p_provider))
  for update;

  if not state_row.auto_fulfillment_enabled and not p_force then
    return jsonb_build_object(
      'acquired', false,
      'reason', 'AUTO_FULFILLMENT_DISABLED',
      'last_error_code', state_row.last_error_code
    );
  end if;

  if state_row.locked_until is not null
     and state_row.locked_until > now()
     and state_row.lock_owner is distinct from p_owner then
    return jsonb_build_object(
      'acquired', false,
      'reason', 'LEASE_HELD',
      'locked_until', state_row.locked_until
    );
  end if;

  update public.payment_provider_state
  set locked_until = now() + make_interval(secs => p_lease_seconds),
      lock_owner = p_owner,
      last_polled_at = now(),
      auto_fulfillment_enabled = case when p_force then true else auto_fulfillment_enabled end,
      last_error_code = case when p_force then null else last_error_code end,
      updated_at = now()
  where provider = state_row.provider
  returning * into state_row;

  return jsonb_build_object(
    'acquired', true,
    'provider', state_row.provider,
    'cursor', state_row.cursor,
    'locked_until', state_row.locked_until
  );
end;
$$;

revoke all on function public.claim_payment_provider_lease(text, uuid, integer, boolean)
  from public, anon, authenticated;
grant execute on function public.claim_payment_provider_lease(text, uuid, integer, boolean)
  to service_role;

create or replace function public.complete_payment_provider_poll(
  p_provider text,
  p_owner uuid,
  p_cursor text,
  p_success boolean,
  p_error_code text default null,
  p_disable_auto_fulfillment boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  state_row public.payment_provider_state%rowtype;
begin
  select *
  into state_row
  from public.payment_provider_state
  where provider = lower(trim(p_provider))
  for update;

  if not found then
    raise exception 'PAYMENT_PROVIDER_STATE_NOT_FOUND';
  end if;
  if state_row.lock_owner is distinct from p_owner then
    raise exception 'PAYMENT_PROVIDER_LEASE_NOT_OWNED';
  end if;

  update public.payment_provider_state
  set cursor = case
        when p_success then coalesce(nullif(p_cursor, ''), cursor)
        else cursor
      end,
      last_success_at = case when p_success then now() else last_success_at end,
      last_error_code = case
        when p_success then null
        else left(coalesce(nullif(trim(p_error_code), ''), 'POLL_FAILED'), 100)
      end,
      auto_fulfillment_enabled = case
        when p_disable_auto_fulfillment then false
        else auto_fulfillment_enabled
      end,
      locked_until = null,
      lock_owner = null,
      updated_at = now()
  where provider = state_row.provider
  returning * into state_row;

  return jsonb_build_object(
    'provider', state_row.provider,
    'success', p_success,
    'cursor', state_row.cursor,
    'auto_fulfillment_enabled', state_row.auto_fulfillment_enabled,
    'last_error_code', state_row.last_error_code
  );
end;
$$;

revoke all on function public.complete_payment_provider_poll(
  text, uuid, text, boolean, text, boolean
) from public, anon, authenticated;
grant execute on function public.complete_payment_provider_poll(
  text, uuid, text, boolean, text, boolean
) to service_role;

create or replace function public.reconcile_purchase_order(p_order_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  order_row public.purchase_orders%rowtype;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select *
  into order_row
  from public.purchase_orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'PURCHASE_ORDER_NOT_FOUND';
  end if;

  if order_row.status = 'paid' then
    return private.fulfill_purchase_order(
      p_order_id,
      coalesce(order_row.provider, 'thueapibank'),
      order_row.provider_order_ref
    );
  end if;

  return jsonb_build_object(
    'order_id', order_row.id,
    'status', order_row.status,
    'key_code', (
      select code from public.exam_keys where source_order_id = order_row.id
    )
  );
end;
$$;

revoke all on function public.reconcile_purchase_order(uuid)
  from public, anon;
grant execute on function public.reconcile_purchase_order(uuid)
  to authenticated;

drop function if exists private.fulfill_purchase_order(uuid, text);

notify pgrst, 'reload schema';
