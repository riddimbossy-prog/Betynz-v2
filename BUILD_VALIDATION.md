# Betynz v5.0.4 build validation

## Passed

- Engine/platform suite: **69/69 tests passed**
- API-Football fixtures, odds, live, results, events, history and crest proxy tests: passed
- Automatic settlement route and scheduler source verification: passed
- Rolling wins endpoint and dashboard wiring: passed
- Board-aware dashboard and Picks visibility: passed
- Favicon, Apple icon, maskable icons and launch artwork: passed
- Animated splash and reduced-motion safeguards: passed
- Responsive phone, Z Fold, tablet and desktop assertions: passed
- Release verification: passed
- Single `render.yaml` / one Render service verification: passed
- API-Football-only integration smoke test: passed

## Integration smoke result

```json
{
  "ok": true,
  "deployment": "ONE_RENDER_SERVICE",
  "provider": "API_FOOTBALL",
  "version": "5.0.4",
  "engines": ["MARKET_ROUTE", "PPG_ROUTE", "CONVERGENCE_ROUTE"],
  "fixtures": 2,
  "live": 1,
  "results": 1,
  "events": 1
}
```

## Important limitation

The integration test used an API-Football-compatible local mock. The production API key and production Supabase project were not available in this environment. Real bookmaker coverage, quota behavior and the populated wins carousel must be confirmed after deployment.
