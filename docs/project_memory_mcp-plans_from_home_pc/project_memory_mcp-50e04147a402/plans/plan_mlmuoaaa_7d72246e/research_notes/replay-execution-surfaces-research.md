---
plan_id: plan_mlmuoaaa_7d72246e
created_at: 2026-02-15T07:50:16.340Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Replay execution surfaces audit (Step 0)

### Scope
- Plan: `Replay Execution Surfaces`
- Objective: audit current replay execution surfaces and identify highest-value expansion opportunities aligned with existing architecture.

### Current state (confirmed)
1. **Replay surface model supports 3 values now**
   - `ReplayTerminalSurface = 'memory_terminal' | 'memory_terminal_interactive' | 'auto'`.
   - Matrix contract accepts `auto`, `memory_terminal`, `memory_terminal_interactive`.

2. **Baseline replay scenarios are currently `memory_terminal`-only**
   - All entries in `baseline-scenarios.v1.json` set `runtime.terminal_surface` to `memory_terminal`.
   - No scenario currently exercises `memory_terminal_interactive` or `auto` as the declared runtime surface.

3. **Replay orchestration is still synthetic (trace-simulation), not true surface invocation**
   - `ReplayOrchestrator` default runner emits deterministic synthetic `tool_call`/`outcome` events.
   - This means replay currently validates contracts and ordering semantics, but does not yet execute real MCP terminal surfaces during replay runs.

4. **Extension has multiple execution entrypoints outside replay harness**
   - Canonical MCP-facing interactive contract: `memory_terminal_interactive` tool handler.
   - Visible VS Code terminal management contract: `memory_terminal_vscode`.
   - `projectMemory.runBuildScript` command resolves `memory_plan.run_build_script` and then executes via a VS Code terminal directly.

5. **Interactive-terminal app is a routing/approval layer, not a third execution API**
   - Interactive terminal README documents routing to either `memory_terminal` (headless) or `memory_terminal_interactive` (visible).

### Highest-value expansion opportunities (architect-ready)

#### Opportunity 1 — Surface parity matrix (highest ROI)
- Expand replay matrix coverage to include `memory_terminal_interactive` and `auto` across at least one P0 slice and one P1 slice.
- Keep existing matrix architecture: use `axes.execution_surfaces` in `run-matrix` contract rather than ad-hoc scenario duplication.
- Why high-value: validates contract parity and drift behavior under all supported surface selectors with minimal architecture churn.

#### Opportunity 2 — Explicit `auto` routing expectations in replay checks
- Add scenario-level/metadata expectations that assert canonical outcomes for `auto` selection (e.g., chosen action canonicalization + authorization class consistency).
- Continue using existing comparator checks (`tool_order`, `auth_outcome`, `flow`, `success_signature`) to avoid new check types.
- Why high-value: `auto` exists in schema today but lacks first-class behavioral assertions.

#### Opportunity 3 — Bridge replay to real execution adapters (incremental mode)
- Introduce an optional replay runner mode that invokes actual extension tool pathways (MCP bridge + terminal contracts) while preserving current synthetic mode as default.
- Suggested approach: dependency-injected runner adapter for `ReplayOrchestrator` to avoid breaking existing deterministic tests.
- Why high-value: closes the realism gap between replay traces and production execution surfaces.

#### Opportunity 4 — Build-script launch-surface contract tests
- Add replay scenarios for the path: `memory_plan.run_build_script` resolve -> selected terminal surface execution (`memory_terminal` vs `memory_terminal_interactive` pathing).
- Include expected ordering for resolve/execute/read_output (or equivalent visible-surface behavior markers).
- Why high-value: plan-level build-script execution is a common launch mechanism and currently under-modeled in replay surface terms.

#### Opportunity 5 — Clarify `memory_terminal_vscode` relationship to replay surfaces
- Decide architecture stance explicitly:
  - either map `memory_terminal_vscode` into replay surface taxonomy (new surface enum value),
  - or document it as UI-only implementation detail excluded from replay surfaces.
- Why high-value: removes ambiguity between canonical MCP surface (`memory_terminal_interactive`) and extension-local visible terminal path.

### Suggested implementation order for Architect
1. Add matrix contract(s) that include all current replay surface enum values (`memory_terminal`, `memory_terminal_interactive`, `auto`) for a small P0/P1 scenario subset.
2. Add `auto`-specific expected behavior metadata and comparator assertions using existing check types.
3. Add optional adapter-backed runner for replay (feature-flagged), keep synthetic runner default.
4. Add build-script execution-surface replay scenarios.
5. Decide and document `memory_terminal_vscode` inclusion/exclusion policy in replay-surface model.

### Risks / gates to call out
- **Determinism risk** rises when moving from synthetic to real execution surfaces; preserve deterministic controls and retry classification behavior.
- **Contract collision risk** if `memory_terminal_interactive` and `memory_terminal_vscode` semantics are mixed without clear taxonomy.
- **Validation mismatch observed**: `memory_agent.validate` returned `switch -> Analyst` despite this plan step being assigned to Researcher; likely orchestration metadata mismatch to resolve at Coordinator level.
