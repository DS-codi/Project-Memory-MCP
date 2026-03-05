# Agent Workflow Handoff Graph

**Plan:** Consumer Integration & Validation: agent routing usage, tests, and cross-surface docs  
**Phase:** Planning  
**Step:** 2 — Agent workflow handoff graph  
**Status:** Specification (Phase B — update agent files to use cartographer once registered)

---

## Overview

This document maps how `memory_cartographer` integrates with each spoke agent role in the hub-and-spoke system. It covers: the agent consumer map (which role uses which domains), authorization boundaries, the handoff sequence through a cartographer-aware workflow, `_session_id` threading requirements, ownership boundaries per role, and stop/injection interaction during in-flight cartography calls.

> **Phase note:** This document is a Phase B planning artifact. Agent instruction files are not modified until Phase A (tool registration) is complete and accepted.

---

## 1. Agent Consumer Map

The following table maps each spoke agent role to the `memory_cartographer` domains and actions relevant to its mission.

| Agent Role | Primary Domains | Key Actions | Phase |
|------------|----------------|-------------|-------|
| **Hub / Coordinator** | `dependencies_dependents` | `bounded_traversal`, `get_plan_dependencies` | Phase A |
| **Hub / Coordinator** | `database_map_access` | `db_map_summary`, `context_items_projection` | Phase A |
| **Researcher** | `cartography_queries` | `summary`, `file_context`, `flow_entry_points`, `search` | Phase B |
| **Architect** | `cartography_queries` | `layer_view`, `summary` | Phase B |
| **Architect** | `architecture_slices` | `slice_catalog`, `slice_detail`, `slice_projection` | A (catalog) / B (detail) |
| **Architect** | `database_map_access` | `db_map_summary` | Phase A |
| **Executor** | `cartography_queries` | `file_context`, `search` | Phase B |
| **Executor** | `dependencies_dependents` | `get_plan_dependencies` | Phase A |
| **Reviewer** | `database_map_access` | `context_items_projection`, `db_node_lookup` | Phase A |
| **Tester** | `architecture_slices` | `slice_detail`, `slice_projection` | Phase B |

### Detailed Role Descriptions

#### Hub / Coordinator
- **Dependency traversal for plan analysis:** Uses `bounded_traversal` and `get_plan_dependencies` to understand inter-plan dependencies when routing work. Helps Hub decide whether a plan can be started (dependencies complete) and which plans may be affected by a given change.
- **DB map for context validation:** Uses `db_map_summary` to confirm schema structure before dispatching agents to work with context data. Uses `context_items_projection` to verify plan context records are in expected state before spawning spokes.

#### Researcher
- **Codebase orientation:** Uses `cartography_queries.summary` as the first call to understand workspace structure (file counts, language breakdown, architecture layers) before deep investigation.
- **File context:** Uses `file_context` to retrieve full symbol/import/export information for specific files identified by PromptAnalyst as noteworthy.
- **Entry points:** Uses `flow_entry_points` to discover investigation starting points in unfamiliar codebases.
- **Search:** Uses `search` to locate symbols and files matching research queries.
- **Scope of use:** Researcher reads freely; cartography results are input to research notes stored via `memory_context`, not final outputs.

#### Architect
- **Design context:** Uses `layer_view` to understand existing architecture layers before proposing a new design. Uses `summary` as a sanity check on workspace structure.
- **Slice inspection:** Uses `slice_catalog` (Phase A) to see registered architecture slices. Uses `slice_detail` (Phase B) for full slice materialization when designing components within known bounded contexts.
- **DB shape:** Uses `db_map_summary` to verify DB table structure before writing schema-dependent plan steps.

#### Executor
- **Implementation scope:** Uses `file_context` to get complete symbol/reference information for files it is about to modify. Ensures implementation aligns with existing patterns.
- **Dependency awareness:** Uses `get_plan_dependencies` when implementing steps that interact with other plans (e.g., shared utilities, cross-plan dependencies).
- **Search:** Uses `search` to locate related symbols before making changes.

#### Reviewer
- **Context validation:** Uses `context_items_projection` to inspect plan context items stored during execution, verifying correctness and coverage of stored artifacts.
- **Node inspection:** Uses `db_node_lookup` to spot-check individual plan or session records during review.
- **Scope of use:** Reviewer is a consumer of status information only. Does not modify cartography data.

#### Tester
- **Test coverage mapping:** Uses `slice_detail` and `slice_projection` (Phase B) to enumerate files and symbols in a given architecture slice, identifying coverage gaps in the test plan.
- **Phase note:** Tester is authorized for `architecture_slices` use only in Phase B. Tester is NOT authorized for `cartography_queries` or `dependencies_dependents` (Tester's access is scoped to slice queries for coverage mapping).

---

## 2. Authorized Agent Types Per Domain

The following table is derived from `tool-action-mappings.ts` (Phase A registration target). It defines which agent types are granted read access to each domain family.

| Domain | Researcher | Architect | Coordinator | Analyst | Executor | Tester | Revisionist | Archivist |
|--------|-----------|-----------|-------------|---------|----------|--------|-------------|-----------|
| `cartography_queries` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `dependencies_dependents` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `architecture_slices` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| `database_map_access` | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |

> **Note:** The authorization table above reflects what `preflightValidate()` will enforce. Tester, Revisionist, and Archivist are **not** granted access. Any cartography call from these agent types returns `ACCESS_DENIED` before any dispatch.

### Table Allowlist (additional restriction for `database_map_access`)

Even for authorized agents, `database_map_access` actions are further restricted to this table allowlist:

```typescript
const ALLOWLISTED_TABLES = [
  'plans', 'plan_dependencies', 'context_items', 'agent_sessions', 'workspace_meta'
] as const;
```

Any call referencing a table not in this list is rejected with `ACCESS_DENIED` regardless of agent type.

---

## 3. Handoff Sequence

The following sequence diagrams show how `memory_cartographer` integrates into the standard orchestration workflow. These represent the **Phase B target state** (after tool is registered and agent files updated).

### 3.1 Hub → Researcher → Hub (codebase investigation)

```
Hub
 ├─ memory_plan(get) → identifies plan, reads step
 ├─ Spawns Researcher with session_id, workspace_id, plan_id
 │
 └─ Researcher (spoke)
     ├─ memory_cartographer({
     │    action: 'cartography_queries.summary',
     │    params: { workspace_id },
     │    _session_id: 'sess_...'
     │  })
     │    → receives file counts, architecture layers, entry point summary
     │
     ├─ memory_cartographer({
     │    action: 'cartography_queries.file_context',
     │    params: { workspace_id, file_id: 'server/src/index.ts' },
     │    _session_id: 'sess_...'
     │  })
     │    → receives symbols, imports, exports for target file
     │
     ├─ memory_context(store, type: 'research_findings', ...)
     │    → stores cartography results as research notes
     │
     └─ memory_agent(handoff, to: 'Coordinator')
         → returns enriched research to Hub
```

### 3.2 Hub → Architect → Hub (design with cartography context)

```
Hub
 ├─ Reads Researcher's research notes via memory_context(get)
 └─ Spawns Architect with session_id, research_notes, workspace_id, plan_id
 
 Architect (spoke)
  ├─ memory_cartographer({
  │    action: 'architecture_slices.slice_catalog',
  │    params: { workspace_id },
  │    _session_id: 'sess_...'
  │  })
  │    → sees registered slices for bounded context design
  │
  ├─ memory_cartographer({
  │    action: 'database_map_access.db_map_summary',
  │    params: { workspace_id },
  │    _session_id: 'sess_...'
  │  })
  │    → verifies DB schema before writing schema-dependent steps
  │
  ├─ memory_plan(create) + memory_steps(replace)
  │    → creates plan steps informed by cartography data
  │
  └─ memory_agent(handoff, to: 'Coordinator')
```

### 3.3 Hub → Executor → Hub (implementation with dependency awareness)

```
Hub
 └─ Spawns Executor with session_id, step assignments, scope boundaries
 
 Executor (spoke)
  ├─ memory_cartographer({
  │    action: 'dependencies_dependents.get_plan_dependencies',
  │    params: { workspace_id, plan_id, depth_limit: 2 },
  │    _session_id: 'sess_...'
  │  })
  │    → confirms upstream plan state before modifying shared code
  │
  ├─ [implements step — modifies source files per scope boundaries]
  │
  └─ memory_agent(handoff, to: 'Coordinator')
```

### 3.4 Hub → Reviewer → Hub (context validation)

```
Hub
 └─ Spawns Reviewer with session_id, review scope, plan context
 
 Reviewer (spoke)
  ├─ memory_cartographer({
  │    action: 'database_map_access.context_items_projection',
  │    params: {
  │      workspace_id, parent_type: 'plan', parent_id: plan_id,
  │      type_filter: ['architecture', 'research_findings']
  │    },
  │    _session_id: 'sess_...'
  │  })
  │    → inspects stored plan context; validates completion
  │
  └─ memory_agent(handoff, to: 'Coordinator')
```

---

## 4. `_session_id` Threading

Every `memory_cartographer` call made during an agent session MUST include `_session_id`. This connects cartography queries to the active session for:
- Stop-directive delivery (server can inject stop markers into cartography responses)
- Telemetry correlation (latency, action, domain, error_code keyed to session)
- Response envelope echo-back (client can correlate response to originating session)

### Threading Rule

`_session_id` is provided in the Hub's spawn prompt under `SESSION CONTEXT`. The spoke agent uses it verbatim in all tool calls, including `memory_cartographer`:

```typescript
// Spoke agents: always thread _session_id from spawn prompt
const result = await memory_cartographer({
  action: 'dependencies_dependents.bounded_traversal',
  params: { workspace_id, root_plan_id: plan_id },
  _session_id: session_id,  // from spawn prompt SESSION CONTEXT block
});
```

### When `_session_id` Is Absent

- Non-session-tracked callers (integration tests, CI scripts) may omit `_session_id`
- Absence does not invalidate the call; action executes normally
- No stop directives are checked; no telemetry correlation is emitted
- Response envelope omits the `_session_id` echo field

### `_session_id` Propagation Chain

```
Hub spawn prompt
  └─ SESSION CONTEXT: session_id = 'sess_mmduaqin_3c71b0d2'
       ↓
  Spoke agent reads from spawn prompt
       ↓
  Every memory_cartographer call includes _session_id: 'sess_mmduaqin_3c71b0d2'
       ↓
  Server routes stop directives / telemetry to this session_id
       ↓
  Response echoes back _session_id for client correlation
```

---

## 5. Ownership Boundaries

Each agent role has defined limits on what it may do with cartography outputs.

### Hub / Coordinator
- **May:** Read cartography outputs to inform routing decisions (spawn next agent, choose workflow path)
- **May:** Pass cartography summaries to spawn prompts as context
- **May NOT:** Use cartography data to create or modify plan steps (Architect owns plan authoring)
- **May NOT:** Use cartography data to implement code changes directly

### Researcher
- **May:** Read all cartography outputs; store as research notes via `memory_context(store)`
- **May:** Explore freely beyond provided file paths using cartography search
- **May NOT:** Use cartography outputs to modify any source file
- **May NOT:** Use `database_map_access` to inspect sensitive plan data for purposes outside research (Reviewer owns that)

### Architect
- **May:** Use cartography data to design plan steps and architecture decisions
- **May:** Reference slice catalog and DB shape in plan step descriptions
- **May NOT:** Implement changes based on cartography data (Executor implements)
- **May NOT:** Call `architecture_slices.slice_detail` in Phase A (Python-blocked; use only `slice_catalog`)

### Executor
- **May:** Use `file_context` and `search` results as read context before making changes
- **May:** Use `get_plan_dependencies` to verify upstream plan state
- **May NOT:** Use cartography outputs to make changes outside assigned scope boundaries
- **May NOT:** Call Python-blocked domains (`cartography_queries`, `architecture_slices` Phase B) — if needed, request that Hub add a Researcher sub-task

### Reviewer
- **May:** Use `context_items_projection` and `db_node_lookup` to inspect plan data for review validation
- **May NOT:** Use cartography data to make code changes
- **May NOT:** Accept cartography errors as a review blocker — cartography is supplemental context

### Tester
- **May:** Use `slice_detail`/`slice_projection` (Phase B only) to map architecture coverage
- **May NOT:** Call `cartography_queries` or `dependencies_dependents` domains

---

## 6. Stop/Injection Interaction with In-Flight Cartography Calls

### Stop Directive Behavior During Cartography

Stop directives can arrive embedded in `memory_cartographer` tool responses (injected by the session management layer). Agents must check for stop markers **before** processing the cartography data payload.

| Stop Level | Marker | Agent Behavior with In-Flight Cartography Call |
|------------|--------|------------------------------------------------|
| Level 1 — Graceful | `⚠️ SESSION STOP` | Complete the current `memory_cartographer` call; use the data if already received; do NOT issue further cartography calls; then handoff + complete |
| Level 2 — Immediate | `🛑 SESSION STOP — IMMEDIATE` | Discard any cartography data received in the same response; do NOT process it; immediately handoff + complete |
| Level 3 — Terminated | `❌ SESSION TERMINATED` | Session killed server-side; cartography call returns error; Hub detects via `orphaned_sessions` on next init |

**Agent implementation rule:** After every `memory_cartographer` call, check the response for stop markers before reading `data.data`. Do not inspect cartography results after a Level 2 stop.

### Injected Guidance (`📝 USER GUIDANCE`)

User guidance injected into a `memory_cartographer` response may redirect query scope:

| Injected instruction example | Expected adjustment |
|-----------------------------|---------------------|
| "limit search to server/ directory" | Adjust next `file_context` or `search` params to scope to `server/` |
| "reduce depth to 3 layers" | Pass `depth_limit: 3` in next traversal call |
| "skip dependency graph for now" | Omit `bounded_traversal` call from current workflow |

**Key rule:** Injected guidance does NOT bypass preflight validation. Allowlist and authorization checks still apply even if guidance requests broader access.

### Phase B Note on Stop Handling

In Phase B, when agent files are updated to actively use cartography:
- Agent instruction files (e.g., `hub.agent.md`) should include a note directing agents to check for stop markers after each `memory_cartographer` call
- Spoke agents should not batch multiple cartography calls before checking stop directives; check after each response

---

## Phase B Implementation Checklist (for future Executor)

When Phase A is accepted and Python core is ready, the following agent files require updating to include `memory_cartographer` usage patterns:

| File | Change required |
|------|----------------|
| `agents/hub.agent.md` | Add cartography usage patterns for Hub's dependency traversal and DB map checks |
| `agents/` (Researcher instructions) | Add cartography entry-point workflow (`summary` → `file_context` → `search`) |
| `agents/` (Architect instructions) | Add slice catalog + DB map usage before plan authoring |
| `agents/` (Executor instructions) | Add `file_context` pre-implementation read pattern |
| `agents/` (Reviewer instructions) | Add `context_items_projection` validation pattern |

These updates are Phase B scope and must not be made until Phase A acceptance gate passes.

---

## Cross-References

- [Consumer integration contract (inputs/outputs, error modes)](./integration-contract.md)
- [Consumer integration: validation matrix](./validation-matrix.md)
- [Auth & session architecture (authorized agent types, stop directives)](../mcp-surface/architecture/auth-session-architecture.md)
- [Action inventory (17 actions across 4 domains)](../mcp-surface/memory-cartographer-action-inventory.md)
- [Hub agent instructions](../../agents/hub.agent.md)
- [Session interruption instructions](../../.github/instructions/session-interruption.instructions.md)
