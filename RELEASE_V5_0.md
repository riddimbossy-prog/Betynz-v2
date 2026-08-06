# Betynz v5.0.2 release

## Provider reset

- Removed the retired collector application and its launcher.
- Removed the private-feed adapter, provider-priority merger and provider-specific rate limiter.
- Removed all retired environment variables and deployment paths.
- Made API-Football the sole football provider.

## API-Football coverage

- Daily fixtures, identities, kickoff, status and official visuals.
- Paginated prematch bookmaker odds and recognized market normalization.
- Live scores, minutes and incidents.
- Finished results for settlement.
- Last-five home and away histories, PPG and goal profiles.
- Standings, team statistics, H2H, predictions, injuries, lineups, events, fixture statistics and player statistics.

## Deployment

- One repository.
- One Render service.
- One root `render.yaml`.
- One private football secret: `API_FOOTBALL_KEY`.
- No application-level daily fixture cap.
