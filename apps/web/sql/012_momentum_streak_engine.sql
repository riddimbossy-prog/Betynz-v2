-- Betynz v5.0.5 upgrade for the Momentum & Streak Engine.
-- Existing records remain valid. New writes may use all four active engines.

alter table if exists public.engine_predictions
  drop constraint if exists engine_predictions_engine_check;

alter table if exists public.engine_predictions
  add constraint engine_predictions_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','CONVERGENCE_ROUTE','MOMENTUM_STREAK')) not valid;

alter table if exists public.prediction_snapshots
  drop constraint if exists prediction_snapshots_engine_check;

alter table if exists public.prediction_snapshots
  add constraint prediction_snapshots_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','CONVERGENCE_ROUTE','MOMENTUM_STREAK')) not valid;

alter table if exists public.consensus_candidates
  drop constraint if exists consensus_candidates_agreement_count_check;

alter table if exists public.consensus_candidates
  add constraint consensus_candidates_agreement_count_check
  check (agreement_count between 1 and 4) not valid;

alter table if exists public.consensus_snapshots
  drop constraint if exists consensus_snapshots_agreement_count_check;

alter table if exists public.consensus_snapshots
  add constraint consensus_snapshots_agreement_count_check
  check (agreement_count between 1 and 4) not valid;

create index if not exists prediction_snapshots_momentum_streak_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'MOMENTUM_STREAK';

create index if not exists engine_predictions_momentum_streak_idx
  on public.engine_predictions (fixture_date desc, status)
  where engine = 'MOMENTUM_STREAK';
