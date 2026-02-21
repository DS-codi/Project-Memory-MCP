# Systems Inventory (Recent Plans)

This document summarizes newly implemented systems from the two requested program containers:

- **Project Memory Local Supervisor** (`plan_mltbczzi_1ce7afcc`)
- **Context-Scoped Orchestration Overhaul** (`plan_mlrzfbgy_e50be118`)

For each plan: what was added, what it improves, and what it deprecates/replaces.

## Compact Table (One Row Per Plan)

| Program | Plan | New System (Brief) | Improvement | Deprecates/Replaces |
|---|---|---|---|---|
| Local Supervisor | Epic A — `plan_mltbe3zj_44eba4af` | Supervisor foundation (config, lock, heartbeat, registry) | Centralized runtime ownership + single-instance safety | Ad-hoc startup ownership pattern |
| Local Supervisor | Epic B — `plan_mltbe46q_cc4cd8f3` | Control API + identity handshake | Unified authenticated control plane | Unverified direct endpoint trust |
| Local Supervisor | Epic C — `plan_mltbe44b_03344c56` | Unified runtime runners + state machine | Standardized lifecycle/reconnect behavior | `server/src/transport/container-proxy.ts` removed; direct container-proxy pattern |
| Local Supervisor | Epic D — `plan_mltbe44b_bb9e4b62` | Extension detect/start/retry/degraded integration | Bounded startup + clearer degraded UX | Implicit extension-owned boot flow |
| Local Supervisor | Epic E — `plan_mltbe466_64116107` | Structured observability + operations hooks | Better diagnostics and controlled restarts | Opaque restart/diagnostic handling |
| Local Supervisor | Epic F — `plan_mltbe478_7450addc` | Optional service mode | Flexible runtime mode boundaries | Always-on single-mode assumption |
| Local Supervisor | Approval Gate GUI — `plan_mltfiehe_25fc65d7` | Initial approval GUI container | Established approval UX baseline | Superseded by Brainstorm GUI scope |
| Local Supervisor | Brainstorm GUI — `plan_mltzwdxi_539556ac` | Consolidated GUI implementation path | Reduced overlap in parallel GUI concepts | Standalone Approval Gate GUI scope |
| Context Overhaul | Category & Intake — `plan_mlrzfy8i_9567af08` | Category/intake routing engine | Deterministic entry routing | Manual/freeform intake routing |
| Context Overhaul | Plan Schema v2 — `plan_mlrzgac4_a6c36762` | Phase-rich plan schema | Better progression/review fidelity | v1-only shallow plan model |
| Context Overhaul | Agent & Context Deploy — `plan_mlrzgmy4_d5dc2788` | Scoped agent/context deployment | Reduced drift + scoped context loading | Broad implicit context bootstrapping |
| Context Overhaul | Tool Preflight — `plan_mlrzgxwt_f3b4274d` | Preflight + enriched init | Prevents invalid starts | Minimal startup validation flow |
| Context Overhaul | Handoff Stats — `plan_mlrzhaye_9868a2ae` | Handoff analytics + incidents | Measurable orchestration quality | Unstructured handoff observability |
| Context Overhaul | Skill Registry — `plan_mlrzhpt2_f0713743` | Skill registry + auto-creation | Consistent reusable task intelligence | Ad-hoc skill curation |
| Context Overhaul | Programs Redesign — `plan_mlrzi2tv_7c33d13e` | Dedicated program store + deps/risks/migration | First-class program orchestration | `is_program` PlanState piggyback; `server/src/tools/plan/plan-programs.ts` marked for retirement |
| Context Overhaul | Frontend Overhaul — `plan_mlrziekp_1e7ddc1e` | Dashboard v2 views (phase/risk/stats/skills) | UI parity with backend overhauls | Limited v1-only visualization model |
| Context Overhaul | Hub Discipline — `plan_mlrzipir_e5286925` | Shared hub pause/summary protocol | Deterministic phase checkpoints | Inconsistent hub pacing behavior |
| Context Overhaul | Migrator Agent — `plan_mlsdgryg_1d3ceab0` | Dedicated v1→v2 migration spoke | Safer, formal migration workflow | Manual migration procedure |

## Program: Project Memory Local Supervisor

### Epic A — Supervisor Foundation (`plan_mltbe3zj_44eba4af`)
- **New system**: Core Supervisor process scaffold, config loading, single-instance lock, heartbeat, service registry state store.
- **Improvement**: Moves runtime lifecycle ownership from ad-hoc extension/session behavior to one stable local process with lock safety.
- **Deprecates/replaces**: Legacy “no central supervisor” startup pattern (behavioral deprecation, not a single file removal).

### Epic B — Control API + Handshake (`plan_mltbe46q_cc4cd8f3`)
- **New system**: Named-pipe control API (+ optional TCP fallback) with WhoAmI identity/capability handshake and client registry commands.
- **Improvement**: Adds authenticated control-plane operations and consistent backend switching through one API.
- **Deprecates/replaces**: Unverified direct endpoint trust and scattered control entrypoints (behavioral deprecation).

### Epic C — Runtime Runners (`plan_mltbe44b_03344c56`)
- **New system**: Unified runner adapters (`NodeRunner`, `ContainerRunner`, `InteractiveTerminalRunner`, `DashboardRunner`) + connection state machine/backoff.
- **Improvement**: Standardizes service lifecycle and reconnection behavior across all managed services.
- **Deprecates/replaces**:
  - Removed file: `server/src/transport/container-proxy.ts` (deleted in last 72h commit history).
  - Replaced pattern: direct transport-specific container proxying in favor of supervisor-managed runners.

### Epic D — VS Code Extension Integration (`plan_mltbe44b_bb9e4b62`)
- **New system**: Extension activation path for detect/start/retry/degraded Supervisor flow with settings-backed startup policy.
- **Improvement**: Reduces activation fragility and adds bounded startup behavior with explicit degraded UX.
- **Deprecates/replaces**: Implicit extension-owned process boot assumptions (behavioral deprecation).

### Epic E — Observability + Operations (`plan_mltbe466_64116107`)
- **New system**: Structured supervisor observability, state query APIs, client visibility, and upgrade/restart orchestration hooks.
- **Improvement**: Enables diagnosable runtime health and controlled restart/upgrade workflows.
- **Deprecates/replaces**: Unstructured restart/failure diagnostics and opaque client/session state handling (behavioral deprecation).

### Epic F — Optional Service Mode (`plan_mltbe478_7450addc`)
- **New system**: Optional service-mode behavior layered into supervisor startup/operation model.
- **Improvement**: Provides clearer runtime mode boundaries and flexible deployment posture.
- **Deprecates/replaces**: Always-on single-mode assumption (behavioral deprecation).

### Approval Gate GUI (`plan_mltfiehe_25fc65d7`)
- **New system**: Initial approval-gate GUI plan container.
- **Improvement**: Established the approval UX direction.
- **Deprecates/replaces**: Superseded by consolidated Brainstorm GUI work (see next item).

### Brainstorm GUI (`plan_mltzwdxi_539556ac`)
- **New system**: Consolidated GUI implementation path for brainstorming/approval interactions.
- **Improvement**: Centralizes previously split GUI work and reduces overlap from parallel GUI concepts.
- **Deprecates/replaces**: Effective replacement of standalone Approval Gate GUI scope.

---

## Program: Context-Scoped Orchestration Overhaul

### Category & Intake Engine (`plan_mlrzfy8i_9567af08`)
- **New system**: Request categorization + intake routing logic for deterministic orchestration entry.
- **Improvement**: Reduces agent drift at the very first routing decision.
- **Deprecates/replaces**: Manual/freeform intake routing behavior.

### Plan Schema v2 (`plan_mlrzgac4_a6c36762`)
- **New system**: Richer plan schema with phase-level structure, criteria, and expanded metadata.
- **Improvement**: Improves deterministic progression, reviewability, and dashboard rendering fidelity.
- **Deprecates/replaces**: v1-only shallow plan structure as the primary model.

### Agent & Context Deployment System (`plan_mlrzgmy4_d5dc2788`)
- **New system**: Scoped deployment model for agent/context bundles.
- **Improvement**: Tightens task scope boundaries and reduces unnecessary codebase-wide reads.
- **Deprecates/replaces**: Broad, implicitly scoped context bootstrapping.

### Tool Preflight & Init Enrichment (`plan_mlrzgxwt_f3b4274d`)
- **New system**: Preflight checks and enriched init payloads before execution.
- **Improvement**: Prevents invalid starts and improves early-session determinism.
- **Deprecates/replaces**: Minimal validation startup path with weaker guardrails.

### Handoff Stats & Incident Reports (`plan_mlrzhaye_9868a2ae`)
- **New system**: Handoff analytics + incident tracking model.
- **Improvement**: Makes orchestration quality measurable and debuggable over time.
- **Deprecates/replaces**: Unstructured handoff observability.

### Skill Registry & Auto-Creation (`plan_mlrzhpt2_f0713743`)
- **New system**: Centralized skill registry with automated skill generation flow.
- **Improvement**: Increases consistency and discoverability of reusable task intelligence.
- **Deprecates/replaces**: Manual, ad-hoc skill curation.

### Integrated Programs Redesign (`plan_mlrzi2tv_7c33d13e`)
- **New system**: Dedicated `data/{workspace_id}/programs/` storage model with independent program state, dependency graph, risk register, migration tooling.
- **Improvement**: Separates programs from plan-state piggybacking and supports cross-plan dependency/risk orchestration.
- **Deprecates/replaces**:
  - Legacy design: `is_program` piggybacking on PlanState.
  - Legacy route target in goals: `server/src/tools/plan/plan-programs.ts` (marked for retirement by plan intent; file still currently present).

### Frontend Overhaul (`plan_mlrziekp_1e7ddc1e`)
- **New system**: Dashboard v2 views for phases, risk, stats, skills, and enriched program visualization with v1 compatibility.
- **Improvement**: Aligns UI with schema/program overhauls and surfaces operational signals directly.
- **Deprecates/replaces**: Prior limited v1-only plan/program visual model.

### Hub Interaction Discipline (`plan_mlrzipir_e5286925`)
- **New system**: Shared hub pause-policy and pre-action summary protocol across Coordinator/Analyst/Runner/TDDDriver.
- **Improvement**: Enforces deterministic interaction checkpoints and better user control over continuation.
- **Deprecates/replaces**: Inconsistent hub-specific pacing behavior.

### Migrator Agent (`plan_mlsdgryg_1d3ceab0`)
- **New system**: Dedicated `Migrator` spoke agent for v1→v2 plan migration with complexity-adaptive strategy.
- **Improvement**: Formalizes migration flow and reduces risky manual rewrites.
- **Deprecates/replaces**: Ad-hoc/manual v1→v2 migration procedure.

---

## Notes on Deprecation Evidence

- **Explicit file deletion observed in last 72h git history**: `server/src/transport/container-proxy.ts`.
- Other “deprecates/replaces” entries above are **architecture-level replacements** documented by plan goals/descriptions; they may not yet correspond to a deleted file in git.

---

## Cleanup Candidate Classification Table (Proposal, No Moves Executed)

Scope aligned to cleanup plan `plan_mlusbxe0_f860bcbf` and hard constraints:
- `agents-v2/` and `instructions-v2/` remain permanent **KEEP**.
- No action proposed under protected no-touch runtime paths.

| Candidate | Exists Now | Classification | Rationale / Evidence | Blocker Before Move |
|---|---:|---|---|---|
| `agents-deprecated/` | Yes | **defer** | Legacy set exists, but references appear in historical plan/docs payloads; needs explicit active-reference verification pass first. | Complete full reference audit and confirm no active tooling loads from this path. |
| `backup/post-consolidation-agents/` | No | **defer** | Candidate path not present in current workspace. | None; remove from execution list unless it reappears. |
| `backup/DashboardViewProvider.before-restore.ts` | No | **defer** | Candidate file not present in current workspace. | None; remove from execution list unless it reappears. |
| `agent_use-logDumps.txt` | Yes | **defer** | Referenced in historical research docs (`replay-input-inventory.md`) and prior replay artifacts. | Decide whether historical-research links must remain path-stable; if not, include link/path update plan. |
| `chat_copy_from_other_workspace.md` | Yes | **archive-now** | Standalone transfer artifact; no active runtime coupling observed. | User approval gate only. |
| `copied_devtools_log.md` | Yes | **archive-now** | Standalone copied log artifact; no active runtime coupling observed. | User approval gate only. |
| `copied_logs.txt` | Yes | **archive-now** | Standalone copied log artifact; no active runtime coupling observed. | User approval gate only. |
| `copied_terminal_output.txt` | Yes | **archive-now** | Standalone copied output artifact; no active runtime coupling observed. | User approval gate only. |
| `copied_terminal_output-successful_connection_to_VMssh.txt` | Yes | **archive-now** | Standalone copied output artifact; no active runtime coupling observed. | User approval gate only. |
| `html_containing_icons.html` | Yes | **defer** | Referenced in historical chat-history docs; likely safe to archive but currently path-referenced in docs. | Confirm whether doc-history links should remain valid. |
| `incomplete.txt` | Yes | **archive-now** | Isolated root scratch artifact; no active runtime coupling observed. | User approval gate only. |
| `Playwright Test Report.html` | Yes | **archive-now** | Root test artifact snapshot; not part of runtime execution path. | User approval gate only. |

### Proposed Approval Batch A (Low Risk)
- `chat_copy_from_other_workspace.md`
- `copied_devtools_log.md`
- `copied_logs.txt`
- `copied_terminal_output.txt`
- `copied_terminal_output-successful_connection_to_VMssh.txt`
- `incomplete.txt`
- `Playwright Test Report.html`

### Keep/Defer Summary
- **keep (hard constraint):** `agents-v2/`, `instructions-v2/`
- **defer (needs explicit decision/audit):** `agents-deprecated/`, `agent_use-logDumps.txt`, `html_containing_icons.html`, and non-existent backup candidates

---

## Comparison vs Tag `work-machine-snapshot-2026-02-21`

Comparison baseline used:
- Tag checkout at `C:\Users\User\Project_Memory_MCP\git_Tag-work-machine-snapshot` (detached at `work-machine-snapshot-2026-02-21`)
- Current workspace head in `Project-Memory-MCP`

### Commit Delta
- **Ahead of tag:** 11 commits
- **Behind tag:** 0 commits

### Post-Tag Change Footprint (by top-level area)
- `server/` (99 files)
- `interactive-terminal/` (29 files)
- `vscode-extension/` (28 files)
- `instructions-v2/` (28 files)
- `pm-gui-forms/` (27 files)
- `dashboard/` (27 files)
- `supervisor/` (26 files)
- `agents/` + `agents-v2/` + `agents-deprecated/` (47 files combined)

### Systems Added or Expanded Since Tag
- **Supervisor + Extension integration expansion**
  - Added full `supervisor/` crate and extension supervisor modules under `vscode-extension/src/supervisor/`.
- **Program v2 infrastructure growth**
  - Added `server/src/storage/program-store.ts` and full `server/src/tools/program/*` suite.
- **Preflight/contract validation layer**
  - Added `server/src/tools/preflight/*` modules.
- **GUI orchestration stack additions**
  - Added `pm-gui-forms/`, `pm-approval-gui/`, `pm-brainstorm-gui/` crates/apps and routing tests.
- **Dashboard schema-v2 rendering improvements**
  - Added phase/risk/stats/skills components and hooks in `dashboard/src/components/plan/` and `dashboard/src/hooks/`.

### Test Surface Added Since Tag (high-level)
- New test modules were added across:
  - `server/src/__tests__/tools/` (program tools, advisory flows, supervisor client, GUI routing)
  - `supervisor/tests/` (form app integration, lock, observability)
  - `vscode-extension/src/test/supervisor/` (activation/detect/ready/degraded/settings)
  - `pm-gui-forms/tests/` (protocol/timer/window transport/refinement)
  - `dashboard/src/__tests__/components/` (paused plan banner)