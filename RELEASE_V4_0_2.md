# Betynz v4.0.2 — rate-limit-safe full-day processing

## Problem repaired

The full-day build could start many `get_fixture_stats` requests at the same time. Multiple pages could also launch the same date enrichment before the first request finished. The private SportyBet core then returned HTTP 429 responses even though every component was running inside the same Render service.

## Changes

- Trusted authenticated loopback calls bypass the public core-API rate limiter.
- Public/external API calls remain rate-limited.
- SportyBet upstream traffic is processed through a paced queue.
- API-Football traffic uses an independent paced queue.
- Duplicate fixture-detail and API-Football requests share one in-flight promise.
- Dashboard, fixture board and Market Route board share in-progress date jobs.
- HTTP 429 responses honour `Retry-After` and use exponential backoff with jitter.
- Full-day fixture coverage remains uncapped.

## Production defaults

```env
BETYNZ_DATA_API_ENRICH_CONCURRENCY=2
BETYNZ_DATA_API_ACTION_CONCURRENCY=2
BETYNZ_DATA_API_ACTION_MIN_INTERVAL_MS=250
BETYNZ_DATA_API_RETRY_BASE_MS=1000
BETYNZ_DATA_API_RETRY_MAX_MS=30000

SPORTYBET_UPSTREAM_CONCURRENCY=2
SPORTYBET_UPSTREAM_MIN_INTERVAL_MS=250
SPORTYBET_UPSTREAM_RETRIES=4
SPORTYBET_UPSTREAM_BACKOFF_BASE_MS=1000
SPORTYBET_UPSTREAM_BACKOFF_MAX_MS=30000
ALLOW_INTERNAL_RATE_LIMIT_BYPASS=true

API_FOOTBALL_ENRICH_CONCURRENCY=2
API_FOOTBALL_REQUEST_CONCURRENCY=3
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=200
API_FOOTBALL_RETRY_BASE_MS=1000
API_FOOTBALL_RETRY_MAX_MS=30000
```

`API_FOOTBALL_MAX_FIXTURES` is not used as a daily cap. All fixtures are retained; the queues only control processing speed.
