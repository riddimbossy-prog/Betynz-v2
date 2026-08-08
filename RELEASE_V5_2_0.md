# Betynz v5.2.0 — Persistence Core

## Purpose
v5.2.0 hardens Betynz against Render restarts, provider cooldowns and overlapping background work without changing the prediction rules of the existing engines.

## What changed
- **Per-fixture durable checkpoints**: completed statistical analysis is written to `fixture_processing_state` in small batches. A restarted process restores completed fixtures and analyzes only unfinished or odds-changed fixtures.
- **Prediction audit ledger**: every qualified engine firing is written to `prediction_ledger` with market, selection, odds, score, grade, reasons, odds snapshot, lineage payload and settlement fields.
- **Distributed scheduler leases**: `persistence_job_locks` plus atomic PostgreSQL RPC functions prevent weekly/date precompute jobs from overlapping across processes.
- **Resumable job ledger**: `persistence_job_runs` records weekly/date job phase, cursor, completed dates, failures and timestamps.
- **Monotonic board progress**: `board_snapshots` refuses a less-complete checkpoint from replacing a completed or more advanced snapshot.
- **Restart hydration**: today's saved engine cards are restored before the HTTP server begins accepting traffic.
- **Settlement linkage**: settled engine snapshots also update matching prediction-ledger records.
- **Private Operations Control**: `/admin-operations.html` shows fixture checkpoints, active leases, jobs, API queues, weekly progress and recent ledger entries.
- **Admin recovery controls**: Refresh Date, Retry Failed and Recompute Fixture are protected by the existing admin session and same-origin checks.
- **Safe migration fallback**: if migration `019_persistence_core.sql` is not installed yet, Betynz continues with in-process locks/checkpoints instead of failing the site.

## Required Supabase migration
Run this file once in Supabase SQL Editor before or immediately after deployment:

`apps/web/sql/019_persistence_core.sql`

The migration creates:
- `prediction_ledger`
- `fixture_processing_state`
- `persistence_job_runs`
- `persistence_job_locks`
- `board_snapshots`
- `betynz_acquire_job_lock(...)`
- `betynz_renew_job_lock(...)`
- `betynz_release_job_lock(...)`
- `betynz_upsert_board_snapshot(...)`

All new tables have RLS enabled and no public policies. Server access uses `SUPABASE_SERVICE_ROLE_KEY`.

## Render settings added
- `PERSISTENCE_CORE_ENABLED=true`
- `PERSISTENCE_DATE_LOCK_SECONDS=10800`
- `PERSISTENCE_WEEK_LOCK_SECONDS=21600`

No second cron service is required.

## Deployment
1. Run `apps/web/sql/019_persistence_core.sql` in Supabase.
2. Deploy this full repository to the existing single Render web service.
3. Use **Manual Deploy → Clear build cache & deploy** for the first v5.2.0 deployment.
4. Sign in as admin and open `/admin-operations.html`.
5. Confirm the banner says **Persistence Core online**.

## Runtime model
`Discover → checkpoint → enrich unfinished fixtures → analyze → FIRE → ledger → display → settle → learn`

A provider timeout or Render restart no longer requires completed fixture analysis to start from zero.
