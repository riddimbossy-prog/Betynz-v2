# Deploy Betynz v5.0.3 on one Render service

The included `render.yaml` defines one Node web service.

## Deployment

1. Replace the repository contents cleanly.
2. Push the v5.0.3 files to the branch connected to Render.
3. Confirm the Render secret `API_FOOTBALL_KEY` is present.
4. Use **Manual Deploy → Clear build cache & deploy**.
5. Verify `/api/health` and `/api/media/team/<TEAM_ID>.png`.
6. Hard-refresh the website once.

No second service, SportyBet variable or additional image provider is required.
