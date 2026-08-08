# Betynz v5.1.1h2 — Week Queue Hotfix

This patch addresses the busy-day condition visible on 8 Aug: 1,213 current-day fixtures while weekly intelligence remains 0/7 and future tabs show zero.

## Changes
- Fixture-count discovery is now priority 0 so it cannot be starved by paginated odds requests.
- Weekly precompute discovers all seven fixture counts before deep engine analysis.
- On the rolling current-week build, future dates are precomputed first and the huge current day is completed last.
- The dashboard consumes scheduler-discovered counts and shows schedule readiness separately from deep engine readiness.
- Existing board-persistence protections remain unchanged.
- PWA cache revision bumped to h2.

No additional external cron job is required.
