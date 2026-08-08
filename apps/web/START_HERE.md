# Betynz v5.1.1 — Start Here

This is the complete single-Render replacement build with weekly precomputed intelligence.

## Upgrade from v5.1.0

1. In Supabase SQL Editor run `apps/web/sql/018_weekly_precomputed_intelligence.sql` once.
2. Extract this package and replace the repository contents while keeping the existing hidden `.git` folder.
3. Commit and push with GitHub Desktop.
4. In Render choose **Manual Deploy → Clear build cache & deploy**.
5. After the service becomes healthy, hard refresh the browser once with `Ctrl + Shift + R`.

SQL `017_foundation_intelligence.sql` must already be installed when upgrading from v5.1.0. A brand-new Supabase project should use the updated `apps/web/sql/001_market_route_fresh.sql` instead.

## What happens after deploy

At startup Betynz first hydrates any complete prepared views already stored in Supabase. The site can therefore serve them immediately after a restart.

Then the background precompute scheduler checks the visible seven-day horizon. Missing or stale days are built sequentially using complete fixture odds, all specialist engines, Atlas, Zeus and day-level Consensus.

The next Monday-Sunday week is also prepared from Sunday UTC so Monday traffic does not start deep analysis.

## Verify

Open:

- `/api/health`
- `/api/precompute-status`

`/api/health` should report version `5.1.1` and include `preparedViews` plus `weeklyPrecompute`.

`/api/precompute-status` shows whether the visible week is ready, which date is currently building, and how many prepared day views are available.

## v5.2.0 Persistence Core
Run `sql/019_persistence_core.sql` in Supabase SQL Editor before the first production deployment. The protected operations dashboard is `/admin-operations.html`.
