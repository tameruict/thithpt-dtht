-- Canonical room-entry/readiness contract and the reviewed correction for the
-- single published question that previously raised QUESTION_CONTENT_NEEDS_REVIEW.

-- The review workflow writes this action, but the legacy constraint did not
-- allow it. Keep the audit log append-only while making the workflow usable.
alter table public.question_audit_log
  drop constraint if exists question_audit_log_action_check;
alter table public.question_audit_log
  add constraint question_audit_log_action_check
  check (action in ('update', 'status_change', 'delete', 'content_review_applied'));

-- Review and correct MATH-2026-011-III-2. The keyed answer 79,1 and the
-- explanation require the minimum to be -45/8; the imported stem lost the
-- minus sign and one explanation line had unbalanced dollar delimiters.
do $review$
declare
  question_row public.questions%rowtype;
  corrected_content text;
  corrected_explanation text;
begin
  select *
    into question_row
  from public.questions
  where code = 'MATH-2026-011-III-2'
  for update;

  if not found then
    raise exception 'QUESTION_MATH_2026_011_III_2_NOT_FOUND';
  end if;

  corrected_content := replace(
    question_row.content,
    'bằng $\frac{45}{8}$.',
    'bằng $-\frac{45}{8}$.'
  );
  corrected_explanation := replace(
    replace(
      coalesce(question_row.explanation, ''),
      'bằng $\frac{45}{8}$.',
      'bằng $-\frac{45}{8}$.'
    ),
    'Theo đề bài: 2a = -$\frac{45}{8}$$ \Rightarrow a = -$\frac{45}{16}$.',
    'Theo đề bài: $2a = -\frac{45}{8} \Rightarrow a = -\frac{45}{16}$.'
  );

  if question_row.content not like '%bằng $-\frac{45}{8}$.%'
     and corrected_content = question_row.content
  then
    raise exception 'QUESTION_MATH_2026_011_III_2_CONTENT_CHANGED';
  end if;

  if coalesce(question_row.explanation, '')
       not like '%Theo đề bài: $2a = -\frac{45}{8} \Rightarrow a = -\frac{45}{16}$.%'
     and corrected_explanation = coalesce(question_row.explanation, '')
  then
    raise exception 'QUESTION_MATH_2026_011_III_2_EXPLANATION_CHANGED';
  end if;

  update public.questions
  set content = corrected_content,
      explanation = corrected_explanation,
      content_format_version = 2,
      content_quality_status = 'verified',
      updated_at = now()
  where id = question_row.id;

  update public.question_content_reviews
  set status = 'applied',
      reviewed_at = coalesce(reviewed_at, now())
  where question_id = question_row.id
    and status = 'pending';

  if corrected_content is distinct from question_row.content
     or corrected_explanation is distinct from question_row.explanation
  then
    insert into public.question_audit_log (
      question_id,
      changed_by,
      old_data,
      new_data,
      action
    ) values (
      question_row.id,
      null,
      jsonb_build_object(
        'content', question_row.content,
        'explanation', question_row.explanation,
        'content_quality_status', question_row.content_quality_status
      ),
      jsonb_build_object(
        'content', corrected_content,
        'explanation', corrected_explanation,
        'content_quality_status', 'verified'
      ),
      'content_review_applied'
    );
  end if;
end
$review$;

-- Ensure every remaining blocked legacy question is visible in the admin
-- review queue. A null proposal intentionally requires an editor review rather
-- than an automatic content rewrite.
insert into public.question_content_reviews (
  question_id,
  entity_type,
  entity_id,
  field_name,
  original_value,
  proposed_value,
  issue_codes,
  severity,
  status
)
select
  question.id,
  'question',
  question.id,
  'content',
  question.content,
  null,
  array['LEGACY_CONTENT_NEEDS_REVIEW']::text[],
  'error',
  'pending'
from public.questions question
where question.content_quality_status = 'needs_review'
  and question.deleted_at is null
  and not exists (
    select 1
    from public.question_content_reviews review
    where review.question_id = question.id
      and review.status = 'pending'
  );

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
        and coalesce(default_paper.needs_review_count, 0) = 0
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
    when room.mode = 'exam' and coalesce(default_paper.needs_review_count, 0) > 0
      then 'question_content_needs_review'
    when room.mode = 'practice'
      and coalesce(practice_pool.approved_question_count, 0) = 0
      then 'missing_approved_questions'
    else 'ready'
  end as readiness_reason
from public.exam_rooms room
left join lateral (
  select
    room_paper.paper_id,
    count(room_question.question_id)::bigint as question_count,
    count(room_question.question_id) filter (
      where question.content_quality_status = 'needs_review'
    )::bigint as needs_review_count
  from public.room_papers room_paper
  left join public.exam_room_questions room_question
    on room_question.paper_id = room_paper.paper_id
  left join public.questions question
    on question.id = room_question.question_id
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
    and question.content_quality_status <> 'needs_review'
    and question.deleted_at is null
) practice_pool on true;

revoke all on public.v_exam_room_readiness from anon;
grant select on public.v_exam_room_readiness to authenticated;

create or replace function private.enforce_exam_room_publish_readiness()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  default_paper_id uuid;
  question_count integer;
  needs_review_count integer;
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

    select
      count(*)::integer,
      count(*) filter (
        where question.content_quality_status = 'needs_review'
      )::integer
      into question_count, needs_review_count
    from public.exam_room_questions room_question
    join public.questions question on question.id = room_question.question_id
    where room_question.paper_id = default_paper_id;

    if question_count = 0 then
      raise exception 'EXAM_ROOM_MISSING_QUESTIONS';
    end if;
    if needs_review_count > 0 then
      raise exception 'EXAM_ROOM_QUESTION_CONTENT_NEEDS_REVIEW';
    end if;
  else
    select count(*)::integer
      into question_count
    from public.questions question
    where question.subject_code = new.subject_code
      and question.status = 'approved'
      and question.content_quality_status <> 'needs_review'
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

create or replace function private.guard_room_question_content_quality()
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

  if quality_status is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;
  if quality_status = 'needs_review' then
    raise exception 'QUESTION_CONTENT_NEEDS_REVIEW';
  end if;
  return new;
end;
$$;

revoke all on function private.guard_room_question_content_quality()
  from public, anon, authenticated;
drop trigger if exists guard_room_question_content_quality
  on public.exam_room_questions;
create trigger guard_room_question_content_quality
before insert or update of question_id on public.exam_room_questions
for each row execute function private.guard_room_question_content_quality();

-- The canonical three-argument join_exam and practice selection are appended
-- below. Keeping them in active migration history removes the live/replay drift.

drop function if exists public.join_exam(text, text);

create or replace function public.join_exam(
  p_code text,
  p_subject_code text default null::text,
  p_exam_room_id uuid default null::uuid
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
#variable_conflict use_variable
declare
  key_record record;
  session_id uuid;
  student_id uuid;
  subject_code text;
  requested_room_id uuid;
  room_id uuid;
  room_subject_code text;
  paper_id uuid;
  now_at timestamptz := now();
  v_duration integer;
  v_active_session uuid;
  v_active_room uuid;
  room_ready boolean;
  room_readiness_reason text;
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  -- Lưới an toàn: bảo đảm có dòng students trước khi tạo phiên thi. Tài khoản
  -- đăng nhập Google (hoặc tạo trước khi handle_new_user tạo students) chỉ có
  -- dòng profiles -> nếu không sẽ vướng exam_sessions_student_id_fkey bên dưới.
  insert into public.students (id, full_name)
  select pr.id, pr.full_name
  from public.profiles pr
  where pr.id = student_id
  on conflict (id) do nothing;

  if nullif(trim(p_code), '') is null then
    raise exception 'KEY_NOT_FOUND';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');
  requested_room_id := p_exam_room_id;

  select
    key.id,
    key.assigned_to,
    key.total_attempts,
    key.used_attempts,
    key.status,
    key.expires_at
  into key_record
  from public.exam_keys key
  where key.code = upper(trim(p_code))
  for update;

  if not found then
    raise exception 'KEY_NOT_FOUND';
  end if;

  if key_record.status not in ('unused', 'active') then
    raise exception 'KEY_INVALID_STATUS';
  end if;

  if key_record.expires_at is not null and key_record.expires_at < now_at then
    raise exception 'KEY_EXPIRED';
  end if;

  if key_record.assigned_to is not null
    and key_record.assigned_to <> student_id
  then
    raise exception 'KEY_ASSIGNED_TO_OTHER';
  end if;

  if key_record.used_attempts >= key_record.total_attempts then
    raise exception 'KEY_NO_ATTEMPTS_LEFT';
  end if;

  if requested_room_id is not null then
    select
      room.id,
      room.subject_code,
      room.duration_minutes,
      readiness.is_ready,
      readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.id = requested_room_id
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select
      room.id,
      room.subject_code,
      room.duration_minutes,
      readiness.is_ready,
      readiness.readiness_reason
      into room_id, room_subject_code, v_duration, room_ready, room_readiness_reason
    from public.exam_rooms room
    join public.v_exam_room_readiness readiness on readiness.id = room.id
    where room.subject_code = subject_code
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at)
    order by room.published_at desc nulls last, room.created_at desc
    limit 1;
  end if;

  if room_id is null then
    raise exception 'ROOM_NOT_AVAILABLE';
  end if;

  if not coalesce(room_ready, false) then
    if room_readiness_reason = 'question_content_needs_review' then
      raise exception 'QUESTION_CONTENT_NEEDS_REVIEW';
    end if;
    raise exception 'ROOM_NOT_READY';
  end if;

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH';
  end if;

  -- Finalize overdue sessions before deciding whether to resume or block.
  update public.exam_sessions as s
  set status = 'submitted',
      submitted_at = coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ),
      grading_status = 'pending_auto',
      grading_error = null,
      client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
      updated_at = now_at
  from public.exam_rooms rm
  where s.student_id = student_id
    and s.status = 'in_progress'
    and rm.id = s.exam_room_id
    and coalesce(
      s.due_at,
      s.started_at + make_interval(mins => rm.duration_minutes)
    ) <= now_at;

  select s.id, s.exam_room_id
    into v_active_session, v_active_room
  from public.exam_sessions s
  where s.student_id = student_id
    and s.status = 'in_progress'
  order by s.started_at desc
  limit 1;

  if v_active_session is not null then
    if v_active_room = room_id then
      return v_active_session;
    else
      raise exception 'SESSION_ALREADY_ACTIVE';
    end if;
  end if;

  select paper.id
    into paper_id
  from public.exam_room_papers paper
  where paper.exam_room_id = room_id
    and paper.status = 'published'
  order by paper.is_default desc, paper.display_order, paper.created_at
  limit 1;

  if paper_id is null then
    raise exception 'PAPER_NOT_AVAILABLE';
  end if;

  if not exists (
    select 1
    from public.exam_room_questions placement
    where placement.paper_id = paper_id
  ) then
    raise exception 'PAPER_HAS_NO_QUESTIONS';
  end if;

  update public.exam_keys
  set
    assigned_to = student_id,
    used_attempts = used_attempts + 1,
    status = case
      when used_attempts + 1 >= total_attempts
        then 'exhausted'::public.exam_key_status
      else 'active'::public.exam_key_status
    end,
    activated_at = coalesce(activated_at, now_at),
    updated_at = now_at
  where id = key_record.id;

  insert into public.exam_sessions (
    key_id,
    student_id,
    exam_room_id,
    paper_id,
    attempt_number,
    status,
    started_at,
    due_at
  )
  values (
    key_record.id,
    student_id,
    room_id,
    paper_id,
    key_record.used_attempts + 1,
    'in_progress',
    now_at,
    now_at + make_interval(mins => coalesce(v_duration, 50))
  )
  returning id into session_id;

  update public.exam_sessions
  set shuffle_config = jsonb_build_object(
    'version', 1,
    'seed', session_id::text,
    'shuffleQuestions', 'within_difficulty',
    'shuffleOptions', true
  )
  where id = session_id;

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    display_no,
    option_order,
    max_points
  )
  with placements as (
    select
      placement.blueprint_section_id,
      placement.question_id,
      placement.points_override,
      section.seq as section_seq,
      section.max_points_per_question,
      question.type as question_type,
      question.difficulty,
      md5(
        session_id::text || ':' ||
        placement.blueprint_section_id::text || ':' ||
        question.difficulty::text || ':' ||
        placement.question_id::text
      ) as tie_breaker
    from public.exam_room_questions placement
    join public.exam_blueprint_sections section
      on section.id = placement.blueprint_section_id
    join public.questions question
      on question.id = placement.question_id
    where placement.paper_id = paper_id
  ),
  ordered as (
    select
      placements.*,
      row_number() over (
        order by
          placements.section_seq,
          placements.difficulty,
          placements.tie_breaker
      ) as display_seq
    from placements
  )
  select
    session_id,
    ordered.blueprint_section_id,
    ordered.question_id,
    ordered.display_seq,
    ordered.display_seq::text,
    case
      when ordered.question_type = 'multiple_choice' then coalesce(
        (
          select array_agg(option_row.id order by option_row.sort_key)::uuid[]
          from (
            select
              option.id,
              case
                when count(*) over () = 4
                  and not private.has_option_self_reference(ordered.question_id)
                then md5(
                  session_id::text || ':' ||
                  ordered.question_id::text || ':' ||
                  option.id::text
                )
                else lpad(option.seq::text, 4, '0')
              end as sort_key
            from public.question_options option
            where option.question_id = ordered.question_id
          ) option_row
        ),
        '{}'::uuid[]
      )
      else '{}'::uuid[]
    end,
    coalesce(ordered.points_override, ordered.max_points_per_question)
  from ordered
  order by ordered.display_seq;

  update public.students
  set current_key_id = key_record.id,
      updated_at = now_at
  where id = student_id
    and current_key_id is null;

  return session_id;
end;
$function$;

revoke all on function public.join_exam(text, text, uuid)
  from public, anon;

grant execute on function public.join_exam(text, text, uuid)
  to authenticated;

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
      and question.content_quality_status <> 'needs_review'
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

notify pgrst, 'reload schema';
