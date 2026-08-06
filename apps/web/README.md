# Betynz Web v5.0.2

The web service uses `src/lib/apiFootball.mjs` as its only football provider adapter.

It exposes same-origin routes for fixtures, engine boards, match intelligence, live scores, incidents, proof, performance, odds movement, league intelligence and protected administration. The browser never receives `API_FOOTBALL_KEY`.

Run locally:

```bash
cp .env.example .env
# add API_FOOTBALL_KEY to .env
npm start
```

Build and test:

```bash
npm run build
```
