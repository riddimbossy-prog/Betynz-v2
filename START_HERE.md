# Start here — Betynz v5.0.3

1. Keep only the hidden `.git` folder in the existing repository.
2. Copy every file from this v5.0.3 folder into the repository root.
3. Commit and push with: `Betynz v5.0.3 crest delivery fix`.
4. In Render use **Manual Deploy → Clear build cache & deploy**.
5. Confirm `/api/health` reports version `5.0.3`.
6. Open one crest directly using a real team ID, for example `/api/media/team/33.png`.
7. Hard-refresh the website with `Ctrl + Shift + R` so the v5.0.3 service worker replaces the old scripts.

Required secret:

```env
API_FOOTBALL_KEY=YOUR_DIRECT_API_SPORTS_KEY
```

Included media settings:

```env
API_FOOTBALL_MEDIA_BASE_URL=https://media.api-sports.io/football
API_FOOTBALL_MEDIA_CONCURRENCY=6
API_FOOTBALL_MEDIA_TIMEOUT_MS=10000
```
