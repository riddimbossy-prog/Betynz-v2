# Deploy Betynz v5.1.1 on one Render service

The repository contains one `render.yaml` and one web service. Provider fetching and precomputation use bounded background lanes inside the same service so the deployment remains simple.

Before deployment on an existing Supabase project, run `apps/web/sql/017_foundation_intelligence.sql` once.

Keep the existing `API_FOOTBALL_KEY`, `STATS_API_KEY`, Supabase variables and the runtime-safety values already in Render.

Deploy with **Manual Deploy → Clear build cache & deploy** and verify `/api/health` reports `5.1.1`.
