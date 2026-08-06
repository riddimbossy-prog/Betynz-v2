# Start here — Betynz v5.0.9

## Existing installation

1. Back up your current Render and Supabase values.
2. In Supabase SQL Editor, run `apps/web/sql/014_five_engine_ppg_apex.sql`.
3. In the local GitHub repository, keep the hidden `.git` folder and delete the other old files.
4. Copy every file from the extracted v5.0.9 folder into the repository root.
5. Commit: `Betynz v5.0.9 five-engine logo edition`.
6. Push to GitHub.
7. In Render choose **Manual Deploy → Clear build cache & deploy**.
8. Open `/api/health` and confirm version `5.0.9` and all five engine codes.
9. Hard-refresh the website with `Ctrl + Shift + R`.

## New Supabase project

Run `apps/web/sql/001_market_route_fresh.sql` once instead of the upgrade migration.

## Required football secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

Keep the Supabase URL, anon key and service-role key server-side in Render. Do not upload secrets to GitHub.

## Expected engine list

```text
MARKET_ROUTE
PPG_ROUTE
APEX_INTELLIGENCE
CONVERGENCE_ROUTE
MOMENTUM_STREAK
```
