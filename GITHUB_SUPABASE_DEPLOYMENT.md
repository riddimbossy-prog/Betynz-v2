# Betynz production: GitHub + Supabase only

Render is not part of this deployment architecture.

## Architecture

- **GitHub Pages** serves `betynz.com`, the full static UI, Zeus assets, CSS and browser JavaScript.
- **Supabase Auth** owns member login/create-account.
- **Supabase Postgres** owns board snapshots, fixture processing state and the prediction ledger.
- **Supabase Edge Function `betynz-api`** serves the public board API, proof data, live feed and crest proxy without exposing private provider credentials.
- **GitHub Actions `Betynz Board Worker`** runs the existing Node Golden engine every 30 minutes and persists its results to Supabase. The engine maths is not rewritten.

## Required GitHub Actions secrets

Add these in **GitHub repository → Settings → Secrets and variables → Actions → New repository secret**. Never put these values in committed files.

- `SUPABASE_URL` — Project URL, for example `https://<project-ref>.supabase.co`
- `SUPABASE_ANON_KEY` — public anon/publishable key used by the browser
- `SUPABASE_SERVICE_ROLE_KEY` — private service-role key used only by the GitHub worker
- `SUPABASE_ACCESS_TOKEN` — Supabase personal access token used only to deploy Edge Functions
- `SUPABASE_PROJECT_REF` — the project reference from Supabase project settings
- `API_FOOTBALL_KEY` — private API-Football key

The Pages workflow intentionally embeds only `SUPABASE_URL` and `SUPABASE_ANON_KEY`. The service-role key, Supabase access token and API-Football key remain private.

## Supabase Auth URLs

In **Supabase → Authentication → URL Configuration**:

- Site URL: `https://betynz.com`
- Allowed redirect URL: `https://betynz.com/auth.html`

`/login` and `/create-account` are generated as real GitHub Pages directories by the Pages workflow.

## GitHub Pages

The workflow `.github/workflows/pages.yml` enables/deploys Pages from GitHub Actions and publishes a `CNAME` for `betynz.com`.

If GitHub asks for the Pages source manually, choose **GitHub Actions** in **Repository → Settings → Pages**.

## DNS cutover

Only change DNS after the Supabase function and GitHub Pages workflow have both deployed successfully.

For the apex `betynz.com`, GitHub Pages supports these A records:

- `185.199.108.153`
- `185.199.109.153`
- `185.199.110.153`
- `185.199.111.153`

Remove the old Render DNS target after GitHub Pages reports the custom domain as healthy. Do not delete the old Render service before this DNS cutover has been verified.

## Final Render removal

The repository `render.yaml` is deleted by this migration. After `betynz.com` is confirmed on GitHub Pages:

1. Disconnect/delete the old Betynz service in Render.
2. Remove any remaining Render DNS record at the domain provider.
3. Keep all runtime secrets in GitHub Actions and Supabase only.

## Production workflows

- `Betynz CI` — validates every code change.
- `Deploy Betynz Pages` — publishes the static site to GitHub Pages.
- `Deploy Supabase Backend` — deploys the `betynz-api` Edge Function and syncs the API-Football secret to Supabase.
- `Betynz Board Worker` — restores/pulls the 7-day fixture board, runs the existing engine, persists snapshots and settles recent predictions.

## Rollback

The Node server remains in the repository for local testing and emergency rollback, but the production workflows do not use it. This keeps the migration reversible without keeping Render in production.
