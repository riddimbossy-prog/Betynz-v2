# Betynz v5.1.0 — Foundation Intelligence

This release addresses the structural weaknesses identified in the full-site review without adding another football engine or changing the locked universal odds band.

## Major changes

- Correlation-aware seven-engine Consensus and adjusted confidence.
- Forward calibration metrics: Brier, log loss, market baseline, calibration gap, CLV and confidence intervals.
- Pairwise engine error-correlation reporting.
- Structured prediction lineage including adaptive candidates considered.
- Multiple-comparison penalty on broad adaptive recovery searches.
- Canonical provider identity registry with stricter Stats API mapping threshold.
- Stats API histories are strictly cutoff at the analysed fixture kickoff.
- Historical deep-analysis lock prevents future-data leakage on past official fixtures.
- Precomputed feature-store snapshots in memory and Supabase.
- Stronger automatic result matching; weak fuzzy identities stay for review instead of auto-settlement.
- Bounded public/deep API rate limits and admin-login throttling.
- Same-origin protection for state-changing admin settlement actions.
- Admin pages removed from public navigation and protected at HTML entry.
- Runtime route/error/latency/event-loop telemetry.
- Simplified public navigation plus an Engine Lab.
- Shared public API client replaces duplicated engine-page fetch implementations.
- Current architecture/documentation brought in sync with the seven engines + Zeus system.

No football outcome is guaranteed. Forward settlement remains the authority for whether a rule adds real predictive information.
