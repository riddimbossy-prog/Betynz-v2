# Betynz v5.0.6 build validation

## Release scope

- API-Football remains the sole football-data provider.
- Market Route, PPG Route, Convergence and Momentum & Streak remain active.
- Engine output is published progressively instead of waiting for the full daily scan.
- Same-league fixtures share a cached completed-fixture history pool.
- Future date counts use a lightweight fixtures-only endpoint.
- The games board uses minimal motion and retains accessible live-state updates and the settled-wins carousel.
- One repository, one root `render.yaml` and one Render web service remain enforced.

## Automated results

```text
Engine and platform tests:              76/76 passed
Fast prediction pipeline tests:          2/2 passed
Minimal board-motion tests:              4/4 passed
Syntax verification:                    passed
Release verification:                   passed
Single-Render verification:             passed
One-service integration smoke:          passed
Fresh ZIP rebuild:                       passed
```

## Integration smoke result

```json
{
  "ok": true,
  "deployment": "ONE_RENDER_SERVICE",
  "provider": "API_FOOTBALL",
  "version": "5.0.6",
  "engines": [
    "MARKET_ROUTE",
    "PPG_ROUTE",
    "CONVERGENCE_ROUTE",
    "MOMENTUM_STREAK"
  ],
  "fixtures": 2,
  "live": 1,
  "results": 1,
  "events": 1
}
```

## Speed regression coverage

Tests verified:

- Multiple fixtures in one league use one shared league-history request.
- Team-specific history calls are avoided when the league pool contains both teams.
- A qualified fixture can appear while a slower fixture is still processing.
- API responses expose progress rather than holding the page until the whole day finishes.
- No-odds fixtures remain on the board but do not start expensive prediction enrichment.
- Duplicate requests reuse cached or in-flight work.

## Motion regression coverage

Tests verified:

- Public pages load the lightweight motion layer.
- Fixture rows do not use IntersectionObserver reveal effects.
- Pointer tilt, parallax and lightning effects are absent.
- CSS disables fixture-card transforms and decorative sweep animations.
- `content-visibility` is enabled for long fixture boards.
- Reduced-motion rules remain present.
- The wins ticker and short PWA launch splash remain available.

## Deployment validation

- Root `render.yaml` count: 1
- Render web-service count: 1
- Application folders: `apps/web` only
- Public service health version: 5.0.6
- Football provider: API-Football only
- Daily fixture application cap: none
- New Supabase migration required from v5.0.5: no
