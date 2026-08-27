-- 1. Enable Trigrams correctly
CREATE EXTENSION IF NOT EXISTS pg_trgm SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS unaccent SCHEMA extensions;
-- Recreate index that failed before
CREATE INDEX IF NOT EXISTS idx_questions_content_trgm
  ON questions USING GIN (content extensions.gin_trgm_ops);
-- 2. Fix student_key_summary view
-- First drop the view
DROP VIEW IF EXISTS public.student_key_summary CASCADE;
-- Now we can drop the gmail column safely
ALTER TABLE public.students DROP COLUMN IF EXISTS gmail;
-- Recreate the view using profiles.email instead
create or replace view public.student_key_summary
with (security_invoker = true)
as
select
  st.id as student_id,
  p.email as gmail,
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
left join public.profiles p on st.id = p.id
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
grant select on public.student_key_summary to authenticated;
