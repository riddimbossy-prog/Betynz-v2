# Betynz v5.0.13 — Fast Engine and Consensus Lane

## Why this release exists

The daily fixture board was already non-blocking, but the five deep-stat engines and Consensus still shared the same low-rate API-Football request queue with future-date counts and complete odds pagination. On accounts with a small per-minute allowance, engine history could wait behind background board work.

## Faster selected-date analysis

- Today’s fixtures remain visible immediately.
- The first odds page is merged immediately.
- Priced, upcoming fixtures enter the engine lane before no-odds or settled fixtures.
- Later odds pages run below engine-history priority.
- One league-season history request is shared by every eligible fixture in that competition.
- All fixtures completed by the shared league pool publish together.
- Team-level history is requested only for fixtures whose venue samples remain incomplete.
- PPG Route, Apex, Convergence and Momentum reuse the same normalized history work.
- Consensus receives each completed fixture as soon as its engine outputs are ready.

## Lighter seven-day counters

The dashboard no longer starts six independent future-date fixture requests. One low-priority range request returns all seven daily totals, leaving the selected date and engine work ahead in the provider queue.

## Rate-limit safety

The adaptive API-Football queue, body-level rate-limit detection, Retry-After support, global cooldown and persistent history caching remain enabled. No engine threshold or prediction rule was changed.

## Database

No Supabase migration is required when upgrading from v5.0.12.
