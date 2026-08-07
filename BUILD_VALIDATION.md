# Betynz v5.0.20 Build Validation

Validated on 2026-08-07 with the production-style API-Football queue limits used by the Render service.

## Result

- Engine/platform tests: **127/127 passed**
- Match-specific adaptive recovery tests: **5/5 passed**
- Source-of-goals validation tests: passed
- Data-backed exact-market validation: passed
- Universal 1.20–2.00 publication gate: passed
- Seven-engine Consensus + Zeus supervision: passed
- Transient 502/503/504 recovery: passed
- Syntax validation: passed
- Release verification: passed
- Single-Render verification: passed
- One-service integration smoke test: passed
- API-Football 8-RPM production-style environment: passed

## Match-specific adaptive recovery

Validated behaviors:

- A failed market threshold does not trigger a fixed fallback ladder.
- When the weaker side fails its one-goal contribution test, Over 2.5 must prove where the third goal can come from.
- If the stronger side has a credible three-goal-alone profile, its Team Over 2.5 route can be considered and must be independently data-backed.
- If the stronger side clears Team Over 1.5, has a meaningful venue PPG/strength advantage, and the weaker side is poor offensively, a favourite-result route can be considered and must be independently data-backed.
- Balanced/neutral 1X2 pricing can trigger a fresh check for Draw/Stalemate, Under, BTTS Yes or BTTS No, depending on the exact statistical picture.
- Every recovered market must be available, inside 1.20–2.00, and independently marked `BACKED_BY_DATA`.
- Opposing alternatives that are too close are withheld instead of forcing a selection.
- Missing evidence remains missing; no statistic is fabricated.

## Source-of-goals guard

For Over 2.5+ routes, when one team is statistically unlikely to contribute a goal, a generic high-goal average is no longer sufficient. Betynz checks whether the likely stronger side has enough three-goal frequency, scoring average, xG and SOT support to supply the required goals alone. If that case is not supported, the original Over 2.5 route is reopened and alternative markets are evaluated match by match.

## Runtime impact

The adaptive recovery layer does not launch another provider-wide scan. It reuses fixture odds, venue histories, xG/SOT, streak and HT/FT evidence already present in the shared analysis context, preserving the bounded caches, sequential deep-analysis lane and transient 502/503/504 recovery introduced in prior runtime-stability releases.
