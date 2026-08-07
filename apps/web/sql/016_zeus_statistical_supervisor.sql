-- Betynz v5.0.18: add Zeus Statistical Intelligence as a stored supervisor engine.
-- The underlying consensus agreement_count remains 1..7 because Zeus supervises
-- the seven independent votes rather than inflating the agreement count.

alter table if exists public.engine_predictions
  drop constraint if exists engine_predictions_engine_check;

alter table if exists public.engine_predictions
  add constraint engine_predictions_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM','ZEUS_SUPERVISOR')) not valid;

alter table if exists public.prediction_snapshots
  drop constraint if exists prediction_snapshots_engine_check;

alter table if exists public.prediction_snapshots
  add constraint prediction_snapshots_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM','ZEUS_SUPERVISOR')) not valid;

create index if not exists prediction_snapshots_zeus_supervisor_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'ZEUS_SUPERVISOR';
