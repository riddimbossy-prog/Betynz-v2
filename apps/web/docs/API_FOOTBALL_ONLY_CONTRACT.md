# API-Football-only data contract

## Authentication

Direct API-Sports subscriptions use:

```http
x-apisports-key: API_FOOTBALL_KEY
```

The key is read only by the Node server.

## Upstream responsibilities

- `GET /fixtures?date=YYYY-MM-DD&timezone=UTC` — complete daily fixture list and results.
- `GET /odds?date=YYYY-MM-DD&page=N` — paginated prematch bookmaker markets.
- `GET /fixtures?live=all` — live fixtures, score and elapsed time.
- `GET /fixtures/events?fixture=ID` — incidents.
- `GET /fixtures?team=ID&last=40&status=FT` — team history used to calculate venue splits.
- `GET /standings`, `/teams/statistics`, `/fixtures/headtohead`, `/predictions`, `/injuries` — core intelligence.
- `GET /fixtures/statistics`, `/fixtures/lineups`, `/fixtures/events`, `/fixtures/players` — deep match intelligence.
- `GET /teams?search=NAME` — visual/team resolver when required.

## Normalized fixture

Each fixture contains a stable API-Football fixture ID, kickoff, status, minute, score, league visual, team crests, normalized odds, raw market rows and provider metadata.

## Coverage and safety

The application applies no daily fixture cap. Odds pages continue until `paging.total` is exhausted when `API_FOOTBALL_MAX_ODDS_PAGES=0`. Missing provider coverage is reported as unavailable evidence; engines do not invent prices or statistics.

## Public same-origin routes

`/api/fixtures`, `/api/results`, `/api/live`, `/api/live-events` and the engine/intelligence routes expose sanitized normalized data without the private key.

## v5.0.4 settlement and settled-win delivery

API-Football remains the sole football data provider. Official completed fixture results are matched to frozen Supabase predictions and settled as `WON`, `LOST`, `VOID`, `PUSH` or `REVIEW`.

Public read-only routes:

```text
GET /api/settlement-status?date=YYYY-MM-DD
GET /api/wins-carousel?days=14&limit=24
```

The wins route returns only officially settled `WON` rows. It does not generate or rewrite predictions.

## v5.0.13 five-engine analysis

The provider contract remains unchanged. Momentum & Streak consumes the same normalized fixture, exact offered markets and cached last-five home/away venue statistics already used by the statistical engines. It does not create another upstream data source or make browser-side provider calls.
## v5.0.13 adaptive subscription protection

All engine enrichment requests share one server-side API-Football queue. The queue deduplicates identical history work, uses a rolling per-minute request budget, and pauses globally when the provider returns a rate-limit signal. Rate limits are detected both from HTTP `429` responses and from API-Football error objects returned with HTTP `200`.

During a provider cooldown, unfinished fixtures remain pending rather than being finalized as missing samples. Engine endpoints expose `providerQueue`, `progress.stage = RATE_LIMIT_COOLDOWN`, and retry timing so the browser can continue polling and publish completed picks as soon as enrichment resumes.

Recommended production defaults:

```env
API_FOOTBALL_ENRICH_CONCURRENCY=2
API_FOOTBALL_REQUEST_CONCURRENCY=1
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=750
API_FOOTBALL_REQUESTS_PER_MINUTE=8
API_FOOTBALL_RATE_LIMIT_RETRIES=6
API_FOOTBALL_RATE_LIMIT_COOLDOWN_MS=65000
API_FOOTBALL_ENGINE_LEAGUE_HISTORY=true
API_FOOTBALL_ENGINE_HISTORY_TTL_SECONDS=43200
```

## v5.0.13 fast engine and Consensus lane

Current-date work is ordered by explicit server-side priority:

1. Fixtures
2. First odds page
3. Shared league-season engine history
4. Team-history fallback
5. Later odds pages
6. Seven-day count range

The browser receives fixtures and partial prices before background pagination finishes. Deep-stat engines analyse only priced upcoming fixtures first. Fixtures in the same league and season share one completed-history pool; only incomplete 5+5 venue samples request team-specific fallback history. Each completed fixture is published immediately to PPG Route, Apex Intelligence, Convergence, Momentum & Streak and Consensus.

`GET /api/fixture-counts?from=YYYY-MM-DD&days=7` replaces six separate future-date count requests.
