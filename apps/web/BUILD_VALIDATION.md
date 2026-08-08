# Betynz v5.1.1 — Build Validation

Validation target: weekly precomputed intelligence on the existing one-Render architecture.

## Result

- Engine/platform regression suite: **142/142 passed**
- Weekly precompute tests: **5/5 passed**
- Syntax checks: passed
- Correlation-aware Consensus: passed
- Universal 1.20–2.00 publication gate: passed
- Data-backed validation: passed
- Match-specific adaptive recovery: passed
- Zeus supervision: passed
- Historical-integrity guard: passed
- Runtime stability and bounded caches: passed

## Weekly-precompute coverage

Validated behaviors:

- Seven prepared fixture counts can be returned without new provider calls.
- Complete prepared engine views can be stored/retrieved by date.
- Full precompute explicitly waits for the full odds book before engine execution.
- Shared Stats Bundle includes PPG, Apex, Convergence, Momentum and Chronos.
- Atlas, Zeus and day-level Consensus are prepared after the shared stats work.
- Prepared views are persisted in Supabase.
- The fresh schema and migration both include `prepared_intelligence_views`.
- Dashboard exposes prepared-week readiness.
- Render declares the weekly scheduler/prebuild controls.
- Sunday next-week prebuild is wired.

## Important production expectation

The provider subscription is intentionally protected by a conservative request queue. A first-ever full seven-day build can therefore take substantial background time on very large fixture weeks. Once prepared views have been written to Supabase, normal page loads and service restarts use those stored results immediately rather than repeating the same deep work on the request path.

## Final production-style validation

- Production-style API-Football queue (8 RPM / 1 worker / 750ms spacing / 65s cooldown): passed
- One Render service verification: passed
- Single-service integration smoke test: passed
- Integration contract: version 5.1.1, all specialist engines plus Zeus present, fixtures/live/results/events passed
- Provider credentials were not used against the live production APIs during packaging; integration uses the repository's deterministic provider contract mocks.
