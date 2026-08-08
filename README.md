# Betynz v5.1.1 — Foundation Intelligence

Betynz is a football-intelligence platform built around seven specialist engines and Zeus statistical supervision. v5.1.1 is a foundation release: it keeps the existing football rules, the universal 1.20–2.00 publication gate, exact-market data validation and match-specific adaptive recovery, while strengthening how evidence is measured, stored, calibrated, mapped and served.

## Decision pipeline

```text
API-Football core data + Stats API enrichment
  → specialist engine proposal
  → universal 1.20–2.00 odds gate
  → exact-market data-backed validation
  → match-specific adaptive recovery when needed
  → correlation-aware seven-engine Consensus
  → Zeus statistical supervision
  → freeze → Proof → settlement → calibration
```

## v5.1.1 foundation upgrades

- Correlation-aware Consensus with effective independent-evidence units.
- Brier score, log loss, market-implied baseline, calibration gap, Wilson intervals and CLV tracking.
- Structured prediction lineage from original proposal through final publication.
- Canonical API-Football ↔ Stats API fixture/team identity registry.
- Strict historical integrity: past official analyses are read from Proof, not recomputed with future data.
- Stats API histories are cutoff-aware as of the target fixture kickoff.
- Precomputed feature store in memory + Supabase for faster match intelligence.
- Bounded public API rate limits and deep-analysis date window.
- Stronger automatic settlement identity requirements.
- Admin page isolation, login throttling and same-origin protection on state-changing admin actions.
- Runtime telemetry for latency, 5xx errors, event-loop lag, memory, caches and provider queues.
- Simplified public navigation with a dedicated Engine Lab.
- Shared browser API client and modular foundation services.

## Deployment

One repository, one `render.yaml`, one Render web service. Run SQL `017_foundation_intelligence.sql` on an existing Supabase project before deploying v5.1.1.

## v5.2.0 durability
Betynz now checkpoints completed engine analysis per fixture, records resumable scheduler jobs, uses distributed database leases, and keeps an immutable prediction firing ledger. Apply `apps/web/sql/019_persistence_core.sql` and use `/admin-operations.html` for private runtime control.
