-- Betynz v6 hardening: Persistence Core RPCs are server-only.
-- Run after 019_persistence_core.sql.

revoke all on function public.betynz_acquire_job_lock(text, text, integer) from public, anon, authenticated;
revoke all on function public.betynz_renew_job_lock(text, text, integer) from public, anon, authenticated;
revoke all on function public.betynz_release_job_lock(text, text) from public, anon, authenticated;
revoke all on function public.betynz_upsert_board_snapshot(text, date, boolean, integer, integer, jsonb, timestamptz) from public, anon, authenticated;

grant execute on function public.betynz_acquire_job_lock(text, text, integer) to service_role;
grant execute on function public.betynz_renew_job_lock(text, text, integer) to service_role;
grant execute on function public.betynz_release_job_lock(text, text) to service_role;
grant execute on function public.betynz_upsert_board_snapshot(text, date, boolean, integer, integer, jsonb, timestamptz) to service_role;

create index if not exists prediction_ledger_golden_date_idx
  on prediction_ledger (engine, fixture_date desc)
  where engine = 'GOLDEN_BANKER_V4_3';
