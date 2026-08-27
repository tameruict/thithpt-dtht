create policy "Staff inserts keys"
on public.exam_keys
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates keys"
on public.exam_keys
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes keys"
on public.exam_keys
for delete
to authenticated
using (private.is_staff());
create policy "Users can read their sessions"
on public.exam_sessions
for select
to authenticated
using (student_id = (select auth.uid()) or private.is_staff());
create policy "Users can start sessions for their active keys"
on public.exam_sessions
for insert
to authenticated
with check (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and exists (
      select 1
      from public.exam_keys k
      where k.id = key_id
        and k.exam_room_id = exam_room_id
        and k.assigned_to = (select auth.uid())
        and k.status in ('unused', 'active')
        and k.used_attempts < k.total_attempts
        and (k.expires_at is null or k.expires_at > now())
    )
  )
);
create policy "Staff updates sessions"
on public.exam_sessions
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes sessions"
on public.exam_sessions
for delete
to authenticated
using (private.is_staff());
create policy "Session questions visible to owner or staff"
on public.exam_session_questions
for select
to authenticated
using (private.owns_session(session_id) or private.is_staff());
create policy "Staff inserts session questions"
on public.exam_session_questions
for insert
to authenticated
with check (private.is_staff());
create policy "Staff updates session questions"
on public.exam_session_questions
for update
to authenticated
using (private.is_staff())
with check (private.is_staff());
create policy "Staff deletes session questions"
on public.exam_session_questions
for delete
to authenticated
using (private.is_staff());
create policy "Answers visible to owner or staff"
on public.session_answers
for select
to authenticated
using (student_id = (select auth.uid()) or private.is_staff());
create policy "Students answer their in-progress session questions"
on public.session_answers
for insert
to authenticated
with check (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and private.can_write_session_question(session_question_id)
  )
);
create policy "Students update their in-progress answers"
on public.session_answers
for update
to authenticated
using (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and private.can_write_session_question(session_question_id)
  )
)
with check (
  private.is_staff()
  or (
    student_id = (select auth.uid())
    and private.can_write_session_question(session_question_id)
  )
);
create policy "Staff deletes answers"
on public.session_answers
for delete
to authenticated
using (private.is_staff());
create or replace view public.exam_blueprint_score_summary
with (security_invoker = true)
as
select
  b.id,
  b.code,
  b.subject_code,
  b.exam_year,
  b.total_score,
  coalesce(
    sum(s.required_question_count * s.max_points_per_question),
    0
  )::numeric(5,2) as configured_score,
  (
    coalesce(sum(s.required_question_count * s.max_points_per_question), 0)
    = b.total_score
  ) as is_score_valid
from public.exam_blueprints b
left join public.exam_blueprint_sections s on s.blueprint_id = b.id
group by b.id, b.code, b.subject_code, b.exam_year, b.total_score;
create or replace view public.student_key_summary
with (security_invoker = true)
as
select
  st.id as student_id,
  st.gmail,
  st.full_name,
  st.school_name,
  st.province_name,
  st.district_name,
  st.phone,
  st.current_key_id,
  k.code as current_key_code,
  k.status as current_key_status,
  k.exam_room_id,
  er.code as exam_room_code,
  er.name as exam_room_name,
  er.subject_code,
  k.total_attempts,
  k.used_attempts,
  greatest(k.total_attempts - k.used_attempts, 0) as remaining_attempts,
  (k.used_attempts > 0) as current_key_has_been_used,
  k.expires_at as current_key_expires_at,
  coalesce(key_stats.assigned_key_count, 0) as assigned_key_count,
  coalesce(key_stats.used_key_count, 0) as used_key_count,
  coalesce(key_stats.exhausted_key_count, 0) as exhausted_key_count
from public.students st
left join lateral (
  select ek.*
  from public.exam_keys ek
  where ek.assigned_to = st.id
    and (st.current_key_id is null or ek.id = st.current_key_id)
  order by coalesce(ek.id = st.current_key_id, false) desc, ek.created_at desc
  limit 1
) k on true
left join public.exam_rooms er on er.id = k.exam_room_id
left join lateral (
  select
    count(*)::int as assigned_key_count,
    count(*) filter (where ek.used_attempts > 0)::int as used_key_count,
    count(*) filter (where ek.status = 'exhausted')::int as exhausted_key_count
  from public.exam_keys ek
  where ek.assigned_to = st.id
) key_stats on true;
insert into public.subjects (
  code,
  name,
  exam_group,
  default_duration_minutes,
  is_compulsory
) values
  ('LITERATURE', 'Ngữ văn', 'compulsory', 120, true),
  ('MATH', 'Toán', 'compulsory', 90, true),
  ('PHYSICS', 'Vật lí', 'science', 50, false),
  ('CHEMISTRY', 'Hóa học', 'science', 50, false),
  ('BIOLOGY', 'Sinh học', 'science', 50, false),
  ('GEOGRAPHY', 'Địa lí', 'social_science', 50, false),
  ('HISTORY', 'Lịch sử', 'social_science', 50, false),
  ('ECONOMIC_LAW', 'Giáo dục kinh tế và pháp luật', 'social_science', 50, false),
  ('INFORMATICS', 'Tin học', 'technology', 50, false),
  ('TECH_INDUSTRIAL', 'Công nghệ Công nghiệp', 'technology', 50, false),
  ('TECH_AGRICULTURAL', 'Công nghệ Nông nghiệp', 'technology', 50, false),
  ('ENGLISH', 'Tiếng Anh', 'foreign_language', 50, false),
  ('RUSSIAN', 'Tiếng Nga', 'foreign_language', 50, false),
  ('FRENCH', 'Tiếng Pháp', 'foreign_language', 50, false),
  ('CHINESE', 'Tiếng Trung Quốc', 'foreign_language', 50, false),
  ('GERMAN', 'Tiếng Đức', 'foreign_language', 50, false),
  ('JAPANESE', 'Tiếng Nhật', 'foreign_language', 50, false),
  ('KOREAN', 'Tiếng Hàn', 'foreign_language', 50, false)
on conflict (code) do update
set
  name = excluded.name,
  exam_group = excluded.exam_group,
  default_duration_minutes = excluded.default_duration_minutes,
  is_compulsory = excluded.is_compulsory,
  is_active = true;
insert into public.subject_tracks (subject_code, code, name) values
  ('INFORMATICS', 'COMMON', 'Nội dung chung'),
  ('INFORMATICS', 'CS', 'Khoa học máy tính'),
  ('INFORMATICS', 'ICT', 'Tin học ứng dụng')
on conflict (subject_code, code) do update
set name = excluded.name, is_active = true;
insert into public.exam_blueprints (
  code,
  subject_code,
  exam_year,
  program_version,
  name,
  form_label,
  duration_minutes,
  total_score,
  source_ref,
  status,
  locked
)
select
  'THPT_2026_' || s.code,
  s.code,
  2026,
  'GDPT_2018',
  'Cấu trúc đề thi tốt nghiệp THPT 2026 - ' || s.name,
  case when s.code = 'LITERATURE' then 'essay' else 'objective' end,
  s.default_duration_minutes,
  10.00,
  'Bộ GDĐT: cấu trúc định dạng đề thi tốt nghiệp THPT từ năm 2025; Quy chế thi tốt nghiệp THPT ban hành theo Thông tư 24/2024/TT-BGDĐT; áp dụng GDPT 2018 cho THPT 2026.',
  'published',
  true
from public.subjects s
on conflict (code) do update
set
  subject_code = excluded.subject_code,
  exam_year = excluded.exam_year,
  program_version = excluded.program_version,
  name = excluded.name,
  form_label = excluded.form_label,
  duration_minutes = excluded.duration_minutes,
  total_score = excluded.total_score,
  source_ref = excluded.source_ref,
  status = excluded.status,
  locked = excluded.locked;
;
