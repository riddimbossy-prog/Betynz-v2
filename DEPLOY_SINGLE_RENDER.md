# Deploy Betynz v5.0.20 on one Render service

The repository contains one `render.yaml` and one web service.

Keep the existing `API_FOOTBALL_KEY`, `STATS_API_KEY`, Supabase variables and the v5.0.17+ runtime-safety values.

No new database migration is required when upgrading from v5.0.19 with SQL 016 already applied.

Deploy with **Manual Deploy → Clear build cache & deploy** and verify `/api/health` reports `5.0.20`.
