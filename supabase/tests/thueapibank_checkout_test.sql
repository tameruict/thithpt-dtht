begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(31);

select has_column('public', 'key_products', 'valid_days',
  'products snapshot an entitlement expiry');
select has_column('public', 'purchase_orders', 'payment_code',
  'orders expose a transfer code');
select has_column('public', 'purchase_orders', 'expires_at',
  'orders expire after checkout timeout');
select has_column('public', 'exam_keys', 'source_order_id',
  'fulfilled orders own one key');

select has_table('public', 'payment_events',
  'immutable bank payment evidence exists');
select has_table('public', 'payment_provider_state',
  'poll cursor and lease state exists');
select has_column('public', 'payment_events', 'transaction_at',
  'normalized transaction time is retained');
select has_column('public', 'payment_events', 'direction',
  'normalized transaction direction is retained');
select has_column('public', 'payment_provider_state', 'last_success_at',
  'last successful poll is observable');
select has_column('public', 'payment_provider_state', 'auto_fulfillment_enabled',
  'provider auth failures can stop fulfillment');
select has_index('public', 'payment_events', 'payment_events_provider_provider_event_id_key',
  'provider event IDs are unique');
select has_index('public', 'exam_keys', 'exam_keys_source_order_unique',
  'one key is issued per order');

select function_returns(
  'public',
  'create_purchase_order',
  array['uuid', 'text'],
  'jsonb',
  'students create orders through a server RPC'
);
select function_returns(
  'public',
  'process_bank_payment',
  array[
    'text', 'text', 'timestamp with time zone', 'text', 'integer', 'text',
    'text', 'text', 'text', 'text', 'text', 'text', 'jsonb', 'text'
  ],
  'jsonb',
  'normalized bank events use one idempotent RPC'
);
select function_returns(
  'public',
  'claim_payment_provider_lease',
  array['text', 'uuid', 'integer', 'boolean'],
  'jsonb',
  'poll workers claim a database lease'
);
select function_returns(
  'public',
  'complete_payment_provider_poll',
  array['text', 'uuid', 'text', 'boolean', 'text', 'boolean'],
  'jsonb',
  'poll workers release the lease and advance cursor'
);
select function_returns(
  'public',
  'reconcile_purchase_order',
  array['uuid'],
  'jsonb',
  'admin reconciliation returns JSON'
);
select function_returns(
  'public',
  'revoke_purchase_order',
  array['uuid', 'text'],
  'jsonb',
  'refund/revoke is an audited RPC'
);

select is_definer('public', 'create_purchase_order',
  array['uuid', 'text'], 'order creation is database guarded');
select is_definer('public', 'process_bank_payment',
  array[
    'text', 'text', 'timestamp with time zone', 'text', 'integer', 'text',
    'text', 'text', 'text', 'text', 'text', 'text', 'jsonb', 'text'
  ],
  'bank fulfillment is database guarded');

select results_eq(
  $$select has_table_privilege('anon', 'public.purchase_orders', 'INSERT')$$,
  array[false],
  'anonymous callers cannot insert orders'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.purchase_orders', 'UPDATE')$$,
  array[false],
  'students cannot mark orders paid'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.payment_events', 'INSERT')$$,
  array[false],
  'clients cannot forge payment evidence'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.payment_provider_state', 'UPDATE')$$,
  array[false],
  'clients cannot alter poll leases or cursor'
);
select results_eq(
  $$select has_function_privilege(
    'authenticated',
    'public.process_bank_payment(text,text,timestamptz,text,integer,text,text,text,text,text,text,text,jsonb,text)',
    'EXECUTE'
  )$$,
  array[false],
  'student sessions cannot execute fulfillment'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.payment_events'::regclass$$,
  array[true],
  'payment evidence has RLS'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.payment_provider_state'::regclass$$,
  array[true],
  'provider state has RLS'
);
select results_eq(
  $$select position('p_provider' in lower(pg_get_functiondef(
    'public.process_bank_payment(text,text,timestamptz,text,integer,text,text,text,text,text,text,text,jsonb,text)'::regprocedure
  ))) > 0$$,
  array[true],
  'generic bank processor receives provider as an explicit field'
);

select is(
  (public.claim_payment_provider_lease(
    'thueapibank',
    '11111111-1111-4111-8111-111111111111'::uuid,
    20,
    false
  ) ->> 'acquired')::boolean,
  true,
  'first poll worker acquires the lease'
);
select is(
  (public.claim_payment_provider_lease(
    'thueapibank',
    '22222222-2222-4222-8222-222222222222'::uuid,
    20,
    false
  ) ->> 'acquired')::boolean,
  false,
  'second concurrent poll worker skips the provider call'
);
select is(
  public.complete_payment_provider_poll(
    'thueapibank',
    '11111111-1111-4111-8111-111111111111'::uuid,
    'cursor-after-success',
    true,
    null,
    false
  ) ->> 'cursor',
  'cursor-after-success',
  'lease owner advances cursor only after success'
);

select * from finish();
rollback;
