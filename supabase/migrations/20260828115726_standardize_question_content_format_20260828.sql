-- Apply only lossless storage-format normalization to the question bank.
-- Formula semantics remain in the review queue created by the audit migration.
create temporary table qb_format_changes (
  question_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  field_name text not null,
  original_value text not null,
  normalized_value text not null
) on commit drop;

insert into qb_format_changes
select q.id, 'question', q.id, 'content', q.content,
       private.standardized_math_content(q.content)
from public.questions q
where q.deleted_at is null
  and q.content is distinct from private.standardized_math_content(q.content)
union all
select q.id, 'question', q.id, 'explanation', q.explanation,
       private.standardized_math_content(q.explanation)
from public.questions q
where q.deleted_at is null
  and q.explanation is not null
  and q.explanation is distinct from private.standardized_math_content(q.explanation)
union all
select q.id, 'option', o.id, 'content', o.content,
       private.standardized_math_content(o.content)
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null
  and o.content is distinct from private.standardized_math_content(o.content)
union all
select q.id, 'option', o.id, 'explanation', o.explanation,
       private.standardized_math_content(o.explanation)
from public.questions q
join public.question_options o on o.question_id = q.id
where q.deleted_at is null
  and o.explanation is not null
  and o.explanation is distinct from private.standardized_math_content(o.explanation)
union all
select q.id, 'true_false_item', i.id, 'content', i.content,
       private.standardized_math_content(i.content)
from public.questions q
join public.question_true_false_items i on i.question_id = q.id
where q.deleted_at is null
  and i.content is distinct from private.standardized_math_content(i.content);

insert into public.question_audit_log (question_id, old_data, new_data, action)
select question_id,
       jsonb_build_object(
         'run_id', 'QB_FORMAT_20260828',
         'entity_type', entity_type,
         'entity_id', entity_id,
         'field_name', field_name,
         'value', original_value
       ),
       jsonb_build_object(
         'run_id', 'QB_FORMAT_20260828',
         'entity_type', entity_type,
         'entity_id', entity_id,
         'field_name', field_name,
         'value', normalized_value
       ),
       'update'
from qb_format_changes;

with changes as (
  select question_id,
    max(normalized_value) filter (where entity_type='question' and field_name='content') as content_value,
    max(normalized_value) filter (where entity_type='question' and field_name='explanation') as explanation_value
  from qb_format_changes
  where entity_type='question'
  group by question_id
)
update public.questions q
set content = coalesce(changes.content_value, q.content),
    explanation = case when changes.explanation_value is not null then changes.explanation_value else q.explanation end,
    updated_at = now()
from changes
where q.id = changes.question_id;

update public.question_options o
set content = changes.normalized_value
from qb_format_changes changes
where changes.entity_type='option'
  and changes.field_name='content'
  and o.id=changes.entity_id;

update public.question_options o
set explanation = changes.normalized_value
from qb_format_changes changes
where changes.entity_type='option'
  and changes.field_name='explanation'
  and o.id=changes.entity_id;

update public.question_true_false_items i
set content = changes.normalized_value
from qb_format_changes changes
where changes.entity_type='true_false_item'
  and changes.field_name='content'
  and i.id=changes.entity_id;

with metadata_changes as (
  select q.id, q.content_format_version, q.content_quality_status
  from public.questions q
  where q.deleted_at is null
    and (q.content_format_version <> 2 or q.content_quality_status = 'legacy')
)
insert into public.question_audit_log (question_id, old_data, new_data, action)
select id,
       jsonb_build_object(
         'run_id', 'QB_FORMAT_20260828',
         'entity_type', 'question_metadata',
         'content_format_version', content_format_version,
         'content_quality_status', content_quality_status
       ),
       jsonb_build_object(
         'run_id', 'QB_FORMAT_20260828',
         'entity_type', 'question_metadata',
         'content_format_version', 2,
         'content_quality_status', case when exists (
           select 1 from public.question_content_reviews review
           where review.question_id = metadata_changes.id and review.status='pending'
         ) then 'needs_review' else 'verified' end
       ),
       'update'
from metadata_changes;

update public.questions q
set content_format_version = 2,
    content_quality_status = case when exists (
      select 1 from public.question_content_reviews review
      where review.question_id = q.id and review.status='pending'
    ) then 'needs_review' else 'verified' end,
    updated_at = now()
where q.deleted_at is null
  and (q.content_format_version <> 2 or q.content_quality_status = 'legacy');

notify pgrst, 'reload schema';