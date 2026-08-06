# Start here — Betynz v4.0.3

This is one deployable repository with one root `render.yaml` and one Render web service.

## Source responsibilities

### SportyBet custom API — primary

- Complete daily fixture list
- SportyBet markets and odds
- Live scores, minutes and incidents
- Final results and settlement
- Team result histories
- Exact home and away venue samples
- PPG, form, goals, clean sheets, failed-to-score, BTTS and goal thresholds
- Streaks and competition scoring trends

### API-Football — enrichment only

- Team crests
- League logos and country flags
- Standings
- H2H
- Injuries
- Lineups and formations
- Additional fixture/player statistics
- Missing statistical fields when SportyBet has no value

API-Football never overwrites a populated SportyBet statistic.

## Deploy

1. Extract the ZIP.
2. Create one blank GitHub repository.
3. Upload the contents of the extracted project folder to the repository root.
4. In Render choose **New → Blueprint** and connect the repository.
5. Add the private values requested by the Blueprint:

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
SUPABASE_URL=YOUR_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SUPABASE_SERVICE_ROLE_KEY
```

6. Deploy and open `/api/health`.

Expected source roles:

```json
{
  "primaryStatistics": "SPORTYBET_CUSTOM_API",
  "enrichmentStatistics": "API_FOOTBALL",
  "visuals": "API_FOOTBALL"
}
```

## Important settings

```env
SPORTYBET_MAX_PAGES=0
API_FOOTBALL_HISTORY_LAST=40
API_FOOTBALL_MAPPING_THRESHOLD=0.55
```

There is no daily application fixture cap. The request queues pace upstream calls without reducing the number of fixtures.
