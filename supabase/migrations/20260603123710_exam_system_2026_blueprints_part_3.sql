create trigger students_validate_current_key
before insert or update on public.students
for each row execute function private.ensure_student_current_key_matches();
alter table public.profiles enable row level security;
alter table public.students enable row level security;
alter table public.subjects enable row level security;
alter table public.subject_tracks enable row level security;
alter table public.knowledge_fields enable row level security;
alter table public.question_groups enable row level security;
alter table public.questions enable row level security;
alter table public.question_assets enable row level security;
alter table public.question_options enable row level security;
alter table public.question_correct_options enable row level security;
alter table public.question_true_false_items enable row level security;
alter table public.question_true_false_answer_keys enable row level security;
alter table public.question_short_answer_keys enable row level security;
alter table public.question_essay_rubric_items enable row level security;
alter table public.question_tags enable row level security;
alter table public.exam_blueprints enable row level security;
alter table public.exam_blueprint_sections enable row level security;
alter table public.exam_blueprint_section_score_steps enable row level security;
alter table public.exam_blueprint_section_rules enable row level security;
alter table public.exam_rooms enable row level security;
alter table public.exam_room_questions enable row level security;
alter table public.exam_room_generation_rules enable row level security;
alter table public.key_batches enable row level security;
alter table public.exam_keys enable row level security;
alter table public.exam_sessions enable row level security;
alter table public.exam_session_questions enable row level security;
alter table public.session_answers enable row level security;
create policy "Profiles are visible to owner or staff"
on public.profiles
for select
to authenticated
using (id = (select auth.uid()) or private.is_staff());
create policy "Students can create their own profile"
on public.profiles
for insert
to authenticated
with check (id = (select auth.uid()) and role = 'student');
create policy "Profile updates are owner-limited or staff"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()) or private.is_staff())
with check (
  (id = (select auth.uid()) and role = 'student')
  or private.is_staff()
);
create policy "Students can read own row or staff"
on public.students
for select
to authenticated
using (id = (select auth.uid()) or private.is_staff());
create policy "Students can create their own student row"
on public.students
for insert
to authenticated
with check (
  private.is_staff()
  or (
    id = (select auth.uid())
    and current_key_id is null
  )
);
create policy "Staff updates students"
on public.students
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes students"
on public.students
for delete
to authenticated
using (private.is_staff());
create policy "Public catalog is readable"
on public.subjects
for select
to anon, authenticated
using (is_active or private.is_staff());
create policy "Staff inserts subjects"
on public.subjects
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates subjects"
on public.subjects
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes subjects"
on public.subjects
for delete
to authenticated
using (private.is_staff());
create policy "Subject tracks are readable"
on public.subject_tracks
for select
to anon, authenticated
using (is_active or private.is_staff());
create policy "Staff inserts subject tracks"
on public.subject_tracks
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates subject tracks"
on public.subject_tracks
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes subject tracks"
on public.subject_tracks
for delete
to authenticated
using (private.is_staff());
create policy "Knowledge fields are readable"
on public.knowledge_fields
for select
to authenticated
using (true);
create policy "Staff inserts knowledge fields"
on public.knowledge_fields
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates knowledge fields"
on public.knowledge_fields
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes knowledge fields"
on public.knowledge_fields
for delete
to authenticated
using (private.is_staff());
create policy "Question groups visible during owned sessions or staff"
on public.question_groups
for select
to authenticated
using (private.can_read_question_group(id));
create policy "Staff inserts question groups"
on public.question_groups
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates question groups"
on public.question_groups
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes question groups"
on public.question_groups
for delete
to authenticated
using (private.is_staff());
create policy "Questions visible during owned sessions or staff"
on public.questions
for select
to authenticated
using (private.can_read_question(id));
create policy "Staff inserts questions"
on public.questions
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates questions"
on public.questions
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes questions"
on public.questions
for delete
to authenticated
using (private.is_staff());
create policy "Question assets visible with question"
on public.question_assets
for select
to authenticated
using (private.can_read_question(question_id));
create policy "Staff inserts question assets"
on public.question_assets
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates question assets"
on public.question_assets
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes question assets"
on public.question_assets
for delete
to authenticated
using (private.is_staff());
create policy "Question options visible with question"
on public.question_options
for select
to authenticated
using (private.can_read_question(question_id));
create policy "Staff inserts question options"
on public.question_options
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates question options"
on public.question_options
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes question options"
on public.question_options
for delete
to authenticated
using (private.is_staff());
create policy "Question true false items visible with question"
on public.question_true_false_items
for select
to authenticated
using (private.can_read_question(question_id));
create policy "Staff inserts question true false items"
on public.question_true_false_items
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates question true false items"
on public.question_true_false_items
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes question true false items"
on public.question_true_false_items
for delete
to authenticated
using (private.is_staff());
create policy "Staff manages correct options"
on public.question_correct_options
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages true false answer keys"
on public.question_true_false_answer_keys
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages short answer keys"
on public.question_short_answer_keys
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages essay rubrics"
on public.question_essay_rubric_items
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages question tags"
on public.question_tags
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Published blueprints are readable"
on public.exam_blueprints
for select
to anon, authenticated
using (status = 'published' or private.is_staff());
create policy "Staff inserts blueprints"
on public.exam_blueprints
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates blueprints"
on public.exam_blueprints
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes blueprints"
on public.exam_blueprints
for delete
to authenticated
using (private.is_staff());
create policy "Blueprint sections are readable"
on public.exam_blueprint_sections
for select
to anon, authenticated
using (
  private.is_staff()
  or
  exists (
    select 1
    from public.exam_blueprints b
    where b.id = blueprint_id
      and b.status = 'published'
  )
);
create policy "Staff inserts blueprint sections"
on public.exam_blueprint_sections
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates blueprint sections"
on public.exam_blueprint_sections
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes blueprint sections"
on public.exam_blueprint_sections
for delete
to authenticated
using (private.is_staff());
create policy "Blueprint score steps are readable"
on public.exam_blueprint_section_score_steps
for select
to authenticated
using (true);
create policy "Staff inserts blueprint score steps"
on public.exam_blueprint_section_score_steps
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates blueprint score steps"
on public.exam_blueprint_section_score_steps
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes blueprint score steps"
on public.exam_blueprint_section_score_steps
for delete
to authenticated
using (private.is_staff());
create policy "Staff manages blueprint section rules"
on public.exam_blueprint_section_rules
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Published exam rooms are readable"
on public.exam_rooms
for select
to authenticated
using (
  private.is_staff()
  or status = 'published'
  or exists (
    select 1
    from public.exam_keys k
    where k.exam_room_id = id
      and k.assigned_to = (select auth.uid())
      and k.status in ('unused', 'active')
  )
);
create policy "Staff inserts exam rooms"
on public.exam_rooms
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates exam rooms"
on public.exam_rooms
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes exam rooms"
on public.exam_rooms
for delete
to authenticated
using (private.is_staff());
create policy "Staff manages room questions"
on public.exam_room_questions
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages room generation rules"
on public.exam_room_generation_rules
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff manages key batches"
on public.key_batches
for all
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Users can read their keys"
on public.exam_keys
for select
to authenticated
using (assigned_to = (select auth.uid()) or private.is_staff());
;
