# Betynz v4.0.1 build validation

Validation date: 2026-08-06

## Full daily fixture coverage

- SportyBet pagination continues until the upstream feed is exhausted.
- `SPORTYBET_MAX_PAGES=0` is the production default.
- Empty pages and repeated-page signatures safely terminate pagination without imposing a fixture count.
- The web adapter has no hard page ceiling.
- API-Football engine enrichment covers every fixture returned for the selected date.
- API-Football crest matching covers every fixture returned for the selected date.
- The dashboard renders the complete filtered day and has no 12/20/30 match limit.

## Automated validation

```text
SportyBet parser/API tests:              5 passed, 0 failed
SportyBet beyond-page-10 test:           passed (223 fixtures across 12 pages)
Betynz engine/platform tests:            67 passed, 0 failed
API-Football beyond-30-fixture test:      passed (45/45 fixtures enriched)
Release verification:                    passed
Single-Render verification:              passed
Combined-process integration:            passed
Render YAML files:                       1
Render web services:                     1
```

## Source authority

SportyBet remains authoritative for fixtures, kickoff, odds, markets, live status, scores and results. API-Football supplies statistics, venue histories, standings, injuries, H2H, predictions, crests, league logos and flags.

## Operational boundary

Betynz itself imposes no daily fixture count. Actual coverage can still be affected by the upstream SportyBet response and the available API-Football account quota.
