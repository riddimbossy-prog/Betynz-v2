# Betynz v5.0.13 Build Validation

## Result

- Engine and platform tests: **84/84 passed**
- Seven-day count batching regression: **passed**
- Shared same-league history regression: **passed**
- Progressive prediction publishing regression: **passed**
- API-Football body-level rate-limit recovery: **passed**
- Render-style production build: **passed**
- Release verification: **passed**
- Single-Render verification: **passed**
- One-service integration smoke test: **passed**

## Production-style environment used

```env
NODE_ENV=production
API_FOOTBALL_REQUESTS_PER_MINUTE=8
API_FOOTBALL_REQUEST_CONCURRENCY=1
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=750
API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS=65000
```

## Speed architecture verified

1. Daily fixtures return without waiting for complete odds pagination.
2. The first odds page is cached and merged immediately.
3. Priced upcoming fixtures enter the engine lane first.
4. Later odds pages run below engine-history priority.
5. One league-season history request is reused by every eligible fixture in that competition.
6. Team-history fallback starts only for incomplete venue samples.
7. PPG, Apex, Convergence and Momentum share normalized history work.
8. Each completed fixture is published to its engine board and Consensus immediately.
9. Seven future-date counters use one low-priority range request instead of six calls.
10. No daily fixture cap was introduced.

No engine rule, threshold or settlement rule was changed.
