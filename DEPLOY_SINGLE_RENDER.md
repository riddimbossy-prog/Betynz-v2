# Deploy Betynz v4.0.3 on one Render service

The root `render.yaml` declares exactly one Render web service. The launcher starts:

- a private SportyBet core API on `127.0.0.1:10001`;
- the public Betynz web/API server on Render's public port.

API-Football is called directly from the public Betynz server process with the private Render secret.

## Required secret

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

The Blueprint already supplies:

```env
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_KEY_HEADER=x-apisports-key
API_FOOTBALL_HISTORY_LAST=40
API_FOOTBALL_MAPPING_THRESHOLD=0.55
API_FOOTBALL_DEEP_STATS=true
```

The default 30-fixture daily automatic-enrichment cap protects API quota. Matches beyond the cap remain visible and can still receive API-Football intelligence when opened.

## Deployment sequence

1. Push the repository to GitHub.
2. Create a Render Blueprint from it.
3. Enter the API-Football and Supabase secrets.
4. Deploy.
5. Check `/api/health` and confirm both `sportybet` and `apiFootball` are `true`.
6. Open a mapped fixture and confirm team crests, five-home/five-away venue history, standings and season statistics appear.
7. Hard-refresh with `Ctrl + Shift + R` so the `betynz-v4-0-2` service-worker cache activates.

No second Render service and no second `render.yaml` are required.

## Full daily coverage

`SPORTYBET_MAX_PAGES=0` means continue through every SportyBet page until the feed is exhausted. API-Football enrichment and crest mapping run across every fixture returned for the selected day.
