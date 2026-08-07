# Betynz v5.0.20 — Match-Specific Adaptive Recovery

v5.0.20 changes the final publication layer from a fixed fallback ladder into match-specific reasoning.

## Final decision flow

1. An engine proposes a direction.
2. The universal 1.20–2.00 odds gate checks the exact market.
3. The exact market is independently checked against match data.
4. If that route fails, Betynz re-opens only that fixture and asks what is still statistically possible.
5. Every alternative must be available, priced 1.20–2.00, logically relevant to this match, and independently `BACKED_BY_DATA`.
6. Competing opposite alternatives within the conflict margin are withheld rather than forced.

## Source-of-goals guard

For Over 2.5 and higher, if one team's O0.5 price is above its contribution threshold, the match total is not allowed to assume that team will score. Betynz now checks whether the favourite can plausibly supply all three goals using:

- 3+ goal venue frequency
- venue scoring average
- xG
- shots on target

If the favourite cannot carry the three-goal route, Over 2.5 is rejected/re-opened.

## Adaptive examples

- Weaker side fails O0.5 + favourite clears Team O1.5 + strong/decent venue PPG → test Favourite Win.
- Weaker side fails O0.5 + favourite has a real 3+ profile → test Favourite Team O2.5.
- Neutral/balanced 1X2 + low-goal evidence → test an Under/stalemate expression.
- Neutral/balanced 1X2 + both teams clear O0.5 + BTTS data agree → test BTTS Yes/GG.
- If no alternative survives its own exact data validation → no public tip.

There is no new provider call and no new Supabase migration. The layer reuses API-Football and Stats API evidence already collected by Betynz.
