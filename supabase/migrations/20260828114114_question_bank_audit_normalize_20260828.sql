-- Question-bank audit and reversible answer normalization, 2026-08-28.
-- Formula text is never guessed or silently rewritten: structural issues become
-- review proposals; only canonical answer metadata is normalized automatically.

create or replace function private.standardized_math_content(p_content text)
returns text
language sql
immutable
set search_path = ''
as $std$
  select trim(
    regexp_replace(
      regexp_replace(
        regexp_replace(coalesce(p_content, ''), E'\\r\\n?', E'\\n', 'g'),
        E'\\n{3,}', E'\\n\\n', 'g'
      ),
      E'[ \\t]+$', '', 'gm'
    )
  );
$std$;

revoke all on function private.standardized_math_content(text)
  from public, anon, authenticated;

create or replace function private.question_formula_issue_codes(p_content text)
returns text[]
language plpgsql
immutable
set search_path = ''
as $func$
declare
  i integer := 1;
  j integer;
  k integer;
  n integer := length(coalesce(p_content, ''));
  backslashes integer;
  close_at integer;
  delimiter text;
  current_char text;
  found_close boolean;
  newline_hit boolean;
  issues text[] := '{}';
  result text[];
begin
  while i <= n loop
    current_char := substr(p_content, i, 1);

    if current_char = '$' then
      backslashes := 0;
      k := i - 1;
      while k >= 1 and substr(p_content, k, 1) = E'\\' loop
        backslashes := backslashes + 1;
        k := k - 1;
      end loop;

      if mod(backslashes, 2) = 0 then
        delimiter := case when substr(p_content, i, 2) = '$$' then '$$' else '$' end;
        j := i + length(delimiter);
        found_close := false;
        newline_hit := false;
        close_at := 0;

        while j <= n loop
          if delimiter = '$' and substr(p_content, j, 1) = E'\n' then
            newline_hit := true;
            exit;
          end if;

          if substr(p_content, j, length(delimiter)) = delimiter then
            backslashes := 0;
            k := j - 1;
            while k >= 1 and substr(p_content, k, 1) = E'\\' loop
              backslashes := backslashes + 1;
              k := k - 1;
            end loop;
            if mod(backslashes, 2) = 0
               and (delimiter = '$$' or substr(p_content, j + 1, 1) <> '$') then
              found_close := true;
              close_at := j;
              exit;
            end if;
          end if;
          j := j + 1;
        end loop;

        if found_close then
          i := close_at + length(delimiter);
          continue;
        elsif newline_hit then
          issues := array_append(issues, 'NEWLINE_IN_INLINE_MATH');
        else
          issues := array_append(issues, 'UNCLOSED_MATH_DELIMITER');
        end if;
      end if;
    elsif current_char = E'\\'
          and substr(p_content, i + 1, 1) ~ '^[A-Za-z]$' then
      issues := array_append(issues, 'TEX_OUTSIDE_MATH');
    end if;

    i := i + 1;
  end loop;

  select coalesce(array_agg(value order by value), '{}'::text[])
    into result
  from (select distinct value from unnest(issues) as value) distinct_values;
  return result;
end;
$func$;

revoke all on function private.question_formula_issue_codes(text)
  from public, anon, authenticated;

do $$
begin
  if exists (
    select 1
    from public.questions
    where deleted_at is null and content_hash is not null
    group by subject_code, content_hash
    having count(*) > 1
  ) then
    raise exception 'QUESTION_BANK_ACTIVE_DUPLICATES_REMAIN';
  end if;
end;
$$;

create unique index if not exists questions_subject_content_hash_active_uidx
  on public.questions (subject_code, content_hash)
  where deleted_at is null and content_hash is not null;

create temporary table qb_formula_fields (
  question_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  original_value text not null,
  normalized_value text not null,
  issue_codes text[] not null
) on commit drop;

insert into qb_formula_fields
select q.id, 'question', q.id, 'content', q.content,
       private.standardized_math_content(q.content),
       private.question_formula_issue_codes(q.content)
from public.questions q
where q.deleted_at is null
union all
select q.id, 'question', q.id, 'explanation', q.explanation,
       private.standardized_math_content(q.explanation),
       private.question_formula_issue_codes(q.explanation)
from public.questions q
where q.deleted_at is null and q.explanation is not null
union all
select q.id, 'option', o.id, 'content', o.content,
       private.standardized_math_content(o.content),
       private.question_formula_issue_codes(o.content)
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null
union all
select q.id, 'option', o.id, 'explanation', o.explanation,
       private.standardized_math_content(o.explanation),
       private.question_formula_issue_codes(o.explanation)
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null and o.explanation is not null
union all
select q.id, 'true_false_item', i.id, 'content', i.content,
       private.standardized_math_content(i.content),
       private.question_formula_issue_codes(i.content)
from public.questions q
join public.question_true_false_items i on i.question_id = q.id
where q.deleted_at is null;

update public.question_content_reviews review
set proposed_value = fields.normalized_value,
    issue_codes = case
      when 'QB_AUDIT_20260828' = any(review.issue_codes)
        then review.issue_codes
      else array_append(review.issue_codes, 'QB_AUDIT_20260828')
    end
from qb_formula_fields fields
where review.status = 'pending'
  and review.entity_type = fields.entity_type
  and review.entity_id = fields.entity_id
  and review.field_name = fields.field_name
  and review.original_value is not distinct from fields.original_value;

insert into public.question_content_reviews (
  question_id, entity_type, entity_id, field_name,
  original_value, proposed_value, issue_codes, severity, status
)
select fields.question_id,
       fields.entity_type,
       fields.entity_id,
       fields.field_name,
       fields.original_value,
       fields.normalized_value,
       array_append(fields.issue_codes, 'QB_AUDIT_20260828'),
       'error',
       'pending'
from qb_formula_fields fields
where cardinality(fields.issue_codes) > 0
on conflict (entity_type, entity_id, field_name, original_value)
do update set
  proposed_value = excluded.proposed_value,
  issue_codes = excluded.issue_codes,
  severity = 'error'
where public.question_content_reviews.status = 'pending';

with targets as (
  select q.id as question_id, q.code, a.id as answer_id,
         a.normalized_text, a.display_value,
         case q.code
           when 'MATH-2026-013-III-3' then '344/35'
           when 'MATH-2026-055-III-6' then '416'
           when 'MATH-2026-063-III-1' then '0,42'
           when 'MATH-2026-094-III-6' then '50,9'
         end as canonical_value
  from public.questions q
  join public.question_short_answer_keys a on a.question_id = q.id
  where q.deleted_at is null
    and q.code in (
      'MATH-2026-013-III-3',
      'MATH-2026-055-III-6',
      'MATH-2026-063-III-1',
      'MATH-2026-094-III-6'
    )
), changed as (
  select * from targets
  where normalized_text is distinct from canonical_value
     or display_value is distinct from canonical_value
)
insert into public.question_audit_log (
  question_id, old_data, new_data, action
)
select question_id,
       jsonb_build_object(
         'run_id', 'QB_AUDIT_20260828',
         'entity_type', 'short_answer_key',
         'entity_id', answer_id,
         'normalized_text', normalized_text,
         'display_value', display_value
       ),
       jsonb_build_object(
         'run_id', 'QB_AUDIT_20260828',
         'entity_type', 'short_answer_key',
         'entity_id', answer_id,
         'normalized_text', canonical_value,
         'display_value', canonical_value
       ),
       'update'
from changed;

with targets as (
  select q.code, a.id as answer_id,
         a.normalized_text, a.display_value,
         case q.code
           when 'MATH-2026-013-III-3' then '344/35'
           when 'MATH-2026-055-III-6' then '416'
           when 'MATH-2026-063-III-1' then '0,42'
           when 'MATH-2026-094-III-6' then '50,9'
         end as canonical_value
  from public.questions q
  join public.question_short_answer_keys a on a.question_id = q.id
  where q.deleted_at is null
    and q.code in (
      'MATH-2026-013-III-3',
      'MATH-2026-055-III-6',
      'MATH-2026-063-III-1',
      'MATH-2026-094-III-6'
    )
)
insert into public.question_content_reviews (
  question_id, entity_type, entity_id, field_name,
  original_value, proposed_value, issue_codes, severity, status,
  reviewed_at
)
select q.id, 'short_answer_key', targets.answer_id, 'normalized_text',
       targets.normalized_text, targets.canonical_value,
       array['ANSWER_NORMALIZED', 'QB_AUDIT_20260828'], 'warning', 'applied', now()
from targets
join public.questions q on q.code = targets.code
where targets.normalized_text is distinct from targets.canonical_value
on conflict (entity_type, entity_id, field_name, original_value) do nothing;

with targets as (
  select q.code, a.id as answer_id,
         a.normalized_text, a.display_value,
         case q.code
           when 'MATH-2026-013-III-3' then '344/35'
           when 'MATH-2026-055-III-6' then '416'
           when 'MATH-2026-063-III-1' then '0,42'
           when 'MATH-2026-094-III-6' then '50,9'
         end as canonical_value
  from public.questions q
  join public.question_short_answer_keys a on a.question_id = q.id
  where q.deleted_at is null
    and q.code in (
      'MATH-2026-013-III-3',
      'MATH-2026-055-III-6',
      'MATH-2026-063-III-1',
      'MATH-2026-094-III-6'
    )
)
insert into public.question_content_reviews (
  question_id, entity_type, entity_id, field_name,
  original_value, proposed_value, issue_codes, severity, status,
  reviewed_at
)
select q.id, 'short_answer_key', targets.answer_id, 'display_value',
       targets.display_value, targets.canonical_value,
       array['ANSWER_NORMALIZED', 'QB_AUDIT_20260828'], 'warning', 'applied', now()
from targets
join public.questions q on q.code = targets.code
where targets.display_value is distinct from targets.canonical_value
on conflict (entity_type, entity_id, field_name, original_value) do nothing;

update public.question_short_answer_keys answer_key
set normalized_text = case question.code
    when 'MATH-2026-013-III-3' then '344/35'
    when 'MATH-2026-055-III-6' then '416'
    when 'MATH-2026-063-III-1' then '0,42'
    when 'MATH-2026-094-III-6' then '50,9'
    else answer_key.normalized_text
  end,
  display_value = case question.code
    when 'MATH-2026-013-III-3' then '344/35'
    when 'MATH-2026-055-III-6' then '416'
    when 'MATH-2026-063-III-1' then '0,42'
    when 'MATH-2026-094-III-6' then '50,9'
    else answer_key.display_value
  end
from public.questions question
where answer_key.question_id = question.id
  and question.deleted_at is null
  and question.code in (
    'MATH-2026-013-III-3',
    'MATH-2026-055-III-6',
    'MATH-2026-063-III-1',
    'MATH-2026-094-III-6'
  );

update public.question_options option
set label = upper(btrim(option.label))
from public.questions question
where option.question_id = question.id
  and question.deleted_at is null
  and question.type::text = 'multiple_choice'
  and option.label is distinct from upper(btrim(option.label));

update public.question_true_false_items item
set label = lower(btrim(item.label))
from public.questions question
where item.question_id = question.id
  and question.deleted_at is null
  and question.type::text = 'true_false'
  and item.label is not null
  and item.label is distinct from lower(btrim(item.label));

notify pgrst, 'reload schema';
