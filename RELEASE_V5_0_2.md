# Betynz v5.0.2 — engine loading and shared-analysis fix

## Problem fixed

Market Route, PPG Route, Convergence and Consensus could remain on `Loading…` or `Analysing upcoming fixtures…` because each page waited for a complete day of API-Football venue-history enrichment before the HTTP response finished.

## New execution flow

- The daily fixtures and bookmaker odds load first.
- Market Route returns immediately with its odds routes and a visible statistics-verification progress state.
- PPG Route and Convergence share one background venue-history job for the selected date.
- Duplicate page requests reuse the same in-flight analysis instead of starting another scan.
- Consensus reads the same shared snapshots and receives partial results immediately.
- The selected date finishes first; the seven-day Consensus expansion starts afterward.
- Every page polls the lightweight progress endpoint and stops polling on success, failure or timeout.
- Empty completed sections show `No qualified selections` rather than remaining in a loading state.
- Failed analysis shows a terminal retry message.

## Data and deployment

- API-Football remains the only football-data provider.
- There is no daily fixture cap.
- One GitHub repository, one Render service and one root `render.yaml` remain unchanged.
- No Supabase migration is required.
