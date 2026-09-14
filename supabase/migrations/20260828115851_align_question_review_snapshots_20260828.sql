-- Keep the review workflow applicable after lossless line-ending normalization.
create temporary table qb_review_snapshot_changes (
  review_id uuid primary key,
  question_id uuid not null,
  old_original text not null,
  current_value text not null
) on commit drop;

insert into qb_review_snapshot_changes
select r.id, r.question_id, r.original_value, q.content
from public.question_content_reviews r
join public.questions q on q.id=r.question_id
where r.status='pending'
  and 'QB_AUDIT_20260828'=any(r.issue_codes)
  and r.entity_type='question' and r.field_name='content'
  and r.original_value is distinct from q.content;

insert into qb_review_snapshot_changes
select r.id, r.question_id, r.original_value, q.explanation
from public.question_content_reviews r
join public.questions q on q.id=r.question_id
where r.status='pending'
  and 'QB_AUDIT_20260828'=any(r.issue_codes)
  and r.entity_type='question' and r.field_name='explanation'
  and r.original_value is distinct from q.explanation;

insert into qb_review_snapshot_changes
select r.id, r.question_id, r.original_value, o.content
from public.question_content_reviews r
join public.question_options o on o.id=r.entity_id
where r.status='pending'
  and 'QB_AUDIT_20260828'=any(r.issue_codes)
  and r.entity_type='option' and r.field_name='content'
  and r.original_value is distinct from o.content;

insert into qb_review_snapshot_changes
select r.id, r.question_id, r.original_value, o.explanation
from public.question_content_reviews r
join public.question_options o on o.id=r.entity_id
where r.status='pending'
  and 'QB_AUDIT_20260828'=any(r.issue_codes)
  and r.entity_type='option' and r.field_name='explanation'
  and r.original_value is distinct from o.explanation;

insert into qb_review_snapshot_changes
select r.id, r.question_id, r.original_value, i.content
from public.question_content_reviews r
join public.question_true_false_items i on i.id=r.entity_id
where r.status='pending'
  and 'QB_AUDIT_20260828'=any(r.issue_codes)
  and r.entity_type='true_false_item' and r.field_name='content'
  and r.original_value is distinct from i.content;

insert into public.question_audit_log (question_id, old_data, new_data, action)
select question_id,
       jsonb_build_object('run_id','QB_FORMAT_20260828','entity_type','question_content_review','entity_id',review_id,'original_value',old_original),
       jsonb_build_object('run_id','QB_FORMAT_20260828','entity_type','question_content_review','entity_id',review_id,'original_value',current_value),
       'update'
from qb_review_snapshot_changes;

update public.question_content_reviews review
set original_value = changes.current_value
from qb_review_snapshot_changes changes
where review.id=changes.review_id;

notify pgrst, 'reload schema';