-- Mo rong exam_sessions cho luong "lam de truc tiep" (khong qua exam_rooms/exam_keys).
-- Additive: khong doi cot cu, khong pha luong exam_rooms/exam_keys hien tai (FE cu van chay).

-- 1) Them cot exam_id, cho phep truy vet phien lam de nao khi lam truc tiep tu exams.
alter table public.exam_sessions
  add column if not exists exam_id uuid references public.exams(id);

comment on column public.exam_sessions.exam_id is
  'De thi (bang exams) duoc lam truc tiep, khong qua exam_rooms. NULL cho luong cu (exam_room/key).';

-- 2) exam_room_id dang NOT NULL -> phai cho nullable de luong moi (khong co room) insert duoc.
--    key_id da nullable san (kiem tra truoc khi ALTER, tranh loi neu da nullable).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_sessions'
      and column_name = 'exam_room_id' and is_nullable = 'NO'
  ) then
    alter table public.exam_sessions alter column exam_room_id drop not null;
  end if;

  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_sessions'
      and column_name = 'key_id' and is_nullable = 'NO'
  ) then
    alter table public.exam_sessions alter column key_id drop not null;
  end if;
end;
$$;

-- 3) exam_session_questions.blueprint_section_id la NOT NULL FK -> exam_blueprint_sections.
--    295 de OCR-import hien tai deu KHONG co blueprint_id (khong dung blueprint/exam_rooms),
--    nen khong the gan blueprint_section_id hop le cho luong lam-de-truc-tiep.
--    Lam cot nullable (additive, an toan): NULL bo qua kiem tra FK, luong cu (co blueprint)
--    van insert gia tri non-null nhu truoc, khong doi hanh vi.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'exam_session_questions'
      and column_name = 'blueprint_section_id' and is_nullable = 'NO'
  ) then
    alter table public.exam_session_questions alter column blueprint_section_id drop not null;
  end if;
end;
$$;

-- 4) get_user_access(): tra trang thai VIP subscription hien tai cua nguoi dung.
create or replace function public.get_user_access()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_expires_at timestamptz;
  v_plan_code text;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select e.expires_at, e.metadata ->> 'plan_code'
    into v_expires_at, v_plan_code
  from public.entitlements e
  where e.user_id = v_uid
    and e.kind = 'vip_subscription'
    and e.revoked_at is null
    and e.expires_at > now()
  order by e.expires_at desc
  limit 1;

  if v_expires_at is null then
    return jsonb_build_object('is_vip', false, 'plan_code', null, 'expires_at', null);
  end if;

  return jsonb_build_object(
    'is_vip', true,
    'plan_code', v_plan_code,
    'expires_at', v_expires_at
  );
end;
$$;

revoke all on function public.get_user_access() from public, anon;
grant execute on function public.get_user_access() to authenticated;
comment on function public.get_user_access() is
  'Tra {is_vip, plan_code, expires_at} cua nguoi dung hien tai dua tren entitlements.kind=vip_subscription con hieu luc.';

-- 5) start_exam_session(p_exam_id): khoi tao phien lam de truc tiep tu bang exams,
--    khong qua exam_rooms/exam_keys. De free (is_free=true) ai cung lam duoc; de
--    khong free doi hoi VIP dang active (entitlements.kind=vip_subscription).
create or replace function public.start_exam_session(p_exam_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_variable
declare
  student_id uuid := (select auth.uid());
  exam_row public.exams%rowtype;
  session_id uuid;
  attempt_number integer;
  now_at timestamptz := now();
  is_vip boolean := false;
  computed_max_points numeric;
  total_max_score numeric;
begin
  if student_id is null then
    raise exception 'NOT_AUTHENTICATED';
  end if;

  select * into exam_row
  from public.exams
  where id = p_exam_id
    and status = 'published';

  if not found then
    raise exception 'EXAM_NOT_AVAILABLE';
  end if;

  if not exam_row.is_free then
    select exists (
      select 1
      from public.entitlements e
      where e.user_id = student_id
        and e.kind = 'vip_subscription'
        and e.revoked_at is null
        and e.expires_at > now_at
    ) into is_vip;

    if not is_vip then
      raise exception 'UPGRADE_REQUIRED';
    end if;
  end if;

  insert into public.students (id, full_name)
  select pr.id, pr.full_name
  from public.profiles pr
  where pr.id = student_id
  on conflict (id) do nothing;

  select coalesce(max(s.attempt_number), 0) + 1
    into attempt_number
  from public.exam_sessions s
  where s.student_id = student_id
    and s.exam_id = p_exam_id;

  -- Khong co blueprint cho 295 de OCR-import hien tai (blueprint_id = null het) nen
  -- khong the chia diem theo tung phan/blueprint_section nhu luong exam_rooms cu.
  -- Don gian hoa: chia deu tong 10 diem cho tat ca cau hoi cua de (deviation, xem bao cao).
  computed_max_points := round(10.0 / greatest(exam_row.question_count, 1), 4);

  insert into public.exam_sessions (
    student_id, exam_id, exam_room_id, key_id, paper_id, attempt_number,
    status, started_at, due_at, max_score,
    shuffle_config, client_info
  )
  values (
    student_id, p_exam_id, null, null, null, attempt_number,
    'in_progress', now_at, now_at + make_interval(mins => exam_row.duration_minutes),
    10.00,
    jsonb_build_object(
      'version', 1,
      'seed', null,
      'shuffleQuestions', 'none',
      'shuffleOptions', true
    ),
    jsonb_build_object('flow', 'direct_exam')
  )
  returning id into session_id;

  update public.exam_sessions
  set shuffle_config = jsonb_set(shuffle_config, '{seed}', to_jsonb(session_id::text))
  where id = session_id;

  insert into public.exam_session_questions (
    session_id, blueprint_section_id, question_id, question_seq,
    display_no, option_order, max_points
  )
  with ordered as (
    select
      q.id as question_id,
      q.type as question_type,
      row_number() over (order by q.part, q.order_in_exam) as display_seq
    from public.questions q
    where q.exam_id = p_exam_id
      and q.deleted_at is null
  )
  select
    session_id,
    null,
    ordered.question_id,
    ordered.display_seq,
    ordered.display_seq::text,
    case
      when ordered.question_type = 'multiple_choice' then coalesce(
        (
          select array_agg(option_row.id order by option_row.sort_key)::uuid[]
          from (
            select
              option.id,
              case
                when count(*) over () = 4
                  and not private.has_option_self_reference(ordered.question_id)
                then md5(
                  session_id::text || ':' ||
                  ordered.question_id::text || ':' ||
                  option.id::text
                )
                else lpad(option.seq::text, 4, '0')
              end as sort_key
            from public.question_options option
            where option.question_id = ordered.question_id
          ) option_row
        ),
        '{}'::uuid[]
      )
      else '{}'::uuid[]
    end,
    computed_max_points
  from ordered
  order by ordered.display_seq;

  select sum(sq.max_points) into total_max_score
  from public.exam_session_questions sq
  where sq.session_id = session_id;

  update public.exam_sessions
  set max_score = coalesce(total_max_score, 10.00)
  where id = session_id;

  return jsonb_build_object('session_id', session_id);
end;
$$;

revoke all on function public.start_exam_session(uuid) from public, anon;
grant execute on function public.start_exam_session(uuid) to authenticated;
comment on function public.start_exam_session(uuid) is
  'Khoi tao phien lam de truc tiep tu bang exams (khong qua exam_rooms/exam_keys). De free: ai cung lam duoc. De tra phi: doi hoi VIP dang active.';

notify pgrst, 'reload schema';
