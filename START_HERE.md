# Betynz v5.0.20 — Start Here

This is a complete single-Render replacement build.

## Upgrade from v5.0.19

No new Supabase migration is required if SQL `016_zeus_statistical_supervisor.sql` is already installed.

1. Extract this package.
2. Replace the repository contents while keeping your existing `.git` folder.
3. Commit and push through GitHub Desktop.
4. In Render choose **Manual Deploy → Clear build cache & deploy**.
5. After the service is healthy, hard-refresh the site once with `Ctrl + Shift + R`.

## What changed

The final validation layer now performs match-specific recovery instead of a fixed safer-market fallback. Every recovered market must still pass the universal 1.20–2.00 gate and its own statistical validation.

Check `/api/health` after deployment. It should report version `5.0.20` and include `adaptiveRecoveryPolicy`.
