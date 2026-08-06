# Betynz v4.0.2 base intelligence release

## New

- `API_FOOTBALL_KEY` is now the statistical and visual enrichment key.
- Official team crests, league logos and country flags come from API-Football.
- PPG and Convergence use API-Football five-home/five-away venue records.
- Market Route keeps the SportyBet odds route and rejects only a strong API-Football statistical contradiction.
- Match intelligence exposes standings, season profiles, H2H, predictions, injuries, lineups, events, fixture statistics and player statistics when available.
- API-Football calls are cached, retried, concurrency-limited and capped for daily automatic analysis.

## Preserved

- SportyBet remains authoritative for fixtures, kickoff, offered markets, odds, live scores, minutes, incidents and results.
- One GitHub repository.
- One Render web service.
- One root `render.yaml`.
- Existing modern black/silver/orange Betynz interface and logo.
- Supabase remains storage/authentication only.
