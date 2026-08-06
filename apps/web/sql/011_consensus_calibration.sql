-- Betynz v3.5 upgrade: consensus candidates, immutable consensus snapshots,
-- agreement-level settlement and calibration support.
-- Existing engine predictions and frozen records are preserved.

create table if not exists public.consensus_candidates (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz not null,
  country text,
  league_name text,
  home_team text not null,
  away_team text not null,
  classification text not null check (classification in ('ELITE_BANKER','CONSENSUS_BANKER','QUALIFIED_PICK','SAFER_PICK')),
  agreement_count integer not null check (agreement_count between 1 and 3),
  agreement_direction text,
  market text not null,
  selection_label text,
  odds numeric(8,3),
  consensus_score numeric(5,2),
  engine_codes jsonb not null default '[]'::jsonb,
  engine_picks jsonb not null default '[]'::jsonb,
  status text not null default 'PROVISIONAL' check (status in ('PROVISIONAL','FROZEN')),
  settlement_status text not null default 'PENDING' check (settlement_status in ('PENDING','LIVE','WON','LOST','VOID','PUSH','REVIEW')),
  reasons jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,fixture_date)
);

create table if not exists public.consensus_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz not null,
  country text,
  league_name text,
  home_team text not null,
  away_team text not null,
  classification text not null check (classification in ('ELITE_BANKER','CONSENSUS_BANKER','QUALIFIED_PICK','SAFER_PICK')),
  agreement_count integer not null check (agreement_count between 1 and 3),
  agreement_direction text,
  market text not null,
  selection_label text,
  odds numeric(8,3),
  consensus_score numeric(5,2),
  engine_codes jsonb not null default '[]'::jsonb,
  engine_picks jsonb not null default '[]'::jsonb,
  settlement_status text not null default 'PENDING' check (settlement_status in ('PENDING','LIVE','WON','LOST','VOID','PUSH','REVIEW')),
  home_score integer,
  away_score integer,
  halftime_home_score integer,
  halftime_away_score integer,
  result_source text,
  result_match_confidence numeric(5,2),
  profit_units numeric(10,3) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  frozen_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,fixture_date)
);

create index if not exists consensus_candidates_date_idx
  on public.consensus_candidates (fixture_date asc,kickoff asc,classification);
create index if not exists consensus_snapshots_date_idx
  on public.consensus_snapshots (fixture_date desc,settlement_status,classification);
create index if not exists consensus_snapshots_agreement_idx
  on public.consensus_snapshots (classification,agreement_count,fixture_date desc);

alter table public.consensus_candidates enable row level security;
alter table public.consensus_snapshots enable row level security;
revoke insert,update,delete on public.consensus_candidates from anon,authenticated;
revoke insert,update,delete on public.consensus_snapshots from anon,authenticated;

select
  to_regclass('public.consensus_candidates') is not null as consensus_candidates_ready,
  to_regclass('public.consensus_snapshots') is not null as consensus_snapshots_ready,
  exists(
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'consensus_snapshots_agreement_idx'
  ) as agreement_performance_index_ready;
