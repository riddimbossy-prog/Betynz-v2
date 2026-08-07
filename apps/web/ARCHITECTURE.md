# Betynz v5.1.0 Architecture

## Provider authority

API-Football is the primary provider for fixtures, identities, odds, live state, results, visual assets, venue history and HT/FT history. Stats API is additive enrichment for external streak profiles, xG, SOT and team-quality evidence.

Cross-provider data is accepted only through the canonical identity layer. Stats API mapping uses home/away orientation, team-name similarity, league, country and kickoff proximity, with a persistent verified mapping registry.

## Football intelligence path

1. Load the selected-day fixture board without waiting for deep odds/history pagination.
2. Process priced upcoming fixtures first.
3. Seven specialist engines analyse their own evidence families.
4. Universal odds gate permits only 1.20–2.00 final prices.
5. Exact-market data validator independently evaluates the selected market and reports evidence-source diversity.
6. If the proposed market fails, adaptive recovery re-opens only that fixture, records every candidate tested, applies a multiple-comparison penalty, and publishes only a replacement that is itself data-backed.
7. Consensus groups compatible directions. Raw agreement remains 1–7, while effective evidence discounts correlated engine families.
8. Zeus supervises the raw statistical picture, data quality and contradictions without becoming an eighth vote.
9. Official predictions freeze before kickoff, settle against strict fixture identity, and feed calibration.

## Calibration

Engine scores are provisional confidence surrogates, not claimed probabilities. Forward-settled calibration measures hit rate and ROI alongside Brier score, log loss, calibration gap, market-implied probability baseline, closing-line value and 95% Wilson intervals. Engine error correlation is measured on shared settled fixtures.

## Historical integrity

Public deep analysis is limited to today through +7 days. Past official dates return a historical lock response and must be viewed through frozen Proof records. Stats API team history is queried and filtered strictly before the target fixture kickoff.

## Performance architecture

The one Render service contains a logical background precompute lane. Today's fixtures, shared histories, Stats API evidence, feature snapshots, engine results, Zeus and Consensus are warmed before/while users arrive. The web request path prefers the feature store and only falls back to provider work when a snapshot is missing.

The service preserves bounded caches, provider queue deduplication, progressive publication, sequential seven-day deep analysis and sequential settlement to avoid full-service 502 failures.

## Security and operations

- API keys stay server-side.
- Supabase service-role key stays server-side.
- Admin cookies are HttpOnly, Secure in production and SameSite=Strict.
- Admin login is throttled.
- State-changing admin actions require a same-origin browser request.
- Admin HTML is not exposed through public navigation and redirects unauthenticated users to sign-in.
- Public APIs and deep-analysis routes are rate limited.
- Runtime telemetry records request latency, 5xx rates, event-loop lag and error classes.

## Persistence

Supabase stores frozen predictions, consensus snapshots, results, prediction lineage, provider identity mappings and precomputed feature snapshots. New v5.1.0 tables are created by `sql/017_foundation_intelligence.sql`.
