-- Vá lỗi lõi chấm điểm (Giai đoạn 0).
--
-- Triệu chứng: get_session_review() gọi public.score_exam_session() và select
-- s.scored_at, nhưng CẢ HAI đều chưa từng tồn tại:
--   * Hàm score_exam_session: chưa được định nghĩa ở bất kỳ migration nào.
--   * Cột exam_sessions.scored_at: chỉ có max_score, không có scored_at.
-- Hệ quả: mọi phiên bị tự-hết-giờ (được các nhánh sweep chuyển sang 'submitted'
-- mà KHÔNG chấm) khi vào /result sẽ có score = null -> review RPC nổ lỗi
-- "function public.score_exam_session(uuid) does not exist" / "column
-- s.scored_at does not exist".
--
-- Nguyên nhân gốc: logic chấm nằm BÊN TRONG submit_exam_session, mà hàm này chỉ
-- chạy cho phiên 'in_progress' của đúng người gọi (auth.uid). Tất cả các nhánh
-- tự-finalize (cron expire_overdue_exam_sessions, join_exam, get_active_session,
-- và sweep inline trong get_session_review) đều bỏ qua bước chấm.
--
-- Bản vá:
--   1. Thêm cột exam_sessions.scored_at.
--   2. Tách logic chấm thành hàm độc lập, idempotent score_exam_session(uuid):
--      chạy được trên phiên bất kỳ (in_progress/submitted), suy student từ chính
--      dòng phiên (an toàn khi gọi từ cron / RPC SECURITY DEFINER khác). Đây là
--      NGUỒN CHÂN LÝ DUY NHẤT cho việc chấm.
--   3. submit_exam_session: giữ kiểm tra quyền + chuyển trạng thái, rồi uỷ thác
--      việc chấm cho score_exam_session (hết trùng lặp logic).
--   4. expire_overdue_exam_sessions: chấm luôn các phiên nó vừa finalize, để
--      điểm có sẵn cho thống kê giáo viên mà không phải chờ thí sinh mở /result.
--
-- Không đụng max_score (giữ mặc định 10.00 như hiện tại) để tránh rủi ro ngoài
-- phạm vi. Không đổi trạng thái phiên trong score_exam_session.

-- 1) Cột scored_at ------------------------------------------------------------
alter table public.exam_sessions
  add column if not exists scored_at timestamptz;

-- 2) score_exam_session(uuid): hàm chấm thuần, idempotent ---------------------
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
  -- Suy student từ chính phiên (KHÔNG dùng auth.uid) để cron/RPC definer gọi được.
  select es.student_id
    into v_student_id
    from public.exam_sessions es
   where es.id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  ---------------------------------------------------------------
  -- Chấm từng câu đã trả lời
  ---------------------------------------------------------------
  for v_rec in
    select
      sa.id            as answer_id,
      sa.answer_json   as answer_json,
      sa.session_question_id,
      esq.question_id,
      esq.max_points,
      q.type           as question_type
    from public.session_answers sa
    join public.exam_session_questions esq
      on esq.id = sa.session_question_id
    join public.questions q
      on q.id = esq.question_id
    where esq.session_id = p_session_id
      and sa.student_id = v_student_id
  loop
    v_answer_json   := v_rec.answer_json;
    v_question_type := v_rec.question_type::text;
    v_is_correct    := false;
    v_earned        := 0;

    -------------------------------------------------------
    -- Trắc nghiệm (multiple_choice)
    -------------------------------------------------------
    if v_question_type = 'multiple_choice' then
      v_selected_option := (v_answer_json ->> 'option_id')::uuid;

      if v_selected_option is not null then
        select exists(
          select 1
            from public.question_correct_options qco
           where qco.question_id = v_rec.question_id
             and qco.option_id   = v_selected_option
        ) into v_is_correct;

        if v_is_correct then
          v_earned := v_rec.max_points;
        end if;
      end if;

      update public.session_answers
         set is_correct  = v_is_correct,
             earned_points = v_earned,
             grader = '{"type":"auto","method":"mcq_exact"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- Đúng/Sai (partial qua score-steps)
    -------------------------------------------------------
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

        insert into public.session_tf_item_answers
          (session_question_id, item_id, selected_value, is_correct)
        values (
          v_rec.session_question_id,
          v_item_key.item_id,
          case
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'true'  then true
            when v_answer_json -> 'items' ->> v_item_key.item_id::text = 'false' then false
            else null
          end,
          v_item_correct
        )
        on conflict (session_question_id, item_id)
        do update set
          selected_value = excluded.selected_value,
          is_correct     = excluded.is_correct,
          updated_at     = now();
      end loop;

      select coalesce(tfs.points, 0)
        into v_earned
        from public.question_tf_score_steps tfs
       where tfs.question_id = v_rec.question_id
         and tfs.correct_item_count = v_correct_count;

      if v_earned is null then
        v_earned := 0;
      end if;

      v_is_correct := (v_earned = v_rec.max_points);

      update public.session_answers
         set is_correct        = v_is_correct,
             correct_item_count = v_correct_count,
             earned_points     = v_earned,
             grader = '{"type":"auto","method":"tf_partial"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- Trả lời ngắn (short_answer)
    -------------------------------------------------------
    elsif v_question_type = 'short_answer' then
      v_sa_text := trim(v_answer_json ->> 'value');
      v_sa_matched := false;

      if v_sa_text is not null and v_sa_text <> '' then
        for v_sa_key in
          select sak.*
            from public.question_short_answer_keys sak
           where sak.question_id = v_rec.question_id
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

          elsif v_sa_key.answer_type = 'text' then
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

            elsif v_sa_key.match_mode = 'regex' then
              if v_sa_key.regex_pattern is not null then
                begin
                  v_sa_matched := (v_sa_text ~ v_sa_key.regex_pattern);
                exception when others then
                  v_sa_matched := false;
                end;
              end if;
            end if;
          end if;

          exit when v_sa_matched;
        end loop;
      end if;

      v_is_correct := v_sa_matched;
      if v_sa_matched then
        v_earned := v_rec.max_points;
      end if;

      update public.session_answers
         set is_correct    = v_is_correct,
             earned_points = v_earned,
             grader = '{"type":"auto","method":"short_answer"}'::jsonb
       where id = v_rec.answer_id;

    -------------------------------------------------------
    -- Tự luận (essay) -> để chấm tay
    -------------------------------------------------------
    elsif v_question_type = 'essay' then
      update public.session_answers
         set grader = '{"type":"pending","method":"manual"}'::jsonb
       where id = v_rec.answer_id;
      -- v_earned giữ 0 — giáo viên cập nhật sau.
    end if;

    v_total_score := v_total_score + v_earned;
  end loop;

  ---------------------------------------------------------------
  -- Ghi điểm + mốc chấm. KHÔNG đổi status (nhiệm vụ của caller).
  ---------------------------------------------------------------
  update public.exam_sessions
     set score      = v_total_score,
         scored_at  = now(),
         updated_at = now()
   where id = p_session_id;

  return v_total_score;
end;
$function$;

-- Chỉ gọi nội bộ (submit / cron / review đều là SECURITY DEFINER cùng owner).
-- Không cấp cho authenticated để thí sinh không tự kích hoạt chấm giữa chừng.
revoke all on function public.score_exam_session(uuid) from public, anon, authenticated;

-- 3) submit_exam_session: kiểm quyền + finalize, rồi uỷ thác chấm -------------
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
  select es.student_id, es.status
    into v_student_id, v_status
    from public.exam_sessions es
   where es.id = p_session_id;

  if v_student_id is null then
    raise exception 'Session not found';
  end if;

  if v_student_id <> (select auth.uid()) then
    raise exception 'Permission denied';
  end if;

  -- Idempotent: đã nộp thì thôi.
  if v_status <> 'in_progress' then
    return;
  end if;

  update public.exam_sessions
     set status       = 'submitted',
         submitted_at = now(),
         updated_at   = now()
   where id = p_session_id
     and student_id = v_student_id;

  perform public.score_exam_session(p_session_id);
end;
$function$;

-- 4) expire_overdue_exam_sessions: finalize rồi chấm luôn ---------------------
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
        submitted_at = coalesce(
          s.due_at,
          s.started_at + make_interval(mins => rm.duration_minutes)
        ),
        client_info = s.client_info || jsonb_build_object('finalized', 'auto_expired'),
        updated_at = now()
    from public.exam_rooms rm
    where s.status = 'in_progress'
      and rm.id = s.exam_room_id
      and coalesce(
        s.due_at,
        s.started_at + make_interval(mins => rm.duration_minutes)
      ) <= now()
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
