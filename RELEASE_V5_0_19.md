# Betynz v5.0.19 — Data-Backed Publication Layer

Every engine route now passes through a final independent statistical validation layer after the universal odds gate and before publication, Consensus, freezing, Proof or storage.

## Mandatory final check

An engine may propose a market, but Betynz publishes it only when the exact market is independently supported by relevant match data. The validator reuses already-loaded API-Football venue history and Stats API evidence; it does not add a new provider scan.

Statuses:
- `BACKED_BY_DATA` — exact proposed market has sufficient independent statistical support.
- `INSUFFICIENT_DATA` — route is held while relevant samples are incomplete.
- `REJECTED_BY_DATA` — route is withheld because the data materially contradict the proposed market.

The validator covers match totals, team totals, 1X2/double chance, draw/no-draw, BTTS, first-half goals and HT/FT transition markets. For goals it can use venue goal rates, goal pace, ordered streaks, xG and SOT.

## User explanation

Every published selection exposes a `Backed by data` control. The popup shows the validation score, sample depth, supporting evidence, cautions/opposing evidence and neutral context in plain English.

## Consensus

Consensus may publish a shared market only when the exact shared market has a matching data-backed validation. A safer market inferred from general direction is held until that exact market is statistically validated.

## Provider and runtime impact

No additional API key is required. The layer reuses existing normalized evidence and adds no new API-Football scan, preserving the v5.0.17/v5.0.18 Render stability controls.

No Supabase migration is required from v5.0.18 because validation metadata is stored inside the existing prediction payload JSON.
