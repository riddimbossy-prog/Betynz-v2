# Betynz v5.0.11 — Render build isolation hotfix

## Fixed

- Prevents Render production API pacing variables from leaking into the Node test runner.
- Keeps production at the configured subscription-safe queue and cooldown values.
- Uses a deterministic local mock queue only while `NODE_TEST_CONTEXT` or `NODE_ENV=test` is active.
- Restores the progressive-engine regression to its intended sub-second response check.
- Prevents the 65-second production cooldown from stalling build tests.

## Production behaviour

Production still honours:

```env
API_FOOTBALL_REQUESTS_PER_MINUTE=8
API_FOOTBALL_REQUEST_CONCURRENCY=1
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=750
API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS=65000
```

No engine logic, prediction thresholds, Supabase schema or public page behaviour changed.
