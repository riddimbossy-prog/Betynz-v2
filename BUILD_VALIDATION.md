# Betynz v5.0.9 Build Validation

## Completed checks

- Engine and platform tests: **81/81 passed**
- PPG Route tests: **10/10 passed**
- Apex Intelligence tests: **5/5 passed**
- Five-engine Consensus tests: **7/7 passed**
- Progressive engine-analysis test: passed
- Fast prediction pipeline tests: passed
- API-Football contract and no-cap tests: passed
- Settlement and calibration tests: passed
- Responsive/minimal-motion tests: passed
- Release verification: passed
- Single-Render verification: passed
- One-service API-Football integration smoke test: passed

## Active engine codes

```text
MARKET_ROUTE
PPG_ROUTE
APEX_INTELLIGENCE
CONVERGENCE_ROUTE
MOMENTUM_STREAK
```

## Consensus thresholds

```text
5/5 compatible agreement = ELITE_BANKER
4/5 compatible agreement = CONSENSUS_BANKER
2–3/5 compatible agreement = QUALIFIED_PICK
1/5 qualifying engine = QUALIFIED_PICK or SAFER_PICK
```

## Logo palette verification

The release guard confirms that the dashboard engine toolbar, engine pages, route badges, analysis cards and active controls use the Betynz black/charcoal, silver, white and orange palette. Semantic live, won, lost, warning and review states remain distinct.

## Deployment verification

```text
Render YAML files: 1
Render web services: 1
Application folders: apps/web only
Football provider: API_FOOTBALL only
Health version: 5.0.9
```

The integration suite uses an API-Football-compatible local mock. Actual production coverage and response speed depend on the user's API-Football plan and availability.
