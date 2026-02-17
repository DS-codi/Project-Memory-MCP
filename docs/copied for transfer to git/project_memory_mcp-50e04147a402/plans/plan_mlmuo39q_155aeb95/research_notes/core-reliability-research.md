---
plan_id: plan_mlmuo39q_155aeb95
created_at: 2026-02-14T22:04:04.378Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Replay Core Reliability — Research Findings (2026-02-15)

## Scope and method
- Read-only audit of replay harness implementation and run outputs in `vscode-extension`.
- Reviewed scenario schema, normalization, comparator, orchestrator, CLI entrypoints, package scripts, and current CI workflow.
- Inspected a real generated replay run directory under `.replay-runs`.

## 1) Current-state audit: baseline handling + artifact layout

### Harness entrypoints and config
- CLI entry: `vscode-extension/src/test/replay/cli/replay-cli.ts`.
- NPM scripts:
  - `replay`: `node ./tools/replay-cli-runner.js`
  - `replay:list`: `npm run replay -- list-scenarios`
  - `replay:run`: `npm run replay -- run`
- Runner wrapper: `vscode-extension/tools/replay-cli-runner.js` bundles TS CLI to `.replay-bin/replay-cli.cjs`, injects defaults for:
  - scenarios: `src/test/replay/scenarios/baseline-scenarios.v1.json`
  - profile: `src/test/replay/config/default.profile.json`
  - output root: `.replay-runs`

### Baseline behavior today
- `run` command executes both profiles in one invocation:
  - baseline capture
  - candidate capture
  - immediate comparison
- Baseline is **not** loaded from versioned golden artifacts by default.
- Baseline and candidate are both generated from the same run and same runner code path (`ReplayOrchestrator.run()`), then compared.
- `compare` command supports external files (`--baseline` and `--candidate`), but there is no standardized repo-managed golden path/workflow wired into scripts.

### Artifact layout today
- Per-run directory: `.replay-runs/<label>-<epochMs>/`
- Artifacts produced:
  - `baseline.raw.jsonl`
  - `baseline.norm.json`
  - `candidate.raw.jsonl`
  - `candidate.norm.json`
  - `comparison.json`
  - `report.md`
  - `manifest.json`
- `manifest.json` currently stores absolute filesystem paths (Windows paths observed in local run), plus envelope metadata.
- `.replay-bin/replay-cli.cjs` is generated transiently by the runner.

### Existing determinism already implemented
- Normalization (`Normalize.ts`) supports:
  - volatile ID masking (`sess/run/req`, UUID, ULID-like tokens)
  - timestamp canonicalization (relative to first event)
  - path canonicalization (Windows/POSIX, workspace-relative when possible)
  - nondeterministic text stripping (ISO timestamps, long numeric tokens)
  - action alias canonicalization (`run/send/create -> execute`, `kill/close -> terminate`)
- Scenario-level normalization toggles are available in schema.
- Comparator enforces check categories: tool order, auth outcomes, flow, success signatures.

### CI state today
- Only workflow present: `.github/workflows/release.yml`.
- Current release workflow does **not** run replay scripts (`replay:run`) nor enforce replay gates.
- Extension build/release artifacts are uploaded, but replay outputs are not integrated into CI artifact retention/reporting.

### Current gaps
1. No canonical, versioned golden baseline store in repo.
2. No explicit baseline promotion/update governance.
3. No CI gate mode abstraction (`strict/warn/info`) despite comparator severity details.
4. No built-in stale artifact lifecycle policy for `.replay-runs`.
5. Manifest/report paths are machine-specific absolute paths (can reduce portability).
6. `.gitignore` does not currently ignore `.replay-runs` or `.replay-bin`.

## 2) Recommended golden-baseline strategy

### Recommended model
Adopt a **versioned golden baseline directory in-repo** for normalized artifacts only, and keep raw traces ephemeral:

- Suggested path:
  - `vscode-extension/src/test/replay/goldens/v1/<scenario-suite>/<profile-name>/baseline.norm.json`
  - optional metadata: `baseline.meta.json` (schema/profile hash, generated_at, generator version, commit)
- Keep `.raw.jsonl` out of git by default (upload as CI artifact only when needed).

### Why this model fits this repo
- Existing comparison already accepts baseline file inputs.
- Existing scenario suite is already versioned (`baseline-scenarios.v1.json`), so `goldens/v1` aligns naturally.
- Normalized artifacts are designed for deterministic diffing and are human-reviewable in PRs.

### Update workflow (recommended)
1. Local or CI regeneration step captures candidate normalized artifact for targeted scenarios.
2. Dedicated “promote baseline” path updates golden files intentionally (not as side effect of normal run).
3. PR includes golden diff + generated report summary.
4. Required reviewer(s) approve baseline changes.
5. Merge updates golden for subsequent strict CI runs.

### Approval flow (recommended)
- Treat golden updates as code changes:
  - Require CODEOWNERS review for `src/test/replay/goldens/**` and `src/test/replay/config/**`.
  - Require PR description to include rationale category:
    - expected behavioral change
    - deterministic normalization fix
    - comparator rule change
- Optional: PR label `replay-baseline-update` to enable extra CI context uploads.

## 3) CI gate mode design (strict / warn / info)

### Proposed gate contract
- `strict`:
  - Fails job on any replay failure (`comparison.passed=false`) or high-severity drift.
  - Intended for protected branches / merge gates.
- `warn`:
  - Job succeeds but emits GitHub warning annotations + summary table.
  - Suitable for rollout and flake burn-down periods.
- `info`:
  - Always pass; upload artifacts and publish report for visibility only.
  - Suitable for exploratory changes, nightly telemetry.

### Pass/fail behavior recommendations
- Parse `comparison.json` and map severities:
  - `strict`: block on any scenario failure.
  - `warn`: pass, but annotate each drift and include actionable next steps.
  - `info`: pass silently except summary.
- Keep behavior configurable via env var/input, e.g. `REPLAY_GATE_MODE`.

### PR ergonomics recommendations
- Post concise markdown summary in job summary:
  - total scenarios, failed scenarios, high/med/low drift counts, top drift messages.
- Upload replay bundle as CI artifact:
  - `comparison.json`, `report.md`, candidate normalized file, optional raw traces.
- For `warn`, provide direct “promote baseline” follow-up instructions.

## 4) Determinism controls + flake controls research

### Existing controls to retain
- ID/time/path/text normalization pipeline in `Normalize.ts`.
- Scenario-level overrides for normalization options.
- Explicit check declarations and severity in scenario schema.

### Additional controls recommended
1. **Stable serialization guarantees**
   - Ensure JSON write order and stable sorting where source maps/objects may vary.
   - Consider deterministic sort for arrays where semantic order is non-essential.
2. **Path portability improvements**
   - Prefer workspace-relative paths in `manifest.json` and report references; avoid host absolute paths.
3. **Timestamp/run-id determinism in outputs**
   - Keep run metadata in manifest, but avoid binding comparator logic to volatile run IDs.
4. **Scenario isolation + retries**
   - Add optional per-scenario retry-once mode for transient external/tooling blips; mark retried results explicitly.
5. **Flake triage mode**
   - For warn/info, collect N repeated runs for failing scenarios and classify as deterministic regression vs intermittent flake.
6. **Environment pinning**
   - Pin Node version in replay CI job and set deterministic locale/timezone (`TZ=UTC`, locale invariants) for stable text output.

### Repo-specific note on current comparator
- Comparator supports severity and profile defaults, but final `passed` currently depends on scenario failures/high drifts aggregate from comparisons. Gate-mode policy should be implemented above comparator (CI wrapper), not forced into core comparator semantics.

## 5) Repo/tooling-specific risks and tradeoffs

### Key risks
1. **False confidence risk (current baseline model)**
   - Baseline and candidate produced in same run can mask real regressions across commits.
2. **Artifact churn risk**
   - Without controlled golden storage and ignore rules, local `.replay-runs` can accumulate noise and accidental commits.
3. **Cross-platform path drift risk**
   - Absolute paths in manifests can cause noisy diffs and poor portability in shared artifacts.
4. **Governance risk**
   - Baseline updates without explicit approval flow can normalize unintended behavior changes.
5. **Rollout friction risk**
   - Enabling strict gating immediately may block development while deterministic edge cases are still being refined.

### Tradeoffs
- **Strict gating** increases safety but may increase short-term PR friction.
- **Warn-first rollout** improves adoption but delays hard enforcement.
- **Versioned goldens in git** improves reviewability and reproducibility, at the cost of maintaining baseline files.
- **Raw artifact retention in CI only** balances debuggability and repo hygiene.

## Practical phased recommendation
1. Phase A: Introduce golden storage path + compare against checked-in normalized baseline.
2. Phase B: Add CI replay job with `warn` default and artifact upload.
3. Phase C: Require approvals for baseline updates (CODEOWNERS + label/rationale).
4. Phase D: Promote default gate to `strict` on protected branches; keep `info` for nightly/experimental runs.

## Questions for Architect/Executor handoff
- Exact golden file taxonomy: per-suite only vs per-scenario shards.
- Whether to include candidate normalized output in PR artifacts only or as optional checked-in fixture for selected regressions.
- Where to implement gate-mode policy (dedicated Node script vs workflow inline logic).
- Cleanup policy for `.replay-runs` and `.replay-bin` (ignore + optional pruning command).
