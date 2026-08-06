# Betynz v4.0.2 build validation

Validation date: 2026-08-06

## 429-rate-limit repair

- Authenticated loopback calls bypass the public SportyBet core limit.
- A regression test sent 60 authenticated local calls while the public limit was set to 30 per minute; all 60 returned HTTP 200 and none returned 429.
- Three simultaneous full-day market-enrichment jobs for the same fixture produced one fixture-detail request.
- SportyBet and API-Football use separate paced queues.
- `Retry-After`, exponential backoff and jitter are applied to retryable responses.
- Date-level fixture and Market Route jobs are single-flight deduplicated.

## Full daily fixture coverage

- SportyBet pagination continues until the upstream feed is exhausted.
- `SPORTYBET_MAX_PAGES=0` is the production default.
- Empty pages and repeated-page signatures terminate pagination safely.
- API-Football enrichment covers every fixture returned for the selected date.
- There is no 12, 20 or 30 fixture application cap.

## Automated validation

```text
SportyBet parser/API tests:                 6 passed, 0 failed
Trusted-internal-rate-limit test:           passed (60/60 HTTP 200)
SportyBet beyond-page-10 test:              passed (223 fixtures across 12 pages)
Betynz engine/platform tests:               68 passed, 0 failed
Duplicate-enrichment single-flight test:    passed (3 callers, 1 upstream request)
API-Football beyond-30-fixture test:         passed (45/45 fixtures enriched)
Release verification:                       passed
Single-Render verification:                 passed
Combined-process integration:               passed
Render YAML files:                          1
Render web services:                        1
```

## Source authority

SportyBet remains authoritative for fixtures, kickoff, odds, markets, live status, scores and results. API-Football supplies statistics, venue histories, standings, injuries, H2H, predictions, crests, league logos and flags.
