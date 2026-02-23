---
plan_id: plan_mlmuoaad_7320fefc
created_at: 2026-02-15T07:13:53.996Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Replay Model Matrix Research (2026-02-15)

### 1) Current Harness Capabilities Relevant to Model/Profile Variants

Observed from replay core/cli/schema artifacts:

- Replay CLI already supports matrix slicing controls:
  - `--scenario` (repeatable), `--tag` (repeatable), `--shard-index`, `--shard-count`
  - `--profile <profile.json>` for comparator behavior
  - `--gate-mode strict|warn|info`
  - `--retry-once true|false`
  - `--label` for run grouping
- Comparator profile supports behavioral variance toggles:
  - `tool_order.strict_default`
  - `tool_order.ignore_optional_tools[]`
  - `authorization.compare_reason_class`
  - `flow.require_handoff_before_complete`
  - `flow.require_confirmation_before_gated_updates`
  - `flow.required_handoff_target`
  - `success_signatures.require_all`
- Scenario schema supports variance by scenario metadata and execution surface:
  - runtime: `mode`, `terminal_surface`
  - tags + tag metadata (domain/surface/risk/priority)
  - determinism level (`strict|moderate|loose`)
  - normalization flags (`mask_ids`, `canonicalize_timestamps`, `canonicalize_paths`, `strip_nondeterministic_text`)
  - stabilization controls (`fixture_seed`, frozen clock delta, wait budget, fixture tree)
  - acceptance thresholds (max total/high/medium/low drifts)
- Output payloads already include scoring primitives:
  - summary drift counts by severity
  - scenario pass/fail and checks executed
  - explainability rollups (by category/confidence/operator bucket) when drifts exist
  - gate classification (`clean`, `deterministic_regression`, `intermittent_flake`) with triage labels
  - flake control metadata (`retry_performed`, retry summary)
  - drift evidence fingerprints + artifact refs

Important limitation for matrix design scope:
- Harness currently compares fixed profile pairs (`baseline` vs `candidate`) and does not directly encode an LLM `model_id` dimension in replay types.
- Model/profile matrix should therefore treat model as run metadata carried in labels/artifact naming/manifest linkage, while comparator behavior remains profile-driven.

### 2) Practical Variance Dimensions for Comparative Matrix Runs

Recommended matrix axes (ordered by impact vs complexity):

1. **Model Identity Axis (external metadata axis)**
   - Candidate sets: model/version/provider (e.g., `model=A`, `model=B`)
   - Encoding approach now: include model key in `--label` and run manifest catalog
   - Keep comparator profile constant while sweeping model to isolate model-caused drift

2. **Comparator Profile Axis (behavioral policy axis)**
   - Start with profile variants:
     - `strict-protocol` (all flow/auth strict)
     - `tolerant-order` (`strict_default=false`, optional tools ignored)
     - `auth-strict` (`compare_reason_class=true`, strict flow)
   - Purpose: sensitivity analysis for expected policy strictness bands

3. **Scenario Slice Axis (coverage axis)**
   - Stratify by tags: `risk:p0`, `risk:p1`, `risk:p2`; and domain tags
   - Run both full and stratified suites to avoid overfitting to one scenario class

4. **Execution Surface Axis (runtime axis)**
   - `runtime.mode` and `terminal_surface` where relevant (`memory_terminal` vs `memory_terminal_interactive`/auto)
   - Use when validating behavior parity across headless vs host-visible flows

5. **Gate Policy Axis (decision threshold axis)**
   - `gate-mode`: strict/warn/info
   - `retry-once`: on/off
   - Use for release decision policy calibration, not model quality itself

6. **Determinism/Normalization Axis (noise-control axis)**
   - Keep `determinism=strict` and all normalization flags ON as baseline condition
   - Introduce relaxed variants only as controlled experiments, not default scoreboard runs

### 3) Meaningful Replay Scoring Metrics (from Existing Fields)

Use a two-level scoring approach: quality score + reliability flags.

#### A. Primary Weighted Drift Score (WDS)

Compute from comparison summary:

- `WDS = 100 - (20 * high + 7 * medium + 2 * low)`
- clamp to `[0, 100]`

Rationale:
- High severity should dominate decisioning
- Medium captures actionable regressions
- Low is monitored but lightly penalized

#### B. Scenario Pass Rate (SPR)

- `SPR = passed_scenarios / total_scenarios`

Use as a hard guardrail with WDS (avoid inflated score when one catastrophic high drift appears in few scenarios).

#### C. Explainability Coverage Index (ECI)

If rollup present:

- `ECI = total_explained_drifts / max(total_drifts, 1)`

High ECI indicates regressions are diagnosable and operationally actionable.

#### D. Blocker Burden Ratio (BBR)

From explainability operator buckets:

- `BBR = blocker_bucket / max(total_explained_drifts, 1)`

Use to distinguish many minor issues vs release-blocking issues.

#### E. Flake Penalty / Reliability Modifier

From gate classification + retry metadata:

- `classification=intermittent_flake` => apply reliability penalty (e.g., -5) but do not fail quality outright
- `classification=deterministic_regression` => fail lane regardless of raw WDS

#### F. Composite Matrix Score (CMS)

Recommended leaderboard value:

- `CMS = WDS * SPR - flake_penalty`
- with hard rules:
  - if `high_severity_drifts > 0` and gate strict: mark lane non-promotable
  - if `classification=deterministic_regression`: non-promotable

### 4) Anti-Noise Constraints for Matrix Validity

Use these constraints to keep comparisons meaningful:

1. **Freeze environment invariants**
   - Keep TZ/locale fixed (`UTC`, `C.UTF-8`) as already enforced by CLI
   - Keep scenario suite and comparator profile hash-pinned per matrix batch

2. **Normalization always-on for core matrix**
   - enforce `mask_ids`, timestamp/path canonicalization, and nondeterministic text stripping
   - only test normalization-off in separate diagnostics lane

3. **Retry discipline for flake triage only**
   - enable `--retry-once true` for reliability labeling
   - score on primary run; use retry only for classification and penalty modulation

4. **Stratified reporting**
   - produce scores per risk tier (`p0/p1/p2`) plus global aggregate
   - prevent large low-risk pools from hiding p0 regressions

5. **Threshold gates at scenario level**
   - keep `acceptance_thresholds` explicit in scenarios, especially p0
   - recommended p0 default remains zero high and zero total drift unless intentionally relaxed

6. **Evidence fingerprint stability checks**
   - track repeat drift fingerprints across runs
   - stable fingerprint => deterministic issue; changing fingerprint => likely stochastic/noisy condition

7. **Minimum sample policy**
   - require at least N scenarios per tier (or clearly flag underpowered slices) before ranking models

### 5) Recommended Initial Matrix Blueprint

Minimal practical starting matrix for Architect planning:

- Models: 2-3 candidates (encoded in run label/manifest catalog)
- Profiles: 2 (`default-replay-profile`, `tolerant-order`)
- Scenario slices: full suite + `risk:p0`
- Gate: strict + retry-once enabled
- Report outputs per lane:
  - gate summary JSON
  - comparison JSON
  - computed `WDS`, `SPR`, `CMS`, classification, triage labels

This provides useful contrast while keeping lane count manageable.
