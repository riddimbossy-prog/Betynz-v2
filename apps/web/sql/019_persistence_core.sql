-- Betynz v5.2.0 Persistence Core
-- Durable prediction ledger, resumable fixture checkpoints and scheduler leases.

create extension if not exists pgcrypto;

create table if not exists prediction_ledger (
  id uuid primary key default gen_random_uuid(),
  fixture_id text not null,
  fixture_date date not null,
  kickoff timestamptz,
  country text,
  league_name text,
  home_team text,
  away_team text,
  engine text not null,
  market text not null,
  selection_label text not null,
  odds numeric,
  engine_score numeric,
  grade text,
  decision text,
  reasons jsonb not null default '[]'::jsonb,
  odds_snapshot jsonb not null default '{}'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  fingerprint text not null,
  first_fired_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  settlement_status text not null default 'PENDING',
  settled_at timestamptz,
  home_score integer,
  away_score integer,
  profit_units numeric,
  result_payload jsonb,
  unique (fixture_id, engine, fingerprint)
);

create index if not exists prediction_ledger_date_idx on prediction_ledger (fixture_date desc, kickoff desc);
create index if not exists prediction_ledger_engine_idx on prediction_ledger (engine, fixture_date desc);
create index if not exists prediction_ledger_status_idx on prediction_ledger (settlement_status, fixture_date desc);

create table if not exists fixture_processing_state (
  fixture_date date not null,
  fixture_id text not null,
  source_fixture_id text,
  kickoff timestamptz,
  odds_fingerprint text,
  analysis_ready boolean not null default false,
  state text not null default 'PENDING',
  stage text,
  attempts integer not null default 0,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  completed_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (fixture_date, fixture_id)
);

create index if not exists fixture_processing_state_state_idx on fixture_processing_state (fixture_date, state, updated_at);

create table if not exists persistence_job_runs (
  job_key text primary key,
  job_kind text not null,
  fixture_date date,
  state text not null default 'PENDING',
  phase text,
  cursor_value integer not null default 0,
  total integer not null default 0,
  completed_count integer not null default 0,
  failed_count integer not null default 0,
  attempts integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  last_error text,
  started_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists persistence_job_runs_state_idx on persistence_job_runs (state, updated_at desc);

create table if not exists persistence_job_locks (
  lock_key text primary key,
  owner text not null,
  lease_until timestamptz not null,
  acquired_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists persistence_job_locks_lease_idx on persistence_job_locks (lease_until);

create table if not exists board_snapshots (
  board_key text not null,
  fixture_date date not null,
  revision bigint not null default 1,
  complete boolean not null default false,
  progress_processed integer not null default 0,
  progress_total integer not null default 0,
  payload jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (board_key, fixture_date)
);

create index if not exists board_snapshots_date_idx on board_snapshots (fixture_date desc, board_key);

-- Atomically lease a job. Expired leases may be claimed by another process.
create or replace function betynz_acquire_job_lock(
  p_lock_key text,
  p_owner text,
  p_lease_seconds integer default 900
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_lease timestamptz := now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 900), 21600)));
  v_owner text;
  v_until timestamptz;
begin
  insert into persistence_job_locks(lock_key, owner, lease_until, acquired_at, updated_at)
  values (p_lock_key, p_owner, v_lease, v_now, v_now)
  on conflict (lock_key) do nothing;

  select owner, lease_until into v_owner, v_until
  from persistence_job_locks where lock_key = p_lock_key for update;

  if v_owner = p_owner or v_until <= v_now then
    update persistence_job_locks
      set owner = p_owner,
          lease_until = v_lease,
          acquired_at = case when v_owner = p_owner then acquired_at else v_now end,
          updated_at = v_now
    where lock_key = p_lock_key;
    return true;
  end if;

  return false;
end;
$$;

create or replace function betynz_renew_job_lock(
  p_lock_key text,
  p_owner text,
  p_lease_seconds integer default 900
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update persistence_job_locks
    set lease_until = now() + make_interval(secs => greatest(30, least(coalesce(p_lease_seconds, 900), 21600))),
        updated_at = now()
  where lock_key = p_lock_key and owner = p_owner;
  return found;
end;
$$;

create or replace function betynz_release_job_lock(
  p_lock_key text,
  p_owner text
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from persistence_job_locks where lock_key = p_lock_key and owner = p_owner;
  return found;
end;
$$;

-- Prevent an incomplete/older board checkpoint from replacing a more complete one.
create or replace function betynz_upsert_board_snapshot(
  p_board_key text,
  p_fixture_date date,
  p_complete boolean,
  p_progress_processed integer,
  p_progress_total integer,
  p_payload jsonb,
  p_generated_at timestamptz default now()
) returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing board_snapshots%rowtype;
  v_processed integer := greatest(0, coalesce(p_progress_processed, 0));
  v_total integer := greatest(0, coalesce(p_progress_total, 0));
begin
  select * into v_existing
  from board_snapshots
  where board_key = p_board_key and fixture_date = p_fixture_date
  for update;

  if not found then
    insert into board_snapshots(board_key, fixture_date, complete, progress_processed, progress_total, payload, generated_at)
    values (p_board_key, p_fixture_date, coalesce(p_complete, false), v_processed, v_total, coalesce(p_payload, '{}'::jsonb), p_generated_at);
    return true;
  end if;

  if v_existing.complete and not coalesce(p_complete, false) then
    return false;
  end if;

  if not coalesce(p_complete, false) and v_processed < v_existing.progress_processed then
    return false;
  end if;

  update board_snapshots
    set revision = v_existing.revision + 1,
        complete = coalesce(p_complete, false),
        progress_processed = greatest(v_existing.progress_processed, v_processed),
        progress_total = greatest(v_existing.progress_total, v_total),
        payload = coalesce(p_payload, '{}'::jsonb),
        generated_at = coalesce(p_generated_at, now()),
        updated_at = now()
  where board_key = p_board_key and fixture_date = p_fixture_date;
  return true;
end;
$$;

alter table prediction_ledger enable row level security;
alter table fixture_processing_state enable row level security;
alter table persistence_job_runs enable row level security;
alter table persistence_job_locks enable row level security;
alter table board_snapshots enable row level security;

-- No public policies are created. Betynz accesses these tables server-side using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. Admin data stays private.
