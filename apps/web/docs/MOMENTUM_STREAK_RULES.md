# Momentum & Streak Engine rules

## Purpose

The engine reads recent venue results in sequence order. It does not qualify a market from one isolated average. At least two independent streak families must agree, and the exact API-Football market must be available.

## Required samples

- Home team: last five home matches.
- Away team: last five away matches.
- A sample below 5/5 returns `WAITING`.

## Streak families

1. **Form** — consecutive wins, losses, unbeaten and winless results.
2. **Opposition** — strong sequence against an opposing weak sequence.
3. **Strength** — venue PPG difference used only as supporting evidence.
4. **Attack** — repeated scoring or failed-to-score results.
5. **Defence** — repeated conceding, clean-sheet or blank pressure.
6. **Long totals** — Over/Under or BTTS occurrence across the full 5+5 sample.
7. **Recent totals** — continuation across the most recent three home and three away matches.
8. **Market** — the exact market offered by API-Football.

## Routes

- Home momentum dominance → Home Win; safer 1X.
- Away momentum dominance → Away Win; safer X2.
- Sustained goal wave → Over 2.5 when strong enough; safer Over 1.5.
- Sustained goal drought → Under 2.5 when strong enough; safer Under 3.5.
- Both-teams scoring wave → BTTS Yes; safer Over 1.5.
- One-team blank streak → BTTS No; safer Under 3.5.

## Fire gate

A direct pick requires:

- no hard blocker;
- two or more independent streak families;
- route score of at least 82;
- exact market odds greater than 1.00.

A safer pick requires the same independent-family rule, a score of at least 70, and the approved safer market.

## Conflict protection

No pick is published when opposite qualified directions have scores within seven points:

- Home result vs away result;
- Goals Over vs goals Under;
- BTTS Yes vs BTTS No.
