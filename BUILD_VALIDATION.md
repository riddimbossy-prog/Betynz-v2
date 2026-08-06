# Betynz v5.0.2 build validation

Validation date: 2026-08-06 UTC

## Architecture

- API-Football is the sole football-data provider.
- Fixtures and odds return before slow venue-history enrichment completes.
- Market Route, PPG Route, Convergence and Consensus use one shared daily background-analysis job.
- Engine endpoints expose `complete`, `failed` and `progress` terminal-state fields.
- One GitHub repository, one root `render.yaml` and one Render web service.
- No application-level daily fixture cap.
- The browser never receives the private API key.

## Automated results

```text
Root stale-provider cleanup:             passed
Syntax checks:                            passed
Engine/platform tests:                   67 passed, 0 failed
Progressive engine endpoint regression:  passed
Delayed history immediate response:      passed
Shared PPG/Convergence analysis:          passed
Market post-enrichment recomputation:     passed
Consensus selected-date-first flow:       passed
API-Football sole-source checks:          passed
No 30-fixture enrichment cap:             45/45 processed
Release verification:                     passed
Single-render verification:               passed
One-service integration test:             passed
```

## Loading-state regression

The regression server deliberately delays each team-history response by 1.2 seconds. Market Route, PPG Route and Consensus must still return an HTTP response in under one second with `complete:false` and progress metadata. The shared analysis then completes, and subsequent Market Route and PPG Route requests return `complete:true` without starting duplicate work.

## Integration smoke result

```json
{
  "ok": true,
  "deployment": "ONE_RENDER_SERVICE",
  "provider": "API_FOOTBALL",
  "version": "5.0.2",
  "engines": ["MARKET_ROUTE", "PPG_ROUTE", "CONVERGENCE_ROUTE"],
  "fixtures": 2,
  "live": 1,
  "results": 1,
  "events": 1
}
```

## Production limitation

The live API-Football service was not called because the private production key is unavailable in this build environment. Tests use a local mock matching the response contract. Competition, bookmaker, odds and statistics coverage depends on the API-Football subscription. Missing evidence is reported as unavailable; the engines do not invent it.
