# Betynz v4.0.2 — Unified SportyBet + API-Football Intelligence

One GitHub repository, one Node process launcher, one Render web service and one root `render.yaml`.

## Data roles

| Role | Source |
|---|---|
| Fixtures and kickoff | Private SportyBet custom API |
| Offered markets and odds | Private SportyBet custom API |
| Live scores, minutes and incidents | Private SportyBet custom API |
| Final results and settlement | Private SportyBet custom API |
| Engine venue history and PPG | API-Football |
| Standings, season profiles, H2H, predictions and injuries | API-Football |
| Team crests and league visuals | API-Football |
| Lineups, events, fixture/player statistics | API-Football, loaded on match open |
| Admin, proof, settlement and learning storage | Supabase |

API-Football enrichment never overwrites SportyBet fixture identity, market availability or prices.

## Engines

- Market Route: SportyBet odds structure plus an API-Football support/contradiction gate.
- PPG Route: last five home versus last five away API-Football venue PPG.
- Convergence: API-Football attack, defence, venue and goal-profile evidence plus SportyBet market confirmation.
- Consensus: combines only independently qualified engine selections.

## Deploy

1. Upload the contents of this repository to one GitHub repository.
2. In Render choose **New → Blueprint** and select the repository.
3. Add `API_FOOTBALL_KEY` and the three Supabase values when prompted.
4. Deploy and check `/api/health`.

See `START_HERE.md` and `DEPLOY_SINGLE_RENDER.md`.

## Full-day fixture coverage

There is no application-level daily fixture cap. SportyBet pagination continues until empty or repeated, every returned fixture is displayed, and API-Football enrichment is applied across the complete day.
