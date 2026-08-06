# Betynz v5.0.5 architecture

```text
API-Football
  → fixtures / odds / live / results / statistics / visuals
  → shared normalized fixture and venue-stat objects
  → Market Route
  → PPG Route
  → Convergence
  → Momentum & Streak
  → four-engine Consensus
  → frozen Supabase proof
  → automatic settlement
  → performance / learning / rolling wins
```

## Fourth-engine isolation

Momentum & Streak is evaluated independently and contributes no more than one decision per fixture. It cannot rewrite another engine's result. Consensus compares compatible directions only after each engine has completed its own gates.

## Data and secrets

The browser never receives the API-Football key or Supabase service-role key. The server caches shared date-level venue analysis so PPG, Convergence and Momentum do not repeat the same upstream history requests.

## Settlement

Settlement updates only frozen predictions using official completed results. `MOMENTUM_STREAK` is included in the same immutable proof and performance pipeline as the existing engines.
