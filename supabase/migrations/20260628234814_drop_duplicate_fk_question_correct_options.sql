
-- #6 Remove the duplicate FK (keep the canonical *_fkey); root cause of PGRST201 embed ambiguity
alter table public.question_correct_options
  drop constraint question_correct_options_question_id_fk;
;
