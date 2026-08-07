# Betynz v5.0.16 Start Here

This is the seven-engine single-Render Betynz build with API-Football core data, Stats API enrichment and the universal **1.20–2.00** publication odds gate.

## Upgrade from v5.0.15

1. Replace the repository contents with this release, keeping the hidden `.git` folder.
2. Keep your existing Render secrets, including `API_FOOTBALL_KEY` and `STATS_API_KEY`.
3. Commit and push through GitHub Desktop.
4. In Render choose **Manual Deploy → Clear build cache & deploy**.
5. Hard refresh once with `Ctrl + Shift + R`.

No Supabase migration is required for this release.

## Universal odds rule

- Final odds **1.20 through 2.00 inclusive** are publishable.
- Below 1.20: Betynz attempts a compatible market upgrade.
- Above 2.00: Betynz attempts a compatible safer-market downgrade.
- If no compatible alternative lands inside the band, the selection is rejected.

All seven engines and Consensus use the same final publication gate.
