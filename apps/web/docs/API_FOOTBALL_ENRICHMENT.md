# API-Football enrichment contract

Betynz v4.0.3 uses two private server-side data roles.

## Authority boundary

- **SportyBet custom API** is authoritative for fixture identity, kickoff, market availability, prices, live score/minute/status, incidents and final results.
- **API-Football** enriches a matched SportyBet fixture with official team crests, league logo/flag, venue history, standings, season team statistics, H2H, predictions, injuries, lineups, events, fixture statistics and player statistics.
- API-Football never replaces a SportyBet market, price, fixture ID, kickoff, live state or result.

## Automatic engine data

The daily engine boards resolve every real fixture returned for the selected date. There is no application-level fixture cap. For each mapped match they request:

- last completed fixtures for the home team and extract the last five **home** matches;
- last completed fixtures for the away team and extract the last five **away** matches;
- current standings;
- season team statistics for both teams;
- recent H2H;
- API-Football prediction context;
- reported injuries.

The PPG and Convergence engines use the exact five-home/five-away venue profiles. Market Route keeps its SportyBet odds rules and applies the API-Football profile as a support/neutral/strong-contradiction gate. Missing or incomplete API-Football samples never create invented statistics.

## Deep match intelligence

Opening a match loads the automatic-engine data plus available:

- fixture statistics;
- confirmed lineups and formations;
- events;
- player statistics.

Some pre-match endpoints may legitimately be empty until closer to kickoff or after a match starts.

## Mapping and safety

SportyBet fixtures are matched to API-Football by home team, away team, league, country and kickoff. Reversed team mappings are rejected. The default confidence floor is `0.55` and can be changed with `API_FOOTBALL_MAPPING_THRESHOLD`.

All API-Football requests run on the server. The browser never receives `API_FOOTBALL_KEY`.

## Required Render secret

```env
API_FOOTBALL_KEY=your_direct_api_sports_key
```

For a direct API-Sports subscription the build uses:

```env
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_KEY_HEADER=x-apisports-key
```

Do not configure RapidAPI host headers for a key purchased directly from API-Sports.
