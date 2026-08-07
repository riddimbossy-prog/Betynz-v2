# Betynz v5.0.14 Start Here

1. In Supabase, for an existing Betynz database run `apps/web/sql/015_seven_engine_stats_htft.sql`. For a brand-new database use `apps/web/sql/001_market_route_fresh.sql` instead.
2. In Render add/keep `API_FOOTBALL_KEY` and add `STATS_API_KEY` as secrets.
3. Deploy this repository as one Render Blueprint/service using the root `render.yaml`.
4. Choose **Manual Deploy → Clear build cache & deploy**.
5. Hard refresh the site after deployment.

Atlas uses Stats API for streak/xG enrichment. API-Football remains the core source for fixtures, odds, live data, results, visuals and the cached HT/FT history used by Chronos.
