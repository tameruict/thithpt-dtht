begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(24);

select has_column('public', 'questions', 'content_format_version', 'question content is versioned');
select has_column('public', 'questions', 'content_quality_status', 'question content has a review state');
select has_column('public', 'questions', 'content_hash', 'normalized content can be deduplicated');
select has_column('public', 'questions', 'r2_asset_id', 'question images reference the registry');
select has_column('public', 'questions', 'image_alt_text', 'question images have accessible text');

select has_table('public', 'question_content_reviews', 'content review queue exists');
select has_table('public', 'exam_sources', 'exam provenance exists');
select has_table('public', 'question_source_links', 'question provenance links exist');
select has_table('public', 'exam_key_assignments', 'key assignment relation exists');
select has_table('public', 'exam_key_usage_ledger', 'immutable usage ledger exists');
select has_view('public', 'v_exam_key_balances', 'derived key balance view exists');

select results_eq(
  $$select relrowsecurity from pg_class where oid='public.question_content_reviews'::regclass$$,
  array[true],
  'review queue has RLS'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.exam_sources'::regclass$$,
  array[true],
  'exam sources have RLS'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.question_source_links'::regclass$$,
  array[true],
  'source links have RLS'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.exam_key_assignments'::regclass$$,
  array[true],
  'key assignments have RLS'
);
select results_eq(
  $$select relrowsecurity from pg_class where oid='public.exam_key_usage_ledger'::regclass$$,
  array[true],
  'key usage has RLS'
);

select function_returns(
  'public',
  'get_question_content_review_queue',
  array['text', 'integer', 'uuid'],
  'jsonb',
  'review queue RPC returns JSON'
);
select isnt_definer(
  'public',
  'get_question_content_review_queue',
  array['text', 'integer', 'uuid'],
  'review queue RPC respects caller permissions'
);
select isnt_definer(
  'public',
  'apply_question_content_review',
  array['uuid', 'text'],
  'public review action is an invoker wrapper'
);

select results_eq(
  $$select count(*)::bigint from public.exam_keys where status in ('unused', 'active') and expires_at <= now()$$,
  array[0::bigint],
  'no expired key remains effectively usable'
);
select results_eq(
  $$select count(*)::bigint from public.room_papers room_paper join public.exam_room_papers paper on paper.id=room_paper.paper_id join public.exam_rooms room on room.id=room_paper.exam_room_id where paper.subject_code<>room.subject_code$$,
  array[0::bigint],
  'room and paper subjects agree'
);
select results_eq(
  $$select count(*)::bigint from public.subjects subject where subject.code='PHYSICS' and subject.is_active and not exists (select 1 from public.questions question where question.subject_code=subject.code and question.status='approved' and question.deleted_at is null)$$,
  array[0::bigint],
  'empty physics scaffold is not student-visible'
);
select results_eq(
  $$select has_table_privilege('anon', 'public.question_content_reviews', 'SELECT')$$,
  array[false],
  'anonymous callers cannot read review snapshots'
);
select results_eq(
  $$select has_function_privilege('anon', 'public.apply_question_content_review(uuid,text)', 'EXECUTE')$$,
  array[false],
  'anonymous callers cannot apply reviews'
);

select * from finish();
rollback;
