# Betynz v5.0.18 — Zeus Statistical Supervisor

This is the single-Render Betynz build with seven independent prediction engines plus **Zeus Statistical Intelligence** as the final statistical supervisor.

## Before deployment

Keep the existing Render secrets:

- `API_FOOTBALL_KEY`
- `STATS_API_KEY`
- your existing Supabase variables

Zeus requires **no new provider key**. It reuses the API-Football venue/HTFT/core data, Stats API streak/xG/SOT evidence, and the seven engine outputs.

## Supabase upgrade

If you are upgrading an existing Betynz v5.0.17 database, run this file once in the Supabase SQL Editor:

`apps/web/sql/016_zeus_statistical_supervisor.sql`

Do not rerun the fresh schema on an existing database. A brand-new Supabase project can use `apps/web/sql/001_market_route_fresh.sql`.

## Deploy

1. Replace the repository contents with this release, keeping the hidden `.git` folder if you use GitHub Desktop.
2. Commit and push.
3. In Render choose **Manual Deploy → Clear build cache & deploy**.
4. Hard refresh the web app (`Ctrl + Shift + R`).

The deployment remains one GitHub repository, one Render web service and one root `render.yaml`.
