# Dynamic Agent System Review — 2 March 2026

**Scope:** Research review of the Context-Scoped Orchestration Overhaul program, DB-first migration, and coordinator agent patterns — informing the design of the Hub/PromptAnalyst/Shell dynamic agent architecture.

---

## 1. Executive Summary

The current dynamic Hub/PromptAnalyst/Shell architecture was shaped by two completed programs and an active migration plan. This review documents what was actually built, what patterns were established, and why the agent files were updated the way they were.

The principal finding is that the old Coordinator agent contained a complete, proven orchestration model that the dynamic Hub agent should replicate in adapted form. The two programs below implemented the server-side infrastructure (deploy_for_task, session minting, cleanup lifecycle) that makes on-demand spoke provisioning possible. The active DB-first migration established that role definitions, instructions, and skills now live in the database and are resolved at spawn time via `memory_agent(action: get_instructions)` rather than from repo files.

---

## 2. Research Scope

Sources reviewed:
- Plan `plan_mlrzgmy4_d5dc2788` — Agent & Context Deployment System (archived, complete)
- Plan `plan_mlrzipir_e5286925` — Hub Interaction Discipline (archived, complete)
- Plan `plan_mlrzfbgy_e50be118` — Context-Scoped Orchestration Overhaul (parent program, archived)
- Plan `plan_mm7a4r0u_ae7a328a` — DB-first Agent/Instruction/Skill Migration + Hub Workflow Re-architecture (active, all steps done)
- `Project-Memory-MCP/_archive/agents/coordinator.agent.md` — the legacy hub agent (735 lines)
- `server/src/tools/consolidated/memory_session.ts` — session management tool (826 lines)
- `server/src/tools/consolidated/memory_agent.ts` — agent lifecycle tool

---

## 3. Context-Scoped Orchestration Overhaul Program

**Program:** `plan_mlrzfbgy_e50be118` — *Context-Scoped Orchestration Overhaul*

This was a 10-plan integrated program. The two plans most relevant to the current agent design are documented here.

### 3.1 Plan: Agent & Context Deployment System (`plan_mlrzgmy4_d5dc2788`)

**Status:** Archived, all 16/16 steps complete across 5 phases.

**What was built:**

This plan implemented the on-demand agent deployment infrastructure that makes the Hub/Shell model possible.

#### New server-side modules (created by this plan)

| Module | Purpose |
|--------|---------|
| `server/src/types/deploy.types.ts` | `DeployForTaskParams`, `ContextBundle`, `ActiveAgentManifest`, `DeployForTaskResult` types |
| `server/src/types/investigation.types.ts` | `Investigation`, `InvestigationPhaseName`, `InvestigationStatus` types |
| `server/src/storage/projectmemory-paths.ts` | 13 path-helper functions for `.projectmemory/` directory layout |
| `server/src/tools/agent-deploy.ts` | `buildContextBundle`, `deployForTask`, `cleanupAgent` — the core deployment module |

#### Key behaviours implemented

**`deployForTask`** — writes to `.projectmemory/active_agents/{agentName}/`:
- `{name}.agent.md` — the agent's instruction file
- `manifest.json` — deployment metadata (plan, phase, steps, timestamps)
- `context/context-bundle.json` — assembled context bundle (research, architecture, execution notes, handoff data, skills, workspace context, knowledge)
- `instructions/` — any matched instruction files

**`buildContextBundle`** — assembles from 8 sources:
1. Research notes
2. Architecture decisions
3. Handoff data from previous agent
4. Phase context
5. Matched skills
6. Instruction files
7. Workspace context
8. Knowledge files

All sources are individually try/catch guarded — missing sources do not fail the deploy.

**`cleanupAgent`** — idempotent cleanup on handoff/complete:
- Moves execution notes to `reviewed_queue/{planId}/{name}_{timestamp}/`
- Removes `active_agents/{name}/` directory

**`memory_agent` integration:** The `deploy_for_task` action was added to the memory_agent tool, with handoff and complete lifecycle hooks that automatically call `cleanupAgent`. This is the path that `memory_session(action: deploy_and_prep)` superseded as the preferred spawn flows consolidated.

#### Architecture decisions from this plan

- **A3-1:** Cleanup must live in `memory_agent.ts` at the handoff/complete points, not in a separate tool — ensures cleanup always runs.
- **A3-2:** `agent-deploy.ts` is a standalone module (not merged into `agent.tools.ts`) to keep under 300 lines.
- **A3-3:** `.projectmemory/` paths get their own helper file (`projectmemory-paths.ts`) to avoid path construction scattered across the codebase.
- **A3-4:** Investigation storage uses MCP data root, not the workspace filesystem.
- **A3-5:** Context bundle assembly failures are graceful — shell agents still launch even if some context sources are unavailable.
- **A3-6:** `AGENTS_ROOT` and `INSTRUCTIONS_ROOT` are exported from `agent.tools.ts` for use by deploy module.
- **A3-7:** Investigation workflow types are separate from deploy types to maintain single-responsibility modules.

---

### 3.2 Plan: Hub Interaction Discipline (`plan_mlrzipir_e5286925`)

**Status:** Archived, all 11/11 steps complete across 6 phases.

**What was built:**

This plan established the pause protocol, pre-action summary format, and auto-continue rules that govern Hub behaviour between spoke spawns.

#### Files created

| File | Purpose |
|------|---------|
| `instructions-v2/hub-interaction-discipline.instructions.md` | Shared policy (176 lines): Pause Policy, Pre-Action Chat Summary, Auto-Continue Suggestion, Category-Dependent Pause Rules, User Override Commands, Hub-Specific Considerations |
| Updates to `agents-v2/coordinator.agent.md` | Orchestration loop pseudocode with `pause_and_summarize()`, `auto_continue_active`, `should_always_pause()` |
| Updates to `agents-v2/analyst.agent.md` | Investigation-specific pause rules (pause between cycles, not within) |
| Updates to `agents-v2/runner.agent.md` | Lighter quick_task auto-continue default, escalation pause protocol |
| Updates to `agents-v2/tdd-driver.agent.md` | TDD cycle-boundary pauses (not within RED→GREEN→REFACTOR) |

#### Key policy decisions

**Category-dependent pause rules:**
- `orchestration`, `program`, `critical`/`high` priority — always pause, not overrideable
- `quick_task` — auto-continue by default
- `feature`, `bugfix`, `refactor` — pause by default, user can enable auto-continue

**Pre-action summary format (mandatory, non-disableable):**
```
✅ <what just completed>
➡️  Deploying <Role> to <task>
📋 Expected: <outcome>
```

**User override commands:** `"auto-continue"` (skip pauses), `"pause"` (re-enable), `"continue"`/`"go"` (proceed once).

**Auto-continue suggestion criteria:** Suggest at plan approval when ≤4 steps, ≤2 phases, not critical/high/orchestration/program.

**TDDDriver specifics:** Pauses between complete TDD cycles (after REFACTOR), not within RED→GREEN→REFACTOR. Auto-continue eligible for plans with ≤3 total cycles.

---

## 4. DB-First Migration Plan (`plan_mm7a4r0u_ae7a328a`)

**Status:** Active, all 18/18 steps done. Awaiting archival.

**What was executed:**

### Phase 1 — DB Coverage (Steps 0–4, complete)

- Inventoried all `.github/instructions` and `.github/skills` files
- Confirmed DB schema mappings for instruction and skill definitions
- Implemented idempotent upsert semantics: `storeInstruction`, `storeSkill`, `storeAgent`
- Validated 29/29 instructions and 20/20 skills in DB
- **DB-first runtime resolution implemented:** Skills now load from `skill_definitions` first; instruction deployment loads from `instruction_files` first; `getAgentInstructions` and `listAgents` prefer `agent_definitions`

This is the critical step that makes `memory_agent(action: get_instructions, agent_name: "Executor")` work as the authoritative role-instruction lookup.

### Phase 2 — Repo Cleanup (Steps 5–8, complete)

- Minimal retained `.github` policy: Hub + PromptAnalyst agents + 16 core MCP/system instructions + 13 system-relevant skills
- All other agent, instruction, and skill files archived to `archive/Project-Memory-MCP-meta-2026-03-01/root-.github-archived/`
- New `hub-interaction-discipline.instructions.md` authored, aligned to PromptAnalyst-driven routing
- A `database-seed-resources/` bundle created for reproducibility

### Phase 3 — Deployable Hub Model (Steps 9–15, complete)

- **Migration 007 added:** New DB tables `deployable_agent_profiles` and `category_workflow_definitions`, linked to deployable profiles and agent definitions
- Hub and PromptAnalyst are now registered as deployable agent profiles in the DB, not just markdown files

### Phase 4 — Reproducibility (Step 16, complete)

- Export/import tooling for DB state reproducibility across machines

### Phase 0 — Process Reliability (Steps 17–18, added late, complete)

- PM lifecycle instrumentation gap identified and resolved
- PM-first protocol established for all subsequent execution

---

## 5. Coordinator Agent Analysis

The legacy `coordinator.agent.md` (735 lines) was the most thoroughly designed and proven agent in the old system. The following patterns from it were directly incorporated into the dynamic Hub design.

### 5.1 Startup sequence

Original Coordinator startup:
1. Register workspace via `memory_workspace(action: register)` — get canonical `workspace_id`
2. Init session via `memory_agent(action: init)` — check `orphaned_sessions`
3. Check workspace context staleness and populate if empty
4. Pass canonical `workspace_id` to every spawned subagent

This became Hub's **Startup Protocol** (see design document).

### 5.2 Spawn protocol (Coordinator's `deploy_and_prep`)

The Coordinator had moved to a preferred 3-step spawn flow:
```
1. memory_session(action: deploy_and_prep) → prep_config.enriched_prompt
2. runSubagent({ agentName: "...", prompt: prep_config.enriched_prompt })
```

`deploy_and_prep` superseded the legacy two-step path (`memory_agent(action: deploy_for_task)` + `memory_session(action: prep)`). Both paths remain supported but `deploy_and_prep` is canonical.

### 5.3 Phase loop (per-phase orchestration)

The Coordinator's per-phase loop was:
```
1. Executor       → Implement phase steps
2. Reviewer       → Build-check + code review (regression check if pre_plan_build_status='passing')
   ├─ Issues      → Revisionist → Executor → loop
   └─ Approved    → continue
3. Tester         → WRITE tests (do not run yet)
```

After all phases:
```
4. Tester         → RUN all tests
5. Failures       → Revisionist → Executor → re-test
6. Reviewer       → Final comprehensive build verification
7. Archivist      → Commit, document, archive plan
```

This exact pattern now informs Hub's `standard_orchestration` workflow loop.

### 5.4 Session recovery

On re-init, the Coordinator checked `orphaned_sessions` in the `memory_agent(action: init)` response. If found, it followed a recovery protocol:
1. `git diff --stat` — assess changed files
2. Check plan for steps stuck in `active` status
3. Check compile errors
4. Ask user what went wrong
5. Revert, reset, or continue based on response

This became Hub's **Recovery gate** in the Startup Protocol.

### 5.5 Progress tracking (post-spoke gate)

After every subagent returned, the Coordinator:
1. Called `memory_plan(action: get)` to read updated step statuses
2. Read `recommended_next_agent`
3. Checked `goals` and `success_criteria` arrays
4. Verified all assigned steps were `done` (not still `pending`/`active`)
5. Refused to advance if steps were incomplete or notes were vague

This is Hub's **Post-spoke validation gate** — the most frequently violated discipline in the old system.

### 5.6 V1 plan migration

The Coordinator had a migration gate on `continue`/`resume` flows: if a plan had `schema_version < '2.0'`, it spawned a Migrator spoke before normal orchestration. The Hub model does not currently include this explicitly — it can be added if legacy plans are encountered.

### 5.7 GUI routing (Brainstorm and approval gates)

The Coordinator routed Brainstorm decisions and approval gates through native GUI form apps when the Supervisor was running. Fallback was always chat-only mode. Hub's Shell model can replicate this via appropriate role instructions when needed.

### 5.8 Request categorisation

The Coordinator had 7 categories:

| Category | Workflow |
|----------|---------|
| `feature` | Research → Brainstorm → Architect → Execute loop |
| `bugfix` | Hub checks cause clarity → investigation-first if unknown → Architect → Execute |
| `refactor` | Research → Architect → Execute |
| `orchestration` | Research → Brainstorm → Architect → Execute (always full) |
| `program` | Meta — decomposes into child plans |
| `quick_task` | Hub → Runner/Executor directly, no formal plan |
| `advisory` | Conversational only, no action |

In the dynamic Hub model, these categories map to PromptAnalyst's `scope_classification` and `hub_mode` outputs. PromptAnalyst performs the categorisation and Hub routes on the result.

---

## 6. Session Context Propagation — Finding

**Issue identified:** The hub.agent.md Spawn Protocol step 3 did not explicitly state that `session_id` (minted by `deploy_and_prep`), `plan_id`, `current_phase`, and `step_indices` must be embedded in the Shell spawn prompt, even though `deploy_and_prep` makes these available in `prep_config`.

Shell agents must know these identifiers to:
- Call `memory_steps(action: update, workspace_id: ..., plan_id: ..., step_index: N, status: "active")` correctly
- Call `memory_agent(action: handoff, workspace_id: ..., plan_id: ..., session_id: ...)` with accurate context
- Reference their session in all MCP tool calls

**Resolution:** The Dynamic Spoke Deployment section of hub.agent.md now lists session context (workspace_id, plan_id, session_id, current_phase, step_indices) as a required item (item 2) in every spoke prompt. The Spawn Protocol step 3 was made explicit about capturing `prep_config.session_id` before composing the spawn call.

---

## 7. Summary of Implications for Hub/Shell Design

| Pattern | Source | Status in Hub |
|---------|--------|---------------|
| Startup protocol (register → init → check orphans) | Coordinator | ✅ Added |
| `deploy_and_prep` as mandatory pre-spawn step | Agent & Context Deployment System | ✅ Present |
| Session ID + plan/phase/step propagated to Shell | `memory_session.ts` PrepResult type | ✅ Added |
| Role instructions pulled from DB via `get_instructions` | DB-first Migration | ✅ Present |
| Phase loop: Executor → Reviewer → Tester → (final) Tester → Reviewer → Archivist | Coordinator | ✅ Added |
| Post-spoke validation gate | Coordinator | ✅ Present |
| Pre-action summary + pause protocol | Hub Interaction Discipline Plan | ✅ Added |
| Auto-continue by mode | Hub Interaction Discipline Plan | ✅ Added |
| Recovery gate on orphaned sessions | Coordinator | ✅ Added |
| Progress tracking (goals/success_criteria) | Coordinator | ✅ Added |
| Scope routing from PromptAnalyst classification | Dynamic Hub design | ✅ Present |
| DB-first role definitions | DB-first Migration | ✅ Present |
| `.projectmemory/active_agents/` lifecycle | Agent & Context Deployment System | ✅ Server-side (automatic on handoff/complete) |

---

*Generated: 2 March 2026*
