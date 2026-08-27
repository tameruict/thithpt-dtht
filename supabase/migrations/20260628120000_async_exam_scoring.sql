-- Phase 3 (scale ~100k thí sinh nộp ĐỒNG BỘ): tách "nộp bài" khỏi "chấm điểm".
--
-- Trước đây submit_exam_session() vừa đánh dấu 'submitted' VỪA chạy vòng lặp chấm
-- điểm nặng ngay trong cùng một lời gọi. Khi 100k phiên nộp cùng một khung giờ,
-- 100k vòng chấm nặng đập vào Postgres cùng lúc → spike CPU/ghi, dễ vỡ.
--
-- Sau migration này:
--   • submit_exam_session()  → CHỈ đánh dấu 'submitted' + submitted_at (nhanh, nhẹ).
--                              KHÔNG chấm. score để NULL = "chưa chấm".
--   • score_exam_session()   → vòng chấm điểm tách riêng, idempotent. Chấm 1 phiên.
--                              Gọi được bởi: chủ phiên (lúc xem /result — lazy),
--                              staff, hoặc tiến trình nền (pg_cron, auth.uid()=null).
--   • score_pending_exam_sessions() → worker quét phiên "đã nộp nhưng score NULL"
--                              và chấm dần theo lô (backstop cho HS không mở kết quả).
--
-- Nhờ vậy việc chấm được RẢI ra theo thời điểm mỗi HS mở trang kết quả (đã có
-- jitter nộp 0-25s phía client) thay vì dồn vào đúng khoảnh khắc hết giờ. pg_cron
-- chỉ là lưới an toàn — tính đúng đắn KHÔNG phụ thuộc vào nó.

-- 1) Cột quan sát + index cho worker quét phiên chưa chấm ------------------------
alter table public.exam_sessions
  add column if not exists scored_at timestamptz;
comment on column public.exam_sessions.scored_at is
  'Thời điểm phiên được chấm xong (score được điền). NULL khi đã nộp nhưng chưa chấm.';
create index if not exists idx_exam_sessions_pending_scoring
  on public.exam_sessions (submitted_at)
  where status = 'submitted' and score is null;
-- 2) Hàm chấm 1 phiên (tách từ submit_exam_session cũ) ---------------------------
create or replace function public.score_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_status text;
  v_score numeric;
  v_caller uuid;
  v_total_score numeric := 0;
  v_rec record;
  v_answer_json jsonb;
  v_selected_option uuid;
  v_is_correct boolean;
  v_earned numeric;
  v_correct_count integer;
  v_item_correct boolean;
  v_item_key record;
  v_sa_text text;
  v_sa_key record;
  v_sa_matched boolean;
  v_numeric_val numeric;
begin
  -- Khóa hàng phiên để tuần tự hóa: 2 lời gọi đồng thời (lazy + cron) không chấm
  -- trùng — lời gọi sau thấy score đã có thì thoát sớm.
  select session.student_id, session.status, session.score
    into v_student_id, v_status, v_score
  from public.exam_sessions session
  where session.id = p_session_id
  for update;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  -- Quyền: nếu có người gọi (auth.uid() khác null) thì phải là chủ phiên hoặc
  -- staff. Khi chạy nền qua pg_cron, auth.uid() = null → cho phép.
  v_caller := (select auth.uid());
  if v_caller is not null
     and v_caller <> v_student_id
     and not private.is_staff() then
    raise exception 'Permission denied';
  end if;

  -- Idempotent: chỉ chấm phiên ĐÃ nộp và CHƯA có điểm.
  if v_status <> 'submitted' or v_score is not null then
    return;
  end if;

  for v_rec in
    select
      answer.id as answer_id,
      answer.answer_json,
      answer.selected_option_id,
      answer.short_answer_text,
      answer.session_question_id,
      session_question.question_id,
      session_question.blueprint_section_id,
      session_question.max_points,
      question.type as question_type
    from public.session_answers answer
    join public.exam_session_questions session_question
      on session_question.id = answer.session_question_id
    join public.questions question
      on question.id = session_question.question_id
    where session_question.session_id = p_session_id
      and answer.student_id = v_student_id
  loop
    v_answer_json := coalesce(v_rec.answer_json, '{}'::jsonb);
    v_is_correct := false;
    v_earned := 0;

    if v_rec.question_type = 'multiple_choice' then
      v_selected_option := coalesce(
        nullif(v_answer_json ->> 'option_id', '')::uuid,
        v_rec.selected_option_id
      );

      if v_selected_option is not null then
        select exists(
          select 1
          from public.question_correct_options correct_option
          where correct_option.question_id = v_rec.question_id
            and correct_option.option_id = v_selected_option
        ) into v_is_correct;

        if v_is_correct then
          v_earned := v_rec.max_points;
        end if;
      end if;

      update public.session_answers
      set is_correct = v_is_correct,
          earned_points = v_earned,
          grader = '{"type":"auto","method":"mcq_exact"}'::jsonb
      where id = v_rec.answer_id;

    elsif v_rec.question_type = 'true_false' then
      v_correct_count := 0;

      for v_item_key in
        select key.item_id, key.correct_value
        from public.question_true_false_answer_keys key
        where key.question_id = v_rec.question_id
      loop
        v_item_correct := false;

        if v_answer_json -> 'items' ->> v_item_key.item_id::text is not null then
          if (
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true' and v_item_key.correct_value = true)
            or
            (v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' and v_item_key.correct_value = false)
          ) then
            v_item_correct := true;
            v_correct_count := v_correct_count + 1;
          end if;
        end if;

        insert into public.session_tf_item_answers (
          session_question_id,
          item_id,
          selected_value,
          is_correct
        )
        values (
          v_rec.session_question_id,
          v_item_key.item_id,
          case
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true' then true
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' then false
            else null
          end,
          v_item_correct
        )
        on conflict (session_question_id, item_id)
        do update set
          selected_value = excluded.selected_value,
          is_correct = excluded.is_correct,
          updated_at = now();
      end loop;

      select coalesce(
        (
          select step.points
          from public.question_tf_score_steps step
          where step.question_id = v_rec.question_id
            and step.correct_item_count = v_correct_count
        ),
        (
          select step.points
          from public.exam_blueprint_section_score_steps step
          where step.section_id = v_rec.blueprint_section_id
            and step.correct_item_count = v_correct_count
        ),
        0
      )
      into v_earned;

      v_is_correct := (v_earned = v_rec.max_points);

      update public.session_answers
      set is_correct = v_is_correct,
          correct_item_count = v_correct_count,
          earned_points = v_earned,
          grader = '{"type":"auto","method":"tf_partial"}'::jsonb
      where id = v_rec.answer_id;

    elsif v_rec.question_type = 'short_answer' then
      v_sa_text := trim(coalesce(v_answer_json ->> 'value', v_rec.short_answer_text));
      v_sa_matched := false;

      if v_sa_text is not null and v_sa_text <> '' then
        for v_sa_key in
          select key.*
          from public.question_short_answer_keys key
          where key.question_id = v_rec.question_id
        loop
          if v_sa_key.answer_type = 'numeric' then
            begin
              v_numeric_val := v_sa_text::numeric;
              if v_sa_key.numeric_value is not null
                and abs(v_numeric_val - v_sa_key.numeric_value) <= coalesce(v_sa_key.tolerance, 0)
              then
                v_sa_matched := true;
              end if;
            exception when others then
              null;
            end;
          elsif v_sa_key.answer_type in ('text', 'expression') then
            if v_sa_key.match_mode = 'exact' then
              if v_sa_key.case_sensitive then
                v_sa_matched := (v_sa_text = v_sa_key.normalized_text);
              else
                v_sa_matched := (lower(v_sa_text) = lower(v_sa_key.normalized_text));
              end if;
            elsif v_sa_key.match_mode = 'contains' then
              if v_sa_key.case_sensitive then
                v_sa_matched := (v_sa_text like '%' || v_sa_key.normalized_text || '%');
              else
                v_sa_matched := (lower(v_sa_text) like '%' || lower(v_sa_key.normalized_text) || '%');
              end if;
            elsif v_sa_key.match_mode = 'starts_with' then
              if v_sa_key.case_sensitive then
                v_sa_matched := (v_sa_text like v_sa_key.normalized_text || '%');
              else
                v_sa_matched := (lower(v_sa_text) like lower(v_sa_key.normalized_text) || '%');
              end if;
            end if;
          elsif v_sa_key.answer_type = 'regex' and v_sa_key.regex_pattern is not null then
            begin
              v_sa_matched := (v_sa_text ~ v_sa_key.regex_pattern);
            exception when others then
              v_sa_matched := false;
            end;
          end if;

          exit when v_sa_matched;
        end loop;
      end if;

      v_is_correct := v_sa_matched;
      if v_sa_matched then
        v_earned := v_rec.max_points;
      end if;

      update public.session_answers
      set is_correct = v_is_correct,
          earned_points = v_earned,
          grader = '{"type":"auto","method":"short_answer"}'::jsonb
      where id = v_rec.answer_id;

    elsif v_rec.question_type = 'essay' then
      update public.session_answers
      set grader = '{"type":"pending","method":"manual"}'::jsonb
      where id = v_rec.answer_id;
    end if;

    v_total_score := v_total_score + v_earned;
  end loop;

  update public.exam_sessions
  set score = v_total_score,
      scored_at = now(),
      updated_at = now()
  where id = p_session_id;
end;
$$;
revoke all on function public.score_exam_session(uuid) from public, anon;
grant execute on function public.score_exam_session(uuid) to authenticated;
comment on function public.score_exam_session(uuid) is
  'Chấm điểm 1 phiên đã nộp (idempotent). Gọi bởi chủ phiên khi xem kết quả, staff, hoặc worker nền.';
-- 3) submit_exam_session() → CHỈ đánh dấu đã nộp (nhanh) ------------------------
create or replace function public.submit_exam_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_status text;
begin
  select session.student_id, session.status
    into v_student_id, v_status
  from public.exam_sessions session
  where session.id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  if v_student_id <> (select auth.uid()) then
    raise exception 'Permission denied';
  end if;

  -- Idempotent: đã nộp rồi thì không làm gì (không đụng tới score đã chấm).
  if v_status <> 'in_progress' then
    return;
  end if;

  -- Đánh dấu đã nộp; score giữ NULL = "chưa chấm". Việc chấm chạy nền/lazy qua
  -- score_exam_session() để tránh spike khi 100k phiên nộp cùng lúc.
  update public.exam_sessions
  set status = 'submitted',
      submitted_at = now(),
      updated_at = now()
  where id = p_session_id
    and student_id = v_student_id;
end;
$$;
revoke all on function public.submit_exam_session(uuid) from public, anon;
grant execute on function public.submit_exam_session(uuid) to authenticated;
-- 4) Worker nền: chấm theo lô các phiên đã nộp nhưng chưa chấm ------------------
create or replace function public.score_pending_exam_sessions(p_limit int default 200)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_count int := 0;
begin
  for v_id in
    select session.id
    from public.exam_sessions session
    where session.status = 'submitted'
      and session.score is null
    order by session.submitted_at
    limit greatest(p_limit, 1)
    for update skip locked
  loop
    perform public.score_exam_session(v_id);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;
-- Chỉ tiến trình nền/đặc quyền được gọi worker này (không mở cho authenticated).
revoke all on function public.score_pending_exam_sessions(int) from public, anon, authenticated;
comment on function public.score_pending_exam_sessions(int) is
  'Backstop: chấm theo lô các phiên đã nộp nhưng score còn NULL. Dùng cho pg_cron.';
-- 5) Lưới an toàn pg_cron (tùy chọn) -------------------------------------------
-- Nếu pg_cron đã bật trên project (Dashboard → Database → Extensions), lên lịch
-- worker mỗi 30 giây. Nếu chưa bật, BỎ QUA — tính đúng đắn vẫn đảm bảo nhờ chấm
-- lazy khi HS mở /result. Bật pg_cron rồi chạy lại migration sẽ kích hoạt lịch.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    if exists (
      select 1 from cron.job where jobname = 'score-pending-exam-sessions'
    ) then
      perform cron.unschedule('score-pending-exam-sessions');
    end if;

    perform cron.schedule(
      'score-pending-exam-sessions',
      '30 seconds',
      $cron$ select public.score_pending_exam_sessions(500); $cron$
    );
  else
    raise notice 'pg_cron chưa bật — bỏ qua lịch chấm nền. Chấm lazy khi xem /result vẫn hoạt động.';
  end if;
end;
$$;
notify pgrst, 'reload schema';
