begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(18);

select has_column('public', 'exam_rooms', 'mode', 'exam rooms have an explicit mode');
select has_column('public', 'subjects', 'practice_attempt_cost', 'subjects define practice cost');
select has_column('public', 'exam_sessions', 'grading_status', 'sessions expose grading state');
select has_column('public', 'exam_keys', 'source_order_id', 'keys can reference purchase orders');

select has_table('public', 'key_products', 'key product contract exists');
select has_table('public', 'purchase_orders', 'purchase order contract exists');
select has_table('public', 'payment_events', 'immutable payment event table exists');
select has_table('public', 'admin_audit_log', 'structured admin audit table exists');
select has_table('public', 'exam_session_key_charges', 'practice attempt ledger exists');

select has_view('public', 'v_exam_room_readiness', 'room readiness view exists');
select has_view('public', 'v_exam_keys_effective', 'effective key status view exists');

select function_returns(
  'public',
  'get_active_exam_session_full',
  array['uuid'],
  'jsonb',
  'active session RPC returns JSON'
);
select is_definer(
  'public',
  'get_active_exam_session_full',
  array['uuid'],
  'active session RPC has a controlled definer boundary'
);
select function_returns(
  'public',
  'start_practice_session',
  array['text', 'integer', 'bigint[]', 'smallint[]'],
  'uuid',
  'practice RPC uses server-side filters'
);

select results_eq(
  $$select count(*)::bigint from public.exam_rooms where upper(code) like 'PRACTICE-%' and mode <> 'practice'$$,
  array[0::bigint],
  'all system practice rooms are separated from official exams'
);
select results_eq(
  $$select count(*)::bigint from public.v_exam_room_readiness where mode = 'exam' and status = 'published' and not is_ready$$,
  array[0::bigint],
  'no structurally invalid official room remains published'
);
select results_eq(
  $$select has_function_privilege('anon', 'public.get_active_exam_session_full(uuid)', 'EXECUTE')$$,
  array[false],
  'anonymous callers cannot execute the owned-session RPC'
);
select results_eq(
  $$select position('private.is_admin()' in pg_get_functiondef('private.is_staff()'::regprocedure)) > 0$$,
  array[true],
  'legacy staff compatibility wrapper is admin-only'
);

select * from finish();
rollback;
