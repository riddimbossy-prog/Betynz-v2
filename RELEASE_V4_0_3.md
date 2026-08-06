# Betynz v4.0.3 — SportyBet-primary statistics

## Source priority

1. SportyBet custom API supplies fixtures, odds, live scores, results and the primary historical/competition statistics used by every engine.
2. API-Football supplies team crests, league logos/flags and secondary statistical enrichment.
3. API-Football fills only missing fields. It never overwrites a non-empty SportyBet statistic.
4. When SportyBet venue history is unavailable, API-Football may be used as an explicitly labelled fallback so the fixture remains analysable.

## Engine behaviour

- Market Route reads SportyBet odds plus SportyBet primary venue statistics.
- PPG Route reads SportyBet home/away history first.
- Convergence reads SportyBet primary history and competition statistics first.
- API-Football enrichment adds visuals, standings, injuries, H2H and missing values without changing SportyBet authority.

## Deployment

The build remains one repository, one Render service and one root `render.yaml`.
