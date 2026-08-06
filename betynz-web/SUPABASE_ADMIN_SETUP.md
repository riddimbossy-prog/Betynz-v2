# Supabase Admin Setup — Betynz v3.0

## Existing Betynz database

Run:

```text
sql/008_market_route_single_engine.sql
```

The migration permits the new `MARKET_ROUTE` code while preserving older frozen rows. v3.0 public APIs filter exclusively for `MARKET_ROUTE`, so previous engine history is not mixed into current Proof or Performance.

## New Supabase database

Run:

```text
sql/001_market_route_fresh.sql
```

Then create the admin user in Supabase Authentication and promote the profile:

```sql
update public.profiles
set role = 'admin', updated_at = now()
where email = 'YOUR_EMAIL@example.com';
```

## Required Render variables

```env
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_ANON_KEY=YOUR_ANON_OR_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY
```

The service-role key belongs only in Render. Never place it in GitHub, HTML or browser JavaScript.

## Admin routes

- `/admin-learning.html`
- `/api/admin/health`
- `/api/admin/settle`
- `/api/admin/visual-diagnostics`

Admin pages use Supabase email/password authentication and require `profiles.role = 'admin'`.
