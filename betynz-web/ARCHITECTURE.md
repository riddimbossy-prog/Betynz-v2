# Betynz v3.8 architecture

```text
SportyBet public football feeds
          ↓
Betynz SportyBet Core API
          ↓ private X-API-Key
Betynz Web and engines
          ↓
Supabase proof/settlement storage
```

The SportyBet core is authoritative for fixtures, offered odds, live state and results. Supabase is persistence only. There is no football-data fallback.

Market Route can work from offered prices immediately. PPG Route and Convergence use team history calculated from SportyBet finished results when enough venue-correct samples are available. When evidence is incomplete, the engine waits rather than inventing statistics.
