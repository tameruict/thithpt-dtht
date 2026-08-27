create table public.exam_room_generation_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  blueprint_section_id uuid not null references public.exam_blueprint_sections(id) on delete cascade,
  selection_mode text not null default 'manual'
    check (selection_mode in ('manual', 'random_from_bank', 'hybrid')),
  difficulty_distribution jsonb not null default '{}'::jsonb,
  knowledge_distribution jsonb not null default '{}'::jsonb,
  question_filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (exam_room_id, blueprint_section_id)
);
create table public.key_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  quantity int not null check (quantity > 0),
  note text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create table public.exam_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  batch_id uuid references public.key_batches(id) on delete set null,
  assigned_to uuid references public.students(id) on delete set null,
  total_attempts int not null default 3 check (total_attempts > 0),
  used_attempts int not null default 0 check (used_attempts >= 0),
  status public.exam_key_status not null default 'unused',
  expires_at timestamptz,
  price_paid int not null default 0 check (price_paid >= 0),
  payment_ref text,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint exam_key_used_lte_total check (used_attempts <= total_attempts)
);
alter table public.students
  add constraint students_current_key_id_fkey
  foreign key (current_key_id)
  references public.exam_keys(id)
  on delete set null;
create table public.exam_sessions (
  id uuid primary key default extensions.gen_random_uuid(),
  key_id uuid not null references public.exam_keys(id) on delete restrict,
  student_id uuid not null references public.students(id) on delete restrict,
  exam_room_id uuid not null references public.exam_rooms(id) on delete restrict,
  attempt_number int not null check (attempt_number > 0),
  status public.exam_session_status not null default 'in_progress',
  shuffle_config jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  due_at timestamptz,
  submitted_at timestamptz,
  score numeric(5,2) check (score >= 0),
  max_score numeric(5,2) not null default 10.00 check (max_score > 0),
  client_info jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (key_id, attempt_number)
);
create table public.exam_session_questions (
  id uuid primary key default extensions.gen_random_uuid(),
  session_id uuid not null references public.exam_sessions(id) on delete cascade,
  blueprint_section_id uuid not null references public.exam_blueprint_sections(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  question_seq int not null check (question_seq > 0),
  display_no text,
  option_order uuid[] not null default '{}'::uuid[],
  max_points numeric(5,2) not null check (max_points >= 0),
  created_at timestamptz not null default now(),
  unique (session_id, question_seq),
  unique (session_id, question_id)
);
create table public.session_answers (
  id uuid primary key default extensions.gen_random_uuid(),
  session_question_id uuid not null references public.exam_session_questions(id) on delete cascade,
  student_id uuid not null references public.students(id) on delete restrict,
  answer_json jsonb not null default '{}'::jsonb,
  selected_option_id uuid references public.question_options(id) on delete restrict,
  short_answer_text text,
  submitted_at timestamptz not null default now(),
  is_correct boolean,
  correct_item_count int check (correct_item_count >= 0),
  earned_points numeric(5,2) check (earned_points >= 0),
  grader jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_question_id)
);
create index knowledge_fields_subject_parent_idx
  on public.knowledge_fields(subject_code, parent_id);
create index students_school_province_idx
  on public.students(province_name, school_name);
create index students_current_key_idx
  on public.students(current_key_id);
create index question_groups_subject_idx
  on public.question_groups(subject_code);
create index questions_subject_status_type_idx
  on public.questions(subject_code, status, type, difficulty);
create index questions_knowledge_field_idx
  on public.questions(knowledge_field_id);
create index question_options_question_idx
  on public.question_options(question_id);
create index question_tf_items_question_idx
  on public.question_true_false_items(question_id);
create index exam_blueprints_subject_year_idx
  on public.exam_blueprints(subject_code, exam_year, status);
create index exam_blueprint_sections_blueprint_idx
  on public.exam_blueprint_sections(blueprint_id, seq);
create index exam_rooms_subject_status_idx
  on public.exam_rooms(subject_code, status);
create index exam_room_questions_question_idx
  on public.exam_room_questions(question_id);
create index exam_keys_assigned_status_idx
  on public.exam_keys(assigned_to, status);
create index exam_sessions_student_status_idx
  on public.exam_sessions(student_id, status);
create index exam_sessions_room_idx
  on public.exam_sessions(exam_room_id);
create index exam_session_questions_session_idx
  on public.exam_session_questions(session_id, question_seq);
create index session_answers_student_idx
  on public.session_answers(student_id);
create or replace function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role in ('teacher', 'admin')
  );
$$;
create or replace function private.owns_session(p_session_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_sessions s
    where s.id = p_session_id
      and s.student_id = (select auth.uid())
  );
$$;
create or replace function private.can_read_question(p_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    or exists (
      select 1
      from public.exam_session_questions sq
      join public.exam_sessions s on s.id = sq.session_id
      where sq.question_id = p_question_id
        and s.student_id = (select auth.uid())
        and s.status = 'in_progress'
    );
$$;
create or replace function private.can_read_question_group(p_group_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.is_staff()
    or exists (
      select 1
      from public.questions q
      join public.exam_session_questions sq on sq.question_id = q.id
      join public.exam_sessions s on s.id = sq.session_id
      where q.group_id = p_group_id
        and s.student_id = (select auth.uid())
        and s.status = 'in_progress'
    );
$$;
create or replace function private.can_write_session_question(p_session_question_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.exam_session_questions sq
    join public.exam_sessions s on s.id = sq.session_id
    where sq.id = p_session_question_id
      and s.student_id = (select auth.uid())
      and s.status = 'in_progress'
  );
$$;
create or replace function private.ensure_exam_room_question_matches_blueprint()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  room_record record;
  section_record record;
  question_record record;
begin
  select er.blueprint_id, er.subject_code
    into room_record
  from public.exam_rooms er
  where er.id = new.exam_room_id;
  select bs.blueprint_id, bs.question_type
    into section_record
  from public.exam_blueprint_sections bs
  where bs.id = new.blueprint_section_id;
  select q.subject_code, q.type
    into question_record
  from public.questions q
  where q.id = new.question_id;
  if section_record.blueprint_id <> room_record.blueprint_id then
    raise exception 'Blueprint section does not belong to exam room blueprint';
  end if;
  if question_record.subject_code <> room_record.subject_code then
    raise exception 'Question subject does not match exam room subject';
  end if;
  if question_record.type <> section_record.question_type then
    raise exception 'Question type does not match blueprint section type';
  end if;
  return new;
end;
$$;
create or replace function private.ensure_student_current_key_matches()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  key_owner uuid;
begin
  if new.current_key_id is null then
    return new;
  end if;
  select k.assigned_to
    into key_owner
  from public.exam_keys k
  where k.id = new.current_key_id;
  if key_owner is distinct from new.id then
    raise exception 'Current key must be assigned to the same student';
  end if;
  return new;
end;
$$;
create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.touch_updated_at();
create trigger students_touch_updated_at
before update on public.students
for each row execute function private.touch_updated_at();
create trigger subjects_touch_updated_at
before update on public.subjects
for each row execute function private.touch_updated_at();
create trigger knowledge_fields_touch_updated_at
before update on public.knowledge_fields
for each row execute function private.touch_updated_at();
create trigger question_groups_touch_updated_at
before update on public.question_groups
for each row execute function private.touch_updated_at();
create trigger questions_touch_updated_at
before update on public.questions
for each row execute function private.touch_updated_at();
create trigger exam_blueprints_touch_updated_at
before update on public.exam_blueprints
for each row execute function private.touch_updated_at();
create trigger exam_blueprint_sections_touch_updated_at
before update on public.exam_blueprint_sections
for each row execute function private.touch_updated_at();
create trigger exam_blueprint_section_rules_touch_updated_at
before update on public.exam_blueprint_section_rules
for each row execute function private.touch_updated_at();
create trigger exam_rooms_touch_updated_at
before update on public.exam_rooms
for each row execute function private.touch_updated_at();
create trigger exam_room_generation_rules_touch_updated_at
before update on public.exam_room_generation_rules
for each row execute function private.touch_updated_at();
create trigger exam_keys_touch_updated_at
before update on public.exam_keys
for each row execute function private.touch_updated_at();
create trigger exam_sessions_touch_updated_at
before update on public.exam_sessions
for each row execute function private.touch_updated_at();
create trigger session_answers_touch_updated_at
before update on public.session_answers
for each row execute function private.touch_updated_at();
create trigger exam_room_questions_validate_blueprint
before insert or update on public.exam_room_questions
for each row execute function private.ensure_exam_room_question_matches_blueprint();
;
