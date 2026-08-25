with section_seed as (
  select *
  from (
    values
      ('THPT_2026_LITERATURE', 'I', 1, 'Đọc hiểu', 'essay', 1, 1, 1, 4.00, 'manual', '{}'::jsonb),
      ('THPT_2026_LITERATURE', 'II', 2, 'Viết', 'essay', 1, 1, 1, 6.00, 'manual', '{}'::jsonb),

      ('THPT_2026_MATH', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 12, 12, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_MATH', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),
      ('THPT_2026_MATH', 'III', 3, 'Trả lời ngắn', 'short_answer', 6, 6, 1, 0.50, 'auto', '{}'::jsonb),

      ('THPT_2026_PHYSICS', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 18, 18, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_PHYSICS', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),
      ('THPT_2026_PHYSICS', 'III', 3, 'Trả lời ngắn', 'short_answer', 6, 6, 1, 0.25, 'auto', '{}'::jsonb),

      ('THPT_2026_CHEMISTRY', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 18, 18, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_CHEMISTRY', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),
      ('THPT_2026_CHEMISTRY', 'III', 3, 'Trả lời ngắn', 'short_answer', 6, 6, 1, 0.25, 'auto', '{}'::jsonb),

      ('THPT_2026_BIOLOGY', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 18, 18, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_BIOLOGY', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),
      ('THPT_2026_BIOLOGY', 'III', 3, 'Trả lời ngắn', 'short_answer', 6, 6, 1, 0.25, 'auto', '{}'::jsonb),

      ('THPT_2026_GEOGRAPHY', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 18, 18, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_GEOGRAPHY', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),
      ('THPT_2026_GEOGRAPHY', 'III', 3, 'Trả lời ngắn', 'short_answer', 6, 6, 1, 0.25, 'auto', '{}'::jsonb),

      ('THPT_2026_HISTORY', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 24, 24, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_HISTORY', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),

      ('THPT_2026_ECONOMIC_LAW', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 24, 24, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_ECONOMIC_LAW', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),

      ('THPT_2026_INFORMATICS', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 24, 24, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_INFORMATICS', 'II', 2, 'Đúng/Sai', 'true_false', 6, 4, 4, 1.00, 'auto', '{"printed_questions": 6, "required_questions": 4, "branches": [{"code": "COMMON", "required": 2}, {"code": "CS", "required": 2}, {"code": "ICT", "required": 2}], "student_chooses_one_branch": true, "per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),

      ('THPT_2026_TECH_INDUSTRIAL', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 24, 24, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_TECH_INDUSTRIAL', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),

      ('THPT_2026_TECH_AGRICULTURAL', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 24, 24, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_TECH_AGRICULTURAL', 'II', 2, 'Đúng/Sai', 'true_false', 4, 4, 4, 1.00, 'auto', '{"per_question_score_steps": {"1": 0.10, "2": 0.25, "3": 0.50, "4": 1.00}}'::jsonb),

      ('THPT_2026_ENGLISH', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_RUSSIAN', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_FRENCH', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_CHINESE', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_GERMAN', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_JAPANESE', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb),
      ('THPT_2026_KOREAN', 'I', 1, 'Trắc nghiệm nhiều lựa chọn', 'multiple_choice', 40, 40, 1, 0.25, 'auto', '{}'::jsonb)
  ) as v(
    blueprint_code,
    section_code,
    seq,
    title,
    question_type,
    displayed_question_count,
    required_question_count,
    items_per_question,
    max_points_per_question,
    grading_mode,
    choice_rule
  )
)
insert into public.exam_blueprint_sections (
  blueprint_id,
  section_code,
  seq,
  title,
  question_type,
  displayed_question_count,
  required_question_count,
  items_per_question,
  max_points_per_question,
  grading_mode,
  choice_rule
)
select
  b.id,
  s.section_code,
  s.seq,
  s.title,
  s.question_type::public.question_type,
  s.displayed_question_count,
  s.required_question_count,
  s.items_per_question,
  s.max_points_per_question,
  s.grading_mode,
  s.choice_rule
from section_seed s
join public.exam_blueprints b on b.code = s.blueprint_code
on conflict (blueprint_id, section_code) do update
set
  seq = excluded.seq,
  title = excluded.title,
  question_type = excluded.question_type,
  displayed_question_count = excluded.displayed_question_count,
  required_question_count = excluded.required_question_count,
  items_per_question = excluded.items_per_question,
  max_points_per_question = excluded.max_points_per_question,
  grading_mode = excluded.grading_mode,
  choice_rule = excluded.choice_rule;
insert into public.exam_blueprint_section_score_steps (
  section_id,
  correct_item_count,
  points
)
select
  s.id,
  step.correct_item_count,
  step.points
from public.exam_blueprint_sections s
cross join (
  values
    (0, 0.00::numeric),
    (1, 0.10::numeric),
    (2, 0.25::numeric),
    (3, 0.50::numeric),
    (4, 1.00::numeric)
) as step(correct_item_count, points)
where s.question_type = 'true_false'
on conflict (section_id, correct_item_count) do update
set points = excluded.points;
insert into public.exam_blueprint_section_rules (section_id)
select id
from public.exam_blueprint_sections
on conflict (section_id) do nothing;
grant usage on schema public to anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on all functions in schema private to anon, authenticated;
grant select on public.subjects to anon, authenticated;
grant select on public.subject_tracks to anon, authenticated;
grant select on public.exam_blueprints to anon, authenticated;
grant select on public.exam_blueprint_sections to anon, authenticated;
grant select on public.exam_blueprint_score_summary to anon, authenticated;
grant select on public.student_key_summary to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
;
