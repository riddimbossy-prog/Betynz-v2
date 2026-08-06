-- Betynz v3.5 fresh database schema with four engines, consensus and calibration.
-- Use this only for a new Supabase project.

create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  display_name text,
  role text not null default 'user' check (role in ('user','admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id,email,display_name,role)
  values (new.id,new.email,coalesce(new.raw_user_meta_data->>'display_name',''),'user')
  on conflict (id) do update set email=excluded.email;
  return new;
end; $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of email on auth.users
for each row execute procedure public.handle_new_user();

create table if not exists public.engine_predictions (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz,
  country text,
  league_name text,
  home_team text not null,
  away_team text not null,
  engine text not null check (engine in ('MARKET_ROUTE','PPG_ROUTE','CONVERGENCE_ROUTE','MOMENTUM_STREAK')),
  market text not null,
  odds numeric(8,3),
  engine_score numeric(5,2),
  grade text,
  decision text not null,
  status text not null default 'PENDING' check (status in ('PENDING','LIVE','WON','LOST','VOID','PUSH')),
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,engine,market,fixture_date)
);

create table if not exists public.prediction_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  source_fixture_id text,
  fixture_date date not null,
  kickoff timestamptz not null,
  country text,
  league_name text,
  home_team text not null,
  away_team text not null,
  engine text not null check (engine in ('MARKET_ROUTE','PPG_ROUTE','CONVERGENCE_ROUTE','MOMENTUM_STREAK')),
  market text not null,
  selection_label text,
  odds numeric(8,3),
  engine_score numeric(5,2),
  grade text,
  decision text not null,
  settlement_status text not null default 'PENDING' check (settlement_status in ('PENDING','LIVE','WON','LOST','VOID','PUSH','REVIEW')),
  home_score integer,
  away_score integer,
  halftime_home_score integer,
  halftime_away_score integer,
  result_source text,
  result_match_confidence numeric(5,2),
  profit_units numeric(10,3) not null default 0,
  reasons jsonb not null default '[]'::jsonb,
  odds_snapshot jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  frozen_at timestamptz not null default now(),
  settled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,engine,fixture_date)
);

create table if not exists public.odds_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  captured_at timestamptz not null default now(),
  bookmaker text not null default 'Live odds feed',
  markets jsonb not null default '{}'::jsonb,
  unique (fixture_id,captured_at)
);

create table if not exists public.match_results (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz,
  country text,
  league_name text,
  home_team text not null,
  away_team text not null,
  status text not null,
  home_score integer,
  away_score integer,
  halftime_home_score integer,
  halftime_away_score integer,
  source text not null,
  source_fixture_id text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id,fixture_date)
);

create index if not exists engine_predictions_date_idx on public.engine_predictions (fixture_date desc);
create index if not exists prediction_snapshots_date_idx on public.prediction_snapshots (fixture_date desc,settlement_status);
create index if not exists prediction_snapshots_engine_idx on public.prediction_snapshots (engine,market,fixture_date desc);
create index if not exists odds_snapshots_fixture_idx on public.odds_snapshots (fixture_id,captured_at desc);
create index if not exists match_results_date_idx on public.match_results (fixture_date desc);

alter table public.profiles enable row level security;
alter table public.engine_predictions enable row level security;
alter table public.prediction_snapshots enable row level security;
alter table public.odds_snapshots enable row level security;
alter table public.match_results enable row level security;

revoke insert,update,delete on public.profiles from anon,authenticated;
-- Promote the admin after creating the auth user:
-- update public.profiles set role='admin' where email='YOUR_EMAIL@example.com';


-- Consensus and calibration tables.
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
  agreement_count integer not null check (agreement_count between 1 and 4),
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
  agreement_count integer not null check (agreement_count between 1 and 4),
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
