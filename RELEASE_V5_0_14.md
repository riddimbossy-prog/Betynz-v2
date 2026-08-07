# Betynz v5.0.14 — Seven-Engine Stats + HT/FT Edition

## New engines
- Atlas Streak Value (`STREAK_VALUE`) — TheStatsAPI streak discovery, best/worst classification, 1.20–1.55 value gate, xG/SOT confirmation for goal routes.
- Chronos HT/FT Momentum (`HTFT_MOMENTUM`) — cached HT/FT transitions layered with momentum and streaks.

## Stability
Engine pages treat HTTP 502/503/504 and timeouts as transient. Existing completed picks remain visible while background jobs retry. Atlas runs on a separate provider queue so it does not consume API-Football's core 8-request-per-minute lane.

## Database
Existing databases: run `apps/web/sql/015_seven_engine_stats_htft.sql` once.
Fresh databases: run `apps/web/sql/001_market_route_fresh.sql` only.

## Required secrets
- `API_FOOTBALL_KEY`
- `STATS_API_KEY`
- Supabase variables when persistence is enabled.
