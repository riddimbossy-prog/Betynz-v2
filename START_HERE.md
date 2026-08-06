# Start here — Betynz v5.0.6

## Upgrade the existing GitHub repository

1. Keep only the hidden `.git` folder in the local repository.
2. Copy every file from the extracted v5.0.6 folder into the repository root.
3. Commit with: `Betynz v5.0.6 fast predictions and minimal board motion`.
4. Push to the branch connected to Render.
5. In Render select **Manual Deploy → Clear build cache & deploy**.
6. Confirm `/api/health` reports version `5.0.6` and four engines.
7. Open the dashboard and confirm priced upcoming fixtures begin producing progress/results before the full day finishes.
8. Hard-refresh the browser with `Ctrl + Shift + R`.
9. Close and reopen the installed PWA so service-worker cache `betynz-v5-0-6` activates.

## Database

No new Supabase migration is required when upgrading from v5.0.5.

An existing project must already include:

```text
apps/web/sql/012_momentum_streak_engine.sql
```

For a completely new Supabase project, run:

```text
apps/web/sql/001_market_route_fresh.sql
```

## Required football secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

## Required for proof, settlement, learning and rolling wins

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Do not place any private key in browser JavaScript, GitHub source or public Supabase settings.
