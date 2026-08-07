# Betynz v5.1.0 — Build Validation

Validated on 2026-08-07 against the same conservative API-Football queue settings used by the Render deployment.

## Final result

- Engine/platform tests: **137/137 passed**
- Foundation Intelligence tests: **10/10 passed**
- Syntax validation: **passed**
- Release verification: **passed**
- Single-Render verification: **passed**
- One-service integration smoke test: **passed**
- Production-style API-Football 8-RPM build: **passed**

## Foundation checks

- Correlation-aware Consensus discounts overlapping evidence families while preserving the public 1–7 raw agreement count.
- Calibration reports Brier score, log loss, market baseline, calibration gap, closing-line value where available, Wilson intervals and pairwise engine error correlation.
- Prediction lineage records original selection, odds-gate action, data validation, adaptive candidates considered, search penalty, Zeus/final publication state.
- Adaptive recovery records all evaluated alternatives and applies a multiple-comparison penalty instead of freely searching markets until one appears attractive.
- Stats API fixture/team matching uses orientation, team identity, league/country and kickoff proximity with a persistent identity registry and hardened mapping threshold.
- Stats API histories are cutoff before the target kickoff.
- Public historical deep analysis is locked; official past predictions must come from frozen Proof records.
- Feature-store snapshots support precomputation and are bounded in memory/persistable in Supabase.
- Public and deep-analysis APIs are rate limited; admin login is throttled; state-changing admin settlement requests require same-origin browser context.
- Runtime telemetry covers request latency/status, 5xx errors, event-loop lag, memory/cache/provider state and error classes.
- Automatic settlement prefers exact provider fixture IDs and uses a strict fuzzy fallback only at high identity confidence.
- Public navigation is simplified and the specialist pages are collected under Engine Lab; admin pages are no longer linked publicly.
- The browser engine pages share one transient-safe API client instead of duplicating fetch/retry code.
- Universal 1.20–2.00 odds gate, exact-market data validation, match-specific adaptive reasoning and Zeus supervision remain active.

## Deployment shape

- **One GitHub repository**
- **One `render.yaml`**
- **One Render web service**
- API-Football remains the core football provider.
- Stats API remains additive enrichment.
- No new API secret is required by v5.1.0.

## Database

Existing databases that already include SQL 016 must run:

`apps/web/sql/017_foundation_intelligence.sql`

This creates `prediction_lineage`, `provider_identity_map` and `feature_snapshots` with indexes and RLS protections.

## Scope note

The build uses mocked/local provider contracts for integration and regression tests; private live provider credentials were not called during packaging. Production provider latency, coverage and future calibration quality must be measured from forward-settled live data.
