# Deploy Betynz Web v3.8.0

## 1. Deploy the SportyBet core first

The API service health URL must return `ok: true`:

```text
https://YOUR-SPORTYBET-API.onrender.com/api/health
```

## 2. Create the web Render service

Use this folder as a separate repository and create a Render Blueprint.

Set:

```env
BETYNZ_DATA_API_BASE_URL=https://YOUR-SPORTYBET-API.onrender.com/
BETYNZ_DATA_API_KEY=THE_EXACT_SAME_VALUE_AS_SPORTYBET_API_KEY
SUPABASE_URL=YOUR_NEW_SUPABASE_URL
SUPABASE_ANON_KEY=YOUR_NEW_SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_NEW_SUPABASE_SERVICE_ROLE_KEY
```

The remaining SportyBet connector routes are already declared in `render.yaml`.

## 3. Fresh Supabase

Run `sql/001_market_route_fresh.sql`, followed by migrations `008` through `011` in numeric order.

Supabase stores predictions and results; it does not supply football fixtures or odds.

## 4. Verify

```text
/api/health
/api/fixtures?date=YYYY-MM-DD
/api/live?date=YYYY-MM-DD
/proof.html
/performance.html
```

Then hard-refresh once so the `betynz-v3-8-0` PWA cache activates.
