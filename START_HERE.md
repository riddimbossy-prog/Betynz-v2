# Start here — Betynz v5.0.10

## Upgrade from v5.0.9

No Supabase migration is required.

1. Back up the current Render environment values.
2. In the local GitHub repository, keep the hidden `.git` folder and delete the other old files.
3. Copy every file from the extracted v5.0.10 folder into the repository root.
4. Commit: `Betynz v5.0.10 adaptive API rate recovery`.
5. Push to GitHub.
6. In Render choose **Manual Deploy → Clear build cache & deploy**.
7. Open `/api/health` and confirm version `5.0.10`, five engine codes and a `providerQueue` object.
8. Hard-refresh the website with `Ctrl + Shift + R`.

## New Supabase project

Run `apps/web/sql/001_market_route_fresh.sql` once. Do not run migration `014` first on a blank project.

## Required football secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

The included `render.yaml` adds conservative production defaults:

```env
API_FOOTBALL_ENRICH_CONCURRENCY=2
API_FOOTBALL_REQUEST_CONCURRENCY=1
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=750
API_FOOTBALL_REQUESTS_PER_MINUTE=8
API_FOOTBALL_RATE_LIMIT_RETRIES=6
API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS=65000
API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS=43200
```

These values keep all daily fixtures while pacing the statistics work. Increase `API_FOOTBALL_REQUESTS_PER_MINUTE` only when the subscription explicitly supports a higher minute limit.

## Expected engine list

```text
MARKET_ROUTE
PPG_ROUTE
APEX_INTELLIGENCE
CONVERGENCE_ROUTE
MOMENTUM_STREAK
```
