-- Finalize the explicit soft-delete decision for duplicate question content.
-- The full duplicate payload and child answers were exported before this
-- migration. History references are remapped before any row is archived.

create temporary table question_dedupe_map on commit drop as
with ranked as (
  select
    question.id,
    question.subject_code,
    question.content_hash,
    first_value(question.id) over (
      partition by question.subject_code, question.content_hash
      order by (question.status = 'approved') desc,
        question.created_at,
        question.id
    ) as canonical_id
  from public.questions question
  where question.deleted_at is null
    and question.content_hash is not null
)
select id as duplicate_id, canonical_id
from ranked
where id <> canonical_id;

do $$
begin
  if exists (
    select 1
    from public.exam_room_questions duplicate_ref
    join question_dedupe_map map
      on map.duplicate_id = duplicate_ref.question_id
    join public.exam_room_questions canonical_ref
      on canonical_ref.paper_id = duplicate_ref.paper_id
     and canonical_ref.question_id = map.canonical_id
  ) then
    raise exception 'QUESTION_DEDUPE_ROOM_COLLISION';
  end if;

  if exists (
    select 1
    from public.exam_session_questions duplicate_ref
    join question_dedupe_map map
      on map.duplicate_id = duplicate_ref.question_id
    join public.exam_session_questions canonical_ref
      on canonical_ref.session_id = duplicate_ref.session_id
     and canonical_ref.question_id = map.canonical_id
  ) then
    raise exception 'QUESTION_DEDUPE_SESSION_COLLISION';
  end if;

  if exists (
    select 1
    from public.session_answers answer
    join public.question_options duplicate_option
      on duplicate_option.id = answer.selected_option_id
    join question_dedupe_map map
      on map.duplicate_id = duplicate_option.question_id
    left join public.question_options canonical_option
      on canonical_option.question_id = map.canonical_id
     and canonical_option.seq = duplicate_option.seq
    where canonical_option.id is null
  ) then
    raise exception 'QUESTION_DEDUPE_OPTION_MAPPING_MISSING';
  end if;
end;
$$;

update public.session_answers answer
set selected_option_id = canonical_option.id,
    updated_at = now()
from public.question_options duplicate_option
join question_dedupe_map map
  on map.duplicate_id = duplicate_option.question_id
join public.question_options canonical_option
  on canonical_option.question_id = map.canonical_id
 and canonical_option.seq = duplicate_option.seq
where answer.selected_option_id = duplicate_option.id;

update public.exam_room_questions reference
set question_id = map.canonical_id
from question_dedupe_map map
where reference.question_id = map.duplicate_id;

update public.exam_session_questions reference
set question_id = map.canonical_id
from question_dedupe_map map
where reference.question_id = map.duplicate_id;

update public.question_import_rows reference
set question_id = map.canonical_id
from question_dedupe_map map
where reference.question_id = map.duplicate_id;

-- Audit rows remain attached to the original archived record so the historical
-- mutation trail is not rewritten.
update public.questions duplicate
set status = 'archived',
    deleted_at = now(),
    updated_at = now(),
    metadata = coalesce(duplicate.metadata, '{}'::jsonb) ||
      jsonb_build_object(
        'duplicate_of', map.canonical_id,
        'deduplicated_at', now()
      )
from question_dedupe_map map
where duplicate.id = map.duplicate_id;

update public.question_duplicate_reviews review
set status = 'merged',
    reviewed_at = now()
from question_dedupe_map map
where review.canonical_question_id = map.canonical_id
  and review.duplicate_question_id = map.duplicate_id;

drop index if exists public.questions_subject_content_hash_active_idx;
create unique index questions_subject_content_hash_active_uidx
  on public.questions (subject_code, content_hash)
  where deleted_at is null and content_hash is not null;

notify pgrst, 'reload schema';
