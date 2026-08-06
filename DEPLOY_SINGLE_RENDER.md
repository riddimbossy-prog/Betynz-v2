# Betynz single-Render deployment

## GitHub

Use one repository. The repository root must contain:

```text
apps/
package.json
render.yaml
scripts/
test/
```

There must be no second `render.yaml` inside either app folder.

## Render

Create a Blueprint from the repository. The included `render.yaml` creates exactly one web service.

Required private values:

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SPORTYBET_API_KEY` is optional in this combined build. When omitted, the launcher generates a strong private key and passes it only between the two internal workers.

## Verification

Open:

```text
https://YOUR-SERVICE.onrender.com/api/health
https://YOUR-SERVICE.onrender.com/api/config
https://YOUR-SERVICE.onrender.com/api/fixtures?date=YYYY-MM-DD
https://YOUR-SERVICE.onrender.com/api/live?date=YYYY-MM-DD
```

`/api/health` should report Betynz `3.8.0`. `/api/config` should identify the SportyBet custom API for fixtures, odds, statistics, live data and results.
