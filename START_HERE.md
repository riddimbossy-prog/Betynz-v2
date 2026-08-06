# Start here — Betynz v5.0.5

## Existing GitHub repository

1. Keep only the hidden `.git` folder in the local repository.
2. Copy every file from the extracted v5.0.5 folder into the repository root.
3. Commit with: `Betynz v5.0.5 Momentum and Streak Engine`.
4. Push to the branch connected to Render.
5. In Render select **Manual Deploy → Clear build cache & deploy**.
6. Confirm `/api/health` reports version `5.0.5` and four engines.
7. Open `/momentum-streak.html` and analyse a date.
8. Hard-refresh the browser with `Ctrl + Shift + R`.
9. Close and reopen the installed PWA so service-worker cache `betynz-v5-0-5` activates.

## Supabase upgrade

For an existing Betynz database, run this once in the Supabase SQL editor before the new engine writes predictions:

```text
apps/web/sql/012_momentum_streak_engine.sql
```

The migration adds `MOMENTUM_STREAK` to prediction constraints and expands consensus agreement counts from three to four.

For a completely new Supabase project, run:

```text
apps/web/sql/001_market_route_fresh.sql
```

The fresh schema already includes all four engines.

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
