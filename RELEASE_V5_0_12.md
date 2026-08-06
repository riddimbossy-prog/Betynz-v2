# Betynz v5.0.12 — Non-blocking fixture board

## Problem fixed

The dashboard waited for every paginated odds page before returning the first fixture list. On a low requests-per-minute API-Football subscription, the page could remain on `Loading fixtures…` with zero matches even though the fixtures endpoint itself was available.

## New board flow

1. Fetch the complete daily fixture list first.
2. Return and render every real fixture immediately.
3. Start the paginated odds download in the background.
4. Poll the same dashboard route briefly and merge odds into the existing rows.
5. Start engine analysis as soon as the odds cache becomes ready.

The daily fixture count is still uncapped. Only bookmaker-odds pagination runs in the background.

## Safety

- API-Football remains the only football provider.
- All five engines remain unchanged.
- Existing rate-limit recovery remains active.
- No Supabase migration is required.
- One repository, one Render service and one `render.yaml` remain.
