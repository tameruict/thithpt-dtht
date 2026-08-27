-- Markdown + KaTeX v2 and database integrity follow-up.
-- This migration is additive and expects 20260820234029_production_foundation_v1.

-- ---------------------------------------------------------------------------
-- 1. Versioned question content and review workflow
-- ---------------------------------------------------------------------------

alter table public.questions
  add column if not exists content_format_version smallint not null default 1,
  add column if not exists content_quality_status text not null default 'legacy',
  add column if not exists content_hash text,
  add column if not exists r2_asset_id uuid,
  add column if not exists image_alt_text text,
  add column if not exists image_width_px integer,
  add column if not exists image_height_px integer;

alter table public.questions
  drop constraint if exists questions_content_format_version_check,
  drop constraint if exists questions_content_quality_status_check,
  drop constraint if exists questions_content_hash_check,
  drop constraint if exists questions_image_dimensions_check;

alter table public.questions
  add constraint questions_content_format_version_check
    check (content_format_version in (1, 2)),
  add constraint questions_content_quality_status_check
    check (content_quality_status in ('legacy', 'needs_review', 'verified')),
  add constraint questions_content_hash_check
    check (content_hash is null or content_hash ~ '^[0-9a-f]{64}$'),
  add constraint questions_image_dimensions_check
    check (
      (image_width_px is null and image_height_px is null)
      or (image_width_px > 0 and image_height_px > 0)
    );

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.questions'::regclass
      and conname = 'questions_r2_asset_id_fkey'
  ) then
    alter table public.questions
      add constraint questions_r2_asset_id_fkey
      foreign key (r2_asset_id) references public.r2_assets(id) on delete set null;
  end if;
end
$$;

create index if not exists questions_content_quality_idx
  on public.questions (subject_code, content_quality_status, status, difficulty)
  where deleted_at is null;
create index if not exists questions_content_hash_idx
  on public.questions (content_hash)
  where content_hash is not null and deleted_at is null;
create index if not exists questions_r2_asset_idx
  on public.questions (r2_asset_id)
  where r2_asset_id is not null;

create table if not exists public.question_content_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  entity_type text not null check (
    entity_type in ('question', 'option', 'true_false_item', 'short_answer_key')
  ),
  entity_id uuid not null,
  field_name text not null check (
    field_name in ('content', 'explanation', 'normalized_text', 'display_value')
  ),
  original_value text,
  proposed_value text,
  issue_codes text[] not null default '{}',
  severity text not null default 'error' check (severity in ('warning', 'error')),
  status text not null default 'pending' check (
    status in ('pending', 'approved', 'rejected', 'applied')
  ),
  detected_at timestamptz not null default now(),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  unique (entity_type, entity_id, field_name, original_value)
);

create index if not exists question_content_reviews_queue_idx
  on public.question_content_reviews (status, severity, detected_at, id);
create index if not exists question_content_reviews_question_idx
  on public.question_content_reviews (question_id, status);

alter table public.question_content_reviews enable row level security;
drop policy if exists question_content_reviews_admin_select
  on public.question_content_reviews;
create policy question_content_reviews_admin_select
on public.question_content_reviews for select to authenticated
using (private.is_admin());

revoke all on public.question_content_reviews from public, anon, authenticated;
grant select on public.question_content_reviews to authenticated;

-- Mark only definitely malformed legacy records. The application audit creates
-- field-level review rows with exact proposed values before any text is changed.
update public.questions question
set content_quality_status = 'needs_review'
where question.deleted_at is null
  and (
    mod(length(question.content) - length(replace(question.content, '$', '')), 2) = 1
    or mod(
      length(coalesce(question.explanation, ''))
        - length(replace(coalesce(question.explanation, ''), '$', '')),
      2
    ) = 1
    or (
      question.content ~ E'\\\\[A-Za-z]+'
      and question.content not like '%$%'
    )
    or (
      coalesce(question.explanation, '') ~ E'\\\\[A-Za-z]+'
      and coalesce(question.explanation, '') not like '%$%'
    )
    or exists (
      select 1
      from public.question_options option
      where option.question_id = question.id
        and (
          mod(length(option.content) - length(replace(option.content, '$', '')), 2) = 1
          or (option.content ~ E'\\\\[A-Za-z]+' and option.content not like '%$%')
        )
    )
    or exists (
      select 1
      from public.question_true_false_items item
      where item.question_id = question.id
        and (
          mod(length(item.content) - length(replace(item.content, '$', '')), 2) = 1
          or (item.content ~ E'\\\\[A-Za-z]+' and item.content not like '%$%')
        )
    )
    or exists (
      select 1
      from public.question_short_answer_keys answer_key
      where answer_key.question_id = question.id
        and (
          answer_key.normalized_text !~ '^-?[0-9]+([,.][0-9]+)?$'
          or length(answer_key.normalized_text) > 4
        )
    )
  );

create or replace function private.guard_session_question_content_quality()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  quality_status text;
begin
  select question.content_quality_status
    into quality_status
  from public.questions question
  where question.id = new.question_id;

  if quality_status = 'needs_review' then
    raise exception 'QUESTION_CONTENT_NEEDS_REVIEW';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_session_question_content_quality()
  from public, anon, authenticated;
drop trigger if exists guard_session_question_content_quality
  on public.exam_session_questions;
create trigger guard_session_question_content_quality
before insert or update of question_id on public.exam_session_questions
for each row execute function private.guard_session_question_content_quality();

create or replace function public.get_question_content_review_queue(
  p_status text default 'pending',
  p_limit integer default 50,
  p_after uuid default null
)
returns jsonb
language sql
stable
security invoker
set search_path to ''
as $$
  select coalesce(jsonb_agg(to_jsonb(queue_row) order by queue_row.detected_at, queue_row.id), '[]'::jsonb)
  from (
    select
      review.id,
      review.question_id,
      question.code as question_code,
      review.entity_type,
      review.entity_id,
      review.field_name,
      review.original_value,
      review.proposed_value,
      review.issue_codes,
      review.severity,
      review.status,
      review.detected_at
    from public.question_content_reviews review
    join public.questions question on question.id = review.question_id
    where review.status = coalesce(nullif(p_status, ''), 'pending')
      and (p_after is null or review.id > p_after)
      and private.is_admin()
    order by review.detected_at, review.id
    limit least(greatest(coalesce(p_limit, 50), 1), 200)
  ) queue_row;
$$;

revoke all on function public.get_question_content_review_queue(text, integer, uuid)
  from public, anon;
grant execute on function public.get_question_content_review_queue(text, integer, uuid)
  to authenticated;

create or replace function private.apply_question_content_review(
  p_review_id uuid,
  p_action text
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  review public.question_content_reviews%rowtype;
  current_value text;
begin
  if not private.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;
  if p_action not in ('approve', 'reject') then
    raise exception 'INVALID_REVIEW_ACTION';
  end if;

  select * into review
  from public.question_content_reviews
  where id = p_review_id
  for update;

  if review.id is null then raise exception 'REVIEW_NOT_FOUND'; end if;
  if review.status <> 'pending' then raise exception 'REVIEW_ALREADY_RESOLVED'; end if;

  if p_action = 'reject' then
    update public.question_content_reviews
    set status = 'rejected', reviewed_by = (select auth.uid()), reviewed_at = now()
    where id = review.id;
    return;
  end if;

  if review.entity_type = 'question' and review.field_name = 'content' then
    select content into current_value from public.questions where id = review.entity_id;
    if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
    update public.questions set content = review.proposed_value, updated_at = now()
    where id = review.entity_id;
  elsif review.entity_type = 'question' and review.field_name = 'explanation' then
    select explanation into current_value from public.questions where id = review.entity_id;
    if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
    update public.questions set explanation = review.proposed_value, updated_at = now()
    where id = review.entity_id;
  elsif review.entity_type = 'option' and review.field_name in ('content', 'explanation') then
    if review.field_name = 'content' then
      select content into current_value from public.question_options where id = review.entity_id;
      if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
      update public.question_options set content = review.proposed_value where id = review.entity_id;
    else
      select explanation into current_value from public.question_options where id = review.entity_id;
      if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
      update public.question_options set explanation = review.proposed_value where id = review.entity_id;
    end if;
  elsif review.entity_type = 'true_false_item' and review.field_name = 'content' then
    select content into current_value from public.question_true_false_items where id = review.entity_id;
    if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
    update public.question_true_false_items set content = review.proposed_value where id = review.entity_id;
  elsif review.entity_type = 'short_answer_key'
    and review.field_name in ('normalized_text', 'display_value') then
    if review.field_name = 'normalized_text' then
      select normalized_text into current_value from public.question_short_answer_keys where id = review.entity_id;
      if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
      update public.question_short_answer_keys set normalized_text = review.proposed_value where id = review.entity_id;
    else
      select display_value into current_value from public.question_short_answer_keys where id = review.entity_id;
      if current_value is distinct from review.original_value then raise exception 'CONTENT_CHANGED'; end if;
      update public.question_short_answer_keys set display_value = review.proposed_value where id = review.entity_id;
    end if;
  else
    raise exception 'UNSUPPORTED_REVIEW_FIELD';
  end if;

  update public.question_content_reviews
  set status = 'applied', reviewed_by = (select auth.uid()), reviewed_at = now()
  where id = review.id;

  update public.questions question
  set content_format_version = 2,
      content_quality_status = case
        when exists (
          select 1 from public.question_content_reviews pending
          where pending.question_id = question.id and pending.status = 'pending'
        ) then 'needs_review'
        else 'verified'
      end,
      updated_at = now()
  where question.id = review.question_id;

  insert into public.question_audit_log(question_id, changed_by, old_data, new_data, action)
  values (
    review.question_id,
    (select auth.uid()),
    jsonb_build_object('field', review.field_name, 'value', review.original_value),
    jsonb_build_object('field', review.field_name, 'value', review.proposed_value),
    'content_review_applied'
  );
end;
$$;

revoke all on function private.apply_question_content_review(uuid, text)
  from public, anon;
grant execute on function private.apply_question_content_review(uuid, text)
  to authenticated;

create or replace function public.apply_question_content_review(
  p_review_id uuid,
  p_action text
)
returns void
language sql
security invoker
set search_path to ''
as $$
  select private.apply_question_content_review(p_review_id, p_action);
$$;

revoke all on function public.apply_question_content_review(uuid, text)
  from public, anon;
grant execute on function public.apply_question_content_review(uuid, text)
  to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Provenance and deterministic duplicate detection
-- ---------------------------------------------------------------------------

create table if not exists public.exam_sources (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_code text not null references public.subjects(code) on delete restrict,
  title text not null,
  organization text,
  exam_year integer check (exam_year between 2000 and 2100),
  source_type text not null default 'import' check (
    source_type in ('import', 'authoring', 'official', 'practice', 'other')
  ),
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.question_source_links (
  question_id uuid not null references public.questions(id) on delete cascade,
  source_id uuid not null references public.exam_sources(id) on delete cascade,
  source_question_code text,
  created_at timestamptz not null default now(),
  primary key (question_id, source_id)
);

create index if not exists exam_sources_subject_year_idx
  on public.exam_sources (subject_code, exam_year desc, created_at desc);
create index if not exists question_source_links_source_idx
  on public.question_source_links (source_id, question_id);

alter table public.exam_sources enable row level security;
alter table public.question_source_links enable row level security;

drop policy if exists exam_sources_admin_all on public.exam_sources;
create policy exam_sources_admin_all on public.exam_sources
for all to authenticated using (private.is_admin()) with check (private.is_admin());
drop policy if exists question_source_links_admin_all on public.question_source_links;
create policy question_source_links_admin_all on public.question_source_links
for all to authenticated using (private.is_admin()) with check (private.is_admin());

revoke all on public.exam_sources, public.question_source_links
  from public, anon, authenticated;
grant select, insert, update, delete on public.exam_sources, public.question_source_links
  to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Normalize room-paper ownership without breaking existing RPCs
-- ---------------------------------------------------------------------------

alter table public.exam_room_papers
  add column if not exists subject_code text;

update public.exam_room_papers paper
set subject_code = room.subject_code
from public.exam_rooms room
where room.id = paper.exam_room_id
  and paper.subject_code is null;

alter table public.exam_room_papers
  alter column subject_code set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.exam_room_papers'::regclass
      and conname = 'exam_room_papers_subject_code_fkey'
  ) then
    alter table public.exam_room_papers
      add constraint exam_room_papers_subject_code_fkey
      foreign key (subject_code) references public.subjects(code) on delete restrict;
  end if;
end
$$;

insert into public.room_papers(exam_room_id, paper_id, is_default, display_order)
select paper.exam_room_id, paper.id, paper.is_default, paper.display_order
from public.exam_room_papers paper
on conflict (exam_room_id, paper_id) do update
set is_default = excluded.is_default,
    display_order = excluded.display_order;

create unique index if not exists room_papers_one_default_per_room
  on public.room_papers (exam_room_id)
  where is_default;

create or replace function private.guard_room_paper_subject()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if not exists (
    select 1
    from public.exam_rooms room
    join public.exam_room_papers paper on paper.id = new.paper_id
    where room.id = new.exam_room_id
      and room.subject_code = paper.subject_code
  ) then
    raise exception 'ROOM_PAPER_SUBJECT_MISMATCH';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_room_paper_subject()
  from public, anon, authenticated;
drop trigger if exists guard_room_paper_subject on public.room_papers;
create trigger guard_room_paper_subject
before insert or update on public.room_papers
for each row execute function private.guard_room_paper_subject();

-- ---------------------------------------------------------------------------
-- 4. Key assignment and immutable usage ledger
-- ---------------------------------------------------------------------------

create table if not exists public.exam_key_assignments (
  key_id uuid not null references public.exam_keys(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'revoked')),
  claimed_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (key_id, student_id)
);

create table if not exists public.exam_key_usage_ledger (
  id bigint generated always as identity primary key,
  key_id uuid not null references public.exam_keys(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  attempts integer not null check (attempts > 0),
  reason text not null check (reason in ('exam', 'practice', 'legacy_session', 'adjustment')),
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique (idempotency_key),
  unique (session_id, key_id, reason)
);

create index if not exists exam_key_assignments_student_idx
  on public.exam_key_assignments (student_id, status, claimed_at desc);
create index if not exists exam_key_usage_ledger_key_idx
  on public.exam_key_usage_ledger (key_id, created_at desc);
create index if not exists exam_key_usage_ledger_student_idx
  on public.exam_key_usage_ledger (student_id, created_at desc);

insert into public.exam_key_assignments(key_id, student_id, status, claimed_at)
select key.id, key.assigned_to, 'active', coalesce(key.activated_at, key.created_at)
from public.exam_keys key
where key.assigned_to is not null
on conflict (key_id, student_id) do nothing;

insert into public.exam_key_assignments(key_id, student_id, status, claimed_at)
select student.current_key_id, student.id, 'active', now()
from public.students student
where student.current_key_id is not null
on conflict (key_id, student_id) do nothing;

insert into public.exam_key_usage_ledger(
  key_id, student_id, session_id, attempts, reason, idempotency_key, created_at
)
select
  session.key_id,
  session.student_id,
  session.id,
  coalesce(charge.attempts, 1),
  case when charge.session_id is null then 'legacy_session' else 'practice' end,
  'session:' || session.id::text || ':key:' || session.key_id::text,
  session.created_at
from public.exam_sessions session
left join public.exam_session_key_charges charge
  on charge.session_id = session.id and charge.key_id = session.key_id
on conflict (idempotency_key) do nothing;

create or replace function private.mirror_session_key_charge_to_ledger()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  owner_id uuid;
begin
  select session.student_id into owner_id
  from public.exam_sessions session
  where session.id = new.session_id;

  insert into public.exam_key_usage_ledger(
    key_id, student_id, session_id, attempts, reason, idempotency_key, created_at
  ) values (
    new.key_id,
    owner_id,
    new.session_id,
    new.attempts,
    'practice',
    'session:' || new.session_id::text || ':key:' || new.key_id::text,
    new.created_at
  )
  on conflict (idempotency_key) do update
  set attempts = excluded.attempts;
  return new;
end;
$$;

revoke all on function private.mirror_session_key_charge_to_ledger()
  from public, anon, authenticated;
drop trigger if exists mirror_session_key_charge_to_ledger
  on public.exam_session_key_charges;
create trigger mirror_session_key_charge_to_ledger
after insert or update of attempts on public.exam_session_key_charges
for each row execute function private.mirror_session_key_charge_to_ledger();

create or replace view public.v_exam_key_balances
with (security_invoker = true)
as
select
  key.id,
  key.total_attempts,
  greatest(
    key.used_attempts,
    coalesce(sum(usage.attempts), 0)::integer
  ) as consumed_attempts,
  greatest(
    key.total_attempts - greatest(
      key.used_attempts,
      coalesce(sum(usage.attempts), 0)::integer
    ),
    0
  ) as remaining_attempts,
  case
    when key.deleted_at is not null or key.status = 'revoked' then 'revoked'
    when key.expires_at is not null and key.expires_at <= now() then 'expired'
    when greatest(key.used_attempts, coalesce(sum(usage.attempts), 0)::integer)
      >= key.total_attempts then 'exhausted'
    else key.status::text
  end as effective_status
from public.exam_keys key
left join public.exam_key_usage_ledger usage on usage.key_id = key.id
group by key.id;

alter table public.exam_key_assignments enable row level security;
alter table public.exam_key_usage_ledger enable row level security;
drop policy if exists exam_key_assignments_owner_read on public.exam_key_assignments;
create policy exam_key_assignments_owner_read on public.exam_key_assignments
for select to authenticated
using (student_id = (select auth.uid()) or private.is_admin());
drop policy if exists exam_key_usage_ledger_owner_read on public.exam_key_usage_ledger;
create policy exam_key_usage_ledger_owner_read on public.exam_key_usage_ledger
for select to authenticated
using (student_id = (select auth.uid()) or private.is_admin());

revoke all on public.exam_key_assignments, public.exam_key_usage_ledger
  from public, anon, authenticated;
grant select on public.exam_key_assignments, public.exam_key_usage_ledger
  to authenticated;
revoke all on public.v_exam_key_balances from anon;
grant select on public.v_exam_key_balances to authenticated;

-- Repair effective status without deleting or reassigning any key.
update public.exam_keys
set status = 'expired', updated_at = now()
where status in ('unused', 'active')
  and expires_at is not null
  and expires_at <= now();

-- Hide scaffolds until their database is ready for students.
update public.subjects subject
set is_active = false, updated_at = now()
where subject.code = 'PHYSICS'
  and not exists (
    select 1 from public.questions question
    where question.subject_code = subject.code
      and question.status = 'approved'
      and question.deleted_at is null
  );

notify pgrst, 'reload schema';
