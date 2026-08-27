create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create schema if not exists private;
create type public.user_role as enum ('student', 'teacher', 'admin');
create type public.question_type as enum (
  'multiple_choice',
  'true_false',
  'short_answer',
  'essay'
);
create type public.question_status as enum ('draft', 'reviewing', 'approved', 'archived');
create type public.blueprint_status as enum ('draft', 'published', 'archived');
create type public.exam_room_status as enum ('draft', 'published', 'archived');
create type public.exam_key_status as enum (
  'unused',
  'active',
  'exhausted',
  'expired',
  'revoked'
);
create type public.exam_session_status as enum (
  'in_progress',
  'submitted',
  'abandoned',
  'expired'
);
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email extensions.citext not null unique,
  full_name text,
  role public.user_role not null default 'student',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.students (
  id uuid primary key references public.profiles(id) on delete cascade,
  gmail extensions.citext not null unique,
  full_name text,
  school_name text,
  province_name text,
  district_name text,
  phone text,
  note text,
  current_key_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.subjects (
  code text primary key,
  name text not null,
  exam_group text not null,
  default_duration_minutes int not null check (default_duration_minutes > 0),
  is_compulsory boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint subjects_code_uppercase check (code = upper(code))
);
create table public.subject_tracks (
  subject_code text not null references public.subjects(code) on delete cascade,
  code text not null,
  name text not null,
  is_active boolean not null default true,
  primary key (subject_code, code),
  constraint subject_tracks_code_uppercase check (code = upper(code))
);
create table public.knowledge_fields (
  id bigint generated always as identity primary key,
  subject_code text not null references public.subjects(code) on delete cascade,
  parent_id bigint references public.knowledge_fields(id) on delete set null,
  name text not null,
  slug text not null,
  grade smallint check (grade between 10 and 12),
  display_order int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (subject_code, slug)
);
create table public.question_groups (
  id uuid primary key default extensions.gen_random_uuid(),
  subject_code text not null references public.subjects(code) on delete restrict,
  title text,
  stimulus text,
  asset_url text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table public.questions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  subject_code text not null references public.subjects(code) on delete restrict,
  subject_track_code text,
  group_id uuid references public.question_groups(id) on delete set null,
  knowledge_field_id bigint references public.knowledge_fields(id) on delete set null,
  type public.question_type not null,
  difficulty smallint not null check (difficulty between 1 and 4),
  content text not null,
  explanation text,
  image_url text,
  status public.question_status not null default 'draft',
  source_label text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (subject_code, subject_track_code)
    references public.subject_tracks(subject_code, code)
    on delete restrict
);
create table public.question_assets (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  kind text not null check (kind in ('image', 'audio', 'video', 'file')),
  url text not null,
  alt_text text,
  display_order int not null default 0,
  created_at timestamptz not null default now()
);
create table public.question_options (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  seq smallint not null check (seq between 1 and 10),
  label text not null,
  content text not null,
  image_url text,
  created_at timestamptz not null default now(),
  unique (question_id, seq),
  unique (question_id, id)
);
create table public.question_correct_options (
  question_id uuid primary key references public.questions(id) on delete cascade,
  option_id uuid not null,
  created_at timestamptz not null default now(),
  foreign key (question_id, option_id)
    references public.question_options(question_id, id)
    on delete cascade
);
create table public.question_true_false_items (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  seq smallint not null check (seq between 1 and 4),
  content text not null,
  created_at timestamptz not null default now(),
  unique (question_id, seq),
  unique (question_id, id)
);
create table public.question_true_false_answer_keys (
  question_id uuid not null references public.questions(id) on delete cascade,
  item_id uuid not null,
  correct_value boolean not null,
  created_at timestamptz not null default now(),
  primary key (question_id, item_id),
  foreign key (question_id, item_id)
    references public.question_true_false_items(question_id, id)
    on delete cascade
);
create table public.question_short_answer_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  normalized_text text,
  numeric_value numeric,
  tolerance numeric,
  regex_pattern text,
  is_primary boolean not null default true,
  note text,
  created_at timestamptz not null default now(),
  constraint short_answer_key_has_value check (
    normalized_text is not null
    or numeric_value is not null
    or regex_pattern is not null
  )
);
create table public.question_essay_rubric_items (
  id uuid primary key default extensions.gen_random_uuid(),
  question_id uuid not null references public.questions(id) on delete cascade,
  seq smallint not null,
  title text not null,
  max_points numeric(5,2) not null check (max_points > 0),
  description text,
  created_at timestamptz not null default now(),
  unique (question_id, seq)
);
create table public.question_tags (
  question_id uuid not null references public.questions(id) on delete cascade,
  tag text not null,
  primary key (question_id, tag)
);
create table public.exam_blueprints (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  subject_code text not null references public.subjects(code) on delete restrict,
  exam_year int not null check (exam_year >= 2025),
  program_version text not null default 'GDPT_2018',
  name text not null,
  form_label text not null check (form_label in ('essay', 'objective')),
  duration_minutes int not null check (duration_minutes > 0),
  total_score numeric(5,2) not null default 10.00 check (total_score > 0),
  source_ref text,
  status public.blueprint_status not null default 'published',
  locked boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, subject_code)
);
create table public.exam_blueprint_sections (
  id uuid primary key default extensions.gen_random_uuid(),
  blueprint_id uuid not null references public.exam_blueprints(id) on delete cascade,
  section_code text not null,
  seq smallint not null,
  title text not null,
  question_type public.question_type not null,
  displayed_question_count int not null check (displayed_question_count >= 0),
  required_question_count int not null check (required_question_count >= 0),
  items_per_question int not null default 1 check (items_per_question > 0),
  max_points_per_question numeric(5,2) not null check (max_points_per_question >= 0),
  grading_mode text not null check (grading_mode in ('auto', 'manual')),
  choice_rule jsonb not null default '{}'::jsonb,
  instructions text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (blueprint_id, section_code),
  unique (blueprint_id, seq),
  constraint blueprint_section_required_lte_displayed
    check (required_question_count <= displayed_question_count)
);
create table public.exam_blueprint_section_score_steps (
  section_id uuid not null references public.exam_blueprint_sections(id) on delete cascade,
  correct_item_count int not null check (correct_item_count >= 0),
  points numeric(5,2) not null check (points >= 0),
  primary key (section_id, correct_item_count)
);
create table public.exam_blueprint_section_rules (
  id uuid primary key default extensions.gen_random_uuid(),
  section_id uuid not null references public.exam_blueprint_sections(id) on delete cascade,
  difficulty_distribution jsonb not null default '{}'::jsonb,
  knowledge_distribution jsonb not null default '{}'::jsonb,
  question_filters jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (section_id)
);
create table public.exam_rooms (
  id uuid primary key default extensions.gen_random_uuid(),
  blueprint_id uuid not null,
  subject_code text not null,
  code text not null unique,
  name text not null,
  duration_minutes int not null check (duration_minutes > 0),
  status public.exam_room_status not null default 'draft',
  price_vnd int not null default 0 check (price_vnd >= 0),
  total_attempts_default int not null default 3 check (total_attempts_default > 0),
  starts_at timestamptz,
  ends_at timestamptz,
  published_at timestamptz,
  settings jsonb not null default '{}'::jsonb,
  blueprint_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (blueprint_id, subject_code)
    references public.exam_blueprints(id, subject_code)
    on delete restrict,
  constraint exam_rooms_time_window check (
    ends_at is null or starts_at is null or ends_at > starts_at
  )
);
create table public.exam_room_questions (
  exam_room_id uuid not null references public.exam_rooms(id) on delete cascade,
  blueprint_section_id uuid not null references public.exam_blueprint_sections(id) on delete restrict,
  question_id uuid not null references public.questions(id) on delete restrict,
  seq int not null check (seq > 0),
  branch_code text,
  is_required boolean not null default true,
  points_override numeric(5,2) check (points_override >= 0),
  created_at timestamptz not null default now(),
  primary key (exam_room_id, blueprint_section_id, seq),
  unique (exam_room_id, question_id)
);
;
