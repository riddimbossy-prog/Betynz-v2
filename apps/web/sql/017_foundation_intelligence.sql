-- Betynz v5.1.0 foundation intelligence migration.
-- Adds auditable prediction lineage, canonical provider identity mappings,
-- and precomputed feature snapshots without changing the active engine codes.

create extension if not exists pgcrypto;

create table if not exists public.prediction_lineage (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz,
  engine text not null,
  original_market text,
  final_market text,
  final_odds numeric(8,3),
  odds_gate_action text,
  validation_status text,
  recovery_used boolean not null default false,
  lineage jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, engine, fixture_date)
);

create table if not exists public.provider_identity_map (
  id uuid primary key default gen_random_uuid(),
  canonical_key text not null,
  entity_type text not null check (entity_type in ('FIXTURE','TEAM')),
  provider text not null,
  provider_entity_id text not null,
  mapping_confidence numeric(5,4) not null default 0,
  verified boolean not null default false,
  canonical_name text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (canonical_key, provider)
);

create table if not exists public.feature_snapshots (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz,
  data_quality numeric(5,2),
  features jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (fixture_id, fixture_date)
);

create index if not exists prediction_lineage_date_idx
  on public.prediction_lineage (fixture_date desc, engine);
create index if not exists prediction_lineage_recovery_idx
  on public.prediction_lineage (recovery_used, fixture_date desc);
create index if not exists provider_identity_provider_idx
  on public.provider_identity_map (provider, entity_type, verified, updated_at desc);
create index if not exists provider_identity_entity_idx
  on public.provider_identity_map (provider_entity_id, provider);
create index if not exists feature_snapshots_date_idx
  on public.feature_snapshots (fixture_date desc, data_quality desc);

alter table public.prediction_lineage enable row level security;
alter table public.provider_identity_map enable row level security;
alter table public.feature_snapshots enable row level security;

revoke insert,update,delete on public.prediction_lineage from anon,authenticated;
revoke insert,update,delete on public.provider_identity_map from anon,authenticated;
revoke insert,update,delete on public.feature_snapshots from anon,authenticated;
