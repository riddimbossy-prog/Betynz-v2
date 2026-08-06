# Start here — Betynz v5.0.12

## Upgrade

No Supabase migration is required when upgrading from v5.0.9–v5.0.11.

1. Keep the hidden `.git` folder and remove the other old repository files.
2. Copy every file from the extracted v5.0.12 folder into the repository root.
3. Commit: `Betynz v5.0.12 non-blocking fixture board`.
4. Push to GitHub.
5. In Render choose **Manual Deploy → Clear build cache & deploy**.
6. Open `/api/health` and confirm version `5.0.12`.
7. Open the dashboard. Fixtures should appear before odds pagination finishes.
8. Hard-refresh once with `Ctrl + Shift + R`.

## New Supabase project

Run `apps/web/sql/001_market_route_fresh.sql` once. Do not run migration `014` first on a blank project.

## Required secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

Keep the existing API-Football pacing values in `render.yaml`.
