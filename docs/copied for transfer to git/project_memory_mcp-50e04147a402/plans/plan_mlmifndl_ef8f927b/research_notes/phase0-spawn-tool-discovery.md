---
plan_id: plan_mlmifndl_ef8f927b
created_at: 2026-02-14T16:13:03.023Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Phase 0 Discovery — Spawn Tool Audit (plan_mlmifndl_ef8f927b)

### 1) Current `memory_spawn_agent` Behavior Summary

Observed implementation (`vscode-extension/src/chat/tools/spawn-agent-tool.ts`):

- Accepts `agent_name`, `prompt`, optional `workspace_id`, `plan_id`, and `scope_boundaries`.
- Validates target against static `KNOWN_AGENTS`.
- Optionally enriches prompt with:
  - workspace context (`memory_workspace` `info`),
  - plan context (`memory_plan` `get`),
  - scope-boundary block,
  - anti-spawning text for **target spoke agents**.
- Performs lane bookkeeping through `active-run-registry` (`acquire`, duplicate debounce, optional queue1 policy, stale detection/recovery, cancel/error release).
- Returns `spawn_config` (enriched prompt + orchestration metadata) and **does not execute actual subagent spawn**.

Net: current code is already context-prep/config generation, not true execution; however public contract/docs still describe it as a spawn executor.

---

### 2) Call-Site Inventory (file + symbol + purpose)

#### A. Runtime code call sites (directly coupled to spawn behavior)

1. `vscode-extension/src/chat/ToolProvider.ts`
   - Symbol: `registerTools()` -> `vscode.lm.registerTool('memory_spawn_agent', ...)`
   - Purpose: tool registration and invocation binding to `handleSpawnAgentTool`.

2. `vscode-extension/src/chat/tools/index.ts`
   - Symbol: barrel export `handleSpawnAgentTool`
   - Purpose: export path consumed by `ToolProvider`.

3. `vscode-extension/src/chat/tools/spawn-agent-tool.ts`
   - Symbol: `handleSpawnAgentTool`
   - Purpose: request validation, prompt/context enrichment, lane handling, return `spawn_config`.

4. `vscode-extension/src/chat/orchestration/active-run-registry.ts`
   - Symbols: `acquire`, `release`, `markCancelled`, `isStale`
   - Purpose: per `(workspace_id, plan_id)` lane gate and reason-coded lifecycle bookkeeping.

5. `vscode-extension/src/chat/orchestration/spawn-reason-codes.ts`
   - Symbol: `SPAWN_REASON_CODES`
   - Purpose: reason-code contract consumed by spawn handler + registry.

6. `vscode-extension/package.json`
   - Tool declaration: `memory_spawn_agent` schema/model description.
   - Purpose: user/model-facing contract and invocation schema.

#### B. Runtime-adjacent orchestrator callers (depend on spawn semantics in prompts/instructions)

7. `agents/coordinator.agent.md`
   - Calls: `runSubagent(...)` and explicit REQUIRED pre-step `memory_agent(action: spawn)`.
   - Purpose: hub workflow definition for subagent launches.

8. `agents/analyst.agent.md`, `agents/runner.agent.md`
   - Calls: `runSubagent(...)` templates.
   - Purpose: hub orchestration flow relying on stable native subagent spawn path.

9. `instructions/handoff-protocol.instructions.md`
   - Section: `Spawn Tool (memory_agent action: spawn)`.
   - Purpose: global policy text for hub/spoke spawn behavior.

10. `vscode-extension/src/chat/tools/agent-tool.ts`
    - Symbol: `handleAgentTool` action switch.
    - Purpose: currently supports `init|complete|handoff|validate|list|get_instructions` only; no `spawn` action.

---

### 3) Failure Mode Inventory (what breaks / trigger / impact)

1. **Contract contradiction: tool says “spawn” but returns config only**
   - Trigger: caller expects `memory_spawn_agent` to launch subagent.
   - Impact: no subagent launch unless caller manually chains to native `runSubagent`; orchestration silently stalls or appears broken.

2. **Hub gate not enforced for caller**
   - Trigger: spoke or unknown caller invokes `memory_spawn_agent`.
   - Impact: tool can return valid config despite policy “only hubs can spawn”; policy enforcement is incomplete (it only injects anti-spawn text based on target role).

3. **Lane deadlock risk due missing release integration with lifecycle tools**
   - Trigger: successful `acquire` in spawn tool followed by normal downstream flow; no matching `release` from `memory_agent` handoff/complete path.
   - Impact: subsequent spawn requests for same lane return `SPAWN_REJECT_ACTIVE_LANE` (or queue) until stale timeout (10 min) or manual recovery path.

4. **Queue policy is write-only (`queue1`), no dequeue/consumer path**
   - Trigger: lane busy with `spawnLanePolicy=queue1`.
   - Impact: requests can be marked queued but never promoted/executed; opaque backlog behavior.

5. **Instruction/runtime mismatch: `memory_agent(action: spawn)` documented but unsupported in extension tool handler**
   - Trigger: Coordinator/instructions follow mandatory pre-spawn guidance.
   - Impact: invalid-action failures or fallback confusion; raises orchestration uncertainty and inconsistent agent behavior.

6. **Historical decision drift captured in `plan_mllc6x7s_5254485e`**
   - Trigger: conflicting plan notes (“validation+context-enrichment only” vs “replacement that actually spawns”).
   - Impact: ambiguous source of truth; implementations and instructions diverge, causing repeated regressions and rework.

7. **No dedicated tests for spawn-tool orchestration contract**
   - Trigger: refactors to spawn handler/agent tool/instructions.
   - Impact: regressions in lane semantics, action compatibility, and policy enforcement likely to escape CI.

8. **Problem statement already confirms field failure**
   - Trigger: real-world use during `plan_mllc6x7s_5254485e` concluded custom spawn execution is not viable.
   - Impact: corrective plan required (`plan_mlmifndl_ef8f927b`) to repurpose tool as context-prep only.

---

### 4) Constraints for Redesign

- Keep actual agent launch on native platform path (`runSubagent`), not custom tool execution.
- Preserve/upgrade pre-spawn context quality (workspace/plan/scope/anti-spawn guidance).
- Maintain backward compatibility where practical for existing callers expecting `memory_spawn_agent` output fields.
- Remove false guarantees (no claims of actual spawning unless performed).
- Avoid broad refactors in Phase 0; focus on contract clarity + minimal migration path.

---

### 5) Recommended Minimal Migration Sequence (Actionable Map)

1. **Freeze contract language first**
   - Update tool description/schema docs to “context preparation only”.
   - Rename output docs to explicit `spawn_prep` semantics (keep compatibility aliases if needed).

2. **Deprecate unsupported spawn gateway guidance**
   - Remove/replace `memory_agent(action: spawn)` mandates in:
     - `agents/coordinator.agent.md`
     - `instructions/handoff-protocol.instructions.md`
   - Standardize: `memory_spawn_agent` (prep) -> `runSubagent` (execute).

3. **Uncouple prep from lane blocking (or make lane release deterministic)**
   - Minimal option A (preferred): remove active-run lane acquisition from context-prep path.
   - Minimal option B: keep lane only if lifecycle release hooks are wired in `memory_agent` complete/handoff and guaranteed.

4. **Add compatibility shim response shape**
   - Return both current keys (`spawn_config`) and explicit new keys (`prep_config`) during migration window.
   - Add warning field when caller treats prep as execution.

5. **Patch caller flows**
   - Update hub templates/prompts to explicitly perform:
     1) prep via `memory_spawn_agent`,
     2) execution via `runSubagent` using enriched prompt.

6. **Add focused tests before broad rollout**
   - Unit tests for prep-only behavior, policy checks, and no-execution guarantee.
   - Regression tests for coordinator/runner/analyst prompt templates and lifecycle continuity.

7. **Finalize and prune legacy paths**
   - After migration, remove deprecated/ambiguous fields and stale reason-code semantics tied to execution lanes if not needed.

---

### Key Files for Architect/Executor

- `vscode-extension/src/chat/tools/spawn-agent-tool.ts`
- `vscode-extension/src/chat/orchestration/active-run-registry.ts`
- `vscode-extension/src/chat/orchestration/spawn-reason-codes.ts`
- `vscode-extension/src/chat/ToolProvider.ts`
- `vscode-extension/src/chat/tools/agent-tool.ts`
- `vscode-extension/package.json`
- `agents/coordinator.agent.md`
- `instructions/handoff-protocol.instructions.md`
