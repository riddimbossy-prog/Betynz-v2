# Betynz v5.1.1 — Weekly Precomputed Intelligence

v5.1.1 changes the user-facing analysis path from on-demand deep computation to prepared weekly intelligence.

## Core behavior

- The visible seven-day horizon is precomputed sequentially in the background.
- Full fixture books and bookmaker odds are fetched before engine precomputation begins.
- Market Route, PPG, Apex, Convergence, Momentum, Chronos, Atlas, Zeus and day-level Consensus are all prepared before users need to open those pages.
- Complete prepared views are persisted to Supabase in `prepared_intelligence_views`.
- On service restart, Betynz hydrates the prepared horizon before accepting normal traffic, so engine pages can return cached complete boards immediately.
- The dashboard fixture-count strip reads prepared fixture boards when available, eliminating repeated future-date count calls.
- A Sunday UTC prebuild prepares the next Monday-Sunday calendar week before it begins.
- A rolling seven-day prebuild keeps the visible horizon filled when a new date enters the board.
- Today's prepared intelligence is refreshed periodically so odds/status changes can be folded into the fast path.

## Prepared view types

- `FIXTURE_BOARD`
- `MARKET_ROUTE`
- `STATS_BUNDLE` (PPG, Apex, Convergence, Momentum and Chronos)
- `STREAK_VALUE`
- `ZEUS`
- `CONSENSUS_DAY`

## Speed model

The browser no longer needs to start a full deep-analysis job simply because a user opened an engine page. When a prepared view exists, the API returns it immediately with `cache: PRECOMPUTED` and `prepared: true`.

The expensive background job remains sequential per date so one Render process is not overwhelmed by seven simultaneous 300+ fixture days.

## Persistence

Existing Supabase projects must run:

`apps/web/sql/018_weekly_precomputed_intelligence.sql`

Fresh projects can use the updated `001_market_route_fresh.sql`.

## Existing intelligence retained

No football engine rule, universal 1.20–2.00 odds gate, data-backed validation, adaptive recovery, correlation-aware Consensus, Zeus supervision, proof, settlement or calibration rule was removed.
