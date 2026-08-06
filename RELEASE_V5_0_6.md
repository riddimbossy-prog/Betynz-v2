# Betynz v5.0.6 — fast predictions and minimal board motion

## Faster prediction delivery

- Engine results are published fixture by fixture instead of waiting for the full day to finish.
- Priced upcoming fixtures are analysed before settled, started or no-odds fixtures.
- Fixtures without a usable prediction market remain visible on the board but do not start expensive venue-history analysis.
- Market Route can return from the fixture and odds layer while deeper venue evidence continues.
- PPG Route, Convergence and Momentum & Streak share the same cached venue-history work.
- Fixtures from the same league and season reuse one completed-fixture history pool before a team-history fallback is attempted.
- Duplicate API-Football requests and duplicate daily analysis jobs share one in-flight promise.
- Supabase writes happen after the public engine response and do not delay the first visible prediction.
- The selected date is processed before future dates.
- Future date counters use the lightweight fixture-count endpoint and run when the browser is idle.

## Minimal games-board motion

- Removed fixture-row reveal animations, card tilt, parallax, lightning and page-exit effects.
- Removed repeated KPI animation loops and decorative sweep effects from the games board.
- Fixture rows remain stable while odds, live status and prediction state update.
- The settled-wins carousel remains available.
- The PWA launch splash is short, installed-app-only and shown once per browser session.
- Reduced-motion preferences continue to disable nonessential movement.

## Platform scope

- API-Football remains the only football-data provider.
- Market Route, PPG Route, Convergence and Momentum & Streak remain active.
- One repository, one Render web service and one root `render.yaml` remain enforced.
- No Supabase schema migration is required when upgrading from v5.0.5.
