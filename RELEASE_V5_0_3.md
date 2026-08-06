# Betynz v5.0.3 — crest delivery fix

- Routes API-Football team and league artwork through a same-origin cached media proxy.
- Uses team IDs from the fixture response, avoiding repeated team-search calls.
- Adds load/error fallbacks so a failed image never leaves a broken-image icon.
- Adds bounded media concurrency, in-flight deduplication, timeouts and seven-day cache headers.
- Keeps one Render service and API-Football as the only football provider.
