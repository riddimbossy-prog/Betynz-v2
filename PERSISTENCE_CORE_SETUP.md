# Persistence Core setup

## 1. Apply the database migration
Open the Supabase project used by Betynz → **SQL Editor** → create a new query → paste the contents of:

`apps/web/sql/019_persistence_core.sql`

Run it once. It is written with `if not exists` / `create or replace`, so rerunning it is safe for the schema objects it owns.

## 2. Keep the existing Supabase environment variables
Betynz needs these on Render:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

The service-role key stays server-side and is never sent to the browser.

## 3. Persistence settings
The supplied `render.yaml` includes:

- `PERSISTENCE_CORE_ENABLED=true`
- `PERSISTENCE_DATE_LOCK_SECONDS=10800`
- `PERSISTENCE_WEEK_LOCK_SECONDS=21600`

## 4. Verify after deployment
Open the protected page:

`https://YOUR-DOMAIN/admin-operations.html`

Expected state:
- Persistence Core online
- Saved fixture count increases while analysis runs
- Only one active weekly/date lease for a job
- Job progress moves forward instead of restarting at zero
- Recent engine firings appear in the prediction ledger

## 5. Recovery controls
**Refresh date** rebuilds a selected day under a date lease.

**Retry failed** retries the selected day without creating a second scheduler.

**Recompute fixture** deletes only one fixture checkpoint and reruns the shared stats job; other completed fixture checkpoints remain intact.
