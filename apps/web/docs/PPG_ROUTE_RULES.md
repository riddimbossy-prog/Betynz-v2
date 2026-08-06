# PPG Route Engine rules

## Input

```text
Home PPG = points from the last five home matches ÷ 5
Away PPG = points from the last five away matches ÷ 5
```

Five verified matches are required for both splits.

## Route priority

1. Two weak teams.
2. Two strong teams.
3. Extreme PPG advantage.
4. Weak away team.
5. No Pick.

This priority prevents conflicting selections.

## No-pick conditions

- Either sample has fewer than five matches.
- The draw price is missing.
- The selected market is unavailable.
- The values fall outside every locked PPG route.
- The weak-away route falls inside the draw zone `3.11–3.50`.
