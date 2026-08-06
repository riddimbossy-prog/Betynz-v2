# Betynz v4.0.1 — Full Daily Fixture Coverage

## No fixture cap

- SportyBet pagination now continues until the upstream feed is exhausted.
- `SPORTYBET_MAX_PAGES=0` means unlimited pagination with empty-page and repeated-page loop guards.
- The Betynz custom API adapter no longer has a 1,000-page safety ceiling.
- API-Football statistics and crest matching now run across every fixture returned for the selected day.
- The dashboard renders the full filtered day immediately and no longer stops at 12, 20 or 30 matches.
- The daily KPI and date-strip counts always use the full returned fixture count.

## Important

The application imposes no daily fixture limit. Upstream provider availability, response pagination and the API-Football account quota still apply. SportyBet remains the authority for fixtures, odds, live status and results; API-Football remains the statistics and visuals layer.
