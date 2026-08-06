# Betynz v3.8.0 — SportyBet-only core

Betynz now uses the private **Betynz SportyBet Core API** as its only football-data source.

The API supplies:

- fixtures and kickoff times;
- every offered SportyBet market and price;
- live scores, minutes, status and incidents;
- half-time and full-time scores;
- finished results for automatic settlement;
- result-derived team history, streaks and competition profiles.

No Parse.bot, BetExplorer, API-Football, The Odds API or demo feed exists in this release. Supabase is storage only for admin access, frozen predictions, proof, settlement, performance and learning.

## Repositories

Deploy as two clean repositories:

```text
betynz-sportybet-api
betynz-web
```

Deploy the API first, then set its Render URL and shared private key on the web service.
