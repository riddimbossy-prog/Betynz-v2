# Betynz v5.1.1 — Board Persistence Hotfix

## Bug reproduced

During progressive engine analysis, a fixture could FIRE and become visible, then disappear or revert to a waiting/pending state on the next automatic refresh. The same refresh could also make progress jump backwards (for example, from several processed fixtures back to `0 of N`).

## Root cause

When API-Football entered a cooldown, a shared analysis retry rebuilt the progressive engine maps from scratch and immediately published a new `WAITING` snapshot with progress reset to zero. Browser polling accepted that less-complete snapshot and replaced the already-visible result.

A second risk existed in weekly precomputation: a complete prepared view could be replaced in memory by a later partial refresh if that refresh did not finish.

## Fixes

- Shared stats retries now resume already-analysed fixtures instead of restarting the day from zero.
- Each processed fixture is marked `analysisReady` and retained across cooldown retries.
- If bookmaker odds change while odds pagination is still streaming, that fixture is deliberately re-analysed rather than incorrectly freezing stale odds.
- Progressive browser polling is monotonic: a `WAITING` response cannot erase a previously resolved FIRE/SAFER/CONFLICT result.
- Consensus/home-board polling preserves the last valid visible result when progress demonstrably regresses.
- Temporary 429/502/503/504/timeouts keep completed cards visible while retrying.
- Complete prepared intelligence can no longer be downgraded by a partial background refresh.
- PWA cache key and public asset query versions were bumped (`5.1.1h1`) so installed/mobile clients receive the hotfix rather than stale JavaScript.

## Validation

- 147/147 automated tests passed.
- Release verification passed.
- Single-Render verification passed.
- Added regression tests covering `7/19 -> 0/19` progress rollback, FIRE -> WAITING rollback, consensus rollback, complete-browser-state retention, and prepared-view downgrade protection.

## Deploy

Deploy this build to the existing single Render service. For the first deployment of this hotfix, use **Manual Deploy → Clear build cache & deploy** so the new PWA/service-worker assets are guaranteed to replace the old cached client.
