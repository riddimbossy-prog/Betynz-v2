# Deploy Betynz v5.0.4 on one Render service

1. Replace the repository cleanly. Keep only `.git` before copying v5.0.4.
2. Push the new files to the branch connected to Render.
3. Keep `API_FOOTBALL_KEY` private in Render.
4. Keep Supabase server keys configured for frozen proof, settlement and the win carousel.
5. Use **Manual Deploy → Clear build cache & deploy**.
6. Check `/api/health`.
7. Check `/api/fixtures?date=YYYY-MM-DD`.
8. Check `/api/settlement-status?date=YYYY-MM-DD` for a finished date.
9. Check `/api/wins-carousel?days=14&limit=24`.
10. Hard-refresh the website and reopen the installed PWA.

The repository contains one root `render.yaml` with exactly one web service.
