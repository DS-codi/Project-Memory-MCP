# Replay Matrix Report Semantics

This document defines how `matrix-report.json` and `matrix-report.md` should be interpreted for promotion decisions.

## Per-Cell Score Fields

- **WDS** (`wds`): Weighted Drift Score.
  - Formula: `WDS = clamp(100 - (20*high + 7*medium + 2*low), 0, 100)`
- **SPR** (`spr`): Scenario Pass Rate.
  - Formula: `SPR = passed_scenarios / total_scenarios`
- **ECI** (`eci`): Explainability Coverage Index.
  - Formula: `ECI = explained_drifts / total_drifts` (`1` when `total_drifts = 0`)
- **BBR** (`bbr`): Blocker Bucket Ratio.
  - Formula: `BBR = blocker_bucket_drifts / explained_drifts` (`0` when `explained_drifts = 0`)
- **CMS** (`cms`): Composite Matrix Score.
  - Formula: `CMS = (WDS * SPR) - flake_penalty`
  - `flake_penalty = 5` only when gate classification is `intermittent_flake`, otherwise `0`.

## Deterministic Regression Handling

- A cell is marked deterministic regression when gate classification is `deterministic_regression`.
- Deterministic regression cells are always **non-promotable**, independent of CMS.
- In strict gate mode this typically corresponds to `gate.passed = false` with a deterministic reason.

## Promotion Semantics

A cell is promotable only if all conditions are true:

1. `score.deterministic_regression === false`
2. `gate.passed === true`
3. Risk-tier drift policy (if configured) is satisfied for that cell's `scenario_slice.risk_tier`.

## Rollups and Summaries

- `axis_rollups` aggregate by each axis (`model_variant`, `comparator_profile`, `scenario_slice`, `execution_surface`, `gate_mode`, `normalization_profile`).
- Each rollup provides averaged `cms`, `wds`, `spr` and promotable cell counts.
- `risk_tier_summary` reports counts by `p0`, `p1`, `p2`, including deterministic regressions.
