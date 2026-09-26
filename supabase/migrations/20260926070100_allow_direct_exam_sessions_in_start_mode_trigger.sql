-- The BEFORE INSERT trigger assert_session_start_mode() unconditionally looked
-- up new.exam_room_id in v_exam_room_readiness and raised ROOM_NOT_FOUND when
-- it was null. This made start_exam_session() (the new direct-exam flow,
-- which inserts exam_room_id = null / exam_id = <exams.id>) fail on every
-- call -- discovered while smoke-testing the exam-bank feature. Add a bypass:
-- when there is no room but there IS an exam_id, this is the new direct-exam
-- flow and the row is allowed through (start_exam_session already validated
-- the exam is published/accessible before inserting). Room-backed sessions
-- keep their original validation unchanged.

CREATE OR REPLACE FUNCTION private.assert_session_start_mode()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  room_mode public.exam_room_mode;
  room_ready boolean;
begin
  if new.exam_room_id is null then
    if new.exam_id is not null then
      return new;
    end if;
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select readiness.mode, readiness.is_ready
    into room_mode, room_ready
  from public.v_exam_room_readiness readiness
  where readiness.id = new.exam_room_id;

  if room_mode is null then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  if room_mode = 'practice'
     and coalesce(current_setting('app.session_start_flow', true), '') <> 'practice'
  then
    raise exception 'PRACTICE_REQUIRES_PRACTICE_RPC';
  end if;

  if not coalesce(room_ready, false) then
    raise exception 'ROOM_NOT_READY';
  end if;

  return new;
end;
$function$;
