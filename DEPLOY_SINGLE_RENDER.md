# Deploy Betynz v5.0.9 on one Render service

The repository contains exactly one root `render.yaml` and one web service named `betynz`.

## Before deployment

For an existing Supabase project, run:

```text
apps/web/sql/014_five_engine_ppg_apex.sql
```

A new Supabase project should run the updated fresh schema:

```text
apps/web/sql/001_market_route_fresh.sql
```

## Render secrets

Set `API_FOOTBALL_KEY`, `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY`. The non-secret defaults are already declared in `render.yaml`.

## Deploy

Push the clean repository, then select **Manual Deploy → Clear build cache & deploy**. Confirm `/api/health` reports `5.0.9` and five active engines before reconnecting a production domain.
