begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(23);

select has_column('public', 'key_products', 'valid_days',
  'products can snapshot an entitlement expiry');
select has_column('public', 'purchase_orders', 'payment_code',
  'orders expose a transfer code');
select has_column('public', 'purchase_orders', 'expires_at',
  'orders expire after checkout timeout');
select has_column('public', 'exam_keys', 'source_order_id',
  'fulfilled orders own one key');

select has_table('public', 'payment_events',
  'immutable SePay evidence table exists');
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
  'process_sepay_payment',
  array['text', 'text', 'integer', 'text', 'text', 'text', 'text', 'jsonb', 'text'],
  'jsonb',
  'SePay events are processed through one idempotent RPC'
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
  array['uuid', 'text'], 'order creation is guarded by the database');
select is_definer('public', 'process_sepay_payment',
  array['text', 'text', 'integer', 'text', 'text', 'text', 'text', 'jsonb', 'text'],
  'webhook fulfillment is guarded by the database');
select is_definer('public', 'reconcile_purchase_order',
  array['uuid'], 'reconciliation is admin-gated');

select results_eq(
  $$select has_table_privilege('anon', 'public.purchase_orders', 'INSERT')$$,
  array[false],
  'anonymous callers cannot insert orders'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.purchase_orders', 'INSERT')$$,
  array[false],
  'authenticated clients cannot insert orders directly'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.purchase_orders', 'UPDATE')$$,
  array[false],
  'authenticated clients cannot mark orders paid directly'
);
select results_eq(
  $$select has_table_privilege('authenticated', 'public.payment_events', 'INSERT')$$,
  array[false],
  'clients cannot forge provider events'
);
select results_eq(
  $$select has_function_privilege('anon', 'public.process_sepay_payment(text,text,integer,text,text,text,text,jsonb,text)', 'EXECUTE')$$,
  array[false],
  'anonymous callers cannot execute webhook fulfillment'
);
select results_eq(
  $$select has_function_privilege('authenticated', 'public.process_sepay_payment(text,text,integer,text,text,text,text,jsonb,text)', 'EXECUTE')$$,
  array[false],
  'student sessions cannot execute webhook fulfillment'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.payment_events'::regclass$$,
  array[true],
  'payment evidence has RLS'
);
select results_eq(
  $$select position('PAYMENT_EVENT_IMMUTABLE' in pg_get_functiondef('private.prevent_payment_event_mutation()'::regprocedure)) > 0$$,
  array[true],
  'payment evidence has an immutable trigger'
);
select results_eq(
  $$select count(*)::bigint from public.key_products where valid_days is not null and valid_days <= 0$$,
  array[0::bigint],
  'configured product expiries remain positive'
);

select * from finish();
rollback;
