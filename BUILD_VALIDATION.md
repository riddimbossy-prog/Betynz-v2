# Betynz unified SportyBet build validation

Validation date: 2026-08-06

## Deployment structure

- One GitHub repository: passed
- One root `render.yaml`: passed
- One Render web service definition: passed
- Duplicate app-level Render files absent: passed
- Root launcher starts both internal workers: passed
- Betynz engines receive the private internal SportyBet API URL automatically: passed

## SportyBet core API

```text
Syntax checks: passed
Parser tests: 4 passed, 0 failed
Private-key authentication: passed
Fixtures and full common markets: passed
Live score, minute, half-time score and incidents: passed
Finished results for settlement: passed
No invented missing odds: passed
```

## Betynz engines and platform

```text
Engine/platform tests: 62 passed, 0 failed
Market Route Engine: passed
PPG Route Engine: passed
Convergence Engine: passed
Consensus Bankers: passed
Automatic calibration: passed
Settlement logic: passed
Responsive and PWA safeguards: passed
Release verification: passed
```

## Combined integration

A mock SportyBet upstream was connected to the private core API. The combined root launcher then started the core API and Betynz web app inside one service process group.

```text
Deployment: ONE_RENDER_SERVICE
Render YAML count: 1
Normalized source: SPORTYBET_CUSTOM_API
Core fixtures: passed
Core live feed: passed
Core results: passed
Core authentication: passed
Web fixture propagation: passed
Web live-score propagation: passed
Engine registration: MARKET_ROUTE, PPG_ROUTE, CONVERGENCE_ROUTE
```

## Production limitation

The build environment had no live web access, so the configured SportyBet public endpoint templates were validated against SportyBet-shaped mock responses rather than a live SportyBet.com request. After Render deployment, verify `/api/fixtures` and `/api/live` immediately. No third-party football-data fallback is included.
