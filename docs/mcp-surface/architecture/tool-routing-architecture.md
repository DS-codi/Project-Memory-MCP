# Tool Routing / Wiring Architecture

**Plan:** MCP Surface Integration: expose memory_cartographer actions/resources via consolidated tools  
**Phase:** Architecture  
**Step:** 10 — Tool Routing/Wiring Architecture  
**Status:** Specification (no implementation required for this plan)

---

## Overview

`memory_cartographer` is a consolidated MCP tool that exposes 17 cartography-related actions across 4 domain families. This document specifies how the tool routes each action class to its respective data/computation layer, how the 6-file registration wiring works, initialization sequence, error propagation, and a full call-chain boundary diagram.

---

## 1. Domain Families and Their Data Layers

| Domain Family | Actions | Data Layer | Integration Point |
|---|---|---|---|
| `cartography_queries` | `summary`, `file_context`, `flow_entry_points`, `layer_view`, `search` | Python core via `PythonBridge` + `PythonCoreAdapter` | `server/src/cartography/adapters/python-bridge.ts` |
| `dependencies_dependents` | `get_dependencies`, `get_dependents`, `get_dependency_graph`, `detect_cycles` | better-sqlite3 via `dependency-db.ts` | Direct SQLite query against `plans.depends_on_plans` FK table |
| `architecture_slices` | `get_slice`, `get_layer_summary`, `get_critical_path`, `get_cohesion_metrics` | Python core via `PythonBridge` | `server/src/cartography/adapters/python-bridge.ts` |
| `database_map_access` | `list_tables`, `describe_table`, `query_schema_lineage`, `get_query_touchpoints` | better-sqlite3 with allowlist enforcement | Direct SQLite against schema metadata with columns restricted to allowlist |

### Routing Detail per Domain

#### cartography_queries → PythonBridge + PythonCoreAdapter

```
memory_cartographer.ts (switch: cartography_queries)
  → PythonCoreAdapter.invoke(action, params)
    → PythonBridge.send({ intent: 'cartograph', action, params })
      → python-core entrypoint.py dispatcher
        → engines/code_cartography.py
          → returns CartographyEnvelope (schema_version, code_cartography, diagnostics)
  ← TypeScript maps CartographyEnvelope fields to typed response
```

**Key contracts:**  
- Input validated via `action-params-cartography.ts` preflight spec before bridge call  
- `PythonBridge` handles process spawn, stdin/stdout wire protocol, timeout  
- Errors from Python core propagate as `CartographyBridgeError` (see §4)

#### dependencies_dependents → better-sqlite3 via dependency-db.ts

```
memory_cartographer.ts (switch: dependencies_dependents)
  → DependencyDbService.query(action, params)
    → better-sqlite3 db instance (read-only mode)
      → SQL against: plans, plan_dependencies, plan_dependency_edges tables
  ← Results mapped to DependencyNode[] / DependencyEdge[] per types.ts
```

**Key contracts:**  
- All SQL uses parameterized statements (no string interpolation)  
- Cursor-based pagination via `cursor` + `limit` params  
- DFS cycle detection done in TypeScript layer (not SQL)  
- Schema: `plan_dependencies(plan_id, depends_on_plan_id)` — aligns with `plans.depends_on_plans` FK

#### architecture_slices → PythonBridge

```
memory_cartographer.ts (switch: architecture_slices)
  → PythonCoreAdapter.invoke(action, params)
    → PythonBridge.send({ intent: 'cartograph', action: 'slice', params })
      → python-core engines/code_cartography.py
        → returns ArchitectureEdge[], ModuleGraph, cohesion metrics
  ← TypeScript maps to SliceResult per slice-types.ts
```

**Key details:**  
- Projection types (`full`, `summary`, `edges_only`) are resolved before bridge call  
- Limits applied pre-bridge: `max_nodes=500`, `max_depth=10`  
- Returns inline payload without caching (inline-only convention, no URI resources)

#### database_map_access → better-sqlite3 direct queries

```
memory_cartographer.ts (switch: database_map_access)
  → DbMapService.query(action, params)
    → better-sqlite3 db instance (read-only mode)
      → SQL against: sqlite_master, sqlite_stat1, and allowlisted application tables
  ← Results mapped to DbMapResult per db-map-types.ts
```

**Key contracts:**  
- Table name always validated against `ALLOWLISTED_TABLES` before query execution  
- Allowlisted tables (from `database-map-access-contract.md`): `plans`, `plan_dependencies`, `context_items`, `agent_sessions`, `workspace_meta`  
- `context_items.context_data` column is masked from all outputs  
- All SQL is parameterized; no raw table name string interpolation  

---

## 2. Six-File Registration Checklist

Each file's role in the wiring pipeline:

| # | File | Role in Wiring |
|---|---|---|
| 1 | `server/src/tools/consolidated/memory_cartographer.ts` | Main dispatch: `switch(action)` → domain handler calls; TypeScript types; response envelope construction |
| 2 | `server/src/tools/consolidated/index.ts` | Re-exports `handleMemoryCartographer` so it is importable from consolidated module namespace |
| 3 | `server/src/tools/preflight/action-params-cartography.ts` | Declares the preflight spec for all 17 cartography actions: required fields, types, range constraints |
| 4 | `server/src/tools/preflight/action-param-registry.ts` | Imports cartography spec and registers it under `ACTION_PARAM_SPECS['memory_cartographer']` |
| 5 | `server/src/tools/preflight/tool-action-mappings.ts` | Declares which agent types can access which `memory_cartographer` actions (Researcher, Architect, Executor, Coordinator, Analyst) |
| 6 | `server/src/index.ts` | `server.tool('memory_cartographer', zodSchema, handleMemoryCartographer)` — registers the tool with the MCP router |

### Wiring Flow (how these 6 files connect at runtime)

```
MCP client calls memory_cartographer
  → server.tool() (index.ts) receives the call
    → Zod schema validates top-level shape (action, params)
    → handleMemoryCartographer() (memory_cartographer.ts via consolidated/index.ts) invoked
      → preflightValidate('memory_cartographer', action, params)
         resolved via action-param-registry.ts → action-params-cartography.ts
      → tool-action-mappings.ts checked: does calling agent have permission for this action?
      → switch(action) dispatches to domain handler
      → response returned as { success: true, data: { action, data: ... } }
```

---

## 3. Initialization Sequence

```
Server process start
  ↓
index.ts: imports handleMemoryCartographer from consolidated/index.ts
  ↓
index.ts: imports ACTION_PARAM_SPECS from action-param-registry.ts
  (action-param-registry.ts has already loaded action-params-cartography.ts at module init)
  ↓
index.ts: server.tool('memory_cartographer', zodSchema, handleMemoryCartographer)
  → Registered with MCP router
  ↓
No lazy initialization required:
  - better-sqlite3 db instance is initialized once at server start (existing pattern)
  - PythonBridge process is spawned on first call (existing pattern in python-bridge.ts)
  - No cartography-specific startup probe needed
  ↓
Server ready: memory_cartographer available for client calls
```

**Note:** The Python core process is NOT pre-spawned at server start. It is spawned on first `cartography_queries` or `architecture_slices` call. This matches the existing `PythonBridge` pattern. Health check can be performed via `cartography_queries.summary` with a probe workspace.

---

## 4. Error Propagation Flow

```
Python bridge error path:
  python-core returns { diagnostics: [{ code: 'PYTHON_CORE_ERROR', ... }] }
    ↓
  PythonBridge surface the raw envelope
    ↓
  PythonCoreAdapter catches and wraps in CartographyBridgeError
    ↓
  memory_cartographer.ts catches CartographyBridgeError
    ↓
  DiagnosticCode normalization (11-code taxonomy from normalization rules):
    PYTHON_CORE_ERROR   → DiagnosticCode.PYTHON_CORE_ERROR
    TIMEOUT             → DiagnosticCode.TIMEOUT
    NOT_FOUND           → DiagnosticCode.NOT_FOUND
    SCHEMA_MISMATCH     → DiagnosticCode.SCHEMA_MISMATCH
    PARTIAL_RESULT      → DiagnosticCode.PARTIAL_RESULT
    ACCESS_DENIED       → DiagnosticCode.ACCESS_DENIED
    INVALID_PARAMS      → DiagnosticCode.INVALID_PARAMS
    INTERNAL_ERROR      → DiagnosticCode.INTERNAL_ERROR
    (+ 3 additional codes per normalization-rules.md)
    ↓
  Response includes `diagnostics` field: DiagnosticEntry[]
    { code, severity, message, context?, recoverable }
    ↓
  success: true still returned (diagnostics surfaced inline, not as thrown error)
  Unless: unrecoverable / no partial result → success: false, error: string

SQLite error path:
  better-sqlite3 throws on query error
    ↓
  DependencyDbService / DbMapService catch and normalize
    ↓
  Maps to DiagnosticCode.INTERNAL_ERROR or DiagnosticCode.ACCESS_DENIED (allowlist violation)
    ↓
  Same response envelope pattern as above
```

---

## 5. Boundary Diagram — Full Call Chain

```
┌─────────────────────────────────────────────────────────────┐
│  MCP Client (AI agent chat turn)                            │
│  tool call: memory_cartographer({ action, params, ... })    │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  server/src/index.ts                                        │
│  server.tool('memory_cartographer', zodSchema, handler)     │
│  → Zod validates: action: string, params: object            │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
┌─────────────────────────────────────────────────────────────┐
│  server/src/tools/consolidated/memory_cartographer.ts       │
│  handleMemoryCartographer(input, context)                   │
│                                                             │
│  Layer 1: null guards (action, params present)              │
│  Layer 2: preflightValidate('memory_cartographer', ...)     │
│           → action-param-registry → action-params-cartography│
│  Layer 3: tool-action-mappings check (agent authorization)  │
│                                                             │
│  switch(action):                                            │
│    case 'cartography_queries.*'  ──────────────────────┐   │
│    case 'architecture_slices.*'  ──────────────────┐   │   │
│    case 'dependencies_dependents.*'  ─────────┐   │   │   │
│    case 'database_map_access.*'  ──────────┐  │   │   │   │
└────────────────────────────────────────────┼──┼───┼───┼───┘
                                             │  │   │   │
          ┌──────────────────────────────────┘  │   │   │
          ▼                                     │   │   │
┌─────────────────────────┐                    │   │   │
│ DbMapService             │                   │   │   │
│ (better-sqlite3 direct)  │                   │   │   │
│ allowlist enforcement    │                   │   │   │
│ → sqlite_master + app    │                   │   │   │
│   tables (readonly)      │                   │   │   │
└─────────────────────────┘                    │   │   │
                          ┌────────────────────┘   │   │
                          ▼                         │   │
┌─────────────────────────────┐                    │   │
│ DependencyDbService          │                   │   │
│ (better-sqlite3 via          │                   │   │
│  dependency-db.ts)           │                   │   │
│ plan deps + edges (readonly) │                   │   │
│ DFS cycle detection (TS)     │                   │   │
└─────────────────────────────┘                    │   │
                                  ┌────────────────┘   │
                                  ▼                     │
                       ┌────────────────────────────────┴─┐
                       │ PythonCoreAdapter                  │
                       │ server/src/cartography/adapters/   │
                       │                                    │
                       │  → PythonBridge                    │
                       │    stdin/stdout wire protocol      │
                       │    process spawn/lifecycle         │
                       │       │                            │
                       │       ▼                            │
                       │  python-core/memory_cartographer/  │
                       │    entrypoint.py dispatcher        │
                       │    ├─ engines/code_cartography.py  │
                       │    └─ engines/database_cartography │
                       └────────────────────────────────────┘
```

---

## 6. Key Design Decisions

1. **No MCP resource infrastructure** — all URIs in `memory-cartographer-resource-uris.md` are inline payload return conventions, not true MCP `server.resource()` registrations. The server has no `server.resource()` anywhere.

2. **Read-only access enforced** — all DB queries use a read-only `better-sqlite3` instance; Python bridge calls are query-only (no write operations in Python core for cartography paths).

3. **No lazy registration** — all 6 files are wired at module load time; no dynamic import or on-demand registration.

4. **PythonBridge existing pattern** — `memory_cartographer.ts` does not spawn Python directly; it delegates entirely to the existing `server/src/cartography/adapters/python-bridge.ts` adapter.

5. **Allowlist at handler level** — DB table allowlist enforcement happens inside `DbMapService` before any SQL is executed, not in the Zod schema (table names are too dynamic for static Zod validation).

---

## Cross-References

- [Action inventory (17 actions)](../memory-cartographer-action-inventory.md)
- [Resource URI conventions (inline only)](../memory-cartographer-resource-uris.md)
- [Design matrices](../design/cartography-action-matrix.md)
- [DB map access contract + allowlist](../database-map-access-contract.md)
- [Dependency traversal contract](../dependency-traversal-contract.md)
- TypeScript type contracts: `server/src/cartography/contracts/`
