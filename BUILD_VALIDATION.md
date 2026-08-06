# Betynz v5.0.5 build validation

## Release scope

- API-Football remains the sole football-data provider.
- Momentum & Streak is added as the fourth independent engine.
- Market Route, PPG Route and Convergence remain active and unchanged in responsibility.
- Consensus expands to four-engine agreement.
- One repository, one root `render.yaml` and one Render web service remain enforced.

## Automated results

```text
Engine and platform tests:       74/74 passed
Momentum engine tests:            5/5 passed
Consensus four-engine tests:      7/7 passed
Syntax verification:              passed
Release verification:             passed
Single-Render verification:       passed
One-service integration smoke:    passed
```

## Integration smoke result

```json
{
  "ok": true,
  "deployment": "ONE_RENDER_SERVICE",
  "provider": "API_FOOTBALL",
  "version": "5.0.5",
  "engines": [
    "MARKET_ROUTE",
    "PPG_ROUTE",
    "CONVERGENCE_ROUTE",
    "MOMENTUM_STREAK"
  ],
  "fixtures": 2,
  "live": 1,
  "results": 1,
  "events": 1
}
```

## Momentum route coverage

Tests verified:

- Home dominance from aligned form, opposition and scoring families
- Sustained goal wave from long and recent totals sequences
- Controlled low-event route from Under, clean-sheet and blank pressure
- Mandatory last-five home and last-five away samples
- A maximum of one official Momentum selection per fixture
- Exact market availability before publication
- Opposite-direction conflict protection

## Consensus coverage

Tests verified:

- 4/4 compatible agreement becomes an Elite Banker
- 3/4 compatible agreement becomes a Consensus Banker
- 2/4 compatible agreement becomes a shared Qualified Pick
- One approved safer route remains a Safer Pick
- Opposite result, totals and BTTS directions remain conflicts
- Agreement without a shared offered price is held

## Database validation

The fresh schema accepts all four engine codes and agreement counts from one through four. Existing projects must run:

```text
apps/web/sql/012_momentum_streak_engine.sql
```

## Deployment validation

- Root `render.yaml` count: 1
- Render web-service count: 1
- Application folders: `apps/web` only
- Public service health version: 5.0.5
- Football provider: API-Football only
- Daily fixture application cap: none
