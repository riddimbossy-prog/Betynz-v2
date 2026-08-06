# Betynz v5.0.11 — Adaptive API Rate Recovery

## Purpose

Fix the zero-prediction failure caused by API-Football minute-limit responses during large daily engine scans.

## Provider protection

- Treats API-Football `errors` bodies containing “Too many requests” as rate-limit responses even when the HTTP status is 200.
- Uses one adaptive request queue shared by fixtures, odds, histories, live data and deep match intelligence.
- Limits production traffic to a configurable rolling request budget.
- Prioritises fixtures, odds and live data ahead of background history enrichment.
- Honours `Retry-After` and common rate-reset headers.
- Applies a global cooldown so queued workers do not retry in another burst.
- Retries minute-limit responses independently from network/server retries.
- Keeps successful league and team histories cached for 12 hours.
- Reuses in-flight requests and same-league history pools.

## Engine behaviour

- All five engines remain active.
- Apex, PPG, Convergence and Momentum continue publishing completed fixtures progressively.
- Unfinished fixtures remain queued instead of being finalised as zero-sample results.
- The engine pages expose provider-cooldown progress and continue polling automatically.
- A persistent provider failure produces a clear retry state instead of a false “no picks” conclusion.

## Motion

- Adds a small orange loading pulse, progress glow and short result reveal across Apex, PPG, Convergence and Momentum.
- Keeps the long fixtures board in minimal-motion mode.
- Respects `prefers-reduced-motion`.

## Render defaults

```env
API_FOOTBALL_ENRICH_CONCURRENCY=2
API_FOOTBALL_REQUEST_CONCURRENCY=1
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=750
API_FOOTBALL_REQUESTS_PER_MINUTE=8
API_FOOTBALL_RATE_LIMIT_RETRIES=6
API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS=65000
API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS=43200
```

No Supabase migration is required when upgrading from v5.0.9.
