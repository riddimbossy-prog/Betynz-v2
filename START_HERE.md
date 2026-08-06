# Start here — Betynz v5.0.4

1. Keep only the hidden `.git` folder in the existing repository.
2. Copy every file from this v5.0.4 folder into the repository root.
3. Commit and push with: `Betynz v5.0.4 settlement and PWA experience`.
4. In Render choose **Manual Deploy → Clear build cache & deploy**.
5. Confirm `/api/health` reports version `5.0.4`.
6. Confirm the board loads fixtures and crests.
7. Open `/api/settlement-status?date=YYYY-MM-DD` for a completed match date.
8. Open `/api/wins-carousel?days=14&limit=24` and confirm settled wins appear after Supabase contains frozen predictions.
9. Hard-refresh with `Ctrl + Shift + R`.
10. For an installed PWA, close and reopen it. If an old icon remains, remove the old installation and install Betynz again.

## Required secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

## Required for proof, settlement and wins carousel

```env
SUPABASE_URL=...
SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

## Included settlement settings

```env
AUTO_SETTLEMENT_ENABLED=true
AUTO_SETTLEMENT_INTERVAL_MINUTES=10
AUTO_SETTLEMENT_LOOKBACK_DAYS=3
SETTLEMENT_TRIGGER_COOLDOWN_SECONDS=90
WIN_CAROUSEL_DAYS=14
WIN_CAROUSEL_LIMIT=24
WIN_CAROUSEL_CACHE_TTL_SECONDS=60
```
