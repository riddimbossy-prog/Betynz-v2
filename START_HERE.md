# Betynz v5.1.0 — Start Here

This is a complete replacement build for the existing single-Render Betynz deployment.

## 1. Supabase first

If you are upgrading an existing Betynz database that already has SQL `016_zeus_statistical_supervisor.sql`, run:

```text
apps/web/sql/017_foundation_intelligence.sql
```

A brand-new Supabase project should use `apps/web/sql/001_market_route_fresh.sql` instead; it already contains the v5.1.0 foundation tables.

## 2. Replace repository files

Keep your existing hidden `.git` folder, replace the repository contents with this build, commit and push through GitHub Desktop.

## 3. Render

Use **Manual Deploy → Clear build cache & deploy**.

Existing secrets stay the same:

```text
API_FOOTBALL_KEY
STATS_API_KEY
SUPABASE_URL
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
```

## 4. Verify

After deployment open `/api/health`. It should report version `5.1.0`, the provider queues, feature-store state, request-guard state and runtime/event-loop telemetry.

Hard-refresh the browser once with `Ctrl + Shift + R`.
