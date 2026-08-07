# Betynz v5.0.16 — Universal Odds Gate

## Universal publication rule

Every active engine and Consensus now passes through one final publication gate:

- **1.20–2.00**: publish the qualified market.
- **Below 1.20**: try to upgrade to the nearest compatible harder market inside 1.20–2.00.
- **Above 2.00**: try to downgrade to the nearest compatible safer market inside 1.20–2.00.
- **No compatible market inside the band**: reject the tip.

The gate runs after engine analysis, so Market Route, PPG Route, Apex Intelligence, Convergence, Momentum & Streak, Atlas Streak Value and Chronos HT/FT keep their own evidence rules. The gate changes only the final publishable market.

## Compatible adjustment examples

- 1X below 1.20 → Home Win if the Home Win price is inside the band.
- X2 below 1.20 → Away Win if the Away Win price is inside the band.
- Over 1.5 below 1.20 → Over 2.5 / Over 3.5 if available inside the band.
- Over 2.5 above 2.00 → Over 1.5 if available inside the band.
- Home/Away Team Over 1.5 above 2.00 → Team Over 0.5 if available inside the band.
- HT/FT Home/Home above 2.00 → Home Win, then 1X, when compatible prices are available.
- HT/FT Away/Away above 2.00 → Away Win, then X2, when compatible prices are available.

The gate never switches to an opposite football direction merely to obtain a price.

## Atlas update

Atlas' published value band is now 1.20–2.00 so it follows the same global rule as all other engines.

## Protection points

The universal gate is enforced at:

1. engine-page result generation,
2. prediction persistence / freezing,
3. Qualified Picks publication,
4. Consensus input filtering,
5. Consensus final shared price validation,
6. legacy snapshot publication filtering.

This prevents an out-of-band price from leaking into Proof or Consensus through an older code path.

## Database

No Supabase migration is required from v5.0.15.
