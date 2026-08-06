# Deploy Betynz v5.0.1 on one Render service

The root `render.yaml` creates exactly one Node web service:

```text
Build command: npm run build
Start command: npm start
Health path: /api/health
```

The web process calls API-Football server-side. Browsers call only Betynz same-origin `/api/*` routes, so `API_FOOTBALL_KEY` never appears in public JavaScript.

Required private value:

```env
API_FOOTBALL_KEY=YOUR_KEY
```

Recommended no-cap settings already included:

```env
API_FOOTBALL_MAX_ODDS_PAGES=0
API_FOOTBALL_HISTORY_LAST=40
API_FOOTBALL_ENRICH_CONCURRENCY=2
API_FOOTBALL_REQUEST_CONCURRENCY=3
API_FOOTBALL_REQUEST_MIN_INTERVAL_MS=200
```

`API_FOOTBALL_MAX_ODDS_PAGES=0` means continue until the provider's final odds page. There is no `API_FOOTBALL_MAX_FIXTURES` setting.

After a repository replacement, use **Manual Deploy → Clear build cache & deploy** and hard-refresh the browser with `Ctrl + Shift + R`.
