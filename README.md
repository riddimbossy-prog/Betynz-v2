# Betynz v5.0.1 — API-Football Only

Betynz is a single-service Node.js prediction platform. `API_FOOTBALL_KEY` is the sole football-data credential and API-Football supplies every football input used by the website and engines.

## Data responsibilities

| Capability | Source |
|---|---|
| Daily fixtures and kickoff | API-Football `/fixtures` |
| Prematch odds and markets | API-Football `/odds` |
| Live scores and minutes | API-Football `/fixtures?live=all` |
| Results and settlement | API-Football `/fixtures?date=...` |
| Team crests, league logos and flags | API-Football fixture/team data |
| Venue histories and PPG | API-Football team fixture history |
| Standings and season team statistics | API-Football |
| H2H, predictions and injuries | API-Football |
| Lineups, events, fixture and player statistics | API-Football |
| Prediction history and learning storage | Supabase, when configured |

There is no second football provider or private collector service.

## Engines

- **Market Route** analyses API-Football bookmaker prices and rejects statistically contradicted routes.
- **PPG Route** compares the home side's last five home matches with the away side's last five away matches.
- **Convergence** combines attack, defence, goals, clean sheets, failed-to-score, BTTS and venue evidence.
- **Consensus** publishes only compatible selections from the three engines.

## Deployment

The repository contains one root `render.yaml` and one Render web service. Add `API_FOOTBALL_KEY` as a private Render environment variable, optionally add Supabase credentials, and deploy the Blueprint.

No application-level fixture cap is applied. The board displays every fixture returned by the subscription for the selected date. Odds pagination continues until API-Football reports the final page.

See `START_HERE.md` for exact installation steps.
