-- Betynz v3.0 upgrade for an existing database.
-- Existing frozen rows are preserved for record integrity.
-- NOT VALID skips historical validation while enforcing MARKET_ROUTE on new writes.

alter table if exists public.engine_predictions
  drop constraint if exists engine_predictions_engine_check;

alter table if exists public.engine_predictions
  add constraint engine_predictions_engine_check
  check (engine = 'MARKET_ROUTE') not valid;

alter table if exists public.prediction_snapshots
  drop constraint if exists prediction_snapshots_engine_check;

alter table if exists public.prediction_snapshots
  add constraint prediction_snapshots_engine_check
  check (engine = 'MARKET_ROUTE') not valid;

create index if not exists prediction_snapshots_market_route_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'MARKET_ROUTE';

create index if not exists engine_predictions_market_route_idx
  on public.engine_predictions (fixture_date desc, status)
  where engine = 'MARKET_ROUTE';

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
  ) as live_constraint_ready;
