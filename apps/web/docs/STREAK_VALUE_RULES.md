# Atlas Streak Value Engine

Atlas uses TheStatsAPI as an additive intelligence source. It classifies recent team quality and ordered streaks, then permits only selections whose actual offered price is 1.20–1.55.

## Evidence
- best/strong vs weak/worst form
- wins, losses, unbeaten and winless streaks
- scoring, conceding, clean-sheet and failed-to-score streaks
- total-goal Over/Under 1.5, 2.5 and 3.5 streaks
- team-goal Over/Under 0.5, 1.5 and 2.5 streaks
- recent xG for/against
- shots-on-target when the provider returns a usable sample

Goal and team-total routes are opened by the streak plus market gate. xG and SOT are confirmation/contradiction layers; they do not invent a route on their own.
