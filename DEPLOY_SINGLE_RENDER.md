# Deploy Betynz v5.0.10 on one Render service

The repository contains exactly one root `render.yaml` and one web service named `betynz`.

## Database

- Upgrading from v5.0.9: no new SQL migration is required.
- New Supabase project: run `apps/web/sql/001_market_route_fresh.sql` once.

## Render secrets

Set:

```text
API_FOOTBALL_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

The non-secret adaptive queue defaults are already declared in `render.yaml`. Keep the included request limit at 8 per minute unless the subscription documentation confirms a higher limit.

## Deploy

1. Replace the repository contents, keeping only the hidden `.git` directory.
2. Commit and push.
3. Select **Manual Deploy → Clear build cache & deploy** in Render.
4. Confirm `/api/health` reports `5.0.10`, five engines and `providerQueue`.
5. Hard-refresh with `Ctrl + Shift + R`.
