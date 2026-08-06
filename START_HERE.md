# Start here — Betynz v5.0.2

## 1. Create one GitHub repository

Extract the ZIP. Upload the contents of the extracted folder to the root of one blank GitHub repository. The repository root must contain:

```text
package.json
render.yaml
apps/
scripts/
test/
```

Do not upload a `.env` file or any secret key.

## 2. Create the Render Blueprint

In Render choose **New → Blueprint**, select the repository and allow Render to read the single root `render.yaml`.

Add this private secret when Render asks:

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

For a key purchased directly from API-Sports, keep:

```env
API_FOOTBALL_BASE_URL=https://v3.football.api-sports.io
API_FOOTBALL_KEY_HEADER=x-apisports-key
```

Do not add RapidAPI headers unless the subscription was purchased through RapidAPI.

## 3. Optional Supabase setup

For permanent proof, performance, settlement and learning records, create a Supabase project and run:

```text
apps/web/sql/001_market_route_fresh.sql
apps/web/sql/009_ppg_route_engine.sql
apps/web/sql/010_convergence_engine.sql
apps/web/sql/011_consensus_calibration.sql
```

Then add `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to Render.

## 4. Verify the temporary Render URL

Open:

```text
/api/health
/api/config
/api/fixtures?date=YYYY-MM-DD
/api/live
```

Expected version: `5.0.2`. Health should show `apiFootball: true`, and every football source role should be `API_FOOTBALL`.

## 5. Connect the domain

Only after the temporary Render URL works, add `betynz.com` and `www.betynz.com` to the Render service and replace obsolete DNS records.

## Coverage note

Betynz applies no daily fixture cap. It displays every fixture returned by API-Football for the selected date. Actual competition, odds and statistics availability still depends on the user's API-Football plan and provider coverage.

## v5.0.2 stale-folder protection

The Render build now runs `npm run clean:provider-reset` before tests. This automatically deletes any retired provider app directory left behind by an older repository. A clean repository replacement is still recommended, but stale provider folders can no longer fail the build.

## v5.0.2 engine loading fix

The engine pages now return immediately and show analysis progress while API-Football venue histories are processed in one shared background job. After deployment, perform one hard refresh with `Ctrl + Shift + R` so the new service worker and page scripts replace the previous loading-state code.
