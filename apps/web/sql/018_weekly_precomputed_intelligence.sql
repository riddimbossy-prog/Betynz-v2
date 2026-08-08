-- Betynz v5.1.1 weekly precomputed intelligence migration.
-- Persists complete day-level public views so the website can serve prepared
-- engine/Consensus/Zeus results instantly after restarts without recomputing
-- the visible week on the user's request path.

create extension if not exists pgcrypto;

create table if not exists public.prepared_intelligence_views (
  id uuid primary key default gen_random_uuid(),
  view_key text not null check (view_key in (
    'FIXTURE_BOARD','MARKET_ROUTE','STATS_BUNDLE','STREAK_VALUE','ZEUS','CONSENSUS_DAY'
  )),
  fixture_date date not null,
  complete boolean not null default false,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (view_key, fixture_date)
);

create index if not exists prepared_intelligence_date_idx
  on public.prepared_intelligence_views (fixture_date asc, view_key);
create index if not exists prepared_intelligence_complete_idx
  on public.prepared_intelligence_views (complete, fixture_date asc);

alter table public.prepared_intelligence_views enable row level security;
revoke insert,update,delete on public.prepared_intelligence_views from anon,authenticated;
