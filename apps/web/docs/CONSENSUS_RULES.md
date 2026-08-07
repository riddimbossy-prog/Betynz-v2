# Consensus Bankers rules

## Inputs

The consensus system receives no more than one qualified decision from each engine:

- Market Route;
- PPG Route;
- Apex Intelligence;
- Convergence;
- Momentum & Streak.

Only FIRE or SAFER decisions can enter consensus comparison.

## Classifications

```text
ELITE_BANKER       = seven engines support one compatible direction
CONSENSUS_BANKER   = five or six engines support one compatible direction
QUALIFIED_PICK     = two or three engines support a complete compatible direction
SAFER_PICK         = one engine produces an approved SAFER decision
CONFLICT           = qualified engines oppose each other
HOLD_MISSING_SHARED_PRICE = agreement exists but the shared market cannot be priced
NO_SIGNAL          = no engine qualifies
```

## Compatible directions

### Team result

```text
Home Win + Home/Draw → Home/Draw
Away Win + Draw/Away → Draw/Away
```

Only unanimous straight wins retain the straight-win market.

### Goals

```text
Over 2.5 + Over 1.5 → Over 1.5
Over 2.5 + BTTS Yes → Over 1.5
Under 2.5 + Under 3.5 → Under 3.5
```

### Team totals

```text
Team Over 1.5 + Team Over 0.5 → Team Over 0.5
```

## Hard conflicts

No banker is published when qualified engines produce home-versus-away opposition, Over-versus-Under opposition, or BTTS Yes-versus-BTTS No opposition.

## Price requirement

A shared market must have a valid price greater than 1.00. Agreement without a price is held and cannot be shown as a banker.

## Freeze policy

Selections are provisional until the configured freeze window. The default is 30 minutes before kickoff. The first frozen snapshot is immutable because the database allows only one consensus snapshot for each fixture/date.

## Score meaning

Consensus score is the average analytical score of the agreeing engines. It measures evidence agreement; it is not a guaranteed probability.
