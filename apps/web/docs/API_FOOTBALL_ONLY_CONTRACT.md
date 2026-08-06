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

## v5.0.9 five-engine analysis

The provider contract remains unchanged. Momentum & Streak consumes the same normalized fixture, exact offered markets and cached last-five home/away venue statistics already used by the statistical engines. It does not create another upstream data source or make browser-side provider calls.
