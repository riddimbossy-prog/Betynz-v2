# Betynz · The daily shortlist

A complete replacement of the previous multi-engine application. This repository now contains one Sportybet market scanner, one matchup analysis engine and a responsive daily prediction board. Old code remains recoverable in Git history.

## The requested selection policy

1. Discover daily football fixtures from Sportybet's Today **and** Upcoming books using its required 1X2 discovery parameter. Follow pagination and fetch each event's full market list without a market whitelist. Retain the original markets in a downloadable daily audit.
2. Only active outcomes with decimal odds **greater than 1.00 and no higher than 1.50** are prediction candidates. Suspended or stale odds never qualify.
3. Compare candidates using the home team's home form, the away team's away form, league standings, recent H2H, venue-specific H2H, half-time/full-time transitions, scoring trends and available advanced statistics. Select one candidate per market category.
4. Publish **one final tip per match**: the category winner with the highest estimated probability of a positive return. Expected return and risk break exact ties. Show loss probability, refund probability, uncertainty, expected return and conditional failure scenarios separately.
5. Only fixtures involving at least one **top-four or bottom-three** team can qualify. On a day with **50 or more leagues**, also require a mismatch supported by both table position and venue-specific form.
6. Exclude **top-five versus top-five**, **bottom-three versus bottom-three**, unreliable leagues, unavailable statistics and excluded competition types. Top-versus-bottom remains eligible. Positions refer to the current overall league table; form uses the relevant home/away split.

The numerical data-quality and league-stability settings are visible in `config/policy.json`. They are implementation defaults, not extra rules attributed to the owner. No picks are forced when the evidence is insufficient.

## Data and coverage

- **Sportybet:** fixture discovery, all markets returned by each event endpoint, exact selection IDs/specifiers and odds. Default regional book: Ghana (`SPORTYBET_COUNTRY=gh`). No automatic region switching, alternate bookmaker prices or fabricated fallback odds.
- **Sportybet / Sportradar statistics (default):** uses the exact Sportybet match and competitor IDs, verified kickoff, official overall standings, regulation-time results, home/away histories and H2H. Tables and league reliability stay within the exact competition group. The table preserves provider ranks and points deductions. No API key is required. Missing xG, shots, corners or cards stay missing; advanced H2H uses verified half-time/full-time score transitions.
- **API-Football (optional):** set `STATISTICS_PROVIDER=api-football` and supply a working `API_FOOTBALL_KEY` to use this adapter, including its available advanced fixture statistics. It verifies both team names and kickoff; ambiguous joins are rejected. The default pipeline does not depend on this account.
- Every returned market is retained. **Collection is broader than prediction support.** Unknown market definitions, unsupported player/sequence/timing markets, ambiguous card-point rules and missing advanced data receive explicit exclusions. The engine does not infer corner or card probabilities from goal totals.
- Supported definitions include 1X2, double chance, DNB, goal totals/team totals, BTTS, supported result/BTTS/total combinations, correct score, odd/even, exact goal counts, explicit Asian and European handicaps, clean sheets, win to nil, team to score, half markets, HT/FT, and win/score across halves. Supported corner and explicit yellow/red-card counts require sufficient actual event statistics. Provider naming changes can cause an outcome to be withheld rather than guessed.
- An all-market audit means every market exposed in the fetched prematch event responses. It does not promise access to withdrawn, account-only, live-only or region-unavailable markets.

Sportybet's web-facing endpoints are not presented as a contracted public developer API. HTTP 403 or provider schema changes appear as feed failures. Establish a permitted feed arrangement with the provider if the deployed worker cannot access the selected regional book.

## Method and risk

The goal model blends recency-weighted home/away scoring and conceding, small opponent-strength adjustments, league scoring baselines, available xG and recent H2H. A joint first-half/second-half Poisson score distribution gives internally consistent score-based market settlement. Half-time histories inform scoring shares. Recent empirical outcomes update these estimates; overlapping H2H/form matches count only once.

Advanced H2H reports venue alignment, BTTS and total-goal occurrences, HT/FT paths, lead retention and reversals. Corners/cards use their actual historical statistic fields, with conservative shrinkage toward the offered-odds prior; their method is labelled on the board.

- **Model chance** is the estimated chance of any positive return (including a half-win), not the chance of avoiding a loss.
- **Loss chance** includes full and half losses. A push is reported separately.
- **Estimated return** = full/half-win profit probability × profit at the quoted odds, minus full/half-loss stake probability. Negative value is shown rather than silently removed.
- **Risk score** (0–100) combines loss probability, model/history disagreement, small samples, missing H2H/xG and historical league instability. It is a heuristic index, not another probability.
- The sampling range is an approximate 90% Wilson interval using effective historical sample weight. It is not a fully calibrated posterior or a guarantee of coverage.
- Failure scenarios report conditional score-model survival if the stronger team fails to score, loses, or the game ends with at most one goal. These are stress checks, not independent predictions.

League reliability uses chronological, prior-match-only checks of a simple split-form result model, multiclass Brier score and the rate at which clear form favorites lose. It requires a broad league sample. There is no country-based assumption of reliability. Historical stability does not guarantee future reliability. No claimed winning percentage or backtested profitability is invented.

## Run locally

Node 22 or newer; no runtime npm dependencies.

```sh
npm ci
npm run check
npm test
npm run refresh
npm run build
npm start
```

Open `http://localhost:3000`. Building before the first refresh displays an honest empty state. Tests contain synthetic fixtures solely for validation; they are never copied into production data.

## Production

`.github/workflows/pages.yml` refreshes and deploys `betynz.com` on main-branch changes, manual dispatch and a half-hour cron. GitHub schedule timing is best-effort. It scans the current UTC day by default so future-day analysis does not delay today's board. Set the optional repository variable `BOARD_DAYS` to 2–7 for a longer board. It caches statistics privately, publishes static JSON plus the board to GitHub Pages, and retains a seven-day data-audit artifact. New code pushes supersede an older production build; scheduled scans do not interrupt a running scan. The UI shows local kickoff times, reloads every five minutes and removes started/expired predictions every minute.

No secret is required for the default Sportybet statistics pipeline. Optional repository variables: `SPORTYBET_COUNTRY` (default `gh`), `STATISTICS_PROVIDER` (default `sportybet`). The optional API-Football adapter requires `API_FOOTBALL_KEY`. GitHub Pages must use Actions as its deployment source, as in the previous deployment. No secret is included in the website. The replacement no longer uses the old Supabase edge function or old scheduled jobs; it does not delete any existing database or user records.

Useful output:

- `data/index.json`: scan status, dates, counts, diagnostics and policy.
- `data/board-YYYY-MM-DD.json`: final picks, per-category comparisons, evidence and exclusions.
- `data/markets-YYYY-MM-DD.json`: every retrieved market for the date.

If access fails, the pipeline publishes an unavailable/partial state rather than old predictions disguised as fresh ones. A successful page deployment does **not** by itself mean the upstream feed worked: inspect the JSON scan status and the workflow's refresh output.

## Verification and rollback

`npm test` checks market settlement, odds boundaries, provider pagination, fixture identity, top/bottom exclusions, the 50-league boundary, freshness, probability mass and insufficient-data behavior. `npm run check` validates JavaScript syntax; `npm run build` creates the production site.

The pre-rebuild source is available from commit `a6c5729890c98c7a9a4ff59b9ce34e301a9e6947`. Restore it through a normal revert or recovery branch; do not force-push away history.

Provider reference: [API-Football v3 documentation](https://api-sports.io/documentation/football/v3). Sportybet endpoint contracts are isolated in `src/providers/sportybet.mjs` and `src/providers/sporty-stats.mjs` and covered with fixture-based tests. Transient network failures and truncated JSON are retried; access denials are not.
