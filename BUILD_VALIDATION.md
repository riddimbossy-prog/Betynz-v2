# Betynz v3.8.0 validation

Validation date: 2026-08-06

## SportyBet private API

- JavaScript syntax: passed
- Parser tests: 4 passed, 0 failed
- Full common market normalization: passed
- Live score, minute, half-time and incident normalization: passed
- Final-result normalization: passed
- Missing-price non-invention safeguard: passed
- Private-key authentication in full-stack smoke test: passed

## Betynz Web

- JavaScript syntax: passed
- Engine/platform tests: 62 passed, 0 failed
- Live-minute regression test: passed
- Release verification: passed
- Version: 3.8.0
- Sole sports source label: `SPORTYBET_CUSTOM_API`
- Demo runtime and packaged demo fixtures: absent

## Full-stack smoke test

A local SportyBet-shaped upstream was connected to the private API, and Betynz Web was connected to that API using the private key.

- Fixtures propagated: passed
- 1X2 and goal-market odds propagated: passed
- Live score and 67th-minute status propagated: passed
- Half-time score propagated: passed
- Finished result propagated: passed
- Unauthorized API request rejected with HTTP 401: passed
- Betynz fixture board source: `SPORTYBET_CUSTOM_API`
- Betynz live-centre source: `SPORTYBET_CUSTOM_API`

## External limitation

Live internet access was unavailable in the build environment. The current SportyBet public live, results and event-detail URLs therefore could not be tested against SportyBet.com during packaging. They remain configurable through `SPORTYBET_PUBLIC_*_URL` environment variables and must be checked immediately after the private API is deployed.
