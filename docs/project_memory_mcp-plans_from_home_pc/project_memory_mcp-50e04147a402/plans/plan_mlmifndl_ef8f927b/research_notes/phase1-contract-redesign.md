---
plan_id: plan_mlmifndl_ef8f927b
created_at: 2026-02-14T16:15:49.045Z
sanitized: false
injection_attempts: 0
warnings: 0
---


## Step 2 — Compatibility Strategy (Shim/Warnings/Fallback)

### Objective
Migrate existing callers from ambiguous "spawn" semantics to explicit prep-then-native-spawn flow with zero orchestration breakage during transition.

### Compatibility Model
1. **Legacy-Compatible Response Window (default `compat_mode=legacy`)**
   - Return both:
     - `prep_config` (new canonical)
     - `spawn_config` (legacy alias, same content)
   - Include warning when legacy field is consumed/selected by caller workflows.

2. **Strict Mode (`compat_mode=strict`)**
   - Return only canonical prep fields.
   - Emit deterministic validation error if caller expects execution semantics.

3. **Fallback Rules**
   - If caller omits `compat_mode`, default to `legacy` until deprecation deadline.
   - If caller passes deprecated execution-centric args, ignore safely and append warning code `SPAWN_PREP_DEPRECATED_INPUT_IGNORED`.
   - If workspace/plan context retrieval fails, still return minimally prepared prompt with explicit warning list and `context_sources_partial=true`.

### Warning and Telemetry Contract
Return warning envelope:
```json
{
  "warnings": [
    {
      "code": "SPAWN_PREP_ONLY",
      "message": "memory_spawn_agent no longer executes spawns; call runSubagent next."
    },
    {
      "code": "SPAWN_PREP_LEGACY_ALIAS",
      "message": "spawn_config is deprecated; migrate to prep_config."
    }
  ],
  "deprecation": {
    "legacy_alias_supported": true,
    "target_removal_phase": "Phase 3",
    "migration_action": "Switch callers to prep_config + native runSubagent"
  }
}
```

### Migration Rollout (No-Break Sequence)
1. **Phase 1 (this plan):** introduce prep-only contract + dual-field compatibility.
2. **Phase 2:** update all hub callers/templates/docs to canonical field names and explicit native execution step.
3. **Phase 3:** disable legacy alias by default behind feature flag; allow emergency fallback toggle.
4. **Phase 4:** remove alias and deprecated inputs after telemetry indicates zero usage.

### Concrete File Targets for Compatibility Implementation
1. `vscode-extension/src/chat/tools/spawn-agent-tool.ts` (dual-field shim + warnings + strict/legacy behavior)
2. `vscode-extension/package.json` (schema docs for compat_mode and prep-only wording)
3. `vscode-extension/src/chat/ToolProvider.ts` (tool metadata/version notes if needed)
4. `agents/coordinator.agent.md` (caller flow update: prep then native spawn)
5. `agents/analyst.agent.md` (same flow update)
6. `agents/runner.agent.md` (same flow update)
7. `instructions/handoff-protocol.instructions.md` (remove unsupported `memory_agent(action: spawn)` requirement, keep native spawn path)
8. `vscode-extension/src/chat/tools/agent-tool.ts` (guardrail messaging if stale spawn action docs are invoked)
9. `vscode-extension/src/chat/orchestration/spawn-reason-codes.ts` (deprecation/new warning codes)

### Ordered Implementation Checklist for Executor
1. Update `memory_spawn_agent` schema + descriptions to "context-prep only".
2. Implement canonical return payload and set `execution.spawn_executed=false` invariant.
3. Add legacy alias shim (`spawn_config`) mapped from canonical `prep_config`.
4. Add warning/deprecation envelope and strict/legacy mode handling.
5. Remove prep-path dependence on active lane-lock semantics.
6. Patch hub docs/templates to explicit `memory_spawn_agent` -> `runSubagent` flow.
7. Add/adjust tests for prep-only invariant, compatibility alias, and no-execution behavior.
8. Add telemetry/deprecation assertions and migration notes.
