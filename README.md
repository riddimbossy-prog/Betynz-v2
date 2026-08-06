# Betynz v5.0.3 — API-Football only

Betynz uses API-Football for fixtures, odds, live scores, results, statistics and visuals. Team crests are delivered through a cached same-origin endpoint to avoid browser hotlink failures.

## Core routes

```text
GET /api/health
GET /api/fixtures?date=YYYY-MM-DD
GET /api/live
GET /api/results?date=YYYY-MM-DD
GET /api/media/team/<TEAM_ID>.png
GET /api/media/league/<LEAGUE_ID>.png
```

The deployment remains one repository, one Render service and one root `render.yaml`.
