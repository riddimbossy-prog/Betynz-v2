# Betynz v6 — Golden Banker Core

Betynz now runs one prediction engine: **Golden Banker v4.3 (Mathematical Split-Form Edition)**.

## Prediction contract

- Home team: exactly the **last 5 HOME matches** before kickoff.
- Away team: exactly the **last 5 AWAY matches** before kickoff.
- Overall table form and older general form are not used by the engine.
- Three systems are scored separately: **Over 2.5**, **BTTS/GG**, **Win/DNB**.
- A primary market must score **7/10 or higher** to qualify.
- The daily board publishes a maximum **Top 4**.
- DNB hard gate: favourite split PPG >= 2.0 and opponent split PPG < 1.0.
- Straight Win hard gate: favourite split PPG >= 2.3 and opponent split PPG < 1.0.
- Defensive bleed trigger: average goals conceded > 2.30.

## Runtime

`API-Football fixtures -> exact 5/5 split histories -> Golden Banker -> durable checkpoint -> final Top 4 -> prediction ledger -> settlement`

The app keeps the existing API-Football queue, Supabase persistence core and restart recovery. The old specialist/Consensus/Zeus prediction stack is not part of the runtime anymore.

## Commands

```bash
npm run build
npm start
```

## Required environment

Copy `.env.example` and configure the private API-Football and Supabase keys in Render. Never commit real keys.
