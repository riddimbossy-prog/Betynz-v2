# Deploy Betynz v5.0.15 on one Render service

Use the root `render.yaml`. Keep `API_FOOTBALL_KEY` and `STATS_API_KEY` private in Render. For an existing Supabase database run `apps/web/sql/015_seven_engine_stats_htft.sql` once. Deploy with **Clear build cache & deploy**, then confirm `/api/health` reports `5.0.14`.
