# Start here — Betynz single-Render build

This package replaces the earlier two-service setup.

## What to upload

Upload **everything inside this folder** to one blank GitHub repository. Do not upload the containing folder as another nested level.

The repository root must show:

```text
apps/
package.json
package-lock.json
render.yaml
scripts/
test/
README.md
DEPLOY_SINGLE_RENDER.md
```

## Render

1. Choose **New → Blueprint**.
2. Connect the new GitHub repository.
3. Render reads the only `render.yaml` and creates one service named `betynz`.
4. Enter the three new Supabase values when prompted.
5. Deploy.

You do not need a second Render service for the SportyBet API. The same container starts the private SportyBet core on an internal port, then starts the public Betynz website.

## Supabase values

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## First checks

```text
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/config
https://YOUR-SERVICE.onrender.com/api/fixtures?date=YYYY-MM-DD
https://YOUR-SERVICE.onrender.com/api/live?date=YYYY-MM-DD
```

Expected engines:

```text
MARKET_ROUTE
PPG_ROUTE
CONVERGENCE_ROUTE
```

Expected football-data source:

```text
SPORTYBET_CUSTOM_API
```
