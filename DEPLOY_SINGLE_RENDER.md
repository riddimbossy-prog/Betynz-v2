# Deploy Betynz v5.0.6 on one Render service

The repository contains one root `render.yaml` defining exactly one Node web service.

1. Replace the repository cleanly, keeping only `.git` before copying v5.0.6.
2. Push the replacement files to GitHub.
3. Keep `API_FOOTBALL_KEY` private in Render.
4. Keep the Supabase server variables configured for frozen proof and settlement.
5. Select **Manual Deploy → Clear build cache & deploy**.
6. Verify `/api/health` reports `5.0.6` and four engines.
7. Verify `/api/fixture-count?date=YYYY-MM-DD` returns a lightweight daily count.
8. Verify each engine route returns a progress or completed response without waiting for all daily histories.
9. Verify the dashboard board remains visually stable while status and predictions update.
10. Hard-refresh the browser and reopen the installed PWA.

Recommended post-deploy checks:

```text
/api/fixtures?date=YYYY-MM-DD
/api/fixture-count?date=YYYY-MM-DD
/api/market-route-board?date=YYYY-MM-DD
/api/ppg-route-board?date=YYYY-MM-DD
/api/convergence-board?date=YYYY-MM-DD
/api/momentum-streak-board?date=YYYY-MM-DD
/api/consensus-picks?from=YYYY-MM-DD&days=1
/api/settlement-status?date=YYYY-MM-DD
/api/wins-carousel?days=14&limit=24
```

No Supabase schema migration is required when upgrading from v5.0.5.
