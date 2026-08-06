# Betynz v5.0.11 architecture

```text
API-Football
  -> fixtures, odds, live scores, results, crests and statistics
  -> normalized fixture board
  -> shared cached history and intelligence layer
  -> progressive five-engine snapshots
       Market Route
       PPG Route
       Apex Intelligence
       Convergence
       Momentum & Streak
  -> five-engine Consensus
  -> frozen predictions, settlement, proof and learning
```

The application is deployed from one repository through one Render web service and one root `render.yaml`.

PPG and Apex share cached venue-history inputs but analyse them independently. PPG applies its specialist venue-split rules. Apex requires several independent evidence families and cannot qualify from PPG alone.

## Rate protection

The provider layer uses one priority queue and rolling minute budget. It detects rate-limit messages even when the upstream HTTP status is 200, honours reset headers, applies a global cooldown and resumes deferred engine enrichment without converting it into a final no-pick result.
