# Betynz v5.0.16 Build Validation

Final validation for the universal 1.20–2.00 odds gate release.

## Universal publication gate

- 1.20 and 2.00 are accepted inclusively.
- Selections below 1.20 attempt a compatible harder-market upgrade.
- Selections above 2.00 attempt a compatible safer-market downgrade.
- No opposite football direction is substituted merely to obtain an in-band price.
- If no compatible 1.20–2.00 alternative exists, the selection is rejected.
- The gate is enforced on all seven engine outputs, Qualified Picks, frozen prediction storage, legacy snapshots and Consensus.
- Consensus also refuses any shared final price outside 1.20–2.00.

## Regression results

- Engine/platform tests: **103/103 passed**.
- Dedicated universal odds-gate tests: **10/10 passed**.
- Seven-engine rule suites: **passed**.
- Atlas widened value band: **passed**.
- Chronos HT/FT compatible downgrade: **passed**.
- Consensus out-of-band filtering: **passed**.
- Prediction persistence safety gate: **passed**.
- Production-style API-Football 8 RPM build: **passed**.
- Release verification: **passed**.
- Single-Render verification: **passed**.
- One-service integration smoke test: **passed**.

## Deployment structure

- One GitHub repository.
- One Render web service.
- One root `render.yaml`.
- API-Football remains the core football provider.
- Stats API remains additive enrichment for Atlas/xG/SOT intelligence.

No Supabase migration is required when upgrading from v5.0.15.
