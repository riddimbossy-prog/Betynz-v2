# Betynz v5.0.17 — Render Runtime Stability

This release hardens the single-Render runtime after a full-service 502 Bad Gateway was observed under heavy seven-engine use.

## Runtime changes

- Bounded general cache with LRU-style eviction.
- Bounded API-Football crest cache: 320 entries / 32 MB by default.
- Bounded Stats API response cache.
- Bounded engine and Consensus date snapshots.
- Seven-day Consensus performs one deep date at a time, selected date first.
- Automatic settlement processes lookback dates sequentially and starts after a 60-second warm-up.
- `/api/health` now reports process memory and runtime cache pressure without calling an upstream provider.
- HTTP server timeouts and rejection/error diagnostics are explicit.

## Prediction behavior

No engine thresholds were changed. The seven engines, Stats API enrichment, Chronos HT/FT logic and universal 1.20–2.00 publication odds gate are unchanged.
