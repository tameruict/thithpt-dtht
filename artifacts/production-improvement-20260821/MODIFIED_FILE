-- Production foundation v1.
-- Live database is the baseline. This migration is additive/forward-only and is
-- intentionally kept out of production until it passes staging or a rolled-back
-- validation transaction against the linked schema.

-- ---------------------------------------------------------------------------
-- 1. Domain fields and compatibility-safe role hardening
-- ---------------------------------------------------------------------------

do $$
begin
  create type public.exam_room_mode as enum ('exam', 'practice');
exception
  when duplicate_object then null;
end
$$;

do $$
begin
  create type public.exam_grading_status as enum (
    'pending_auto',
    'pending_manual',
    'scored',
    'failed'
  );
exception
  when duplicate_object then null;
end
$$;

alter table public.exam_rooms
  add column if not exists mode public.exam_room_mode not null default 'exam';

alter table public.subjects
  add column if not exists practice_attempt_cost integer not null default 3,
  add column if not exists deleted_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'subjects_practice_attempt_cost_check'
      and conrelid = 'public.subjects'::regclass
  ) then
    alter table public.subjects
      add constraint subjects_practice_attempt_cost_check
      check (practice_attempt_cost between 1 and 100);
  end if;
end
$$;

alter table public.exam_sessions
  add column if not exists grading_status public.exam_grading_status
    not null default 'pending_auto',
  add column if not exists grading_error text;

update public.exam_rooms
set mode = 'practice'
where upper(code) like 'PRACTICE-%';

update public.exam_sessions session
set grading_status = case
  when session.status = 'in_progress' then 'pending_auto'::public.exam_grading_status
  when exists (
    select 1
    from public.exam_session_questions session_question
    join public.questions question on question.id = session_question.question_id
    left join public.session_answers answer
      on answer.session_question_id = session_question.id
    where session_question.session_id = session.id
      and question.type = 'essay'
      and coalesce(answer.grader ->> 'type', 'pending') <> 'manual'
  ) then 'pending_manual'::public.exam_grading_status
  when session.score is not null then 'scored'::public.exam_grading_status
  else 'pending_auto'::public.exam_grading_status
end;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select private.is_admin();
$$;

revoke all on function private.is_staff() from public, anon;
grant execute on function private.is_staff() to authenticated, service_role;

-- pg_jsonschema is non-relocatable after installation. Recreate it in the
-- extensions schema after removing its sole application dependency.
alter table public.exam_sessions
  drop constraint if exists valid_shuffle_config;

drop extension if exists pg_jsonschema;
create extension if not exists pg_jsonschema with schema extensions;

alter table public.exam_sessions
  add constraint valid_shuffle_config
  check (
    extensions.jsonb_matches_schema(
      '{"type":"object","properties":{"question_order":{"type":"array"}}}'::json,
      shuffle_config
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Readiness, effective key state, single active session and audit trail
-- ---------------------------------------------------------------------------

create or replace view public.v_exam_room_readiness
with (security_invoker = true)
as
select
  room.id,
  room.code,
  room.name,
  room.subject_code,
  room.blueprint_id,
  room.mode,
  room.status,
  room.duration_minutes,
  room.price_vnd,
  room.total_attempts_default,
  room.starts_at,
  room.ends_at,
  room.published_at,
  room.deleted_at,
  default_paper.paper_id as default_paper_id,
  coalesce(default_paper.question_count, 0)::integer as default_paper_question_count,
  coalesce(practice_pool.approved_question_count, 0)::integer as approved_practice_question_count,
  (
    (room.starts_at is null or room.starts_at <= now())
    and (room.ends_at is null or room.ends_at > now())
  ) as schedule_is_open,
  case
    when room.deleted_at is not null then false
    when room.status <> 'published' then false
    when room.starts_at is not null and room.starts_at > now() then false
    when room.ends_at is not null and room.ends_at <= now() then false
    when room.mode = 'exam'
      then default_paper.paper_id is not null
        and coalesce(default_paper.question_count, 0) > 0
    else coalesce(practice_pool.approved_question_count, 0) > 0
  end as is_ready,
  case
    when room.deleted_at is not null then 'archived'
    when room.status <> 'published' then 'not_published'
    when room.starts_at is not null and room.starts_at > now() then 'not_started'
    when room.ends_at is not null and room.ends_at <= now() then 'ended'
    when room.mode = 'exam' and default_paper.paper_id is null
      then 'missing_default_paper'
    when room.mode = 'exam' and coalesce(default_paper.question_count, 0) = 0
      then 'missing_questions'
    when room.mode = 'practice'
      and coalesce(practice_pool.approved_question_count, 0) = 0
      then 'missing_approved_questions'
    else 'ready'
  end as readiness_reason
from public.exam_rooms room
left join lateral (
  select
    room_paper.paper_id,
    count(room_question.question_id)::bigint as question_count
  from public.room_papers room_paper
  left join public.exam_room_questions room_question
    on room_question.paper_id = room_paper.paper_id
  where room_paper.exam_room_id = room.id
    and room_paper.is_default
  group by room_paper.paper_id
  limit 1
) default_paper on true
left join lateral (
  select count(*)::bigint as approved_question_count
  from public.questions question
  where question.subject_code = room.subject_code
    and question.status = 'approved'
    and question.deleted_at is null
) practice_pool on true;

revoke all on public.v_exam_room_readiness from anon;
grant select on public.v_exam_room_readiness to authenticated;

create or replace view public.v_exam_keys_effective
with (security_invoker = true)
as
select
  exam_key.*,
  case
    when exam_key.deleted_at is not null then 'revoked'::public.exam_key_status
    when exam_key.expires_at is not null and exam_key.expires_at <= now()
      then 'expired'::public.exam_key_status
    when exam_key.used_attempts >= exam_key.total_attempts
      then 'exhausted'::public.exam_key_status
    else exam_key.status
  end as effective_status,
  greatest(exam_key.total_attempts - exam_key.used_attempts, 0) as remaining_attempts
from public.exam_keys exam_key;

revoke all on public.v_exam_keys_effective from anon;
grant select on public.v_exam_keys_effective to authenticated;

-- Resolve existing overdue sessions before enforcing one active session/user.
select public.expire_overdue_exam_sessions();

create unique index if not exists uq_exam_sessions_one_active_per_student
  on public.exam_sessions (student_id)
  where status = 'in_progress';

create table if not exists public.admin_audit_log (
  id bigint generated by default as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  request_id text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_user_id, created_at desc);
create index if not exists admin_audit_log_entity_created_idx
  on public.admin_audit_log (entity_type, entity_id, created_at desc);

alter table public.admin_audit_log enable row level security;
drop policy if exists admin_audit_log_admin_read on public.admin_audit_log;
create policy admin_audit_log_admin_read
on public.admin_audit_log
for select
to authenticated
using (private.is_admin());

revoke all on public.admin_audit_log from anon, authenticated;
grant select on public.admin_audit_log to authenticated;

create or replace function private.audit_admin_mutation()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  audit_row jsonb;
  audit_id text;
begin
  if (select auth.uid()) is null or not private.is_admin() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;

  audit_row := to_jsonb(case when tg_op = 'DELETE' then old else new end);
  audit_id := coalesce(
    audit_row ->> 'id',
    audit_row ->> 'code',
    audit_row ->> 'exam_room_id'
  );

  insert into public.admin_audit_log (
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    details
  ) values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    audit_id,
    nullif(current_setting('request.headers', true)::jsonb ->> 'x-request-id', ''),
    jsonb_build_object('schema', tg_table_schema)
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function private.audit_admin_mutation() from public, anon, authenticated;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'subjects',
    'questions',
    'exam_rooms',
    'exam_room_papers',
    'exam_keys',
    'key_batches'
  ]
  loop
    execute format(
      'drop trigger if exists audit_admin_mutation on public.%I',
      table_name
    );
    execute format(
      'create trigger audit_admin_mutation after insert or update or delete on public.%I for each row execute function private.audit_admin_mutation()',
      table_name
    );
  end loop;
end
$$;

create or replace function private.enforce_exam_room_publish_readiness()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  default_paper_id uuid;
  question_count integer;
begin
  if new.status <> 'published' or new.deleted_at is not null then
    return new;
  end if;

  if new.mode = 'exam' then
    select room_paper.paper_id
      into default_paper_id
    from public.room_papers room_paper
    where room_paper.exam_room_id = new.id
      and room_paper.is_default
    limit 1;

    if default_paper_id is null then
      raise exception 'EXAM_ROOM_MISSING_DEFAULT_PAPER';
    end if;

    select count(*)::integer
      into question_count
    from public.exam_room_questions room_question
    where room_question.paper_id = default_paper_id;

    if question_count = 0 then
      raise exception 'EXAM_ROOM_MISSING_QUESTIONS';
    end if;
  else
    select count(*)::integer
      into question_count
    from public.questions question
    where question.subject_code = new.subject_code
      and question.status = 'approved'
      and question.deleted_at is null;

    if question_count = 0 then
      raise exception 'PRACTICE_ROOM_MISSING_APPROVED_QUESTIONS';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function private.enforce_exam_room_publish_readiness()
  from public, anon, authenticated;

drop trigger if exists enforce_exam_room_publish_readiness on public.exam_rooms;
create trigger enforce_exam_room_publish_readiness
before insert or update of status, mode, deleted_at
on public.exam_rooms
for each row
execute function private.enforce_exam_room_publish_readiness();

-- Keep practice rooms separate and remove structurally invalid official rooms
-- from the published catalog. No row is deleted.
update public.exam_rooms room
set status = 'draft'
where room.mode = 'exam'
  and room.status = 'published'
  and (
    not exists (
      select 1
      from public.room_papers room_paper
      where room_paper.exam_room_id = room.id
        and room_paper.is_default
    )
    or not exists (
      select 1
      from public.room_papers room_paper
      join public.exam_room_questions room_question
        on room_question.paper_id = room_paper.paper_id
      where room_paper.exam_room_id = room.id
        and room_paper.is_default
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Checkout-ready entitlement tables (checkout remains disabled by env flag)
-- ---------------------------------------------------------------------------

create table if not exists public.key_products (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  product_kind text not null check (product_kind in ('exam', 'practice', 'bundle')),
  attempt_count integer not null check (attempt_count > 0),
  price_amount integer not null check (price_amount >= 0),
  currency text not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz
);

create table if not exists public.purchase_orders (
  id uuid primary key default extensions.gen_random_uuid(),
  student_id uuid not null references public.profiles(id) on delete restrict,
  product_id uuid references public.key_products(id) on delete set null,
  status text not null default 'pending'
    check (status in ('pending', 'paid', 'fulfilled', 'failed', 'cancelled', 'refunded')),
  amount integer not null check (amount >= 0),
  currency text not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  product_snapshot jsonb not null,
  provider text,
  provider_order_ref text,
  idempotency_key text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  paid_at timestamptz,
  fulfilled_at timestamptz,
  failed_at timestamptz,
  failure_code text
);

create unique index if not exists purchase_orders_provider_ref_unique
  on public.purchase_orders (provider, provider_order_ref)
  where provider is not null and provider_order_ref is not null;
create index if not exists purchase_orders_student_created_idx
  on public.purchase_orders (student_id, created_at desc);

create table if not exists public.payment_events (
  id bigint generated by default as identity primary key,
  order_id uuid references public.purchase_orders(id) on delete set null,
  provider text not null,
  provider_event_id text not null,
  event_type text not null,
  payload_sha256 text not null check (payload_sha256 ~ '^[0-9a-f]{64}$'),
  payload jsonb not null,
  received_at timestamptz not null default now(),
  processed_at timestamptz,
  processing_error text,
  unique (provider, provider_event_id)
);

create index if not exists payment_events_order_received_idx
  on public.payment_events (order_id, received_at desc);

alter table public.exam_keys
  add column if not exists source_order_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'exam_keys_source_order_id_fkey'
      and conrelid = 'public.exam_keys'::regclass
  ) then
    alter table public.exam_keys
      add constraint exam_keys_source_order_id_fkey
      foreign key (source_order_id)
      references public.purchase_orders(id)
      on delete set null;
  end if;
end
$$;

create unique index if not exists exam_keys_source_order_unique
  on public.exam_keys (source_order_id)
  where source_order_id is not null;

alter table public.key_products enable row level security;
alter table public.purchase_orders enable row level security;
alter table public.payment_events enable row level security;

drop policy if exists key_products_authenticated_read on public.key_products;
create policy key_products_authenticated_read
on public.key_products
for select
to authenticated
using ((is_active and archived_at is null) or private.is_admin());

drop policy if exists key_products_admin_write on public.key_products;
create policy key_products_admin_write
on public.key_products
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists purchase_orders_owner_read on public.purchase_orders;
create policy purchase_orders_owner_read
on public.purchase_orders
for select
to authenticated
using (student_id = (select auth.uid()) or private.is_admin());

drop policy if exists purchase_orders_admin_write on public.purchase_orders;
create policy purchase_orders_admin_write
on public.purchase_orders
for all
to authenticated
using (private.is_admin())
with check (private.is_admin());

drop policy if exists payment_events_admin_read on public.payment_events;
create policy payment_events_admin_read
on public.payment_events
for select
to authenticated
using (private.is_admin());

revoke all on public.key_products, public.purchase_orders, public.payment_events
  from anon, authenticated;
grant select on public.key_products, public.purchase_orders, public.payment_events
  to authenticated;
grant insert, update, delete on public.key_products, public.purchase_orders
  to authenticated;

-- Add the new entitlement tables to the automatic admin audit trail.
do $$
declare
  table_name text;
begin
  foreach table_name in array array['key_products', 'purchase_orders']
  loop
    execute format(
      'drop trigger if exists audit_admin_mutation on public.%I',
      table_name
    );
    execute format(
      'create trigger audit_admin_mutation after insert or update or delete on public.%I for each row execute function private.audit_admin_mutation()',
      table_name
    );
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 4. Session read RPC and dashboard contract
-- ---------------------------------------------------------------------------

create or replace function public.get_active_exam_session_full(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  caller_id uuid := (select auth.uid());
  owner_id uuid;
  session_status text;
  due_at_value timestamptz;
  result_value jsonb;
begin
  if caller_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select session.student_id, session.status::text, session.due_at
    into owner_id, session_status, due_at_value
  from public.exam_sessions session
  where session.id = p_session_id;

  if owner_id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if owner_id <> caller_id and not private.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  if session_status = 'in_progress'
     and due_at_value is not null
     and due_at_value <= now()
  then
    update public.exam_sessions
    set status = 'submitted',
        submitted_at = coalesce(due_at, now()),
        grading_status = 'pending_auto',
        client_info = client_info || jsonb_build_object('finalized', 'auto_expired'),
        updated_at = now()
    where id = p_session_id
      and status = 'in_progress';
    session_status := 'submitted';
  end if;

  if session_status <> 'in_progress' and not private.is_admin() then
    raise exception 'SESSION_NOT_ACTIVE';
  end if;

  select jsonb_build_object(
    'session', jsonb_build_object(
      'id', session.id,
      'status', session.status,
      'attempt_number', session.attempt_number,
      'started_at', session.started_at,
      'due_at', session.due_at,
      'submitted_at', session.submitted_at,
      'score', session.score,
      'max_score', session.max_score,
      'exam_room_id', session.exam_room_id,
      'grading_status', session.grading_status
    ),
    'room', jsonb_build_object(
      'id', room.id,
      'code', room.code,
      'name', room.name,
      'duration_minutes', room.duration_minutes,
      'status', room.status,
      'mode', room.mode,
      'price_vnd', room.price_vnd,
      'total_attempts_default', room.total_attempts_default,
      'starts_at', room.starts_at,
      'ends_at', room.ends_at,
      'published_at', room.published_at,
      'blueprint_code', blueprint.code,
      'blueprint_name', blueprint.name,
      'subject_code', room.subject_code,
      'subject_name', subject.name
    ),
    'questions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', session_question.id,
          'question_seq', session_question.question_seq,
          'display_no', coalesce(
            session_question.display_no,
            session_question.question_seq::text
          ),
          'max_points', session_question.max_points,
          'question_id', question.id,
          'code', question.code,
          'type', question.type,
          'content', question.content,
          'image_url', question.image_url,
          'image_alt_text', (
            select asset.alt_text
            from public.question_assets asset
            where asset.question_id = question.id
              and asset.kind = 'image'
              and (question.image_url is null or asset.url = question.image_url)
            order by asset.display_order
            limit 1
          ),
          'image_width_px', (
            select registry.width_px
            from public.r2_assets registry
            where registry.public_url = question.image_url
            limit 1
          ),
          'image_height_px', (
            select registry.height_px
            from public.r2_assets registry
            where registry.public_url = question.image_url
            limit 1
          ),
          'options', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', option.id,
                'seq', option.seq,
                'label', option.label,
                'content', option.content,
                'image_url', option.image_url,
                'image_alt_text', option.image_alt_text,
                'image_width_px', (
                  select registry.width_px
                  from public.r2_assets registry
                  where registry.public_url = option.image_url
                  limit 1
                ),
                'image_height_px', (
                  select registry.height_px
                  from public.r2_assets registry
                  where registry.public_url = option.image_url
                  limit 1
                )
              )
              order by
                coalesce(array_position(session_question.option_order, option.id), 32767),
                option.seq
            )
            from public.question_options option
            where option.question_id = question.id
          ), '[]'::jsonb),
          'true_false_items', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'id', item.id,
                'seq', item.seq,
                'label', item.label,
                'content', item.content
              ) order by item.seq
            )
            from public.question_true_false_items item
            where item.question_id = question.id
          ), '[]'::jsonb)
        ) order by session_question.question_seq
      )
      from public.exam_session_questions session_question
      join public.questions question on question.id = session_question.question_id
      where session_question.session_id = session.id
    ), '[]'::jsonb),
    'answers', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'session_question_id', answer.session_question_id,
          'answer_json', answer.answer_json,
          'selected_option_id', answer.selected_option_id,
          'short_answer_text', answer.short_answer_text,
          'is_correct', answer.is_correct,
          'earned_points', answer.earned_points
        )
      )
      from public.session_answers answer
      join public.exam_session_questions answer_question
        on answer_question.id = answer.session_question_id
      where answer_question.session_id = session.id
        and answer.student_id = session.student_id
    ), '[]'::jsonb)
  )
  into result_value
  from public.exam_sessions session
  join public.exam_rooms room on room.id = session.exam_room_id
  left join public.exam_blueprints blueprint on blueprint.id = room.blueprint_id
  left join public.subjects subject on subject.code = room.subject_code
  where session.id = p_session_id;

  return result_value;
end;
$$;

revoke all on function public.get_active_exam_session_full(uuid)
  from public, anon;
grant execute on function public.get_active_exam_session_full(uuid)
  to authenticated;

create or replace function public.get_subjects_dashboard()
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  student_id uuid := (select auth.uid());
  current_time timestamptz := now();
  result_value jsonb;
begin
  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  update public.exam_sessions session
  set status = 'submitted',
      submitted_at = coalesce(
        session.due_at,
        session.started_at + make_interval(mins => room.duration_minutes)
      ),
      grading_status = 'pending_auto',
      client_info = session.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = current_time
  from public.exam_rooms room
  where session.student_id = student_id
    and session.status = 'in_progress'
    and room.id = session.exam_room_id
    and coalesce(
      session.due_at,
      session.started_at + make_interval(mins => room.duration_minutes)
    ) <= current_time;

  select jsonb_build_object(
    'subjects', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'code', subject.code,
          'name', subject.name,
          'default_duration_minutes', subject.default_duration_minutes,
          'is_compulsory', subject.is_compulsory,
          'is_active', subject.is_active,
          'practice_attempt_cost', subject.practice_attempt_cost
        ) order by subject.is_compulsory desc, subject.name
      )
      from public.subjects subject
      where subject.is_active
        and subject.deleted_at is null
    ), '[]'::jsonb),
    'rooms', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', room.id,
          'code', room.code,
          'name', room.name,
          'duration_minutes', room.duration_minutes,
          'status', room.status,
          'mode', room.mode,
          'price_vnd', room.price_vnd,
          'total_attempts_default', room.total_attempts_default,
          'starts_at', room.starts_at,
          'ends_at', room.ends_at,
          'published_at', room.published_at,
          'blueprint_code', blueprint.code,
          'blueprint_name', blueprint.name,
          'subject_code', room.subject_code,
          'subject_name', subject.name,
          'readiness_reason', readiness.readiness_reason
        ) order by subject.name, room.published_at desc
      )
      from public.exam_rooms room
      join public.v_exam_room_readiness readiness on readiness.id = room.id
      join public.exam_blueprints blueprint on blueprint.id = room.blueprint_id
      join public.subjects subject on subject.code = room.subject_code
      where room.mode = 'exam'
        and readiness.is_ready
    ), '[]'::jsonb),
    'practice', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'subject_code', subject.code,
          'subject_name', subject.name,
          'room_id', room.id,
          'room_name', room.name,
          'attempt_cost', subject.practice_attempt_cost,
          'approved_question_count', readiness.approved_practice_question_count,
          'available', readiness.is_ready
        ) order by subject.name
      )
      from public.subjects subject
      left join lateral (
        select practice_room.*
        from public.exam_rooms practice_room
        where practice_room.subject_code = subject.code
          and practice_room.mode = 'practice'
          and practice_room.deleted_at is null
        order by practice_room.published_at desc nulls last
        limit 1
      ) room on true
      left join public.v_exam_room_readiness readiness on readiness.id = room.id
      where subject.is_active
        and subject.deleted_at is null
    ), '[]'::jsonb),
    'attempt_balance', coalesce((
      select sum(effective_key.remaining_attempts)
      from public.v_exam_keys_effective effective_key
      where effective_key.assigned_to = student_id
        and effective_key.effective_status in ('unused', 'active')
    ), 0),
    'profile', (
      select jsonb_build_object(
        'id', profile.id,
        'email', profile.email::text,
        'role', profile.role::text,
        'full_name', profile.full_name,
        'avatar_url', profile.avatar_url
      )
      from public.profiles profile
      where profile.id = student_id
    ),
    'active_session', (
      select jsonb_build_object(
        'session_id', session.id,
        'exam_room_id', session.exam_room_id,
        'room_name', room.name,
        'room_code', room.code,
        'room_mode', room.mode,
        'subject_name', subject.name,
        'started_at', session.started_at,
        'due_at', session.due_at
      )
      from public.exam_sessions session
      join public.exam_rooms room on room.id = session.exam_room_id
      left join public.subjects subject on subject.code = room.subject_code
      where session.student_id = student_id
        and session.status = 'in_progress'
      order by session.started_at desc
      limit 1
    )
  ) into result_value;

  return result_value;
end;
$$;

revoke all on function public.get_subjects_dashboard() from public, anon;
grant execute on function public.get_subjects_dashboard() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Server-selected practice sessions and attempt charge ledger
-- ---------------------------------------------------------------------------

create table if not exists public.exam_session_key_charges (
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  key_id uuid not null references public.exam_keys(id) on delete restrict,
  attempts integer not null check (attempts > 0),
  created_at timestamptz not null default now(),
  primary key (session_id, key_id)
);

create index if not exists exam_session_key_charges_key_idx
  on public.exam_session_key_charges (key_id, created_at desc);

alter table public.exam_session_key_charges enable row level security;
drop policy if exists exam_session_key_charges_owner_read
  on public.exam_session_key_charges;
create policy exam_session_key_charges_owner_read
on public.exam_session_key_charges
for select
to authenticated
using (
  exists (
    select 1
    from public.exam_sessions session
    where session.id = exam_session_key_charges.session_id
      and (session.student_id = (select auth.uid()) or private.is_admin())
  )
);

revoke all on public.exam_session_key_charges from anon, authenticated;
grant select on public.exam_session_key_charges to authenticated;

create or replace function private.assert_session_start_mode()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  room_mode public.exam_room_mode;
  room_ready boolean;
begin
  select readiness.mode, readiness.is_ready
    into room_mode, room_ready
  from public.v_exam_room_readiness readiness
  where readiness.id = new.exam_room_id;

  if room_mode is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_mode = 'practice'
     and coalesce(current_setting('app.session_start_flow', true), '') <> 'practice'
  then
    raise exception 'PRACTICE_REQUIRES_PRACTICE_RPC';
  end if;

  if not coalesce(room_ready, false) then
    raise exception 'ROOM_NOT_READY';
  end if;

  return new;
end;
$$;

revoke all on function private.assert_session_start_mode()
  from public, anon, authenticated;

drop trigger if exists assert_session_start_mode on public.exam_sessions;
create trigger assert_session_start_mode
before insert on public.exam_sessions
for each row
execute function private.assert_session_start_mode();

drop function if exists public.start_practice_session(text, jsonb);

create or replace function public.start_practice_session(
  p_subject_code text,
  p_question_count integer default 20,
  p_knowledge_field_ids bigint[] default null,
  p_difficulties smallint[] default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_variable
declare
  student_id uuid := (select auth.uid());
  subject_code text := nullif(upper(trim(p_subject_code)), '');
  requested_count integer := least(greatest(coalesce(p_question_count, 20), 5), 50);
  practice_room_id uuid;
  practice_blueprint_id uuid;
  session_id uuid := extensions.gen_random_uuid();
  first_key_id uuid;
  attempt_number integer;
  required_attempts integer;
  remaining_attempts integer;
  take_attempts integer;
  selected_count integer;
  charge_rows jsonb := '[]'::jsonb;
  key_row record;
begin
  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  if subject_code is null then
    raise exception 'SUBJECT_REQUIRED';
  end if;

  select room.id, room.blueprint_id, subject.practice_attempt_cost
    into practice_room_id, practice_blueprint_id, required_attempts
  from public.exam_rooms room
  join public.subjects subject on subject.code = room.subject_code
  join public.v_exam_room_readiness readiness on readiness.id = room.id
  where room.subject_code = subject_code
    and room.mode = 'practice'
    and readiness.is_ready
  order by room.published_at desc nulls last
  limit 1;

  if practice_room_id is null then
    raise exception 'PRACTICE_NOT_AVAILABLE';
  end if;

  if exists (
    select 1
    from public.exam_sessions session
    where session.student_id = student_id
      and session.status = 'in_progress'
  ) then
    raise exception 'SESSION_ALREADY_ACTIVE';
  end if;

  insert into public.students (id, full_name)
  select profile.id, profile.full_name
  from public.profiles profile
  where profile.id = student_id
  on conflict (id) do nothing;

  select coalesce(sum(exam_key.total_attempts - exam_key.used_attempts), 0)::integer
    into remaining_attempts
  from public.exam_keys exam_key
  where exam_key.assigned_to = student_id
    and exam_key.status in ('unused', 'active')
    and (exam_key.expires_at is null or exam_key.expires_at > now())
    and exam_key.used_attempts < exam_key.total_attempts
    and exam_key.deleted_at is null;

  if remaining_attempts < required_attempts then
    raise exception 'INSUFFICIENT_ATTEMPTS';
  end if;

  for key_row in
    select exam_key.id, exam_key.total_attempts, exam_key.used_attempts
    from public.exam_keys exam_key
    where exam_key.assigned_to = student_id
      and exam_key.status in ('unused', 'active')
      and (exam_key.expires_at is null or exam_key.expires_at > now())
      and exam_key.used_attempts < exam_key.total_attempts
      and exam_key.deleted_at is null
    order by exam_key.expires_at nulls last, exam_key.created_at
    for update
  loop
    exit when required_attempts <= 0;

    take_attempts := least(
      required_attempts,
      key_row.total_attempts - key_row.used_attempts
    );

    update public.exam_keys
    set used_attempts = used_attempts + take_attempts,
        status = case
          when used_attempts + take_attempts >= total_attempts
            then 'exhausted'::public.exam_key_status
          else 'active'::public.exam_key_status
        end,
        activated_at = coalesce(activated_at, now()),
        updated_at = now()
    where id = key_row.id;

    first_key_id := coalesce(first_key_id, key_row.id);
    charge_rows := charge_rows || jsonb_build_array(
      jsonb_build_object('key_id', key_row.id, 'attempts', take_attempts)
    );
    required_attempts := required_attempts - take_attempts;
  end loop;

  if required_attempts > 0 or first_key_id is null then
    raise exception 'INSUFFICIENT_ATTEMPTS';
  end if;

  select coalesce(max(session.attempt_number), 0) + 1
    into attempt_number
  from public.exam_sessions session
  where session.key_id = first_key_id;

  perform set_config('app.session_start_flow', 'practice', true);

  insert into public.exam_sessions (
    id,
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status,
    grading_status,
    client_info,
    shuffle_config
  ) values (
    session_id,
    first_key_id,
    student_id,
    practice_room_id,
    null,
    attempt_number,
    'in_progress',
    'pending_auto',
    jsonb_build_object('flow', 'practice'),
    jsonb_build_object(
      'version', 2,
      'seed', session_id::text,
      'shuffleQuestions', 'server_random',
      'shuffleOptions', true,
      'filters', jsonb_build_object(
        'knowledgeFieldIds', to_jsonb(p_knowledge_field_ids),
        'difficulties', to_jsonb(p_difficulties)
      )
    )
  );

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    display_no,
    option_order,
    max_points
  )
  with selected as (
    select
      question.id as question_id,
      question.type as question_type,
      section.id as section_id,
      section.max_points_per_question as max_points
    from public.questions question
    join lateral (
      select blueprint_section.id, blueprint_section.max_points_per_question
      from public.exam_blueprint_sections blueprint_section
      where blueprint_section.blueprint_id = practice_blueprint_id
        and blueprint_section.question_type = question.type
      order by blueprint_section.seq
      limit 1
    ) section on true
    where question.subject_code = subject_code
      and question.status = 'approved'
      and question.deleted_at is null
      and (
        p_knowledge_field_ids is null
        or cardinality(p_knowledge_field_ids) = 0
        or question.knowledge_field_id = any(p_knowledge_field_ids)
      )
      and (
        p_difficulties is null
        or cardinality(p_difficulties) = 0
        or question.difficulty = any(p_difficulties)
      )
    order by random()
    limit requested_count
  ),
  numbered as (
    select selected.*, row_number() over ()::integer as sequence_number
    from selected
  )
  select
    session_id,
    numbered.section_id,
    numbered.question_id,
    numbered.sequence_number,
    numbered.sequence_number::text,
    case
      when numbered.question_type = 'multiple_choice' then coalesce((
        select array_agg(option.id order by md5(
          session_id::text || ':' || numbered.question_id::text || ':' || option.id::text
        ))::uuid[]
        from public.question_options option
        where option.question_id = numbered.question_id
      ), '{}'::uuid[])
      else '{}'::uuid[]
    end,
    numbered.max_points
  from numbered;

  get diagnostics selected_count = row_count;
  if selected_count <> requested_count then
    raise exception 'INSUFFICIENT_APPROVED_QUESTIONS';
  end if;

  update public.exam_sessions
  set max_score = (
    select sum(session_question.max_points)
    from public.exam_session_questions session_question
    where session_question.session_id = session_id
  )
  where id = session_id;

  insert into public.exam_session_key_charges (session_id, key_id, attempts)
  select session_id, charge.key_id, charge.attempts
  from jsonb_to_recordset(charge_rows) as charge(key_id uuid, attempts integer);

  update public.students
  set current_key_id = first_key_id,
      updated_at = now()
  where id = student_id;

  return session_id;
end;
$$;

revoke all on function public.start_practice_session(text, integer, bigint[], smallint[])
  from public, anon;
grant execute on function public.start_practice_session(text, integer, bigint[], smallint[])
  to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Immediate auto-grading, manual state and recovery cron
-- ---------------------------------------------------------------------------

create or replace function private.refresh_exam_grading_status(p_session_id uuid)
returns public.exam_grading_status
language plpgsql
security definer
set search_path to ''
as $$
declare
  next_status public.exam_grading_status;
begin
  select case
    when session.status = 'in_progress'
      then 'pending_auto'::public.exam_grading_status
    when exists (
      select 1
      from public.exam_session_questions session_question
      join public.questions question on question.id = session_question.question_id
      left join public.session_answers answer
        on answer.session_question_id = session_question.id
      where session_question.session_id = session.id
        and question.type = 'essay'
        and coalesce(answer.grader ->> 'type', 'pending') <> 'manual'
    ) then 'pending_manual'::public.exam_grading_status
    when session.score is not null
      then 'scored'::public.exam_grading_status
    else 'pending_auto'::public.exam_grading_status
  end
  into next_status
  from public.exam_sessions session
  where session.id = p_session_id;

  if next_status is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  update public.exam_sessions
  set grading_status = next_status,
      grading_error = case when next_status = 'failed' then grading_error else null end,
      scored_at = case
        when next_status = 'scored' then coalesce(scored_at, now())
        when next_status = 'pending_manual' then null
        else scored_at
      end,
      updated_at = now()
  where id = p_session_id;

  return next_status;
end;
$$;

revoke all on function private.refresh_exam_grading_status(uuid)
  from public, anon, authenticated;

create or replace function public.submit_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  owner_id uuid;
  session_status text;
begin
  select session.student_id, session.status::text
    into owner_id, session_status
  from public.exam_sessions session
  where session.id = p_session_id;

  if owner_id is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if owner_id <> (select auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if session_status <> 'in_progress' then
    return;
  end if;

  update public.exam_sessions
  set status = 'submitted',
      submitted_at = now(),
      grading_status = 'pending_auto',
      grading_error = null,
      updated_at = now()
  where id = p_session_id
    and student_id = owner_id
    and status = 'in_progress';

  begin
    perform public.score_exam_session(p_session_id);
    perform private.refresh_exam_grading_status(p_session_id);
  exception
    when others then
      update public.exam_sessions
      set grading_status = 'failed',
          grading_error = left(sqlstate || ':' || sqlerrm, 500),
          updated_at = now()
      where id = p_session_id;
  end;
end;
$$;

revoke all on function public.submit_exam_session(uuid) from public, anon;
grant execute on function public.submit_exam_session(uuid) to authenticated;

create or replace function public.score_pending_exam_sessions(p_limit integer default 200)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  session_id uuid;
  scored_count integer := 0;
begin
  for session_id in
    select session.id
    from public.exam_sessions session
    where session.status = 'submitted'
      and session.grading_status in ('pending_auto', 'failed')
    order by session.submitted_at
    limit least(greatest(coalesce(p_limit, 200), 1), 1000)
    for update skip locked
  loop
    begin
      update public.exam_sessions
      set grading_status = 'pending_auto', grading_error = null
      where id = session_id;

      perform public.score_exam_session(session_id);
      perform private.refresh_exam_grading_status(session_id);
      scored_count := scored_count + 1;
    exception
      when others then
        update public.exam_sessions
        set grading_status = 'failed',
            grading_error = left(sqlstate || ':' || sqlerrm, 500),
            updated_at = now()
        where id = session_id;
    end;
  end loop;

  return scored_count;
end;
$$;

revoke all on function public.score_pending_exam_sessions(integer)
  from public, anon, authenticated;

create or replace function public.grade_essay_answer(
  p_answer_id uuid,
  p_points numeric
)
returns numeric
language plpgsql
security definer
set search_path to ''
as $$
declare
  session_id uuid;
  max_points numeric;
  question_type text;
  total_score numeric;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_points is null or p_points < 0 then
    raise exception 'INVALID_POINTS';
  end if;

  select session_question.session_id, session_question.max_points, question.type::text
    into session_id, max_points, question_type
  from public.session_answers answer
  join public.exam_session_questions session_question
    on session_question.id = answer.session_question_id
  join public.questions question on question.id = session_question.question_id
  where answer.id = p_answer_id;

  if session_id is null then
    raise exception 'ANSWER_NOT_FOUND';
  end if;

  if question_type <> 'essay' then
    raise exception 'NOT_AN_ESSAY';
  end if;

  if p_points > max_points then
    raise exception 'POINTS_EXCEED_MAX';
  end if;

  update public.session_answers
  set earned_points = p_points,
      is_correct = (p_points >= max_points),
      grader = jsonb_build_object(
        'type', 'manual',
        'by', (select auth.uid()),
        'at', now()
      ),
      updated_at = now()
  where id = p_answer_id;

  select coalesce(sum(answer.earned_points), 0)
    into total_score
  from public.session_answers answer
  join public.exam_session_questions session_question
    on session_question.id = answer.session_question_id
  where session_question.session_id = session_id;

  update public.exam_sessions
  set score = total_score,
      updated_at = now()
  where id = session_id;

  perform private.refresh_exam_grading_status(session_id);
  return total_score;
end;
$$;

revoke all on function public.grade_essay_answer(uuid, numeric)
  from public, anon;
grant execute on function public.grade_essay_answer(uuid, numeric)
  to authenticated;

-- Preserve the existing review behavior while attaching grading state.
alter function public.get_session_review(uuid)
  rename to get_session_review_core_20260821;

revoke all on function public.get_session_review_core_20260821(uuid)
  from public, anon, authenticated;

create or replace function public.get_session_review(p_session_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  result_value jsonb;
  grading_status_value public.exam_grading_status;
  grading_error_value text;
begin
  result_value := public.get_session_review_core_20260821(p_session_id);

  select session.grading_status, session.grading_error
    into grading_status_value, grading_error_value
  from public.exam_sessions session
  where session.id = p_session_id;

  result_value := jsonb_set(
    result_value,
    '{session,grading_status}',
    to_jsonb(grading_status_value),
    true
  );
  result_value := jsonb_set(
    result_value,
    '{session,grading_error}',
    coalesce(to_jsonb(grading_error_value), 'null'::jsonb),
    true
  );

  return result_value;
end;
$$;

revoke all on function public.get_session_review(uuid) from public, anon;
grant execute on function public.get_session_review(uuid) to authenticated;

-- Reduce score-recovery frequency and retain pg_cron run history for 14 days.
do $cron$
declare
  job_id bigint;
begin
  select jobid into job_id
  from cron.job
  where jobname = 'score-pending-exam-sessions';

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'score-pending-exam-sessions',
    '*/5 * * * *',
    'select public.score_pending_exam_sessions(200);'
  );

  select jobid into job_id
  from cron.job
  where jobname = 'cleanup-cron-job-history';

  if job_id is not null then
    perform cron.unschedule(job_id);
  end if;

  perform cron.schedule(
    'cleanup-cron-job-history',
    '17 3 * * *',
    $$delete from cron.job_run_details where end_time < now() - interval '14 days';$$
  );
end
$cron$;

-- ---------------------------------------------------------------------------
-- 7. R2 registry RPC and manual paper composition RPCs missing on live
-- ---------------------------------------------------------------------------

drop function if exists public.register_r2_asset(text, text, bigint);

create or replace function public.register_r2_asset(
  p_public_url text,
  p_bucket text,
  p_object_key text,
  p_file_name text,
  p_content_type text,
  p_size_bytes bigint,
  p_width_px integer default null,
  p_height_px integer default null,
  p_alt_text text default null
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  asset_id uuid;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  if p_public_url !~ '^https://'
     or position('?' in p_public_url) > 0
     or position('#' in p_public_url) > 0
  then
    raise exception 'IMAGE_URL_MUST_BE_STABLE_HTTPS';
  end if;

  if nullif(trim(p_bucket), '') is null
     or nullif(trim(p_object_key), '') is null
     or p_object_key !~ '^authoring/[A-Za-z0-9._/-]+$'
     or nullif(trim(p_file_name), '') is null
  then
    raise exception 'IMAGE_OBJECT_IDENTITY_INVALID';
  end if;

  if p_content_type not in ('image/png', 'image/jpeg', 'image/webp', 'image/avif') then
    raise exception 'IMAGE_CONTENT_TYPE_NOT_ALLOWED';
  end if;

  if p_size_bytes is null or p_size_bytes <= 0 or p_size_bytes > 10485760 then
    raise exception 'IMAGE_SIZE_NOT_ALLOWED';
  end if;

  if (p_width_px is not null and p_width_px <= 0)
     or (p_height_px is not null and p_height_px <= 0)
  then
    raise exception 'IMAGE_DIMENSIONS_INVALID';
  end if;

  update public.r2_assets
  set bucket = trim(p_bucket),
      object_key = trim(p_object_key),
      file_name = trim(p_file_name),
      content_type = p_content_type,
      size_bytes = p_size_bytes,
      width_px = p_width_px,
      height_px = p_height_px,
      alt_text = nullif(trim(p_alt_text), '')
  where public_url = p_public_url
  returning id into asset_id;

  if asset_id is null then
    insert into public.r2_assets (
      bucket,
      object_key,
      public_url,
      file_name,
      content_type,
      size_bytes,
      width_px,
      height_px,
      alt_text,
      uploaded_by,
      linked_to_type
    ) values (
      trim(p_bucket),
      trim(p_object_key),
      p_public_url,
      trim(p_file_name),
      p_content_type,
      p_size_bytes,
      p_width_px,
      p_height_px,
      nullif(trim(p_alt_text), ''),
      (select auth.uid()),
      'other'
    )
    returning id into asset_id;
  end if;

  return asset_id;
end;
$$;

revoke all on function public.register_r2_asset(
  text, text, text, text, text, bigint, integer, integer, text
) from public, anon;
grant execute on function public.register_r2_asset(
  text, text, text, text, text, bigint, integer, integer, text
) to authenticated;

create or replace function private.compose_paper_json(p_paper_id uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'paper', (
      select jsonb_build_object(
        'id', paper.id,
        'label', coalesce(paper.label, paper.paper_code),
        'status', paper.status::text,
        'subjectCode', room.subject_code,
        'roomName', room.name,
        'blueprintId', paper.blueprint_id
      )
      from public.exam_room_papers paper
      join public.exam_rooms room on room.id = paper.exam_room_id
      where paper.id = p_paper_id
    ),
    'sections', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'sectionId', section.id,
          'sectionCode', section.section_code,
          'title', section.title,
          'type', section.question_type::text,
          'displayedCount', section.displayed_question_count,
          'placedCount', (
            select count(*)
            from public.exam_room_questions room_question
            where room_question.paper_id = p_paper_id
              and room_question.blueprint_section_id = section.id
          ),
          'questions', coalesce((
            select jsonb_agg(
              jsonb_build_object(
                'questionId', question.id,
                'code', question.code,
                'difficulty', question.difficulty,
                'content', left(question.content, 240),
                'seq', room_question.seq
              ) order by room_question.seq
            )
            from public.exam_room_questions room_question
            join public.questions question on question.id = room_question.question_id
            where room_question.paper_id = p_paper_id
              and room_question.blueprint_section_id = section.id
          ), '[]'::jsonb)
        ) order by section.seq
      )
      from public.exam_blueprint_sections section
      where section.blueprint_id = (
        select paper.blueprint_id
        from public.exam_room_papers paper
        where paper.id = p_paper_id
      )
    ), '[]'::jsonb)
  );
$$;

revoke all on function private.compose_paper_json(uuid)
  from public, anon, authenticated;

create or replace function public.get_paper_composition(p_paper_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;
  return private.compose_paper_json(p_paper_id);
end;
$$;

create or replace function public.compose_add_questions(
  p_paper_id uuid,
  p_question_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  room_id uuid;
  blueprint_id uuid;
  paper_status text;
  subject_code text;
  question_id uuid;
  question_type public.question_type;
  question_subject text;
  section_id uuid;
  next_sequence integer;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select paper.exam_room_id, paper.blueprint_id, paper.status::text, room.subject_code
    into room_id, blueprint_id, paper_status, subject_code
  from public.exam_room_papers paper
  join public.exam_rooms room on room.id = paper.exam_room_id
  where paper.id = p_paper_id;

  if room_id is null then raise exception 'PAPER_NOT_FOUND'; end if;
  if paper_status <> 'draft' then raise exception 'PAPER_IS_IMMUTABLE'; end if;

  foreach question_id in array coalesce(p_question_ids, array[]::uuid[])
  loop
    select question.type, question.subject_code
      into question_type, question_subject
    from public.questions question
    where question.id = question_id
      and question.status = 'approved'
      and question.deleted_at is null;

    if question_type is null or question_subject <> subject_code then
      continue;
    end if;

    if exists (
      select 1 from public.exam_room_questions room_question
      where room_question.paper_id = p_paper_id
        and room_question.question_id = question_id
    ) then
      continue;
    end if;

    select section.id into section_id
    from public.exam_blueprint_sections section
    where section.blueprint_id = blueprint_id
      and section.question_type = question_type
    order by section.seq
    limit 1;

    if section_id is null then continue; end if;

    select coalesce(max(room_question.seq), 0) + 1
      into next_sequence
    from public.exam_room_questions room_question
    where room_question.paper_id = p_paper_id
      and room_question.blueprint_section_id = section_id;

    insert into public.exam_room_questions (
      exam_room_id,
      paper_id,
      blueprint_section_id,
      question_id,
      seq,
      is_required
    ) values (
      room_id,
      p_paper_id,
      section_id,
      question_id,
      next_sequence,
      true
    )
    on conflict do nothing;
  end loop;

  return private.compose_paper_json(p_paper_id);
end;
$$;

create or replace function public.compose_remove_question(
  p_paper_id uuid,
  p_question_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  paper_status text;
begin
  if not private.is_admin() then
    raise exception 'ADMIN_ONLY';
  end if;

  select paper.status::text into paper_status
  from public.exam_room_papers paper
  where paper.id = p_paper_id;

  if paper_status is null then raise exception 'PAPER_NOT_FOUND'; end if;
  if paper_status <> 'draft' then raise exception 'PAPER_IS_IMMUTABLE'; end if;

  delete from public.exam_room_questions
  where paper_id = p_paper_id
    and question_id = p_question_id;

  return private.compose_paper_json(p_paper_id);
end;
$$;

revoke all on function public.get_paper_composition(uuid) from public, anon;
revoke all on function public.compose_add_questions(uuid, uuid[]) from public, anon;
revoke all on function public.compose_remove_question(uuid, uuid) from public, anon;
grant execute on function public.get_paper_composition(uuid) to authenticated;
grant execute on function public.compose_add_questions(uuid, uuid[]) to authenticated;
grant execute on function public.compose_remove_question(uuid, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Minimize executable surface for privileged functions
-- ---------------------------------------------------------------------------

do $$
declare
  function_row record;
begin
  for function_row in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname in ('public', 'private')
      and procedure.prosecdef
  loop
    execute format(
      'revoke execute on function %I.%I(%s) from public, anon',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$$;

-- Internal cron/maintenance entrypoints are not client APIs.
revoke all on function public.expire_overdue_exam_sessions()
  from public, anon, authenticated;

-- Re-grant only the SECURITY DEFINER RPCs intentionally used by signed-in UI.
do $$
declare
  function_row record;
begin
  for function_row in
    select
      namespace.nspname as schema_name,
      procedure.proname as function_name,
      pg_get_function_identity_arguments(procedure.oid) as identity_arguments
    from pg_proc procedure
    join pg_namespace namespace on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname = any(array[
        'activate_exam_key',
        'compose_add_questions',
        'compose_remove_question',
        'create_exam_paper_successor',
        'generate_exam_keys',
        'get_active_exam_session_full',
        'get_active_session',
        'get_exam_results',
        'get_paper_composition',
        'get_pending_essays',
        'get_session_review',
        'get_subjects_dashboard',
        'grade_essay_answer',
        'join_exam',
        'publish_authoring_document',
        'record_session_event',
        'register_r2_asset',
        'start_practice_session',
        'submit_exam_session'
      ])
  loop
    execute format(
      'grant execute on function %I.%I(%s) to authenticated',
      function_row.schema_name,
      function_row.function_name,
      function_row.identity_arguments
    );
  end loop;
end
$$;

notify pgrst, 'reload schema';
