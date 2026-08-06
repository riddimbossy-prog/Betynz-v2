# Betynz v5.0.4 — settlement, smart boards and PWA motion

## Automatic settlement

- Finished fixtures automatically settle frozen engine and consensus predictions.
- Settlement runs at startup, every 10 minutes, when a board contains finished fixtures, and when Proof or Performance is opened.
- The scheduler covers today and the previous two days by default.
- Duplicate settlement scans share one in-flight job and observe a cooldown.
- Public read-only endpoints:
  - `GET /api/settlement-status?date=YYYY-MM-DD`
  - `GET /api/wins-carousel?days=14&limit=24`

Permanent settlement history requires Supabase.

## Board-aware visibility

- Dashboard Elite, Consensus and Early Pick blocks stay visible while analysis is running.
- After completion, empty blocks disappear automatically.
- The entire Consensus Command Centre hides when it has nothing publishable.
- Picks categories and their zero-value KPI cards hide when the active board/filter has no rows.
- A single honest empty-board message replaces multiple empty cards.

## Rolling wins carousel

- Officially settled wins roll continuously across the dashboard.
- Engine and consensus wins include match, score, selection, odds and proof link.
- The carousel pauses on hover/focus and respects reduced-motion settings.
- It stays completely hidden when there are no settled wins or Supabase is unavailable.

## Favicon and PWA

- Multi-size `favicon.ico`
- 16 px and 32 px browser icons
- 180 px Apple touch icon
- Separate any-purpose and maskable 192/512 icons
- Portrait and landscape launch artwork
- PWA shortcuts for Picks, Live and Proof
- Animated in-app launch splash with lightning, glow and progress movement

## Additional motion

- Rolling proof ticker
- Number-pop animation when KPI values update
- Lightweight pointer tilt on premium cards
- Animated section entrances
- Button light sweep
- Settled and live scorelines on the main fixture board
- Full `prefers-reduced-motion` protection
