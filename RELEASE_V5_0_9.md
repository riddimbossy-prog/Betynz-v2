# Betynz v5.0.9 — Five-Engine Logo Edition

## PPG retained, Apex added

PPG Route remains active after its successful settled performance. Apex Intelligence is added beside it rather than replacing it.

The active engine set is:

```text
Market Route
PPG Route
Apex Intelligence
Convergence
Momentum & Streak
```

## Five-engine Consensus

```text
5/5 compatible agreement → Elite Banker
4/5 compatible agreement → Consensus Banker
2–3/5 compatible agreement → Shared Qualified Pick
1 engine qualifies → Qualified or Safer Pick
Opposite directions → Conflict
```

## Unified logo palette

All engine pages, toolbar chips, filter controls, detail cards and active states now use black, charcoal, silver, white and orange. Engine identity is communicated by name and icon rather than unrelated colours. Semantic result states remain distinct.

## Database

Existing projects must run `apps/web/sql/014_five_engine_ppg_apex.sql`. The migration permits both `PPG_ROUTE` and `APEX_INTELLIGENCE` and expands agreement counts to five.

## Deployment

One repository, one Render web service, one `render.yaml`, and API-Football as the only football provider.
