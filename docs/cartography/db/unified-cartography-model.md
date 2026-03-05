# Unified Cartography Model

> **Cartography artifact — Step 14 of Database Cartography plan**
> Master document linking all prior cartography sections into a single structured reference.
> This is the single entry point for downstream consumers (execution agents, reviewers, automated tools).

---

## 1. System Identity

| Property | Value |
|----------|-------|
| **Database engine** | SQLite (via `better-sqlite3`) |
| **Journal mode** | WAL (Write-Ahead Logging) |
| **FK enforcement** | ON (`PRAGMA foreign_keys = ON`) |
| **Busy timeout** | 5 000 ms |
| **DB file path** | `{PM_DATA_ROOT}/project-memory.db` (env override: `PM_DATA_ROOT`) |
| **Default data root** | Windows: `%APPDATA%\ProjectMemory\`; macOS: `~/Library/Application Support/ProjectMemory/`; Linux: `$XDG_DATA_HOME/ProjectMemory/` |
| **Schema version** | 9 migrations applied (001–009) |
| **Cartography produced** | Manual (Python automation path is a stub — see G-01 in `mapping-gaps.md`) |
| **Cartography date** | 2025 |
| **Plan ID** | `plan_mm9b56x6_551d976d` |

---

## 2. Schema Catalog Summary

> Full detail: [`schema-drift-report.md`](schema-drift-report.md)

| Category | Count |
|----------|-------|
| Active domain tables | 35 |
| Archive tables | 5 |
| Migration tracking table (`_migrations`) | 1 |
| **Total tables** | **41** |
| Indexes | 57 |
| Triggers | 1 |
| Views | 0 |
| FK edges (explicit) | 34 |
| Nullable FK paths (`SET NULL`) | 7 |
| Self-referential FKs | 1 |
| Polymorphic join patterns | 4 |

### Hub Nodes (highest FK in-degree)

| Table | Inbound FKs | Role |
|-------|-------------|------|
| `workspaces` | 15 | Root anchor — all data is workspace-scoped |
| `plans` | 10 | Primary work unit |
| `programs` | 4 | Multi-plan orchestration container |
| `deployable_agent_profiles` | 2 | Deployment target for agent materialisation |

---

## 3. Relation Graph

> Full detail: [`graph-adjacency.md`](graph-adjacency.md) · [`graph-adjacency-matrix.json`](graph-adjacency-matrix.json) · [`graph-integrity-report.md`](graph-integrity-report.md)

- **34 FK edges** — all valid, 0 broken references
- **7 nullable FK paths** — intentional SET NULL semantics for optional associations  
- **1 self-referential FK** — `workspaces.parent_workspace_id → workspaces.id` (hierarchy)
- **4 polymorphic join patterns** — `context_items`, `research_documents`, `dependencies` (source), `dependencies` (target) — unconstrained by design; validated by application layer
- **Integrity verdict:** ✅ PASSING

### Key FK chains

```
workspaces → plans → phases → steps
                  → sessions → lineage
                  → context_items
programs  → program_plan_links → plans
          → program_workspace_links → workspaces
agent_definitions → deployable_agent_profiles → agent_deployments → workspaces
skills → workspace_skill_assignments → workspaces
       → skill_deployments → workspaces
```

---

## 4. Migration Lineage

> Full detail: [`migration-registry.md`](migration-registry.md) · [`migration-object-timeline.md`](migration-object-timeline.md)

| Migration | Key Change |
|-----------|-----------|
| `001_initial_schema.sql` | Creates 30 core tables — foundation of the schema |
| `002_research_documents.sql` | Converts research to polymorphic model; removes `depends_on` from steps |
| `003_program_v2.sql` | Extends `program_risks` (+5 cols) and `dependencies` (+3 cols); adds `programs` v2 source column |
| `004_knowledge_items.sql` | Adds `knowledge_items` table |
| `005_workspace_hierarchy.sql` | Adds `parent_workspace_id` to `workspaces` |
| `006_agent_definitions.sql` | Extends `agent_definitions` (+5 cols for tools and checkpoints) |
| `007_category_workflows.sql` | Adds `category_workflows` and `workspace_session_registry` |
| `008_deployable_profiles.sql` | Adds `deployable_agent_profiles`, `agent_deployments`, `skill_deployments`, `instruction_deployments`, `workspace_instruction_assignments`, `workspace_skill_assignments`, `gui_routing_contracts` |
| `009_plan_workflow_settings.sql` | Adds `plan_workflow_settings` archive entry; adds `paused_at` / `paused_at_snapshot` to plans |

**Migration runner:** Transaction-per-file; `IF NOT EXISTS` idempotence; soft-skip DML `"no such column"` errors; forward-only (no down migrations).

---

## 5. Code-to-DB Surface Map

> Full detail: [`code-db-touchpoints.md`](code-db-touchpoints.md) · [`symbol-to-db-map.md`](symbol-to-db-map.md)

### Layer architecture

```
MCP Tool Handlers  (server/src/tools/**)
       │
       ▼
Domain Repositories  (server/src/db/*-db.ts × 29 files)
       │  import from
       ▼
Query Helpers  (server/src/db/query-helpers.ts)
  queryOne<T> · queryAll<T> · run · transaction<T> · newId · nowIso
       │
       ▼
SQLite Singleton  (server/src/db/connection.ts → getDb())
       │
       ▼
better-sqlite3  →  project-memory.db
```

### Touchpoint counts

| Layer | File Count |
|-------|-----------|
| Domain repository files (`*-db.ts`) | 29 |
| Infrastructure files (`connection`, `query-helpers`, `migration-runner`, `index`, `types`, `mappers`, `seed`, `reproducibility-package`) | 8 |
| MCP tool handler directories | 4 (`tools/`, `tools/plan/`, `tools/consolidated/`, `tools/orchestration/`) |

### Key access patterns

| Pattern | Usage |
|---------|-------|
| `queryOne<T>` | ~70% of all reads — single-row fetch by PK |
| `queryAll<T>` | ~25% of all reads — list by FK or filtered query |
| `run` | ~90% of all writes — INSERT / UPDATE / DELETE |
| `transaction<T>` | Plan lifecycle operations (create plan + phases + steps atomically) |
| Direct `getDb()` | Migration runner only |

---

## 6. Mapping Gaps

> Full detail: [`mapping-gaps.md`](mapping-gaps.md)

| Gap ID | Severity | Summary |
|--------|----------|---------|
| G-01 | ⬛ CRITICAL | Python cartography automation entirely unimplemented (`invokePythonCore` throws) |
| G-04 | 🟧 MEDIUM | Tool catalog tables (`tool_catalog`, `tool_actions`, `tool_action_params`) may be unpopulated at runtime |
| G-07 | 🟧 MEDIUM | `databaseMapper.ts` type stubs cannot deserialize data (no Python core to produce it) |
| G-02 | 🟨 LOW | Archive tables have no TS read path |
| G-03 | 🟦 NONE | Immutable audit tables (intentional — no action needed) |
| G-05 | 🟦 NONE | 8 domain↔DB field-name deltas — compile-time safe, all handled by `mappers.ts` |
| G-06 | 🟨 LOW | Assignment vs deployment table write-path transactionality unverified |

---

## 7. Artifact Inventory

All cartography artifacts reside under `Project-Memory-MCP/docs/cartography/db/`.

| File | Step | Describes |
|------|------|-----------|
| [`graph-adjacency.md`](graph-adjacency.md) | 6 | FK graph adjacency list with hub analysis |
| [`graph-adjacency-matrix.json`](graph-adjacency-matrix.json) | 6 | Machine-readable adjacency matrix (41 nodes, 34 edges) |
| [`graph-integrity-report.md`](graph-integrity-report.md) | 7 | Graph integrity validation — verdict: PASSING |
| [`migration-registry.md`](migration-registry.md) | 8 | Canonical migration order + runner behavior documentation |
| [`migration-object-timeline.md`](migration-object-timeline.md) | 9 | Per-migration object-level change timeline (all 9 migrations) |
| [`schema-drift-report.md`](schema-drift-report.md) | 10 | Migration DDL vs `*-db.ts` code drift — severity: LOW |
| [`code-db-touchpoints.md`](code-db-touchpoints.md) | 11 | Full call-chain from MCP tools → repositories → SQLite |
| [`symbol-to-db-map.md`](symbol-to-db-map.md) | 12 | Bidirectional TS symbol ↔ DB object index |
| [`mapping-gaps.md`](mapping-gaps.md) | 13 | 7 identified gaps with severity + remediation |
| [`unified-cartography-model.md`](unified-cartography-model.md) | 14 | **This file** — master reference linking all artifacts |
| [`cartography-manifest.json`](cartography-manifest.json) | 14 | Machine-readable manifest of all artifacts |
| [`validation-report.md`](validation-report.md) | 15 | Completeness checklist and final handoff gate |

Also in parent directory (produced by prior sessions):

| File | Step | Describes |
|------|------|-----------|
| [`../relation-graph.json`](../relation-graph.json) | 5 | FK edge list (40 nodes, 36 FK edges — prior session) |

---

## 8. Key Findings

1. **Schema is stable** — All 41 tables match between migration DDL and `*-db.ts` code layer. No orphaned tables, no broken references.
2. **FK graph is clean** — 34 edges, all valid. 7 nullable paths are intentional (SET NULL semantics). 0 circular cascades.
3. **workspaces is the root anchor** — 15 tables have a direct FK to `workspaces.id`. Deleting a workspace would cascade-delete the majority of the data store.
4. **Python automation path is blocked** — The cartography automation pipeline is entirely unimplemented (G-01). This manual cartography output serves as a substitute until the Python core is built.
5. **Archive tables are write-only from TS** — No read API exists for the 5 archive tables. Data is preserved but not queryable through MCP tools.
6. **Tool layer is clean** — No tool handler directly calls `getDb()` or `better-sqlite3`. All DB access flows through the repository layer.

---

*Generated by Database Cartography Executor agent — plan plan_mm9b56x6_551d976d*
