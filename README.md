# Betynz v5.0.11 — Render Build Isolation Hotfix

Betynz is an API-Football-only football-analysis platform deployed as one Render web service.

## Active engines

1. Market Route
2. PPG Route
3. Apex Intelligence
4. Convergence
5. Momentum & Streak

## What v5.0.11 fixes

Render production pacing variables are now isolated from the Node test runner. The live service still uses the subscription-safe queue, while build mocks run with a deterministic local queue.

API-Football can report its per-minute limit inside a normal HTTP 200 JSON body. Earlier builds treated that message as a final enrichment failure, which could leave Apex at `151 fixtures checked` but `0 complete samples`.

v5.0.11 adds one adaptive queue for every API-Football request. It detects body-level and HTTP 429 limits, pauses globally, honours reset headers, retries after cooldown, prioritises fixtures/odds/live data, and keeps unfinished engine work queued. Successful league and team histories are cached and shared across all five engines.

## Consensus

- 5/5 compatible agreement: Elite Banker
- 4/5 compatible agreement: Consensus Banker
- 2–3/5 compatible agreement: Shared Qualified Pick
- One independent qualification: Qualified or Safer Pick
- Opposing qualified directions: Conflict

## Motion

The long games board remains minimal. Apex receives only a light orange loading pulse, progress glow and short pick-card reveal, with full reduced-motion support.

## Deployment

The repository contains one `render.yaml` and one Render web service. API-Football is the only football provider. Supabase stores frozen predictions, settlement, proof, performance and learning records.
