begin;
-- Fix the live import finalizer before the next forward-only deployment.
-- The previous function assigned text literals to an enum column, which makes
-- the function fail at execution time. It is an internal import operation and
-- must not be exposed as an anonymous/authenticated Data API endpoint.

create or replace function public.finish_import_job(p_job_id uuid)
returns void
language plpgsql
security invoker
set search_path = public, pg_catalog
as $$
declare
  v_success int;
  v_error int;
  v_skip int;
  v_total int;
begin
  select
    count(*) filter (where status = 'success'),
    count(*) filter (where status = 'error'),
    count(*) filter (where status in ('skipped', 'duplicate')),
    count(*)
  into v_success, v_error, v_skip, v_total
  from public.question_import_rows
  where job_id = p_job_id;

  update public.question_import_jobs
  set success_count = v_success,
      error_count = v_error,
      skip_count = v_skip,
      total_rows = v_total,
      status = case
        when v_error = 0 then 'done'::public.import_job_status
        when v_success = 0 then 'failed'::public.import_job_status
        else 'partial'::public.import_job_status
      end,
      finished_at = now()
  where id = p_job_id;
end;
$$;

revoke execute on function public.finish_import_job(uuid) from anon, authenticated;
grant execute on function public.finish_import_job(uuid) to service_role;

rollback;