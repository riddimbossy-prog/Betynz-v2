# Betynz v5.0.5 — Momentum & Streak fourth engine

## New engine

Momentum & Streak evaluates ordered recent venue sequences rather than relying on averages alone. It reads:

- Consecutive wins, losses, unbeaten and winless runs
- Scoring and conceding continuity
- Clean sheets and failed-to-score pressure
- Over 1.5, Over 2.5, Under 2.5 and Under 3.5 continuation
- BTTS continuation or suppression
- Last-three acceleration inside the full last-five venue sample
- Exact API-Football market availability

A direct selection requires at least two independent streak families, no hard blocker, a route score of at least 82 and an offered market. Safer output requires at least 70 and the approved fallback market.

## Consensus expansion

- 4/4 compatible agreement → Elite Banker
- 3/4 compatible agreement → Consensus Banker
- 2/4 compatible agreement → shared Qualified Pick
- 1 complete route → Qualified Pick or Safer Pick

Opposite team, totals or BTTS directions remain conflicts and cannot become bankers.

## Platform integration

- New `/api/momentum-streak-board` endpoint
- New `/momentum-streak.html` page
- Momentum tab in match intelligence
- Momentum filter on the Picks page
- Engine audit, Proof, Performance and settlement support
- Four-engine database constraints and agreement counts
- Service-worker and PWA shell coverage

## Database action

Existing Supabase projects must run `apps/web/sql/012_momentum_streak_engine.sql` once. New projects may use the updated fresh schema.
