# Betynz v5.0.13 — Fast Engine and Consensus Lane

Betynz is a five-engine football analysis application powered only by API-Football. It renders the full daily fixture board immediately, streams odds in the background, and gives selected-date engine history priority over future-date and later odds-page work.

## Active engines

- Market Route
- PPG Route
- Apex Intelligence
- Convergence
- Momentum & Streak

## Performance design

- Fixtures first
- First odds page next
- Priced/upcoming engine candidates next
- Shared league-history batch
- Team fallback only when needed
- Later odds pages and future-date counts last
- Progressive Consensus publishing

The repository deploys as one Render web service from one root `render.yaml`.
