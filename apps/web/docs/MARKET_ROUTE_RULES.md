# Market Route Rule Reference

| Route | Required direction | Full selection | One or two missed conditions |
|---|---|---|---|
| Favourite control | U3.5 ≥1.50, unbalanced 1X2, favourite TTO1.5 <1.55, weaker TTO0.5 ≥1.65, draw ≥3.70, NG ≤1.55, favourite 1.20–1.55 | Favourite win | Favourite double chance |
| Very short favourite | U3.5 ≥1.50, favourite <1.20, draw >4.00, favourite TTO1.5 <1.55, weaker TTO0.5 ≥1.65, NG ≤1.55 | Favourite TTO1.5 | Favourite TTO0.5 |
| Balanced scoring | U3.5 ≥1.50, balanced 1X2, both TTO0.5 ≤1.30, draw ≥3.70, NG ≥2.50, GG 1.20–1.55 | BTTS Yes | Over 1.5 |
| High-goal favourite | U3.5 ≥1.60, unbalanced 1X2, favourite TTO1.5 <1.50, weaker TTO0.5 ≤1.30, draw ≥3.70 | Over 2.5 | Over 1.5 |
| Compressed under | U2.5 ≤1.55, O1.5 ≥1.45, NG ≤1.50, average TTO0.5 ≥1.60, draw ≤3.00 | Under 2.5 | Under 3.5 |

Decision policy:

```text
No conditions missed
→ Full target market

One or two conditions missed
→ Approved safer market

Three or more conditions missed
→ Reject
```

Missing target or safer-market odds prevent that market from being published. Directly opposing over and under routes produce conflict and no selection.
