# Betynz v5.0.6 architecture

One Node web service hosts the public application and server API.

```text
API-Football
  -> fixture and odds cache
  -> lightweight daily fixture counts
  -> shared league-season history pools
  -> team-history fallback only when needed
  -> progressive four-engine snapshots
  -> Consensus, proof, settlement and learning
  -> public dashboard/PWA
```

Market Route can publish from the odds layer while deeper venue evidence continues. PPG Route, Convergence and Momentum & Streak reuse the same cached venue-history work. The browser receives progress and partial completed results instead of waiting for the entire daily board.

The games board renders stable rows with minimal motion. Live status, scores and prediction states can update without rebuilding the full fixture list when its signature is unchanged.
