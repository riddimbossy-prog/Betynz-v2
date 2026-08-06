# Betynz Unified SportyBet Build v3.8.0

This repository deploys the complete Betynz platform as **one Render web service**.

## Included in this one build

- Private SportyBet core API
- Upcoming fixtures and full SportyBet markets
- Live scores, minutes, half-time scores and incidents
- Results and automatic settlement feed
- Market Route Engine
- PPG Route Engine
- Convergence Engine
- Consensus Bankers and automatic calibration
- Proof, performance, league intelligence and odds movement
- Supabase-backed admin, proof, settlement and learning storage

## Runtime architecture

The root launcher starts two tightly coupled Node workers inside the same Render container:

1. `apps/sportybet-api` listens only on the internal port configured by `SPORTYBET_INTERNAL_PORT`.
2. `apps/web` listens on Render's public `PORT` and receives its API base URL and private key automatically.

Only the Betynz web port is routed publicly. The engines cannot be pointed to a third-party sports provider through Render settings because the launcher injects the internal SportyBet core URL.

## Deploy

1. Create one blank GitHub repository.
2. Upload the contents of this package to the repository root.
3. In Render choose **New → Blueprint** and connect the repository.
4. Render reads the single root `render.yaml` and creates one service named `betynz`.
5. Add the three fresh Supabase values when prompted.
6. Deploy and open `/api/health`.

No separate SportyBet API Render service is required.
