# Betynz v3.8.0 — SportyBet-only rebuild

This release contains two fresh services:

1. `betynz-sportybet-api` — the private SportyBet core API.
2. `betynz-web` — the Betynz website and prediction engines.

The SportyBet custom API is the only football-data source. Betynz contains no Parse.bot, BetExplorer, API-Football, The Odds API, demo-feed runtime, or packaged demo fixture fallback.

## Deployment order

1. Create a blank GitHub repository named `betynz-sportybet-api`.
2. Upload the contents of the API package and deploy its `render.yaml` as a Render Blueprint.
3. Set `SPORTYBET_API_KEY` to one long private secret.
4. Confirm the API health route: `/api/health`.
5. Test private routes with the same key: `/api/fixtures`, `/api/live`, `/api/results`, and one event detail.
6. Create a blank GitHub repository named `betynz-web`.
7. Upload the contents of the web package and deploy its `render.yaml`.
8. Set `BETYNZ_DATA_API_BASE_URL` to the private API Render URL ending in `/api/`.
9. Set `BETYNZ_DATA_API_KEY` to exactly the same secret used by `SPORTYBET_API_KEY`.
10. Supabase is optional for first boot. Add a fresh project later for accounts, frozen predictions, proof, settlement, performance, and learning.

## Important production check

The upcoming SportyBet route comes from the previously working collector. SportyBet may change its logged-out live, result, or event-detail route. Those four upstream templates are environment variables in the API service so they can be corrected without rebuilding the site.
