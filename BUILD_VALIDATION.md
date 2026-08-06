# Betynz v4.0.3 build validation

Validation date: 2026-08-06 UTC

## Required source hierarchy

- SportyBet custom API is primary for fixtures, markets, odds, live scores, results, team histories, venue splits, streaks and competition statistics.
- API-Football is secondary for team crests, league logos/flags, standings, injuries, H2H, lineups and missing statistical fields.
- The primary-first merge never overwrites a populated SportyBet value.
- API-Football is labelled `API_FOOTBALL_FALLBACK` only when the required SportyBet statistic is absent.

## Automated validation

```text
SportyBet core tests:                       6 passed, 0 failed
Betynz engine/platform tests:              72 passed, 0 failed
Primary-source conflict test:              passed
Missing-field enrichment test:             passed
SportyBet pagination beyond ten pages:     passed
API-Football full-day enrichment:          passed
Internal rate-limit bypass:                passed
Duplicate request coalescing:              passed
Release verification:                      passed
Single-render verification:                passed
Combined process integration:              passed
```

## Source-priority conflict fixture

The regression fixture deliberately supplied conflicting values:

- SportyBet home PPG: 2.20; API-Football home PPG: 0.40
- SportyBet home sample: 5; API-Football home sample: 10
- SportyBet home Over 2.5: 80%; API-Football home Over 2.5: 10%

The final engine object retained the SportyBet values. API-Football filled only missing fields such as home scoring average, BTTS rate and standings.

## Combined service smoke test

```json
{
  "ok": true,
  "deployment": "ONE_RENDER_SERVICE",
  "renderYamlCount": 1,
  "source": "SPORTYBET_CUSTOM_API",
  "engines": ["MARKET_ROUTE", "PPG_ROUTE", "CONVERGENCE_ROUTE"],
  "webVersion": "4.0.3"
}
```

## Production limitation

The build environment did not call the user's private API-Football subscription or the live SportyBet production endpoints. Production endpoint availability, plan quotas and exact upstream responses must be confirmed after deployment. The code and tests use compatible local response contracts.
