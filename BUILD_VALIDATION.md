# Betynz v5.0.1 build validation

Validation date: 2026-08-06 UTC

## Architecture

- API-Football is the sole football-data provider.
- Fixtures, prematch odds, live scores, results, incidents, statistics and official visuals use `API_FOOTBALL_KEY` server-side.
- One GitHub repository, one root `render.yaml` and one Render web service.
- No application-level daily fixture cap.
- Odds pagination continues until the provider reports the final page.
- The browser never receives the private API key.

## Automated results

```text
Root stale-provider cleanup:            passed
Contaminated-repository build test:      passed
Syntax checks:                           passed
Engine/platform tests:                  66 passed, 0 failed
API-Football sole-source checks:         passed
Fixture and odds normalization:          passed
Odds pagination test:                    passed
No 30-fixture enrichment cap:            45/45 processed
Live score and minute normalization:     passed
Result normalization and API route:      passed
Incident/event normalization:            passed
Crests, league logos and flags:          passed
Venue history and PPG extraction:        passed
Deep intelligence contract:              passed
Release verification:                    passed
Single-render verification:              passed
One-service integration test:            passed
```

## Build-failure regression

The repository was deliberately contaminated with an extra retired app directory plus old root launcher/test files. `npm run build` removed the stale files before the test suite, after which all 66 tests and both release verifiers passed. This reproduces and fixes the Render failure reported for test 64.

## Integration smoke result

```json
{
  "deployment": "ONE_RENDER_SERVICE",
  "provider": "API_FOOTBALL",
  "version": "5.0.1",
  "engines": ["MARKET_ROUTE", "PPG_ROUTE", "CONVERGENCE_ROUTE"],
  "fixtures": 2,
  "live": 1,
  "results": 1,
  "events": 1
}
```

## Production limitation

The live API-Football service was not called because the private production key is unavailable in this build environment. Tests use a local mock matching the expected response contract. Competition, bookmaker, odds, injury and deep-stat coverage depends on the user's API-Football subscription and the provider's coverage for each league. Missing data is reported as unavailable evidence; engines do not invent it.
