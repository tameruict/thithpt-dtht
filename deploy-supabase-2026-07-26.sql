-- ============================================================================
-- DEPLOY: Web thi THPT — thay đổi DB phiên 2026-07-26
--
-- Cách chạy: Supabase Dashboard > SQL Editor > New query > dán file này > Run.
-- An toàn chạy lại nhiều lần (idempotent: create or replace / add column if not
-- exists / create table if not exists).
--
-- ⚠️ VỀ DRIFT: DB remote có 25 migration KHÔNG nằm trong repo Git (sửa trực tiếp
-- trên dashboard), nên `supabase db push` bị chặn. File này viết theo hướng
-- an toàn tối đa, tách 2 phần:
--
--   • PHẦN A — CHỈ THÊM MỚI (cột/hàm/view mới). KHÔNG ghi đè hàm đang chạy.
--     Deploy được ngay, bật toàn bộ tính năng mới:
--       - Dashboard kết quả thi (get_exam_results)
--       - Quản lý phòng thi (admin_exam_room_summary)
--       - Chấm tự luận (get_pending_essays, grade_essay_answer)
--       - Log chống gian lận (violation_count, record_session_event)
--     => Nên chạy PHẦN A.
--
--   • PHẦN B — TUỲ CHỌN, GHI ĐÈ 2 hàm chấm điểm cũ (submit_exam_session,
--     expire_overdue_exam_sessions). CHỈ chạy nếu phiên tự-hết-giờ khi vào
--     /result bị lỗi "function public.score_exam_session ... does not exist".
--     Nếu web đang chấm điểm bình thường => BỎ QUA phần B (tránh ghi đè bản
--     đang chạy tốt trên remote).
-- ============================================================================


-- ############################################################################
-- ##  PHẦN A — AN TOÀN (chỉ thêm mới)                                        ##
-- ############################################################################

-- A1) Cột phụ trợ ------------------------------------------------------------
alter table public.exam_sessions
  add column if not exists scored_at timestamptz;

alter table public.exam_sessions
  add column if not exists violation_count integer not null default 0;


-- A2) record_session_event(): ghi log rời tab / thoát toàn màn hình ----------
create or replace function public.record_session_event(
  p_session_id uuid,
  p_type text default 'tab_switch'
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student uuid;
  v_status text;
  v_count integer;
begin
  select s.student_id, s.status::text
    into v_student, v_status
  from public.exam_sessions s
  where s.id = p_session_id;

  if v_student is null then
    raise exception 'SESSION_NOT_FOUND';
  end if;

  if v_student <> (select auth.uid()) then
    raise exception 'PERMISSION_DENIED';
  end if;

  if v_status <> 'in_progress' then
    return null;
  end if;

  update public.exam_sessions
     set violation_count = violation_count + 1,
         client_info = client_info || jsonb_build_object(
           'last_event',
           jsonb_build_object('type', coalesce(nullif(trim(p_type), ''), 'tab_switch'), 'at', now())
         ),
         updated_at = now()
   where id = p_session_id
   returning violation_count into v_count;

  return v_count;
end;
$function$;

revoke all on function public.record_session_event(uuid, text) from public, anon;
grant execute on function public.record_session_event(uuid, text) to authenticated;


-- A3) get_exam_results(): dashboard kết quả (kèm violation_count) -------------
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
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 1000), 1), 5000);
  v_subject text := nullif(trim(p_subject_code), '');
  v_status text := nullif(trim(p_status), '');
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last, r.started_at desc),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      s.id                            as session_id,
      s.student_id                    as student_id,
      st.full_name                    as student_name,
      st.school_name                  as school_name,
      s.exam_room_id                  as exam_room_id,
      rm.name                         as room_name,
      rm.code                         as room_code,
      rm.subject_code                 as subject_code,
      sub.name                        as subject_name,
      s.attempt_number                as attempt_number,
      s.status::text                  as status,
      s.score                         as score,
      s.max_score                     as max_score,
      s.violation_count               as violation_count,
      s.started_at                    as started_at,
      s.submitted_at                  as submitted_at,
      s.scored_at                     as scored_at,
      (s.client_info ->> 'finalized') as finalized
    from public.exam_sessions s
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = s.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where (v_subject is null or rm.subject_code = v_subject)
      and (p_exam_room_id is null or s.exam_room_id = p_exam_room_id)
      and (v_status is null or s.status::text = v_status)
    order by s.submitted_at desc nulls last, s.started_at desc
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_exam_results(text, uuid, text, integer) from public, anon;
grant execute on function public.get_exam_results(text, uuid, text, integer) to authenticated;


-- A4) admin_exam_room_summary: view quản lý phòng thi ------------------------
create or replace view public.admin_exam_room_summary
with (security_invoker = true) as
select
  er.id,
  er.code,
  er.name,
  er.subject_code,
  sub.name                as subject_name,
  er.blueprint_id,
  bp.code                 as blueprint_code,
  bp.name                 as blueprint_name,
  er.duration_minutes,
  er.status,
  er.price_vnd,
  er.total_attempts_default,
  er.starts_at,
  er.ends_at,
  er.published_at,
  er.created_at,
  (select count(*) from public.exam_room_papers p where p.exam_room_id = er.id)     as paper_count,
  (select count(*) from public.exam_room_questions q where q.exam_room_id = er.id)   as question_count
from public.exam_rooms er
left join public.subjects sub on sub.code = er.subject_code
left join public.exam_blueprints bp on bp.id = er.blueprint_id
where private.is_staff();

grant select on public.admin_exam_room_summary to authenticated;


-- A5) Chấm tự luận: get_pending_essays + grade_essay_answer ------------------
create or replace function public.get_pending_essays(p_limit integer default 500)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $function$
declare
  v_result jsonb;
  v_limit integer := least(greatest(coalesce(p_limit, 500), 1), 2000);
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  select coalesce(
    jsonb_agg(to_jsonb(r) order by r.submitted_at desc nulls last),
    '[]'::jsonb
  )
  into v_result
  from (
    select
      sa.id                                             as answer_id,
      esq.session_id                                    as session_id,
      st.full_name                                      as student_name,
      rm.name                                           as room_name,
      sub.name                                          as subject_name,
      coalesce(esq.display_no, esq.question_seq::text)  as display_no,
      esq.max_points                                    as max_points,
      q.content                                         as question_content,
      coalesce(sa.short_answer_text, sa.answer_json ->> 'value') as student_answer,
      sa.earned_points                                  as earned_points,
      s.submitted_at                                    as submitted_at
    from public.session_answers sa
    join public.exam_session_questions esq on esq.id = sa.session_question_id
    join public.exam_sessions s on s.id = esq.session_id
    join public.questions q on q.id = esq.question_id
    join public.exam_rooms rm on rm.id = s.exam_room_id
    left join public.students st on st.id = sa.student_id
    left join public.subjects sub on sub.code = rm.subject_code
    where q.type = 'essay'
      and s.status = 'submitted'
      and coalesce(sa.grader ->> 'type', 'pending') <> 'manual'
    order by s.submitted_at desc nulls last
    limit v_limit
  ) r;

  return v_result;
end;
$function$;

revoke all on function public.get_pending_essays(integer) from public, anon;
grant execute on function public.get_pending_essays(integer) to authenticated;

create or replace function public.grade_essay_answer(p_answer_id uuid, p_points numeric)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_session_id uuid;
  v_max_points numeric;
  v_q_type text;
  v_total numeric;
begin
  if not private.is_staff() then
    raise exception 'STAFF_ONLY';
  end if;

  if p_points is null or p_points < 0 then
    raise exception 'INVALID_POINTS';
  end if;

  select esq.session_id, esq.max_points, q.type::text
    into v_session_id, v_max_points, v_q_type
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  join public.questions q on q.id = esq.question_id
  where sa.id = p_answer_id;

  if v_session_id is null then
    raise exception 'ANSWER_NOT_FOUND';
  end if;

  if v_q_type <> 'essay' then
    raise exception 'NOT_AN_ESSAY';
  end if;

  if p_points > v_max_points then
    raise exception 'POINTS_EXCEED_MAX';
  end if;

  update public.session_answers
     set earned_points = p_points,
         is_correct = (p_points >= v_max_points),
         grader = jsonb_build_object('type', 'manual', 'by', (select auth.uid()), 'at', now()),
         updated_at = now()
   where id = p_answer_id;

  select coalesce(sum(sa.earned_points), 0)
    into v_total
  from public.session_answers sa
  join public.exam_session_questions esq on esq.id = sa.session_question_id
  where esq.session_id = v_session_id;

  update public.exam_sessions
     set score      = v_total,
         scored_at  = now(),
         updated_at = now()
   where id = v_session_id;

  return v_total;
end;
$function$;

revoke all on function public.grade_essay_answer(uuid, numeric) from public, anon;
grant execute on function public.grade_essay_answer(uuid, numeric) to authenticated;

notify pgrst, 'reload schema';


-- ############################################################################
-- ##  PHẦN B — TUỲ CHỌN: vá lỗi chấm điểm (GHI ĐÈ 2 hàm cũ)                   ##
-- ##                                                                          ##
-- ##  ⚠️ CHỈ chạy nếu phiên TỰ-HẾT-GIỜ khi vào /result báo lỗi               ##
-- ##  "function public.score_exam_session(uuid) does not exist".             ##
-- ##  Nếu web đang chấm điểm bình thường => KHÔNG chạy phần B.                ##
-- ############################################################################

-- B0) Bảng chi tiết Đúng/Sai (no-op nếu đã có trên remote) -------------------
create table if not exists public.session_tf_item_answers (
  session_question_id uuid        not null references public.exam_session_questions(id) on delete cascade,
  item_id             uuid        not null references public.question_true_false_items(id) on delete cascade,
  selected_value      boolean,
  is_correct          boolean     not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  primary key (session_question_id, item_id)
);

-- B1) score_exam_session(): hàm chấm dùng chung, idempotent ------------------
create or replace function public.score_exam_session(p_session_id uuid)
returns numeric
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student_id  uuid;
  v_total_score numeric := 0;
  v_rec         record;
  v_question_type text;
  v_answer_json jsonb;
  v_selected_option uuid;
  v_is_correct  boolean;
  v_earned      numeric;
  v_correct_count integer;
  v_item_correct boolean;
  v_item_key    record;
  v_sa_text     text;
  v_sa_key      record;
  v_sa_matched  boolean;
  v_numeric_val numeric;
begin
  select es.student_id into v_student_id
    from public.exam_sessions es
   where es.id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  for v_rec in
    select sa.id as answer_id, sa.answer_json as answer_json, sa.session_question_id,
           esq.question_id, esq.max_points, q.type as question_type
      from public.session_answers sa
      join public.exam_session_questions esq on esq.id = sa.session_question_id
      join public.questions q on q.id = esq.question_id
     where esq.session_id = p_session_id
       and sa.student_id = v_student_id
  loop
    v_answer_json   := v_rec.answer_json;
    v_question_type := v_rec.question_type::text;
    v_is_correct    := false;
    v_earned        := 0;

    if v_question_type = 'multiple_choice' then
      v_selected_option := (v_answer_json ->> 'option_id')::uuid;
      if v_selected_option is not null then
        select exists(
          select 1 from public.question_correct_options qco
           where qco.question_id = v_rec.question_id and qco.option_id = v_selected_option
        ) into v_is_correct;
        if v_is_correct then v_earned := v_rec.max_points; end if;
      end if;
      update public.session_answers
         set is_correct = v_is_correct, earned_points = v_earned,
             grader = '{"type":"auto","method":"mcq_exact"}'::jsonb
       where id = v_rec.answer_id;

    elsif v_question_type = 'true_false' then
      v_correct_count := 0;
      for v_item_key in
        select tfk.item_id, tfk.correct_value
          from public.question_true_false_answer_keys tfk
         where tfk.question_id = v_rec.question_id
      loop
        v_item_correct := false;
        if v_answer_json -> 'items' ->> v_item_key.item_id::text is not null then
          if (
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true'  and v_item_key.correct_value = true)
            or
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' and v_item_key.correct_value = false)
          ) then
            v_item_correct := true;
            v_correct_count := v_correct_count + 1;
          end if;
        end if;
        insert into public.session_tf_item_answers (session_question_id, item_id, selected_value, is_correct)
        values (
          v_rec.session_question_id, v_item_key.item_id,
          case
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true'  then true
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' then false
            else null
          end,
          v_item_correct
        )
        on conflict (session_question_id, item_id)
        do update set selected_value = excluded.selected_value, is_correct = excluded.is_correct, updated_at = now();
      end loop;

      select coalesce(tfs.points, 0) into v_earned
        from public.question_tf_score_steps tfs
       where tfs.question_id = v_rec.question_id and tfs.correct_item_count = v_correct_count;
      if v_earned is null then v_earned := 0; end if;
      v_is_correct := (v_earned = v_rec.max_points);
      update public.session_answers
         set is_correct = v_is_correct, correct_item_count = v_correct_count, earned_points = v_earned,
             grader = '{"type":"auto","method":"tf_partial"}'::jsonb
       where id = v_rec.answer_id;

    elsif v_question_type = 'short_answer' then
      v_sa_text := trim(v_answer_json ->> 'value');
      v_sa_matched := false;
      if v_sa_text is not null and v_sa_text <> '' then
        for v_sa_key in
          select sak.* from public.question_short_answer_keys sak where sak.question_id = v_rec.question_id
        loop
          if v_sa_key.answer_type = 'numeric' then
            begin
              v_numeric_val := v_sa_text::numeric;
              if v_sa_key.numeric_value is not null
                 and abs(v_numeric_val - v_sa_key.numeric_value) <= coalesce(v_sa_key.tolerance, 0)
              then v_sa_matched := true; end if;
            exception when others then null;
            end;
          elsif v_sa_key.answer_type = 'text' then
            if v_sa_key.match_mode = 'exact' then
              if v_sa_key.case_sensitive then v_sa_matched := (v_sa_text = v_sa_key.normalized_text);
              else v_sa_matched := (lower(v_sa_text) = lower(v_sa_key.normalized_text)); end if;
            elsif v_sa_key.match_mode = 'contains' then
              if v_sa_key.case_sensitive then v_sa_matched := (v_sa_text like '%' || v_sa_key.normalized_text || '%');
              else v_sa_matched := (lower(v_sa_text) like '%' || lower(v_sa_key.normalized_text) || '%'); end if;
            elsif v_sa_key.match_mode = 'regex' then
              if v_sa_key.regex_pattern is not null then
                begin v_sa_matched := (v_sa_text ~ v_sa_key.regex_pattern);
                exception when others then v_sa_matched := false;
                end;
              end if;
            end if;
          end if;
          exit when v_sa_matched;
        end loop;
      end if;
      v_is_correct := v_sa_matched;
      if v_sa_matched then v_earned := v_rec.max_points; end if;
      update public.session_answers
         set is_correct = v_is_correct, earned_points = v_earned,
             grader = '{"type":"auto","method":"short_answer"}'::jsonb
       where id = v_rec.answer_id;

    elsif v_question_type = 'essay' then
      update public.session_answers
         set grader = '{"type":"pending","method":"manual"}'::jsonb
       where id = v_rec.answer_id;
    end if;

    v_total_score := v_total_score + v_earned;
  end loop;

  update public.exam_sessions
     set score = v_total_score, scored_at = now(), updated_at = now()
   where id = p_session_id;

  return v_total_score;
end;
$function$;

revoke all on function public.score_exam_session(uuid) from public, anon, authenticated;

-- B2) submit_exam_session(): kiểm quyền + finalize, rồi uỷ thác chấm ---------
create or replace function public.submit_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_student_id uuid;
  v_status     text;
begin
  select es.student_id, es.status into v_student_id, v_status
    from public.exam_sessions es where es.id = p_session_id;

  if v_student_id is null then raise exception 'Session not found'; end if;
  if v_student_id <> (select auth.uid()) then raise exception 'Permission denied'; end if;
  if v_status <> 'in_progress' then return; end if;

  update public.exam_sessions
     set status = 'submitted', submitted_at = now(), updated_at = now()
   where id = p_session_id and student_id = v_student_id;

  perform public.score_exam_session(p_session_id);
end;
$function$;

-- B3) expire_overdue_exam_sessions(): finalize rồi chấm luôn -----------------
create or replace function public.expire_overdue_exam_sessions()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_ids uuid[];
  v_id  uuid;
begin
  with upd as (
    update public.exam_sessions as s
    set status = 'submitted',
        submitted_at = coalesce(s.due_at, s.started_at + make_interval(mins => rm.duration_minutes)),
        client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
        updated_at = now()
    from public.exam_rooms rm
    where s.status = 'in_progress'
      and rm.id = s.exam_room_id
      and coalesce(s.due_at, s.started_at + make_interval(mins => rm.duration_minutes)) <= now()
    returning s.id
  )
  select array_agg(id) into v_ids from upd;

  if v_ids is not null then
    foreach v_id in array v_ids loop
      perform public.score_exam_session(v_id);
    end loop;
  end if;

  return coalesce(array_length(v_ids, 1), 0);
end;
$function$;

grant execute on function public.expire_overdue_exam_sessions() to authenticated;

notify pgrst, 'reload schema';

-- ============================================================================
-- HẾT. Sau khi chạy: vào /admin (tài khoản admin/teacher) kiểm tra các khu
-- Kết quả thi / Phòng thi / Chấm tự luận. Nếu lỗi "column ... does not exist"
-- hay "function ... does not exist" -> gửi lại nguyên văn lỗi để đối chiếu.
-- ============================================================================
