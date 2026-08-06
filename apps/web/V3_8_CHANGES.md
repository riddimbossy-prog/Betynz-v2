# Betynz v3.8.0 changes

- Replaced the previous experimental data service with the SportyBet custom API developed for sporty.codes.
- Made that service the only football-data authority.
- Added dedicated live-score, event-detail and finished-result calls.
- Added full common market normalization: 1X2, double chance, totals, BTTS, team totals, first-half and HT/FT.
- Allowed SportyBet event IDs such as `sr:match:...` in live-event requests.
- Switched automatic settlement to the dedicated SportyBet results route.
- Removed the BetExplorer media base and every third-party fallback configuration.
- Preserved Market Route, PPG Route, Convergence, Consensus, Proof, Performance and responsive PWA behavior.
