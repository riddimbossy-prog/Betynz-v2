# Betynz web — v5.1.0

The web application contains the public/PWA interface, server API, provider adapters, seven specialist engines, Consensus, Zeus, settlement, calibration, identity mapping, feature caching and Supabase persistence.

## Active specialist engines

- MARKET_ROUTE
- PPG_ROUTE
- APEX_INTELLIGENCE
- CONVERGENCE_ROUTE
- MOMENTUM_STREAK
- STREAK_VALUE
- HTFT_MOMENTUM

`ZEUS_SUPERVISOR` sits above the seven-engine vote. It does not turn 7/7 into 8/8.

## Foundation services

- `evidenceIndependence.mjs` — correlation-aware effective evidence.
- `predictionLineage.mjs` — original → gate → validation → recovery → final audit trail.
- `identityRegistry.mjs` — canonical cross-provider identities.
- `featureStore.mjs` — bounded precomputed intelligence cache + Supabase snapshots.
- `requestGuard.mjs` — rate limiting and historical/future analysis window.
- `telemetry.mjs` — route/error/latency/event-loop telemetry.
- `api-client.js` — shared browser API transport/recovery behavior.

Historical official predictions are never recomputed from current data. Use Proof for past dates.
