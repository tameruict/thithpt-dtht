begin;

create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;

select plan(11);

select has_function(
  'public',
  'join_exam',
  array['text', 'text', 'uuid'],
  'room entry exposes the canonical three-argument RPC'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_proc function_row
    join pg_namespace namespace_row on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'public'
      and function_row.proname = 'join_exam'
      and pg_get_function_identity_arguments(function_row.oid) = 'p_code text, p_subject_code text'
  $$,
  array[0::bigint],
  'the obsolete two-argument room entry RPC is absent'
);

select results_eq(
  $$select content_quality_status from public.questions where code = 'MATH-2026-011-III-2'$$,
  array['verified'::text],
  'the published blocking question is verified after correction'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.questions
    where code = 'MATH-2026-011-III-2'
      and position('bằng $-\frac{45}{8}$.' in content) > 0
  $$,
  array[1::bigint],
  'the missing minus sign is restored in the question stem'
);

select results_eq(
  $$
    select mod(
      length(coalesce(explanation, ''))
        - length(replace(coalesce(explanation, ''), '$', '')),
      2
    )::bigint
    from public.questions
    where code = 'MATH-2026-011-III-2'
  $$,
  array[0::bigint],
  'the corrected explanation has balanced dollar delimiters'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.exam_room_questions room_question
    join public.exam_room_papers paper on paper.id = room_question.paper_id
    join public.exam_rooms room on room.id = paper.exam_room_id
    join public.questions question on question.id = room_question.question_id
    where room.status = 'published'
      and paper.status = 'published'
      and question.content_quality_status = 'needs_review'
  $$,
  array[0::bigint],
  'published papers contain no blocked content'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.questions question
    where question.content_quality_status = 'needs_review'
      and question.deleted_at is null
      and not exists (
        select 1
        from public.question_content_reviews review
        where review.question_id = question.id
          and review.status = 'pending'
      )
  $$,
  array[0::bigint],
  'every remaining blocked question is present in the admin review queue'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.v_exam_room_readiness
    where mode = 'exam'
      and status = 'published'
      and not is_ready
  $$,
  array[0::bigint],
  'all published official rooms pass the strengthened readiness contract'
);

select results_eq(
  $$
    select count(*)::bigint
    from pg_trigger
    where tgrelid = 'public.exam_room_questions'::regclass
      and tgname = 'guard_room_question_content_quality'
      and not tgisinternal
  $$,
  array[1::bigint],
  'room composition is guarded against blocked content'
);

select results_eq(
  $$
    select position(
      'question.content_quality_status <> ''needs_review'''
      in pg_get_functiondef(
        'public.start_practice_session(text,integer,bigint[],smallint[])'::regprocedure
      )
    ) > 0
  $$,
  array[true],
  'practice selection excludes blocked content'
);

select results_eq(
  $$
    select 'security_invoker=true' = any(coalesce(reloptions, array[]::text[]))
    from pg_class
    where oid = 'public.v_exam_room_readiness'::regclass
  $$,
  array[true],
  'readiness view retains security-invoker behavior'
);

select * from finish();
rollback;
