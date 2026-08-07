# Betynz v5.0.18 — Zeus Statistical Intelligence

## Architecture

Seven independent engines continue to create the underlying football directions:

1. Market Route
2. PPG Route
3. Apex Intelligence
4. Convergence
5. Momentum & Streak
6. Atlas Streak Value
7. Chronos HT/FT Momentum

**Zeus Statistical Intelligence** is added above them as a supervisor, not as an eighth vote. Consensus agreement therefore remains 7/7 for Elite and 5–6/7 for Consensus.

## Zeus evidence families

Zeus independently evaluates venue strength, attack/defence fit, matchup compatibility, recent momentum, ordered streaks, xG, shots on target, HT/FT transition behavior, overall statistical strength and corroboration from the seven underlying engines. Evidence is grouped by family so related streaks do not artificially inflate confidence.

Zeus also calculates a data-quality score and runs a separate contradiction layer. Hard contradictions, or multiple medium contradictions, can veto a direction. When evidence is incomplete Zeus can wait; when no direction is strong enough Zeus returns **No Clear Statistical Edge**.

## Consensus supervision

Zeus can mark a shared selection as:

- `APPROVED` — Zeus independently supports the same direction.
- `NEUTRAL` — Zeus does not materially oppose it.
- `INSUFFICIENT_DATA` — Zeus does not have enough reliable evidence to supervise.
- `ZEUS_HOLD` — a strong statistical contradiction/veto prevents publication.

Zeus never increases `agreement_count`; a 7/7 underlying agreement remains 7/7.

## Universal publication gate

The final 1.20–2.00 odds gate remains after Zeus. A Zeus selection outside the band must be converted to a compatible in-band direction by the universal gate or it is rejected.

## UI

A dedicated `/zeus.html` command page shows confidence, data quality, dominant direction, evidence-family count, strongest supporting evidence and contradictions. Zeus is also visible in the dashboard toolbar, match-intelligence dialog, Qualified Picks filters, Proof, Performance and Engine Audit.

## Data and runtime

Zeus creates no new provider lane. It reuses already-cached API-Football and Stats API evidence, preserving the v5.0.17 Render stability protections. `ZEUS_CACHE_TTL_SECONDS=1800` is included in `render.yaml`.

## Database

Existing projects must run `apps/web/sql/016_zeus_statistical_supervisor.sql` once. The migration permits `ZEUS_SUPERVISOR` in stored engine rows while leaving Consensus agreement counts at 1..7.

Predictive quality is not guaranteed by the name or score; Zeus should be calibrated against settled forward results before interpreting higher confidence bands as proven accuracy.
