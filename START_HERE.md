# Start here — Betynz v4.0.2

## 1. Upload one repository

Extract the ZIP and upload everything inside the extracted folder to one blank GitHub repository. The repository root must contain:

```text
render.yaml
package.json
apps/
scripts/
test/
```

Do not upload an extra parent folder around these files.

## 2. Create one Render Blueprint

In Render choose **New → Blueprint**, connect the repository and let Render read the single root `render.yaml`.

Add these private values:

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
SUPABASE_URL=YOUR_NEW_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_NEW_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_NEW_SUPABASE_SERVICE_ROLE_KEY
```

The `API_FOOTBALL_KEY` is used only on the server. Do not place it in GitHub code, browser JavaScript or Supabase client settings.

## 3. Verify

Open:

```text
https://YOUR-RENDER-SERVICE.onrender.com/api/health
```

Expected core fields:

```json
{
  "ok": true,
  "version": "4.0.2",
  "configured": {
    "sportybet": true,
    "apiFootball": true
  }
}
```

Then test the dashboard, a match popup, `/live.html`, `/proof.html` and `/performance.html` before connecting `betynz.com`.

## 4. API responsibilities

SportyBet remains the source for matches, odds, live state and results. API-Football supplies the statistics and official crests used by the engines. Supabase stores proof and learning data only.

## Full-day fixture coverage

There is no application-level daily fixture cap. SportyBet pagination continues until empty or repeated, every returned fixture is displayed, and API-Football enrichment is applied across the complete day.

## Rate-limit-safe processing

The included `render.yaml` already contains the paced queue and backoff settings. Do not raise the concurrency values just to make the first scan appear faster. All fixtures remain in the queue and complete progressively without a fixture cap.

After replacing the repository, use **Manual Deploy → Clear build cache & deploy**, then hard-refresh the site with `Ctrl + Shift + R`.
