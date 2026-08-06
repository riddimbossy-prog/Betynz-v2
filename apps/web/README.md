# Betynz web — v5.0.12

API-Football-only five-engine football-analysis application.

## Active engines

1. Market Route
2. PPG Route
3. Apex Intelligence
4. Convergence
5. Momentum & Streak

PPG Route remains an independent venue-split specialist. Apex Intelligence complements it with a broader multi-factor decision path. Every engine publishes at most one official selection per fixture.

The public interface uses the Betynz logo palette: black and charcoal surfaces, silver borders, white text and orange accents. Semantic colours remain reserved for live, won, lost, warning and review states.

API keys and Supabase service credentials stay server-side.

## Adaptive provider queue

All provider requests share one rolling request budget. Body-level “Too many requests” errors and HTTP 429 responses trigger a global cooldown and automatic retry. Fixture, odds and live requests receive priority over background engine history. Completed histories remain cached for reuse across all five engines.
