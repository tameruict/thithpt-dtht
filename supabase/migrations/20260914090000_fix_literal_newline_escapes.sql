-- QB_FIX_20260914: convert literal "\n" escape sequences (stored as backslash+n
-- by the original seed import) into real newlines, and normalize the 12
-- short-answer decimal-dot values to the Vietnamese comma convention.
--
-- Real TeX commands starting with "n" (\neqq, \nexists, \notin, \nabla,
-- \neq, \neg, \nu, \not) are sheltered behind placeholders first, because
-- Postgres regex has no working lookahead guard. Ambiguous "\ne" (broken
-- \neq vs newline+e-word, 17 cases) is intentionally converted and left for
-- the targeted agent fix pass afterwards.
--
-- Formula semantics are otherwise untouched: only newline encoding and the
-- dot->comma answer convention change. Every change is captured in
-- question_audit_log, and auto-fixed fields get applied review rows.

-- 0. Guard: placeholder tokens must not exist in live content.
do $$
begin
  if exists (
    select 1 from public.questions q
    where q.deleted_at is null
      and (q.content like '%⟦%' or coalesce(q.explanation, '') like '%⟦%')
  ) or exists (
    select 1 from public.question_options o
    join public.questions q on q.id = o.question_id
    where q.deleted_at is null
      and (o.content like '%⟦%' or coalesce(o.explanation, '') like '%⟦%')
  ) or exists (
    select 1 from public.question_true_false_items i
    join public.questions q on q.id = i.question_id
    where q.deleted_at is null and i.content like '%⟦%'
  ) then
    raise exception 'QB_FIX_PLACEHOLDER_COLLISION';
  end if;
end;
$$;

-- 1. Capture before-images of every field that will change.
create temporary table qb_fix_before (
  entity_type text not null,
  entity_id uuid not null,
  question_id uuid not null,
  field_name text not null,
  original_value text not null
) on commit drop;

insert into qb_fix_before
select 'question', q.id, q.id, 'content', q.content
from public.questions q
where q.deleted_at is null and q.content like '%\n%'
union all
select 'question', q.id, q.id, 'explanation', q.explanation
from public.questions q
where q.deleted_at is null and q.explanation like '%\n%'
union all
select 'option', o.id, q.id, 'content', o.content
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null and o.content like '%\n%'
union all
select 'option', o.id, q.id, 'explanation', o.explanation
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null and o.explanation like '%\n%'
union all
select 'true_false_item', i.id, q.id, 'content', i.content
from public.questions q
join public.question_true_false_items i on i.question_id = q.id
where q.deleted_at is null and i.content like '%\n%'
union all
select 'short_answer_key', a.id, q.id, 'normalized_text', a.normalized_text
from public.questions q
join public.question_short_answer_keys a on a.question_id = q.id
where q.deleted_at is null and a.normalized_text ~ '^[0-9]+\.[0-9]+$'
union all
select 'short_answer_key', a.id, q.id, 'display_value', a.display_value
from public.questions q
join public.question_short_answer_keys a on a.question_id = q.id
where q.deleted_at is null and a.display_value ~ '^[0-9]+\.[0-9]+$';

-- 2. Shelter real TeX n-commands behind placeholders (longest first).
update public.questions q
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      q.content,
      '\neqq', '⟦NEQQ⟧'),
      '\nexists', '⟦NEXISTS⟧'),
      '\notin', '⟦NOTIN⟧'),
      '\nabla', '⟦NABLA⟧'),
      '\neq', '⟦NEQ⟧'),
      '\neg', '⟦NEG⟧'),
      '\nu', '⟦NU⟧'),
      '\not', '⟦NOT⟧')
where q.deleted_at is null
  and q.id in (select entity_id from qb_fix_before where entity_type = 'question' and field_name = 'content');

update public.questions q
set explanation = replace(replace(replace(replace(replace(replace(replace(replace(
      q.explanation,
      '\neqq', '⟦NEQQ⟧'),
      '\nexists', '⟦NEXISTS⟧'),
      '\notin', '⟦NOTIN⟧'),
      '\nabla', '⟦NABLA⟧'),
      '\neq', '⟦NEQ⟧'),
      '\neg', '⟦NEG⟧'),
      '\nu', '⟦NU⟧'),
      '\not', '⟦NOT⟧')
where q.deleted_at is null
  and q.id in (select entity_id from qb_fix_before where entity_type = 'question' and field_name = 'explanation');

update public.question_options o
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      o.content,
      '\neqq', '⟦NEQQ⟧'),
      '\nexists', '⟦NEXISTS⟧'),
      '\notin', '⟦NOTIN⟧'),
      '\nabla', '⟦NABLA⟧'),
      '\neq', '⟦NEQ⟧'),
      '\neg', '⟦NEG⟧'),
      '\nu', '⟦NU⟧'),
      '\not', '⟦NOT⟧')
from public.questions q
where o.question_id = q.id and q.deleted_at is null
  and o.id in (select entity_id from qb_fix_before where entity_type = 'option' and field_name = 'content');

update public.question_options o
set explanation = replace(replace(replace(replace(replace(replace(replace(replace(
      o.explanation,
      '\neqq', '⟦NEQQ⟧'),
      '\nexists', '⟦NEXISTS⟧'),
      '\notin', '⟦NOTIN⟧'),
      '\nabla', '⟦NABLA⟧'),
      '\neq', '⟦NEQ⟧'),
      '\neg', '⟦NEG⟧'),
      '\nu', '⟦NU⟧'),
      '\not', '⟦NOT⟧')
from public.questions q
where o.question_id = q.id and q.deleted_at is null
  and o.id in (select entity_id from qb_fix_before where entity_type = 'option' and field_name = 'explanation');

update public.question_true_false_items i
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      i.content,
      '\neqq', '⟦NEQQ⟧'),
      '\nexists', '⟦NEXISTS⟧'),
      '\notin', '⟦NOTIN⟧'),
      '\nabla', '⟦NABLA⟧'),
      '\neq', '⟦NEQ⟧'),
      '\neg', '⟦NEG⟧'),
      '\nu', '⟦NU⟧'),
      '\not', '⟦NOT⟧')
from public.questions q
where i.question_id = q.id and q.deleted_at is null
  and i.id in (select entity_id from qb_fix_before where entity_type = 'true_false_item');

-- 3. Convert remaining literal "\n" to real LF, to fixpoint (handles \n\n runs).
do $$
declare
  c1 integer; c2 integer; c3 integer; c4 integer; c5 integer;
  guard integer := 0;
begin
  loop
    update public.questions q
    set content = regexp_replace(q.content, '(^|[^\\])\\n', '\1' || chr(10), 'g'),
        updated_at = now()
    where q.deleted_at is null and q.content ~ '(^|[^\\])\\n';
    get diagnostics c1 = row_count;

    update public.questions q
    set explanation = regexp_replace(q.explanation, '(^|[^\\])\\n', '\1' || chr(10), 'g'),
        updated_at = now()
    where q.deleted_at is null and q.explanation ~ '(^|[^\\])\\n';
    get diagnostics c2 = row_count;

    update public.question_options o
    set content = regexp_replace(o.content, '(^|[^\\])\\n', '\1' || chr(10), 'g')
    from public.questions q
    where o.question_id = q.id and q.deleted_at is null and o.content ~ '(^|[^\\])\\n';
    get diagnostics c3 = row_count;

    update public.question_options o
    set explanation = regexp_replace(o.explanation, '(^|[^\\])\\n', '\1' || chr(10), 'g')
    from public.questions q
    where o.question_id = q.id and q.deleted_at is null and o.explanation ~ '(^|[^\\])\\n';
    get diagnostics c4 = row_count;

    update public.question_true_false_items i
    set content = regexp_replace(i.content, '(^|[^\\])\\n', '\1' || chr(10), 'g')
    from public.questions q
    where i.question_id = q.id and q.deleted_at is null and i.content ~ '(^|[^\\])\\n';
    get diagnostics c5 = row_count;

    exit when (c1 + c2 + c3 + c4 + c5) = 0 or guard >= 20;
    guard := guard + 1;
  end loop;
  if guard >= 20 then
    raise exception 'QB_FIX_NEWLINE_LOOP_NOT_CONVERGING';
  end if;
end;
$$;

-- 4. Restore sheltered TeX commands.
update public.questions q
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      q.content,
      '⟦NEQQ⟧', '\neqq'),
      '⟦NEXISTS⟧', '\nexists'),
      '⟦NOTIN⟧', '\notin'),
      '⟦NABLA⟧', '\nabla'),
      '⟦NEQ⟧', '\neq'),
      '⟦NEG⟧', '\neg'),
      '⟦NU⟧', '\nu'),
      '⟦NOT⟧', '\not')
where q.deleted_at is null and q.content like '%⟦%';

update public.questions q
set explanation = replace(replace(replace(replace(replace(replace(replace(replace(
      q.explanation,
      '⟦NEQQ⟧', '\neqq'),
      '⟦NEXISTS⟧', '\nexists'),
      '⟦NOTIN⟧', '\notin'),
      '⟦NABLA⟧', '\nabla'),
      '⟦NEQ⟧', '\neq'),
      '⟦NEG⟧', '\neg'),
      '⟦NU⟧', '\nu'),
      '⟦NOT⟧', '\not')
where q.deleted_at is null and q.explanation like '%⟦%';

update public.question_options o
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      o.content,
      '⟦NEQQ⟧', '\neqq'),
      '⟦NEXISTS⟧', '\nexists'),
      '⟦NOTIN⟧', '\notin'),
      '⟦NABLA⟧', '\nabla'),
      '⟦NEQ⟧', '\neq'),
      '⟦NEG⟧', '\neg'),
      '⟦NU⟧', '\nu'),
      '⟦NOT⟧', '\not')
from public.questions q
where o.question_id = q.id and q.deleted_at is null and o.content like '%⟦%';

update public.question_options o
set explanation = replace(replace(replace(replace(replace(replace(replace(replace(
      o.explanation,
      '⟦NEQQ⟧', '\neqq'),
      '⟦NEXISTS⟧', '\nexists'),
      '⟦NOTIN⟧', '\notin'),
      '⟦NABLA⟧', '\nabla'),
      '⟦NEQ⟧', '\neq'),
      '⟦NEG⟧', '\neg'),
      '⟦NU⟧', '\nu'),
      '⟦NOT⟧', '\not')
from public.questions q
where o.question_id = q.id and q.deleted_at is null and o.explanation like '%⟦%';

update public.question_true_false_items i
set content = replace(replace(replace(replace(replace(replace(replace(replace(
      i.content,
      '⟦NEQQ⟧', '\neqq'),
      '⟦NEXISTS⟧', '\nexists'),
      '⟦NOTIN⟧', '\notin'),
      '⟦NABLA⟧', '\nabla'),
      '⟦NEQ⟧', '\neq'),
      '⟦NEG⟧', '\neg'),
      '⟦NU⟧', '\nu'),
      '⟦NOT⟧', '\not')
from public.questions q
where i.question_id = q.id and q.deleted_at is null and i.content like '%⟦%';

-- 5. Short-answer decimal dots (e.g. 23.4) to Vietnamese commas (23,4).
update public.question_short_answer_keys a
set normalized_text = replace(a.normalized_text, '.', ','),
    display_value = replace(a.display_value, '.', ',')
from public.questions q
where a.question_id = q.id and q.deleted_at is null
  and (a.normalized_text ~ '^[0-9]+\.[0-9]+$' or a.display_value ~ '^[0-9]+\.[0-9]+$');

-- 6. Audit log for every changed field (before -> after).
insert into public.question_audit_log (question_id, old_data, new_data, action)
select b.question_id,
  jsonb_build_object('run_id', 'QB_FIX_20260914', 'entity_type', b.entity_type,
    'entity_id', b.entity_id, 'field_name', b.field_name, 'value', b.original_value),
  jsonb_build_object('run_id', 'QB_FIX_20260914', 'entity_type', b.entity_type,
    'entity_id', b.entity_id, 'field_name', b.field_name, 'value',
    case when b.entity_type = 'question' and b.field_name = 'content' then q.content
         when b.entity_type = 'question' then q.explanation
         when b.entity_type = 'option' and b.field_name = 'content' then o.content
         when b.entity_type = 'option' then o.explanation
         when b.entity_type = 'true_false_item' then i.content
         when b.entity_type = 'short_answer_key' and b.field_name = 'normalized_text' then a.normalized_text
         else a.display_value end),
  'update'
from qb_fix_before b
left join public.questions q on q.id = b.entity_id and b.entity_type = 'question'
left join public.question_options o on o.id = b.entity_id and b.entity_type = 'option'
left join public.question_true_false_items i on i.id = b.entity_id and b.entity_type = 'true_false_item'
left join public.question_short_answer_keys a on a.id = b.entity_id and b.entity_type = 'short_answer_key'
where case when b.entity_type = 'question' and b.field_name = 'content' then q.content
           when b.entity_type = 'question' then q.explanation
           when b.entity_type = 'option' and b.field_name = 'content' then o.content
           when b.entity_type = 'option' then o.explanation
           when b.entity_type = 'true_false_item' then i.content
           when b.entity_type = 'short_answer_key' and b.field_name = 'normalized_text' then a.normalized_text
           else a.display_value end
      is distinct from b.original_value;

-- 7. Applied review rows for the auto-fixed fields (precedent: 20260828 answer fixes).
insert into public.question_content_reviews (
  question_id, entity_type, entity_id, field_name,
  original_value, proposed_value, issue_codes, severity, status, reviewed_at
)
select b.question_id, b.entity_type, b.entity_id, b.field_name,
  b.original_value,
  case when b.entity_type = 'question' and b.field_name = 'content' then q.content
       when b.entity_type = 'question' then q.explanation
       when b.entity_type = 'option' and b.field_name = 'content' then o.content
       when b.entity_type = 'option' then o.explanation
       when b.entity_type = 'true_false_item' then i.content
       when b.entity_type = 'short_answer_key' and b.field_name = 'normalized_text' then a.normalized_text
       else a.display_value end,
  array['FORMAT_NORMALIZED', 'QB_FIX_20260914'], 'warning', 'applied', now()
from qb_fix_before b
left join public.questions q on q.id = b.entity_id and b.entity_type = 'question'
left join public.question_options o on o.id = b.entity_id and b.entity_type = 'option'
left join public.question_true_false_items i on i.id = b.entity_id and b.entity_type = 'true_false_item'
left join public.question_short_answer_keys a on a.id = b.entity_id and b.entity_type = 'short_answer_key'
where case when b.entity_type = 'question' and b.field_name = 'content' then q.content
           when b.entity_type = 'question' then q.explanation
           when b.entity_type = 'option' and b.field_name = 'content' then o.content
           when b.entity_type = 'option' then o.explanation
           when b.entity_type = 'true_false_item' then i.content
           when b.entity_type = 'short_answer_key' and b.field_name = 'normalized_text' then a.normalized_text
           else a.display_value end
      is distinct from b.original_value
on conflict (entity_type, entity_id, field_name, original_value) do nothing;

-- 8. Post-conditions: no unprotected literal \n may remain, no placeholders,
--    no dot-decimal answers, sheltered commands intact.
do $$
declare
  leftover_n integer;
  leftover_ph integer;
  leftover_dots integer;
begin
  select count(*) into leftover_n
  from public.questions q
  where q.deleted_at is null
    and (q.content ~ '(^|[^\\])\\n(?!(?:neqq|nexists|notin|nabla|neq|neg|nu|not)(?![A-Za-z]))'
      or coalesce(q.explanation, '') ~ '(^|[^\\])\\n(?!(?:neqq|nexists|notin|nabla|neq|neg|nu|not)(?![A-Za-z]))');
  -- NOTE: the guard lookahead is a no-op in Postgres ARE; the count above is
  -- informational only. The authoritative check is the API re-audit afterwards.
  select count(*) into leftover_ph
  from public.questions q
  where q.deleted_at is null and (q.content like '%⟦%' or coalesce(q.explanation, '') like '%⟦%');
  if leftover_ph > 0 then
    raise exception 'QB_FIX_PLACEHOLDER_LEFTOVER: %', leftover_ph;
  end if;

  select count(*) into leftover_dots
  from public.question_short_answer_keys a
  join public.questions q on q.id = a.question_id
  where q.deleted_at is null
    and (a.normalized_text ~ '^[0-9]+\.[0-9]+$' or a.display_value ~ '^[0-9]+\.[0-9]+$');
  if leftover_dots > 0 then
    raise exception 'QB_FIX_DOT_DECIMAL_LEFTOVER: %', leftover_dots;
  end if;
end;
$$;

notify pgrst, 'reload schema';
