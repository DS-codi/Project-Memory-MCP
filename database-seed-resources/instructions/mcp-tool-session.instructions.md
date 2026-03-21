---
applyTo: "**/*"
---

# memory_session — Tool Reference

Session ID minting and prompt enrichment for native subagent launches. Hub agents call this **before** `runSubagent` to prepare context-rich spawn payloads.

> **This tool does NOT execute spawns.** It prepares — the caller executes with native `runSubagent`.

**Spoke agents** must not use `memory_session` to spawn other agents. Use `memory_agent(action: handoff)` instead to recommend the next agent to the hub.

---

## Actions

### `prep`

Mint a session ID and enrich a prompt with workspace/plan context, scope boundaries, and anti-spawning instructions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"prep"` |
| `workspace_id` | string | — | Workspace ID |
| `plan_id` | string | — | Plan ID |
| `agent_name` | string | — | Target agent name (e.g. `"Executor"`) |
| `prompt` | string | — | Base prompt to enrich |
| `compat_mode` | string | — | `"strict"` (canonical `prep_config` only) or `"legacy"` (also returns deprecated `spawn_config` alias). Default: strict |
| `parent_session_id` | string | — | Parent session ID for lineage tracking |
| `prep_config` | object | — | Scope boundaries config (see below) |
| `requested_hub_label` | string | — | Hub label for policy enforcement |
| `current_hub_mode` | string | — | Current canonical hub mode |

**`prep_config.scope_boundaries`:**

| Field | Type | Description |
|-------|------|-------------|
| `files_allowed` | string[] | Files the subagent may modify |
| `directories_allowed` | string[] | Directories for new file creation |
| `scope_escalation_instruction` | string | Custom scope escalation instruction |

**Returns:** `{ prep_config: { session_id, agent_name, enriched_prompt, ... } }`

**When to use:** When you need prompt enrichment and session ID minting but not a full deployment context bundle.

**Example:**
```json
{
  "action": "prep",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123",
  "agent_name": "Executor",
  "prompt": "Implement the payment refund endpoint...",
  "compat_mode": "strict",
  "prep_config": {
    "scope_boundaries": {
      "files_allowed": ["src/payments/refund.ts"],
      "directories_allowed": ["src/payments"]
    }
  }
}
```

Then launch:
```json
runSubagent({
  "agentName": "Executor",
  "prompt": "<prep_config.enriched_prompt>"
})
```

---

### `deploy_and_prep`

Deploy a context bundle (skills, instructions, research, architecture) **and** prepare an enriched prompt in one call. Preferred over calling `memory_agent(action: deploy_for_task)` + `prep` separately.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"deploy_and_prep"` |
| `workspace_id` | string | — | Workspace ID |
| `plan_id` | string | — | Plan ID |
| `agent_name` | string | — | Target agent name |
| `prompt` | string | — | Base prompt to enrich |
| `compat_mode` | string | — | `"strict"` or `"legacy"` |
| `parent_session_id` | string | — | Parent session ID for lineage |
| `phase_name` | string | — | Current phase name |
| `step_indices` | number[] | — | Step indices to work on |
| `include_skills` | boolean | — | Include skills in deployment context |
| `include_research` | boolean | — | Include research notes |
| `include_architecture` | boolean | — | Include architecture context |
| `prep_config` | object | — | Scope boundaries (same as `prep`) |
| `provisioning_mode` | string | — | `"on_demand"` or `"compat"` |
| `allow_legacy_always_on` | boolean | — | Allow legacy always-on behavior (compat) |
| `allow_ambient_instruction_scan` | boolean | — | Allow ambient instruction discovery fallback |
| `allow_include_skills_all` | boolean | — | Allow broad skill discovery fallback |
| `strict_bundle_resolution` | boolean | — | Prefer explicit bundle IDs; minimize ambient discovery |
| `requested_scope` | string | — | `"task"`, `"phase"`, or `"plan"` |
| `prompt_analyst_output` | object | — | PromptAnalyst output payload for deploy contract |
| `hub_decision_payload` | object | — | Hub decision payload for spoke bundle resolution |
| `fallback_policy` | object | — | Fallback policy metadata |
| `telemetry_context` | object | — | Telemetry context for tracing |

**Returns:** `{ prep_config: { session_id, agent_name, enriched_prompt, ... } }`

**When to use:** Standard hub-to-spoke spawn for all orchestrated workflows. Ensures the spoke receives scoped context and a session-tracked prompt.

**Example:**
```json
{
  "action": "deploy_and_prep",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123",
  "agent_name": "Executor",
  "prompt": "Implement step 3: payment refund endpoint",
  "compat_mode": "strict",
  "phase_name": "Implement",
  "step_indices": [2],
  "include_skills": true,
  "prep_config": {
    "scope_boundaries": {
      "files_allowed": ["src/payments/refund.ts"],
      "directories_allowed": ["src/payments"]
    }
  }
}
```

Then:
```json
runSubagent({
  "agentName": "Executor",
  "prompt": "<prep_config.enriched_prompt>"
})
```

---

### `list_sessions`

Query sessions recorded in plan state.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_sessions"` |
| `workspace_id` | string | — | Workspace ID |
| `plan_id` | string | — | Plan ID |
| `status_filter` | string | — | `"active"`, `"stopping"`, `"completed"`, or `"all"` |

**Returns:** Array of session records with agent type, status, started/completed times, and session IDs.

**When to use:** Hub wants to verify no orphaned sessions are running before spawning a new spoke.

---

### `get_session`

Find a specific session by ID.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_session"` |
| `session_id` | string | ✅ | Session ID to look up |
| `workspace_id` | string | — | Workspace ID |

**Returns:** Single session record, or `success: false` if not found.

---

## Hub-mode policy parameters

These parameters are used by hub agents that participate in the canonical hub-mode policy enforcement system. Spokes do not set these.

| Parameter | Type | Description |
|-----------|------|-------------|
| `requested_hub_label` | enum | `Coordinator`, `Analyst`, `Runner`, `TDDDriver`, `Hub` |
| `current_hub_mode` | enum | `standard_orchestration`, `investigation`, `adhoc_runner`, `tdd_cycle` |
| `previous_hub_mode` | enum | Same options as current |
| `requested_hub_mode` | enum | Same options as current |
| `transition_event` | string | Transition event tag (for hub mode changes) |
| `transition_reason_code` | string | Transition reason code |
| `prompt_analyst_enrichment_applied` | boolean | Whether PromptAnalyst pre-dispatch enrichment was applied |
| `bypass_prompt_analyst_policy` | boolean | Bypass PromptAnalyst requirement for explicit unavailable fallback only |
| `prompt_analyst_latency_ms` | number | PromptAnalyst enrichment latency for telemetry |
| `peer_sessions_count` | number | Known peer session count at dispatch time |

---

## Key rules

1. `deploy_and_prep` and `prep` are **prep-only** — they never launch agents themselves.
2. `compat_mode: "strict"` returns canonical `prep_config`; `"legacy"` also includes deprecated `spawn_config` alias — migrate to strict.
3. Always pass `enriched_prompt` to `runSubagent`, not the original base prompt.
4. Spoke agents receiving `_session_id` in their enriched prompt must include it in every MCP tool call for session tracking and interrupt delivery.
