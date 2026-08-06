-- Betynz v3.2 upgrade for the PPG Route Engine.
-- Existing frozen records are preserved. New writes may use MARKET_ROUTE or PPG_ROUTE.

alter table if exists public.engine_predictions
  drop constraint if exists engine_predictions_engine_check;

alter table if exists public.engine_predictions
  add constraint engine_predictions_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE')) not valid;

alter table if exists public.prediction_snapshots
  drop constraint if exists prediction_snapshots_engine_check;

alter table if exists public.prediction_snapshots
  add constraint prediction_snapshots_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE')) not valid;

create index if not exists prediction_snapshots_ppg_route_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'PPG_ROUTE';

create index if not exists engine_predictions_ppg_route_idx
  on public.engine_predictions (fixture_date desc, status)
  where engine = 'PPG_ROUTE';

select
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.prediction_snapshots'::regclass
      and conname = 'prediction_snapshots_engine_check'
  ) as snapshot_constraint_ready,
  exists(
    select 1 from pg_constraint
    where conrelid = 'public.engine_predictions'::regclass
      and conname = 'engine_predictions_engine_check'
  ) as live_constraint_ready,
  exists(
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'prediction_snapshots_ppg_route_idx'
  ) as ppg_snapshot_index_ready;
