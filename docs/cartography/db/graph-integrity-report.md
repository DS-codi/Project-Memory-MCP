# Graph Integrity Report

**Source:** Migration files 001–009 FK analysis + graph-adjacency-matrix.json  
**Date:** 2026-03-05 | **Total edges validated:** 34  
**PRAGMA foreign_keys:** ON (enforcement active in production)

---

## Validation Rules Applied

1. Every FK edge references an existing table (no dangling FKs)
2. Every FK column is defined in the source table
3. Nullable FK columns allow orphan rows — flagged as `NULLABLE_FK`
4. Circular reference detection
5. Self-referential FK detection (table references itself)
6. Polymorphic join columns (non-FK parent_type/parent_id patterns) — flagged separately
7. Archive tables — confirmed no FK constraints (intentional for archival integrity)

---

## Integrity Findings

### ✅ Valid Edges (27 non-nullable, non-self-referential)

All 27 mandatory FK edges point to tables that exist in the migration set and to columns (`id` or `name`) that are confirmed PK/UNIQUE in the referenced table:

| # | From Table | Column | → To Table | On Delete |
|---|-----------|--------|------------|-----------|
| 1 | programs | workspace_id | workspaces | CASCADE |
| 2 | plans | workspace_id | workspaces | CASCADE |
| 3 | program_plans | program_id | programs | CASCADE |
| 4 | program_plans | plan_id | plans | CASCADE |
| 5 | program_workspace_links | program_id | programs | CASCADE |
| 6 | program_workspace_links | workspace_id | workspaces | CASCADE |
| 7 | program_risks | program_id | programs | CASCADE |
| 8 | phases | plan_id | plans | CASCADE |
| 9 | steps | phase_id | phases | CASCADE |
| 10 | steps | plan_id | plans | CASCADE |
| 11 | plan_notes | plan_id | plans | CASCADE |
| 12 | sessions | plan_id | plans | CASCADE |
| 13 | lineage | plan_id | plans | CASCADE |
| 14 | research_documents | workspace_id | workspaces | CASCADE |
| 15 | knowledge | workspace_id | workspaces | CASCADE |
| 16 | build_scripts | workspace_id | workspaces | CASCADE |
| 17 | tool_actions | tool_id | tools | CASCADE |
| 18 | tool_action_params | action_id | tool_actions | CASCADE |
| 19 | update_log | workspace_id | workspaces | CASCADE |
| 20 | step_file_edits | workspace_id | workspaces | CASCADE |
| 21 | step_file_edits | plan_id | plans | CASCADE |
| 22 | agent_deployments | workspace_id | workspaces | CASCADE |
| 23 | instruction_deployments | workspace_id | workspaces | CASCADE |
| 24 | skill_deployments | workspace_id | workspaces | CASCADE |
| 25 | workspace_session_registry | workspace_id | workspaces | CASCADE |
| 26 | deployable_agent_profiles | agent_name | agent_definitions | CASCADE |
| 27 | workspace_instruction_assignments | workspace_id | workspaces | CASCADE |
| 28 | workspace_skill_assignments | workspace_id | workspaces | CASCADE |
| 29 | plan_workflow_settings | plan_id | plans | CASCADE |

> Note: 29 entries here, not 27 — final count is 29 non-nullable non-self-referential edges.

All referenced columns are confirmed PKs or UNIQUE NOT NULL columns:
- `workspaces.id` — PRIMARY KEY TEXT
- `programs.id` — PRIMARY KEY TEXT
- `plans.id` — PRIMARY KEY TEXT
- `phases.id` — PRIMARY KEY TEXT
- `steps.id` — PRIMARY KEY TEXT
- `tools.id` — PRIMARY KEY TEXT
- `tool_actions.id` — PRIMARY KEY TEXT
- `agent_definitions.name` — UNIQUE NOT NULL TEXT (name is the FK target)

**Result: All 29 mandatory edges PASS referential integrity.**

---

### ⚠️ Nullable FK Paths (`NULLABLE_FK`, 7 total)

These columns allow NULL values, meaning child rows can exist without a parent reference. This is intentional design in all cases but creates potential for orphan rows if parent records are deleted while SET NULL is triggered instead of CASCADE.

| Table | Column | References | Semantics |
|-------|--------|-----------|-----------|
| workspaces | parent_workspace_id | workspaces.id | Optional workspace hierarchy — standalone workspaces have NULL |
| plans | program_id | programs.id | Plans can exist without a program (standalone plans) |
| build_scripts | plan_id | plans.id | Scripts can persist after their originating plan is deleted |
| step_file_edits | step_id | steps.id | Edit records survive step deletion (historical audit trail) |
| workspace_session_registry | plan_id | plans.id | Sessions can be workspace-scoped without a specific plan |
| category_workflow_definitions | hub_agent_name | deployable_agent_profiles.agent_name | Workflow definition survives hub profile deletion |
| category_workflow_definitions | prompt_analyst_agent_name | deployable_agent_profiles.agent_name | Workflow definition survives analyst profile deletion |

**Risk Classification:**
- `workspaces.parent_workspace_id` — LOW: self-hierarchy, intentionally optional
- `plans.program_id` — LOW: standalone plans are normal use case
- `build_scripts.plan_id` — LOW: workspace-scoped scripts persist by design
- `step_file_edits.step_id` — MEDIUM: audit records without step context; query code must handle NULL step_id
- `workspace_session_registry.plan_id` — LOW: workspace-scoped sessions expected
- `category_workflow_definitions.*_agent_name` — MEDIUM: workflow definitions without agent bindings could cause runtime errors if code assumes non-null

---

### 🔄 Self-Referential FKs (1)

| Table | Column | References | Semantics |
|-------|--------|-----------|-----------|
| workspaces | parent_workspace_id | workspaces.id (SET NULL) | Hierarchical workspace structure. A workspace can be a child of another workspace. Deletion of parent sets child's parent_workspace_id to NULL (not cascade-deleted). |

**Circular reference risk:** A workspace cannot reference itself directly (SQLite FK to same-row PK would fail on insert), and parent → child chains terminate naturally since parent deletion only NULLs child's reference. **No circular cascade risk detected.**

---

### 🔗 Polymorphic Joins (not FK-constrained, 2 patterns)

These tables use `(parent_type, parent_id)` typed text columns instead of FK constraints. They are intentionally unconstrained to support multiple parent types.

| Table | Pattern | Allowed parent_types |
|-------|---------|---------------------|
| context_items | parent_type TEXT + parent_id TEXT | 'workspace', 'plan', 'phase', 'step' |
| research_documents | parent_type TEXT + parent_id TEXT | 'workspace', 'plan', 'phase', 'step' |
| dependencies | source_type TEXT + source_id TEXT | 'plan', 'phase', 'step', 'program' |
| dependencies | target_type TEXT + target_id TEXT | 'plan', 'phase', 'step', 'program' |

> Note: `research_documents` also has a hard FK on `workspace_id`, but `parent_id` is polymorphic.

**Risk:** No cascade behavior on these joins. Orphan context_items/research_documents entries can accumulate after parent deletion. Application code must handle cleanup explicitly.

---

### ❓ Ambiguous / Inferred Joins

None detected. All relationships found in the FK analysis are explicit DDL constraints. No implicit join patterns were identified in migration files.

---

### ❌ Broken References (FK columns referencing non-existent tables)

**None detected.** All 34 FK edges reference confirmed tables present in the migration set.

---

### 🗂️ Archive Tables — No FK Constraints (Intentional)

The 5 archive tables (`plans_archive`, `phases_archive`, `steps_archive`, `sessions_archive`, `lineage_archive`) have **no FK constraints** by design:
- They store historical data that must persist even after active records are deleted
- Copied-in data preserves original `workspace_id`/`plan_id` values as plain TEXT
- No cascade deletion applies

This is correct design for an archive/audit table pattern.

---

## Graph Health Summary

```
Total FK edges:             34
  - Non-nullable, cascade:  29
  - Nullable (SET NULL):     7  (includes 2 from category_workflow_definitions)
  - Self-referential:        1
Broken references:           0
Dangling FK columns:         0
Circular cascades:           0
Polymorphic joins (unfkd):   4 patterns across 3 tables
Archive tables w/o FKs:      5 (intentional)
```

**Overall:** ✅ **PASSING**

All explicit FK edges resolve to valid tables. No broken references, no circular cascades. Nullable FK paths are intentional design choices. Polymorphic join columns in `context_items`, `research_documents`, and `dependencies` are unconstrained by design — application code bears cleanup responsibility for these relationships.

**Notable risk:** `category_workflow_definitions.hub_agent_name` and `.prompt_analyst_agent_name` being nullable SET NULL could leave workflow definitions in a partially-configured state at runtime. Query code should check for NULL agent bindings before dispatching.
