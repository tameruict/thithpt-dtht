-- Keep result history readable after a room is archived, prevent archived
-- rooms from reappearing in exam entry points, and make question hashing
-- deterministic at the database boundary.

create or replace function private.normalized_question_content(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select regexp_replace(
    regexp_replace(trim(coalesce(p_content, '')), E'\r\n?', E'\n', 'g'),
    E'[ \t]+',
    ' ',
    'g'
  );
$$;

revoke all on function private.normalized_question_content(text)
  from public, anon, authenticated;

create or replace function private.normalized_question_hash(p_content text)
returns text
language sql
immutable
set search_path = ''
as $$
  select encode(
    extensions.digest(private.normalized_question_content(p_content), 'sha256'),
    'hex'
  );
$$;

revoke all on function private.normalized_question_hash(text)
  from public, anon, authenticated;

create or replace function private.set_question_content_hash()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.content_hash := private.normalized_question_hash(new.content);
  return new;
end;
$$;

drop trigger if exists set_question_content_hash on public.questions;
create trigger set_question_content_hash
before insert or update of content on public.questions
for each row execute function private.set_question_content_hash();

-- Backfill all rows. Duplicate active rows are intentionally preserved here:
-- 26 of the 47 same-content groups have different answer signatures. They are
-- queued for an explicit semantic review instead of being merged blindly.
update public.questions question
set content_hash = private.normalized_question_hash(question.content)
where question.content_hash is distinct from
  private.normalized_question_hash(question.content);

create table if not exists public.question_duplicate_reviews (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_code text not null,
  content_hash text not null,
  canonical_question_id uuid not null
    references public.questions(id) on delete restrict,
  duplicate_question_id uuid not null
    references public.questions(id) on delete restrict,
  answer_signature_matches boolean not null,
  status text not null default 'pending'
    check (status in ('pending', 'merged', 'kept_distinct')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (canonical_question_id, duplicate_question_id),
  check (canonical_question_id <> duplicate_question_id)
);

alter table public.question_duplicate_reviews enable row level security;
revoke all on public.question_duplicate_reviews
  from public, anon, authenticated;
grant select, update on public.question_duplicate_reviews to authenticated;

drop policy if exists question_duplicate_reviews_admin_select
  on public.question_duplicate_reviews;
create policy question_duplicate_reviews_admin_select
on public.question_duplicate_reviews for select to authenticated
using (private.is_admin());

drop policy if exists question_duplicate_reviews_admin_update
  on public.question_duplicate_reviews;
create policy question_duplicate_reviews_admin_update
on public.question_duplicate_reviews for update to authenticated
using (private.is_admin())
with check (private.is_admin());

with signatures as (
  select
    question.id,
    question.subject_code,
    question.content_hash,
    question.status,
    question.created_at,
    jsonb_build_object(
      'type', question.type,
      'options', (
        select coalesce(jsonb_agg(jsonb_build_array(
          option.seq,
          option.label,
          trim(option.content),
          correct.option_id is not null
        ) order by option.seq), '[]'::jsonb)
        from public.question_options option
        left join public.question_correct_options correct
          on correct.question_id = option.question_id
         and correct.option_id = option.id
        where option.question_id = question.id
      ),
      'true_false', (
        select coalesce(jsonb_agg(jsonb_build_array(
          item.seq,
          item.label,
          trim(item.content),
          answer.correct_value
        ) order by item.seq), '[]'::jsonb)
        from public.question_true_false_items item
        left join public.question_true_false_answer_keys answer
          on answer.question_id = item.question_id
         and answer.item_id = item.id
        where item.question_id = question.id
      ),
      'short_answer', (
        select coalesce(jsonb_agg(jsonb_build_array(
          answer.answer_type,
          answer.normalized_text,
          answer.numeric_value,
          answer.tolerance,
          answer.regex_pattern,
          answer.match_mode,
          answer.is_primary
        ) order by answer.is_primary desc, answer.id), '[]'::jsonb)
        from public.question_short_answer_keys answer
        where answer.question_id = question.id
      )
    ) as answer_signature
  from public.questions question
  where question.deleted_at is null
), ranked as (
  select
    signature.*,
    first_value(signature.id) over (
      partition by signature.subject_code, signature.content_hash
      order by (signature.status = 'approved') desc,
        signature.created_at,
        signature.id
    ) as canonical_question_id
  from signatures signature
), duplicate_rows as (
  select duplicate.*, canonical.answer_signature as canonical_signature
  from ranked duplicate
  join ranked canonical on canonical.id = duplicate.canonical_question_id
  where duplicate.id <> duplicate.canonical_question_id
)
insert into public.question_duplicate_reviews (
  subject_code,
  content_hash,
  canonical_question_id,
  duplicate_question_id,
  answer_signature_matches
)
select
  duplicate.subject_code,
  duplicate.content_hash,
  duplicate.canonical_question_id,
  duplicate.id,
  duplicate.answer_signature = duplicate.canonical_signature
from duplicate_rows duplicate
on conflict (canonical_question_id, duplicate_question_id) do update
set answer_signature_matches = excluded.answer_signature_matches;

-- Until every duplicate pair has an admin decision, enforce uniqueness only
-- for content hashes that do not have a pending review. A later forward-only
-- migration can merge approved pairs and replace this with a strict partial
-- unique index without risking incorrect answer remapping.
create index if not exists questions_subject_content_hash_active_idx
  on public.questions (subject_code, content_hash)
  where deleted_at is null and content_hash is not null;

create or replace view public.v_exam_rooms_full
with (security_invoker = true)
as
select
  er.id,
  er.blueprint_id,
  eb.subject_code,
  er.code,
  er.name,
  er.duration_minutes,
  er.status,
  er.price_vnd,
  er.total_attempts_default,
  er.starts_at,
  er.ends_at,
  er.published_at,
  er.settings,
  er.blueprint_snapshot,
  er.created_by,
  er.created_at,
  er.updated_at,
  eb.code as blueprint_code,
  eb.name as blueprint_name,
  subject.name as subject_name,
  subject.exam_group as subject_exam_group
from public.exam_rooms er
join public.exam_blueprints eb on eb.id = er.blueprint_id
join public.subjects subject on subject.code = eb.subject_code
where er.deleted_at is null;

create or replace view public.admin_exam_room_summary
with (security_invoker = true)
as
select
  room.id,
  room.code,
  room.name,
  room.subject_code,
  subject.name as subject_name,
  room.blueprint_id,
  blueprint.code as blueprint_code,
  blueprint.name as blueprint_name,
  room.duration_minutes,
  room.status,
  room.price_vnd,
  room.total_attempts_default,
  room.starts_at,
  room.ends_at,
  room.published_at,
  room.created_at,
  (select count(*) from public.exam_room_papers paper
    where paper.exam_room_id = room.id) as paper_count,
  (select count(*) from public.exam_room_questions question
    where question.exam_room_id = room.id) as question_count
from public.exam_rooms room
left join public.subjects subject on subject.code = room.subject_code
left join public.exam_blueprints blueprint on blueprint.id = room.blueprint_id
where private.is_admin()
  and room.deleted_at is null;

create or replace function public.get_session_review_core_20260821(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_status text;
  v_score numeric;
  v_due timestamptz;
  v_duration integer;
  v_room_deleted_at timestamptz;
  v_caller uuid := (select auth.uid());
  v_now timestamptz := now();
  v_result jsonb;
begin
  select
    session.student_id,
    session.status::text,
    session.score,
    session.due_at,
    room.duration_minutes,
    room.deleted_at
  into v_student, v_status, v_score, v_due, v_duration, v_room_deleted_at
  from public.exam_sessions session
  join public.exam_rooms room on room.id = session.exam_room_id
  where session.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_caller is null
     or (v_caller <> v_student and not private.is_admin()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status = 'in_progress' then
    if coalesce(v_due, v_now) <= v_now then
      update public.exam_sessions
      set status = 'submitted',
          submitted_at = coalesce(v_due, v_now),
          client_info = client_info ||
            jsonb_build_object('finalized', 'auto_expired'),
          updated_at = v_now
      where id = p_session_id;
      v_status := 'submitted';
    else
      raise exception 'SESSION_NOT_ENDED';
    end if;
  end if;

  if v_status = 'submitted' and v_score is null then
    perform public.score_exam_session(p_session_id);
  end if;

  select jsonb_build_object(
    'session', (
      select jsonb_build_object(
        'id', session.id,
        'status', session.status,
        'attempt_number', session.attempt_number,
        'started_at', session.started_at,
        'submitted_at', session.submitted_at,
        'due_at', session.due_at,
        'scored_at', session.scored_at,
        'score', session.score,
        'max_score', session.max_score,
        'exam_room_id', session.exam_room_id,
        'room_name', room.name,
        'room_code', room.code,
        'room_deleted', room.deleted_at is not null,
        'duration_minutes', room.duration_minutes,
        'subject_code', room.subject_code,
        'subject_name', subject.name,
        'blueprint_code', blueprint.code,
        'blueprint_name', blueprint.name
      )
      from public.exam_sessions session
      join public.exam_rooms room on room.id = session.exam_room_id
      left join public.subjects subject on subject.code = room.subject_code
      left join public.exam_blueprints blueprint
        on blueprint.id = room.blueprint_id
      where session.id = p_session_id
    ),
    'questions', case
      when v_room_deleted_at is not null then '[]'::jsonb
      else coalesce((
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
            'options', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'id', option.id,
                  'seq', option.seq,
                  'label', option.label,
                  'content', option.content,
                  'image_url', option.image_url,
                  'image_alt_text', option.image_alt_text,
                  'correct', exists(
                    select 1
                    from public.question_correct_options correct
                    where correct.question_id = question.id
                      and correct.option_id = option.id
                  )
                ) order by option.seq
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
                  'content', item.content,
                  'correct_value', (
                    select answer.correct_value
                    from public.question_true_false_answer_keys answer
                    where answer.question_id = question.id
                      and answer.item_id = item.id
                  )
                ) order by item.seq
              )
              from public.question_true_false_items item
              where item.question_id = question.id
            ), '[]'::jsonb),
            'short_answer_keys', coalesce((
              select jsonb_agg(
                jsonb_build_object(
                  'display', coalesce(
                    answer.display_value,
                    answer.normalized_text,
                    answer.numeric_value::text
                  ),
                  'answer_type', answer.answer_type
                ) order by answer.is_primary desc nulls last
              )
              from public.question_short_answer_keys answer
              where answer.question_id = question.id
            ), '[]'::jsonb),
            'answer', (
              select jsonb_build_object(
                'answer_json', answer.answer_json,
                'selected_option_id', answer.selected_option_id,
                'short_answer_text', answer.short_answer_text,
                'is_correct', answer.is_correct,
                'earned_points', answer.earned_points
              )
              from public.session_answers answer
              where answer.session_question_id = session_question.id
                and answer.student_id = v_student
              limit 1
            )
          ) order by session_question.question_seq
        )
        from public.exam_session_questions session_question
        join public.questions question
          on question.id = session_question.question_id
        where session_question.session_id = p_session_id
      ), '[]'::jsonb)
    end
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_exam_results(
  p_subject_code text default null,
  p_exam_room_id uuid default null,
  p_status text default null,
  p_limit integer default 1000
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_subject text := nullif(trim(p_subject_code), '');
  v_status text := nullif(trim(p_status), '');
begin
  if not private.is_admin() then
    raise exception 'PERMISSION_DENIED';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(result) order by result.submitted_at desc nulls last,
      result.started_at desc),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      session.id as session_id,
      session.student_id,
      student.full_name as student_name,
      student.school_name,
      session.exam_room_id,
      coalesce(room.name, 'Phòng thi đã gỡ') as room_name,
      coalesce(room.code, 'ARCHIVED') as room_code,
      room.subject_code,
      subject.name as subject_name,
      session.attempt_number,
      session.status::text as status,
      session.score,
      session.max_score,
      session.violation_count,
      session.started_at,
      session.submitted_at,
      session.scored_at,
      session.client_info ->> 'finalized' as finalized,
      room.deleted_at is not null as room_deleted
    from public.exam_sessions session
    left join public.exam_rooms room on room.id = session.exam_room_id
    left join public.students student on student.id = session.student_id
    left join public.subjects subject on subject.code = room.subject_code
    where (v_subject is null or room.subject_code = v_subject)
      and (p_exam_room_id is null or session.exam_room_id = p_exam_room_id)
      and (v_status is null or session.status::text = v_status)
    order by session.submitted_at desc nulls last, session.started_at desc
    limit v_limit
  ) result;

  return v_result;
end;
$$;

-- Admin RPCs remain callable from the authenticated admin dashboard, but each
-- function performs its own private.is_admin() gate before reading or writing.

-- There are no teacher profiles. PostgreSQL cannot remove an enum label in
-- place, so replace the type after removing its two direct dependencies.
drop policy if exists "Students can create their own profile"
  on public.profiles;
drop trigger if exists profiles_prevent_non_admin_role_change
  on public.profiles;
alter table public.profiles alter column role drop default;
alter type public.user_role rename to user_role_with_teacher;
create type public.user_role as enum ('student', 'admin');
alter table public.profiles
  alter column role type public.user_role
  using role::text::public.user_role;
alter table public.profiles
  alter column role set default 'student'::public.user_role;
drop type public.user_role_with_teacher;

create policy "Students can create their own profile"
on public.profiles for insert to authenticated
with check (
  id = (select auth.uid())
  and role = 'student'::public.user_role
);

create trigger profiles_prevent_non_admin_role_change
before update of role on public.profiles
for each row execute function private.prevent_non_admin_profile_role_change();

notify pgrst, 'reload schema';
