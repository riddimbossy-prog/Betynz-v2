# Betynz v5.0.3 architecture

```text
API-Football
  ↓ server-side authenticated requests
Betynz Node service
  ├─ fixture and odds normalization
  ├─ live/results/event normalization
  ├─ venue history and team intelligence
  ├─ Market Route
  ├─ PPG Route
  ├─ Convergence
  ├─ Consensus and settlement
  └─ responsive PWA
```

API-Football is authoritative for fixture identity, kickoff, markets, odds, live state, results, official visuals and statistics. Supabase is optional persistence for proof, settlement, performance and learning; it is not a football-data provider.

The daily board has no application fixture cap. Odds requests paginate to the provider's reported final page. Request pacing, caching, in-flight deduplication and retry backoff protect API quotas.
