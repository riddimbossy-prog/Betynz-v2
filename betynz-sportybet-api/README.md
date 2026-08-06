# Betynz SportyBet Core API v1.0.0

This private Node.js service is the only football-data source for Betynz. It reads logged-out public SportyBet football feeds and normalizes fixtures, complete offered markets, live scores, match status, incidents and finished results.

It does **not** use Parse.bot, BetExplorer, API-Football, The Odds API, demo fixtures, customer cookies or logged-in account data.

## Public health route

```text
GET /api/health
```

## Private routes

Send the key using `X-API-Key` or `Authorization: Bearer ...`.

```text
GET /api/fixtures?date=YYYY-MM-DD
GET /api/fixtures?from=YYYY-MM-DD&days=7
GET /api/fixtures/:eventId
GET /api/fixtures/:eventId/markets
GET /api/live?date=YYYY-MM-DD
GET /api/live/:eventId
GET /api/results?date=YYYY-MM-DD
GET /api/results/:eventId
GET /api/events?event_id=...
```

Compatibility routes used by Betynz Web:

```text
GET /search_matches?date=YYYY-MM-DD
GET /get_fixture_stats?event_id=...
GET /get_team_history?... 
GET /get_team_streaks?...
GET /get_competition_stats?...
GET /get_standings?...
```

Team history and competition statistics are calculated only from SportyBet result feeds. The standings route returns unavailable unless a SportyBet standings endpoint is configured; it never calls another provider.

## Deploy

Create a fresh GitHub repository, upload this folder's contents, and create a Render Blueprint. Set `SPORTYBET_API_KEY` to one long private secret. Use the exact same value as `BETYNZ_DATA_API_KEY` on the Betynz Web service.

## Production verification

The upcoming feed URL was inherited from the working custom collector. Live, result and event-detail endpoint templates are configurable because SportyBet can change public paths or response schemas. After deployment, verify `/api/source-status`, `/api/live`, `/api/results`, and one event-detail request. Update only the corresponding `SPORTYBET_PUBLIC_*_URL` variable if SportyBet changes a path.
