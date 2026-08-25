alter table public.question_options
  add column if not exists r2_asset_id uuid references public.r2_assets(id) on delete set null,
  add column if not exists image_alt_text text;
create index if not exists idx_question_options_r2_asset
  on public.question_options(r2_asset_id)
  where r2_asset_id is not null;
alter table public.exam_room_papers
  add column if not exists status text not null default 'draft',
  add column if not exists source_paper_id uuid references public.exam_room_papers(id) on delete set null,
  add column if not exists published_at timestamptz;
alter table public.exam_room_papers
  drop constraint if exists exam_room_papers_status_check;
alter table public.exam_room_papers
  add constraint exam_room_papers_status_check
  check (status in ('draft', 'published', 'archived'));
update public.exam_room_papers paper
set
  status = case
    when room.status = 'published' then 'published'
    else 'draft'
  end,
  published_at = case
    when room.status = 'published' then coalesce(paper.published_at, paper.created_at)
    else paper.published_at
  end
from public.exam_rooms room
where room.id = paper.exam_room_id;
create index if not exists idx_exam_room_papers_status
  on public.exam_room_papers(exam_room_id, status, is_default);
alter table public.exam_room_questions
  add column if not exists paper_id uuid references public.exam_room_papers(id) on delete cascade;
update public.exam_room_questions placement
set paper_id = coalesce(
  (
    select paper.id
    from public.exam_room_papers paper
    where paper.exam_room_id = placement.exam_room_id
      and paper.is_default
    order by paper.created_at
    limit 1
  ),
  (
    select paper.id
    from public.exam_room_papers paper
    where paper.exam_room_id = placement.exam_room_id
    order by paper.created_at
    limit 1
  )
)
where placement.paper_id is null;
alter table public.exam_room_questions
  alter column paper_id set not null;
alter table public.exam_room_questions
  drop constraint if exists exam_room_questions_pkey,
  drop constraint if exists exam_room_questions_exam_room_id_question_id_key;
alter table public.exam_room_questions
  add constraint exam_room_questions_pkey
    primary key (paper_id, blueprint_section_id, seq),
  add constraint exam_room_questions_paper_question_key
    unique (paper_id, question_id);
create index if not exists idx_exam_room_questions_paper
  on public.exam_room_questions(paper_id, blueprint_section_id, seq);
create or replace function private.ensure_exam_room_question_matches_blueprint()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  paper_record record;
  section_record record;
  question_record record;
begin
  select paper.exam_room_id, paper.blueprint_id, room.subject_code
    into paper_record
  from public.exam_room_papers paper
  join public.exam_rooms room on room.id = paper.exam_room_id
  where paper.id = new.paper_id;

  if paper_record.exam_room_id is null then
    raise exception 'PAPER_NOT_FOUND';
  end if;

  if new.exam_room_id <> paper_record.exam_room_id then
    raise exception 'PAPER_ROOM_MISMATCH';
  end if;

  select section.blueprint_id, section.question_type
    into section_record
  from public.exam_blueprint_sections section
  where section.id = new.blueprint_section_id;

  if section_record.blueprint_id is null then
    raise exception 'BLUEPRINT_SECTION_NOT_FOUND';
  end if;

  select question.subject_code, question.type
    into question_record
  from public.questions question
  where question.id = new.question_id;

  if question_record.subject_code is null then
    raise exception 'QUESTION_NOT_FOUND';
  end if;

  if section_record.blueprint_id <> paper_record.blueprint_id then
    raise exception 'SECTION_PAPER_BLUEPRINT_MISMATCH';
  end if;

  if question_record.subject_code <> paper_record.subject_code then
    raise exception 'QUESTION_PAPER_SUBJECT_MISMATCH';
  end if;

  if question_record.type <> section_record.question_type then
    raise exception 'QUESTION_SECTION_TYPE_MISMATCH';
  end if;

  return new;
end;
$$;
drop trigger if exists trg_exam_sessions_populate_questions on public.exam_sessions;
drop function if exists public.trg_populate_session_questions();
create table if not exists public.exam_authoring_documents (
  id uuid primary key default extensions.gen_random_uuid(),
  mode text not null check (mode in ('question', 'paper')),
  title text not null,
  subject_code text not null references public.subjects(code) on delete restrict,
  paper_id uuid references public.exam_room_papers(id) on delete restrict,
  materialized_question_id uuid references public.questions(id) on delete set null,
  latex_source text not null default '',
  revision bigint not null default 1 check (revision > 0),
  published_revision bigint,
  created_by uuid not null references public.profiles(id) on delete restrict,
  updated_by uuid not null references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  constraint exam_authoring_documents_target_check check (
    (mode = 'question' and paper_id is null)
    or (mode = 'paper' and paper_id is not null)
  )
);
create unique index if not exists uq_exam_authoring_documents_paper
  on public.exam_authoring_documents(paper_id)
  where paper_id is not null;
create index if not exists idx_exam_authoring_documents_updated
  on public.exam_authoring_documents(updated_at desc);
create index if not exists idx_exam_authoring_documents_subject
  on public.exam_authoring_documents(subject_code, mode);
drop trigger if exists trg_exam_authoring_documents_updated_at
  on public.exam_authoring_documents;
create trigger trg_exam_authoring_documents_updated_at
  before update on public.exam_authoring_documents
  for each row execute function private.touch_updated_at();
alter table public.exam_authoring_documents enable row level security;
drop policy if exists authoring_documents_staff_read
  on public.exam_authoring_documents;
create policy authoring_documents_staff_read
  on public.exam_authoring_documents
  for select to authenticated
  using (private.is_staff());
drop policy if exists authoring_documents_staff_write
  on public.exam_authoring_documents;
create policy authoring_documents_staff_write
  on public.exam_authoring_documents
  for all to authenticated
  using (private.is_staff())
  with check (
    private.is_staff()
    and updated_by = (select auth.uid())
  );
revoke all on table public.exam_authoring_documents from public, anon;
grant select, insert, update, delete
  on table public.exam_authoring_documents to authenticated, service_role;
create or replace function public.create_exam_paper_successor(p_source_paper_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  source_paper public.exam_room_papers%rowtype;
  successor_id uuid;
begin
  if not private.is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  select *
    into source_paper
  from public.exam_room_papers
  where id = p_source_paper_id
  for update;

  if not found then
    raise exception 'PAPER_NOT_FOUND';
  end if;

  if source_paper.status = 'draft' then
    return source_paper.id;
  end if;

  insert into public.exam_room_papers (
    exam_room_id,
    blueprint_id,
    paper_code,
    label,
    is_default,
    display_order,
    status,
    source_paper_id
  )
  values (
    source_paper.exam_room_id,
    source_paper.blueprint_id,
    source_paper.paper_code || '_DRAFT_' ||
      upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 8)),
    coalesce(source_paper.label, source_paper.paper_code) || ' - draft',
    false,
    source_paper.display_order,
    'draft',
    source_paper.id
  )
  returning id into successor_id;

  return successor_id;
end;
$$;
revoke all on function public.create_exam_paper_successor(uuid)
  from public, anon;
grant execute on function public.create_exam_paper_successor(uuid)
  to authenticated;
create or replace function private.resolve_authoring_image(p_image jsonb)
returns public.r2_assets
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  asset public.r2_assets%rowtype;
  image_url text := nullif(trim(p_image ->> 'url'), '');
  image_alt text := nullif(trim(p_image ->> 'alt'), '');
begin
  if not private.is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  if image_url is null or image_alt is null then
    raise exception 'IMAGE_URL_AND_ALT_REQUIRED';
  end if;

  if image_url !~ '^https://'
    or position('?' in image_url) > 0
    or position('#' in image_url) > 0
  then
    raise exception 'IMAGE_URL_MUST_BE_STABLE_HTTPS';
  end if;

  select *
    into asset
  from public.r2_assets
  where public_url = image_url;

  if not found then
    raise exception 'IMAGE_NOT_REGISTERED';
  end if;

  if asset.content_type not in (
    'image/png',
    'image/jpeg',
    'image/webp',
    'image/avif'
  ) then
    raise exception 'IMAGE_CONTENT_TYPE_NOT_ALLOWED';
  end if;

  if asset.size_bytes is null or asset.size_bytes > 10485760 then
    raise exception 'IMAGE_SIZE_NOT_ALLOWED';
  end if;

  return asset;
end;
$$;
revoke all on function private.resolve_authoring_image(jsonb)
  from public, anon;
grant execute on function private.resolve_authoring_image(jsonb)
  to authenticated;
create or replace function public.save_authoring_document(
  p_document_id uuid,
  p_expected_revision bigint,
  p_latex_source text
)
returns table (
  id uuid,
  revision bigint,
  updated_at timestamptz
)
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if not private.is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  return query
  update public.exam_authoring_documents document
  set
    latex_source = p_latex_source,
    revision = document.revision + 1,
    updated_by = (select auth.uid())
  where document.id = p_document_id
    and document.revision = p_expected_revision
  returning document.id, document.revision, document.updated_at;

  if not found then
    raise exception 'AUTHORING_REVISION_CONFLICT';
  end if;
end;
$$;
revoke all on function public.save_authoring_document(uuid, bigint, text)
  from public, anon;
grant execute on function public.save_authoring_document(uuid, bigint, text)
  to authenticated;
create or replace function public.publish_authoring_document(
  p_document_id uuid,
  p_expected_revision bigint,
  p_payload jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
#variable_conflict use_variable
declare
  document public.exam_authoring_documents%rowtype;
  paper public.exam_room_papers%rowtype;
  question_payload jsonb;
  option_payload jsonb;
  item_payload jsonb;
  rubric_payload jsonb;
  image_payload jsonb;
  image_asset public.r2_assets%rowtype;
  question_id uuid;
  option_id uuid;
  item_id uuid;
  section_id uuid;
  question_code text;
  question_type public.question_type;
  question_seq integer := 0;
  option_seq integer;
  item_seq integer;
  correct_count integer;
  result_question_ids jsonb := '[]'::jsonb;
begin
  if not private.is_staff() then
    raise exception 'STAFF_REQUIRED';
  end if;

  select *
    into document
  from public.exam_authoring_documents
  where id = p_document_id
  for update;

  if not found then
    raise exception 'AUTHORING_DOCUMENT_NOT_FOUND';
  end if;

  if document.revision <> p_expected_revision then
    raise exception 'AUTHORING_REVISION_CONFLICT';
  end if;

  if p_payload ->> 'mode' <> document.mode
    or upper(p_payload ->> 'subjectCode') <> document.subject_code
  then
    raise exception 'AUTHORING_DOCUMENT_PAYLOAD_MISMATCH';
  end if;

  if jsonb_typeof(p_payload -> 'questions') <> 'array'
    or jsonb_array_length(p_payload -> 'questions') = 0
  then
    raise exception 'AUTHORING_QUESTIONS_REQUIRED';
  end if;

  if document.mode = 'question'
    and jsonb_array_length(p_payload -> 'questions') <> 1
  then
    raise exception 'SINGLE_QUESTION_MODE_REQUIRES_ONE_QUESTION';
  end if;

  if document.mode = 'paper' then
    select *
      into paper
    from public.exam_room_papers
    where id = document.paper_id
    for update;

    if not found then
      raise exception 'PAPER_NOT_FOUND';
    end if;

    if paper.status <> 'draft' then
      raise exception 'PAPER_IS_IMMUTABLE';
    end if;

    delete from public.exam_room_questions
    where paper_id = paper.id;
  end if;

  for question_payload in
    select value from jsonb_array_elements(p_payload -> 'questions')
  loop
    question_seq := question_seq + 1;
    question_id := extensions.gen_random_uuid();
    question_type := (question_payload ->> 'type')::public.question_type;
    question_code := nullif(upper(trim(question_payload ->> 'code')), '');

    if question_code is null then
      question_code := document.subject_code || '_' ||
        upper(substr(replace(question_id::text, '-', ''), 1, 12));
    end if;

    if nullif(trim(question_payload ->> 'content'), '') is null
      and question_payload -> 'image' is null
    then
      raise exception 'QUESTION_CONTENT_OR_IMAGE_REQUIRED';
    end if;

    image_payload := question_payload -> 'image';
    if image_payload is not null and image_payload <> 'null'::jsonb then
      image_asset := private.resolve_authoring_image(image_payload);
    else
      image_asset := null;
    end if;

    correct_count := case
      when question_type = 'multiple_choice' then (
        select count(*)::integer
        from jsonb_array_elements(
          coalesce(question_payload -> 'options', '[]'::jsonb)
        ) option_row
        where coalesce((option_row ->> 'correct')::boolean, false)
      )
      else 1
    end;

    if question_type = 'multiple_choice' and correct_count < 1 then
      raise exception 'MULTIPLE_CHOICE_CORRECT_OPTION_REQUIRED';
    end if;

    insert into public.questions (
      id,
      code,
      subject_code,
      type,
      difficulty,
      content,
      explanation,
      image_url,
      status,
      source_label,
      metadata,
      created_by,
      reviewed_by,
      reviewed_at,
      mc_select_count
    )
    values (
      question_id,
      question_code,
      document.subject_code,
      question_type,
      coalesce((question_payload ->> 'difficulty')::smallint, 2),
      coalesce(question_payload ->> 'content', ''),
      nullif(trim(question_payload ->> 'explanation'), ''),
      case when image_asset.id is null then null else image_asset.public_url end,
      'approved',
      'authoring:' || document.id::text,
      jsonb_build_object(
        'authoring_document_id', document.id,
        'authoring_revision', document.revision
      ),
      (select auth.uid()),
      (select auth.uid()),
      now(),
      greatest(correct_count, 1)
    );

    if image_asset.id is not null then
      insert into public.question_assets (
        question_id,
        kind,
        url,
        alt_text,
        display_order,
        r2_asset_id
      )
      values (
        question_id,
        'image',
        image_asset.public_url,
        trim(image_payload ->> 'alt'),
        0,
        image_asset.id
      );

      update public.r2_assets
      set linked_to_type = 'question',
          linked_to_id = question_id,
          alt_text = coalesce(nullif(alt_text, ''), trim(image_payload ->> 'alt'))
      where id = image_asset.id;
    end if;

    if question_type = 'multiple_choice' then
      option_seq := 0;

      if jsonb_array_length(coalesce(question_payload -> 'options', '[]'::jsonb)) < 2 then
        raise exception 'MULTIPLE_CHOICE_REQUIRES_OPTIONS';
      end if;

      for option_payload in
        select value
        from jsonb_array_elements(question_payload -> 'options')
      loop
        option_seq := option_seq + 1;
        option_id := extensions.gen_random_uuid();
        image_payload := option_payload -> 'image';

        if nullif(trim(option_payload ->> 'content'), '') is null
          and (image_payload is null or image_payload = 'null'::jsonb)
        then
          raise exception 'OPTION_CONTENT_OR_IMAGE_REQUIRED';
        end if;

        if image_payload is not null and image_payload <> 'null'::jsonb then
          image_asset := private.resolve_authoring_image(image_payload);
        else
          image_asset := null;
        end if;

        insert into public.question_options (
          id,
          question_id,
          seq,
          label,
          content,
          image_url,
          r2_asset_id,
          image_alt_text
        )
        values (
          option_id,
          question_id,
          option_seq,
          coalesce(
            nullif(upper(trim(option_payload ->> 'label')), ''),
            chr(64 + option_seq)
          ),
          coalesce(option_payload ->> 'content', ''),
          case when image_asset.id is null then null else image_asset.public_url end,
          image_asset.id,
          case
            when image_asset.id is null then null
            else trim(image_payload ->> 'alt')
          end
        );

        if coalesce((option_payload ->> 'correct')::boolean, false) then
          insert into public.question_correct_options(question_id, option_id)
          values (question_id, option_id);
        end if;

        if image_asset.id is not null then
          update public.r2_assets
          set linked_to_type = 'question_option',
              linked_to_id = option_id,
              alt_text = coalesce(nullif(alt_text, ''), trim(image_payload ->> 'alt'))
          where id = image_asset.id;
        end if;
      end loop;
    elsif question_type = 'true_false' then
      item_seq := 0;

      for item_payload in
        select value
        from jsonb_array_elements(
          coalesce(question_payload -> 'trueFalseItems', '[]'::jsonb)
        )
      loop
        item_seq := item_seq + 1;
        item_id := extensions.gen_random_uuid();

        insert into public.question_true_false_items (
          id,
          question_id,
          seq,
          label,
          content
        )
        values (
          item_id,
          question_id,
          item_seq,
          coalesce(nullif(trim(item_payload ->> 'label'), ''), chr(96 + item_seq)),
          trim(item_payload ->> 'content')
        );

        insert into public.question_true_false_answer_keys (
          question_id,
          item_id,
          correct_value
        )
        values (
          question_id,
          item_id,
          (item_payload ->> 'correct')::boolean
        );
      end loop;

      if item_seq = 0 then
        raise exception 'TRUE_FALSE_ITEMS_REQUIRED';
      end if;
    elsif question_type = 'short_answer' then
      if nullif(trim(question_payload ->> 'answer'), '') is null then
        raise exception 'SHORT_ANSWER_KEY_REQUIRED';
      end if;

      insert into public.question_short_answer_keys (
        question_id,
        normalized_text,
        answer_type,
        display_value,
        is_primary
      )
      values (
        question_id,
        trim(question_payload ->> 'answer'),
        'text',
        trim(question_payload ->> 'answer'),
        true
      );
    elsif question_type = 'essay' then
      item_seq := 0;
      for rubric_payload in
        select value
        from jsonb_array_elements(
          coalesce(question_payload -> 'rubric', '[]'::jsonb)
        )
      loop
        item_seq := item_seq + 1;
        insert into public.question_essay_rubric_items (
          question_id,
          seq,
          title,
          max_points,
          description
        )
        values (
          question_id,
          item_seq,
          trim(rubric_payload ->> 'title'),
          (rubric_payload ->> 'points')::numeric,
          nullif(trim(rubric_payload ->> 'description'), '')
        );
      end loop;
    end if;

    if document.mode = 'paper' then
      select section.id
        into section_id
      from public.exam_blueprint_sections section
      where section.blueprint_id = paper.blueprint_id
        and section.question_type = question_type
        and (
          nullif(upper(trim(question_payload ->> 'section')), '') is null
          or section.section_code =
            upper(trim(question_payload ->> 'section'))
        )
      order by section.seq
      limit 1;

      if section_id is null then
        raise exception 'PAPER_SECTION_NOT_FOUND_FOR_QUESTION';
      end if;

      insert into public.exam_room_questions (
        exam_room_id,
        paper_id,
        blueprint_section_id,
        question_id,
        seq,
        is_required
      )
      values (
        paper.exam_room_id,
        paper.id,
        section_id,
        question_id,
        question_seq,
        true
      );
    end if;

    result_question_ids := result_question_ids || to_jsonb(question_id);
  end loop;

  if document.mode = 'paper' then
    update public.exam_room_papers
    set is_default = false
    where exam_room_id = paper.exam_room_id
      and id <> paper.id
      and is_default;

    update public.exam_room_papers
    set status = 'published',
        is_default = true,
        published_at = now()
    where id = paper.id;
  end if;

  update public.exam_authoring_documents
  set
    published_revision = revision,
    published_at = now(),
    materialized_question_id = case
      when mode = 'question' then (result_question_ids ->> 0)::uuid
      else materialized_question_id
    end,
    updated_by = (select auth.uid())
  where id = document.id;

  return jsonb_build_object(
    'documentId', document.id,
    'revision', document.revision,
    'paperId', document.paper_id,
    'questionIds', result_question_ids
  );
end;
$$;
revoke all on function public.publish_authoring_document(uuid, bigint, jsonb)
  from public, anon;
grant execute on function public.publish_authoring_document(uuid, bigint, jsonb)
  to authenticated;
create or replace function public.join_exam(
  p_code text,
  p_subject_code text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  key_record record;
  session_id uuid;
  student_id uuid;
  subject_code text;
  room_id uuid;
  room_subject_code text;
  paper_id uuid;
  now_at timestamptz := now();
begin
  student_id := (select auth.uid());

  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  subject_code := nullif(upper(trim(p_subject_code)), '');

  select
    key.id,
    key.exam_room_id,
    key.paper_id,
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

  if key_record.paper_id is not null then
    select room.id, room.subject_code, paper.id
      into room_id, room_subject_code, paper_id
    from public.exam_room_papers paper
    join public.exam_rooms room on room.id = paper.exam_room_id
    where paper.id = key_record.paper_id
      and paper.status = 'published'
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  elsif key_record.exam_room_id is not null then
    select room.id, room.subject_code
      into room_id, room_subject_code
    from public.exam_rooms room
    where room.id = key_record.exam_room_id
      and room.status = 'published'
      and (room.starts_at is null or room.starts_at <= now_at)
      and (room.ends_at is null or room.ends_at > now_at);
  else
    if subject_code is null then
      raise exception 'SUBJECT_REQUIRED';
    end if;

    select room.id, room.subject_code
      into room_id, room_subject_code
    from public.exam_rooms room
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

  if subject_code is not null and room_subject_code <> subject_code then
    raise exception 'KEY_SUBJECT_MISMATCH';
  end if;

  if paper_id is null then
    select paper.id
      into paper_id
    from public.exam_room_papers paper
    where paper.exam_room_id = room_id
      and paper.status = 'published'
    order by paper.is_default desc, paper.display_order, paper.created_at
    limit 1;
  end if;

  if paper_id is null then
    raise exception 'PAPER_NOT_AVAILABLE';
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
    status
  )
  values (
    key_record.id,
    student_id,
    room_id,
    paper_id,
    key_record.used_attempts + 1,
    'in_progress'
  )
  returning id into session_id;

  insert into public.exam_session_questions (
    session_id,
    blueprint_section_id,
    question_id,
    question_seq,
    max_points
  )
  select
    session_id,
    placement.blueprint_section_id,
    placement.question_id,
    placement.seq,
    coalesce(placement.points_override, section.max_points_per_question)
  from public.exam_room_questions placement
  join public.exam_blueprint_sections section
    on section.id = placement.blueprint_section_id
  where placement.paper_id = paper_id
  order by placement.seq;

  update public.students
  set current_key_id = key_record.id,
      updated_at = now_at
  where id = student_id
    and current_key_id is null;

  return session_id;
end;
$$;
revoke all on function public.join_exam(text, text)
  from public, anon;
grant execute on function public.join_exam(text, text)
  to authenticated;
comment on table public.exam_authoring_documents is
  'Autosaved LaTeX sources for staff authoring. Publishing materializes normalized exam data atomically.';
comment on column public.question_options.r2_asset_id is
  'Registry entry for the stable public R2 image used by this option.';
comment on column public.question_options.image_alt_text is
  'Accessible alternative text for the option image.';
notify pgrst, 'reload schema';
