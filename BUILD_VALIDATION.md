# Betynz v5.0.10 Build Validation

## Completed checks

- Engine and platform tests: **83/83 passed**
- API-Football body-level minute-limit recovery: passed
- End-to-end engine cooldown recovery: passed
- PPG Route tests: passed
- Apex Intelligence tests: passed
- Five-engine Consensus tests: passed
- Progressive engine-analysis tests: passed
- Fast prediction pipeline tests: passed
- API-Football contract and no-cap tests: passed
- Settlement and calibration tests: passed
- Responsive/minimal-motion tests: passed
- Release verification: passed
- Single-Render verification: passed
- One-service API-Football integration smoke test: passed

## Rate-limit regression

The mock provider first returned:

```text
Too many requests. You have exceeded the limit of requests per minute of your subscription.
```

inside an HTTP 200 response. Betynz detected it as a rate limit, entered cooldown, retried, loaded the league history and completed the Apex analysis without a failed or false zero-pick state.

## Active engine codes

```text
MARKET_ROUTE
PPG_ROUTE
APEX_INTELLIGENCE
CONVERGENCE_ROUTE
MOMENTUM_STREAK
```

## Production request guard

```text
Request concurrency: 1
Enrichment concurrency: 2
Rolling request budget: 8 per minute
Rate-limit retries: 6
Default cooldown: 65 seconds
Engine-history cache: 12 hours
```

## Deployment verification

```text
Render YAML files: 1
Render web services: 1
Application folders: apps/web only
Football provider: API_FOOTBALL only
Health version: 5.0.10
```

The integration suite uses an API-Football-compatible local mock. Actual production coverage depends on the subscription and provider availability.
