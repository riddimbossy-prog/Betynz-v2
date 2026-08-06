# Automatic calibration policy

## Purpose

Calibration measures how engine routes and consensus classifications perform after settlement. It helps identify patterns that may deserve promotion, guardrails, recalibration or suspension review.

## What is automatic

- Settlement collection
- Hit-rate calculation
- Profit-unit calculation
- ROI calculation
- Grouping by route, downgrade and agreement level
- Recommendation generation

## What is not automatic

The system does not change thresholds, activate a new route or suspend a production rule by itself. Recommendations require an administrator to review the sample and approve a code change.

## Sample stages

```text
0–19 settled     → AUDIT
20–39 settled    → PROVISIONAL
40–99 settled    → CALIBRATED
100+ settled     → ESTABLISHED
```

## Recommendation rules

```text
Sample below 20
→ KEEP_AUDITING

Hit rate at least 72% and positive ROI
→ REVIEW_FOR_PROMOTION before 40
→ KEEP_ACTIVE from 40 onward

Hit rate at least 66% and ROI at least -2%
→ KEEP_WITH_GUARDRAILS

Hit rate below 58% or ROI at or below -8%
→ SUSPEND_AND_REVIEW

Other mature patterns
→ RECALIBRATE
```

## Measurement groups

- Engine + route + FIRE/SAFER decision
- Engine + safer market + missed-condition count
- Elite Banker
- Consensus Banker
- Qualified Pick
- Safer Pick

VOID and PUSH records remain in settled sample counts but do not count as wins or losses. REVIEW records require manual result verification.
