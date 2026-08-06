# Deploy Betynz v5.0.5 on one Render service

The repository contains one root `render.yaml` defining exactly one Node web service.

1. Replace the repository cleanly, keeping only `.git` before copying v5.0.5.
2. Run `apps/web/sql/012_momentum_streak_engine.sql` in an existing Supabase project.
3. Push the replacement files to GitHub.
4. Keep `API_FOOTBALL_KEY` private in Render.
5. Keep the Supabase server variables configured for frozen proof and settlement.
6. Select **Manual Deploy → Clear build cache & deploy**.
7. Verify `/api/health` reports `5.0.5` and four engines.
8. Verify `/api/momentum-streak-board?date=YYYY-MM-DD` returns a terminal or progress response.
9. Verify `/api/consensus-picks?from=YYYY-MM-DD&days=7` accepts four-engine agreement.
10. Hard-refresh the browser and reopen the installed PWA.

Recommended post-deploy checks:

```text
/api/fixtures?date=YYYY-MM-DD
/api/market-route-board?date=YYYY-MM-DD
/api/ppg-route-board?date=YYYY-MM-DD
/api/convergence-board?date=YYYY-MM-DD
/api/momentum-streak-board?date=YYYY-MM-DD
/api/settlement-status?date=YYYY-MM-DD
/api/wins-carousel?days=14&limit=24
```
