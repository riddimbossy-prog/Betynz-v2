-- Betynz v5.0.14: add Atlas Streak Value and Chronos HT/FT Momentum engines.

alter table if exists public.engine_predictions
  drop constraint if exists engine_predictions_engine_check;

alter table if exists public.engine_predictions
  add constraint engine_predictions_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM')) not valid;

alter table if exists public.prediction_snapshots
  drop constraint if exists prediction_snapshots_engine_check;

alter table if exists public.prediction_snapshots
  add constraint prediction_snapshots_engine_check
  check (engine in ('MARKET_ROUTE','PPG_ROUTE','APEX_INTELLIGENCE','CONVERGENCE_ROUTE','MOMENTUM_STREAK','STREAK_VALUE','HTFT_MOMENTUM')) not valid;

create index if not exists prediction_snapshots_streak_value_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'STREAK_VALUE';

create index if not exists prediction_snapshots_htft_momentum_idx
  on public.prediction_snapshots (fixture_date desc, settlement_status)
  where engine = 'HTFT_MOMENTUM';

alter table if exists public.consensus_candidates
  drop constraint if exists consensus_candidates_agreement_count_check;

alter table if exists public.consensus_candidates
  add constraint consensus_candidates_agreement_count_check
  check (agreement_count between 1 and 7) not valid;

alter table if exists public.consensus_snapshots
  drop constraint if exists consensus_snapshots_agreement_count_check;

alter table if exists public.consensus_snapshots
  add constraint consensus_snapshots_agreement_count_check
  check (agreement_count between 1 and 7) not valid;
