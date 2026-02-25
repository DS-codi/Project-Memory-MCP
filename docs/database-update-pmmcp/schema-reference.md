# Project Memory MCP — SQLite Schema Reference

Generated from `server/src/db/migrations/001-initial-schema.sql` and `002-gap-closure.sql`.

> **SQLite configuration:** WAL mode, synchronous = NORMAL, foreign keys = ON, busy timeout = 5 s.

---

## Table of Contents

1. [Workspace & Organisation](#1-workspace--organisation)
2. [Plans & Structure](#2-plans--structure)
3. [Agent Lifecycle](#3-agent-lifecycle)
4. [Context & Knowledge](#4-context--knowledge)
5. [Build & Dependencies](#5-build--dependencies)
6. [Tool Catalog](#6-tool-catalog)
7. [Agent / Instruction / Skill Storage](#7-agent--instruction--skill-storage)
8. [Audit Tables](#8-audit-tables)
9. [Archive Tables](#9-archive-tables)
10. [Index Reference](#10-index-reference)

---

## 1. Workspace & Organisation

### `workspaces`

The registry of all known workspaces.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Workspace identifier (`{name}-{12-hex-sha256}`) |
| `path` | TEXT | NOT NULL UNIQUE | Absolute filesystem path |
| `name` | TEXT | NOT NULL | Derived from the directory name |
| `parent_workspace_id` | TEXT | FK → workspaces(id) SET NULL | Hierarchy parent (optional) |
| `registered_at` | TEXT | NOT NULL, DEFAULT now | ISO 8601 registration timestamp |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | ISO 8601 last-updated timestamp |
| `profile` | TEXT | NULL | JSON: `{ languages, frameworks, package_manager, ... }` |
| `meta` | TEXT | NULL | JSON: additional metadata |

---

### `programs`

Independent multi-plan containers ("Integrated Programs").

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | Program identifier |
| `workspace_id` | TEXT | FK → workspaces CASCADE | Owning workspace |
| `title` | TEXT | NOT NULL | Human-readable title |
| `description` | TEXT | NOT NULL DEFAULT '' | Long-form description |
| `category` | TEXT | CHECK (see below) | `feature` / `bugfix` / `refactor` / `orchestration` / `quick_task` / `advisory` |
| `priority` | TEXT | CHECK (see below) | `low` / `medium` / `high` / `critical` |
| `status` | TEXT | CHECK (see below) | `active` / `completed` / `archived` / `paused` |
| `schema_version` | TEXT | NOT NULL DEFAULT '2.0' | Schema version |
| `goals` | TEXT | NOT NULL DEFAULT '[]' | JSON: `string[]` |
| `success_criteria` | TEXT | NOT NULL DEFAULT '[]' | JSON: `string[]` |
| `source` | TEXT | CHECK `v2` \| `v1_migrated` | Origin flag |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |
| `archived_at` | TEXT | NULL | Set when `status = 'archived'` |

---

### `program_plans`

Join table linking programs to their child plans (with ordering).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `program_id` | TEXT | FK → programs CASCADE | |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `order_index` | INTEGER | NOT NULL DEFAULT 0 | Display ordering |
| `added_at` | TEXT | NOT NULL, DEFAULT now | |

**UNIQUE(program_id, plan_id)**

---

### `program_workspace_links`

Enables cross-workspace plan inclusion in a program.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `program_id` | TEXT | FK → programs CASCADE | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | The foreign workspace being linked |
| `linked_at` | TEXT | NOT NULL, DEFAULT now | |
| `linked_by` | TEXT | NULL | Agent type or `'user'` that created the link |

**UNIQUE(program_id, workspace_id)**

---

### `program_risks`

Risk register entries for a program.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `program_id` | TEXT | FK → programs CASCADE | |
| `risk_type` | TEXT | CHECK (see below) | `functional_conflict` / `behavioral_change` / `dependency_risk` |
| `severity` | TEXT | CHECK | `low` / `medium` / `high` / `critical` |
| `description` | TEXT | NOT NULL | |
| `affected_plan_ids` | TEXT | NOT NULL DEFAULT '[]' | JSON: `string[]` |
| `mitigation` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |

---

## 2. Plans & Structure

### `plans`

Core plan records. Each plan belongs to exactly one workspace.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | |
| `program_id` | TEXT | FK → programs SET NULL, NULL | Optional parent program |
| `title` | TEXT | NOT NULL | |
| `description` | TEXT | NOT NULL DEFAULT '' | |
| `category` | TEXT | CHECK | `feature` / `bugfix` / `refactor` / `orchestration` / `quick_task` / `advisory` |
| `priority` | TEXT | CHECK | `low` / `medium` / `high` / `critical` |
| `status` | TEXT | CHECK | `active` / `completed` / `archived` / `paused` / `blocked` |
| `schema_version` | TEXT | NOT NULL DEFAULT '2.0' | |
| `goals` | TEXT | NOT NULL DEFAULT '[]' | JSON: `string[]` |
| `success_criteria` | TEXT | NOT NULL DEFAULT '[]' | JSON: `string[]` |
| `categorization` | TEXT | NULL | JSON: `CategorizationResult` |
| `deployment_context` | TEXT | NULL | JSON: `DeploymentContext` |
| `confirmation_state` | TEXT | NULL | JSON: `ConfirmationState` |
| `paused_at` | TEXT | NULL | ISO 8601 index column (extracted from `paused_at_snapshot`) |
| `paused_at_snapshot` | TEXT | NULL | JSON: `PausedAtSnapshot` |
| `recommended_next_agent` | TEXT | NULL | AgentType string |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |
| `archived_at` | TEXT | NULL | |
| `completed_at` | TEXT | NULL | |

---

### `phases`

Ordered phases within a plan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `name` | TEXT | NOT NULL | Human-readable phase label |
| `order_index` | INTEGER | NOT NULL DEFAULT 0 | Sort order |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |

**UNIQUE(plan_id, name)**

---

### `steps`

Individual work items within a phase.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `phase_id` | TEXT | FK → phases CASCADE | |
| `plan_id` | TEXT | FK → plans CASCADE | Denormalized for fast plan-level queries |
| `task` | TEXT | NOT NULL | Step description |
| `type` | TEXT | NOT NULL DEFAULT 'standard' | `standard` / `analysis` / `validation` / etc. |
| `status` | TEXT | NOT NULL DEFAULT 'pending' | `pending` / `active` / `done` / `blocked` |
| `assignee` | TEXT | NULL | Agent type |
| `notes` | TEXT | NULL | Completion or blocker notes |
| `order_index` | INTEGER | NOT NULL DEFAULT 0 | Position within phase |
| `requires_confirmation` | INTEGER | NOT NULL DEFAULT 0 | 0\|1 boolean |
| `requires_user_confirmation` | INTEGER | NOT NULL DEFAULT 0 | 0\|1 boolean |
| `requires_validation` | INTEGER | NOT NULL DEFAULT 0 | 0\|1 boolean |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |
| `completed_at` | TEXT | NULL | |
| `completed_by_agent` | TEXT | NULL | |

> **Note:** `depends_on` column was removed in migration 002. Use the `dependencies` table instead.

---

### `plan_notes`

Freeform notes attached to a plan (info / warning / instruction).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `content` | TEXT | NOT NULL | |
| `note_type` | TEXT | NOT NULL DEFAULT 'info' | `info` / `warning` / `instruction` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |

---

## 3. Agent Lifecycle

### `sessions`

Agent session records tied to a plan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | `sess_…` prefixed ID |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `agent_type` | TEXT | NOT NULL | `Coordinator` / `Executor` / etc. |
| `started_at` | TEXT | NOT NULL, DEFAULT now | |
| `completed_at` | TEXT | NULL | Set by `memory_agent(action: complete)` |
| `summary` | TEXT | NULL | Completion summary |
| `artifacts` | TEXT | NULL | JSON: `string[]` (file paths) |
| `is_orphaned` | INTEGER | NOT NULL DEFAULT 0 | 0\|1 — set when session ended abnormally |
| `context` | TEXT | NULL | JSON: `{ deployed_by, reason, current_step_index, ... }` |

---

### `lineage`

Handoff history between agents for a plan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `from_agent` | TEXT | NOT NULL | Source agent type |
| `to_agent` | TEXT | NOT NULL | Target agent type (usually `Coordinator`) |
| `reason` | TEXT | NOT NULL DEFAULT '' | Human-readable handoff reason |
| `data` | TEXT | NULL | JSON: `{ recommendation, steps_completed, files_modified, ... }` |
| `timestamp` | TEXT | NOT NULL, DEFAULT now | |

---

## 4. Context & Knowledge

### `context_items`

Typed JSON blobs scoped to a workspace, plan, phase, or step.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `parent_type` | TEXT | NOT NULL | `workspace` / `plan` / `phase` / `step` |
| `parent_id` | TEXT | NOT NULL | ID of the parent entity |
| `type` | TEXT | NOT NULL | Key for the context blob (e.g. `execution_log`) |
| `data` | TEXT | NOT NULL | JSON payload |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

---

### `research_documents`

Polymorphic research notes — any parent type (workspace, plan, phase, step).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | |
| `parent_type` | TEXT | CHECK | `workspace` / `plan` / `phase` / `step` |
| `parent_id` | TEXT | NULL | NULL only when `parent_type = 'workspace'` |
| `filename` | TEXT | NOT NULL | e.g. `codebase-analysis.md` |
| `content` | TEXT | NOT NULL DEFAULT '' | Markdown content (append semantics) |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

**UNIQUE(workspace_id, parent_type, parent_id, filename)**

---

### `knowledge`

Long-lived workspace-scoped knowledge files (e.g. SKILL.md patterns).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | |
| `slug` | TEXT | NOT NULL | URL-safe identifier |
| `title` | TEXT | NOT NULL | |
| `data` | TEXT | NOT NULL | JSON payload |
| `category` | TEXT | NULL | |
| `tags` | TEXT | NULL | JSON: `string[]` |
| `created_by_agent` | TEXT | NULL | |
| `created_by_plan` | TEXT | NULL | |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |
| `updated_at` | TEXT | NOT NULL, DEFAULT now | |

**UNIQUE(workspace_id, slug)**

---

## 5. Build & Dependencies

### `build_scripts`

Reusable build/test/deploy commands for a workspace or plan.

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | TEXT | PK | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | |
| `plan_id` | TEXT | FK → plans SET NULL, NULL | Plan-scoped (optional) |
| `name` | TEXT | NOT NULL | |
| `description` | TEXT | NULL | |
| `command` | TEXT | NOT NULL | Shell command |
| `directory` | TEXT | NOT NULL | Working directory |
| `mcp_handle` | TEXT | NULL | Programmatic identifier |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |

---

### `dependencies`

Generic directed-dependency graph (plans, phases, steps, programs).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `source_type` | TEXT | CHECK | `plan` / `phase` / `step` / `program` |
| `source_id` | TEXT | NOT NULL | ID of the "blocker" entity |
| `target_type` | TEXT | CHECK | `plan` / `phase` / `step` / `program` |
| `target_id` | TEXT | NOT NULL | ID of the "blocked" entity |
| `dep_type` | TEXT | CHECK | `blocks` (hard gate) / `informs` (soft reference) |
| `dep_status` | TEXT | CHECK | `pending` / `satisfied` |
| `created_at` | TEXT | NOT NULL, DEFAULT now | |

**UNIQUE(source_type, source_id, target_type, target_id)**

For step dependencies: `source_id = the blocker step`, `target_id = the blocked step`.

---

### `step_file_edits`

File-level change history per step/plan (added in migration 002).

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | INTEGER | PK AUTOINCREMENT | |
| `workspace_id` | TEXT | FK → workspaces CASCADE | |
| `plan_id` | TEXT | FK → plans CASCADE | |
| `step_id` | TEXT | FK → steps SET NULL, NULL | Optional — may be NULL for migration-discovered edits |
| `file_path` | TEXT | NOT NULL | Workspace-relative path |
| `change_type` | TEXT | CHECK | `create` / `edit` / `delete` / `rename` |
| `previous_path` | TEXT | NULL | For rename operations only |
| `edited_at` | TEXT | NOT NULL, DEFAULT now | |
| `agent_type` | TEXT | NULL | |
| `session_id` | TEXT | NULL | |
| `notes` | TEXT | NULL | |

---

## 6. Tool Catalog

### `tools` / `tool_actions` / `tool_action_params`

Seeded catalog of MCP tools and their actions.

#### `tools`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `name` | TEXT UNIQUE | e.g. `memory_plan` |
| `description` | TEXT | |

#### `tool_actions`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `tool_id` | TEXT FK → tools | |
| `name` | TEXT | e.g. `create` |
| `description` | TEXT | |

**UNIQUE(tool_id, name)**

#### `tool_action_params`
| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `action_id` | TEXT FK → tool_actions | |
| `name` | TEXT | Parameter name |
| `type` | TEXT DEFAULT 'string' | |
| `required` | INTEGER | 0\|1 |
| `description` | TEXT | |
| `default_value` | TEXT NULL | |

**UNIQUE(action_id, name)**

---

## 7. Agent / Instruction / Skill Storage

### `agent_definitions`

Stored agent prompt files.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `name` | TEXT UNIQUE | e.g. `executor` |
| `content` | TEXT | Full agent markdown prompt |
| `metadata` | TEXT NULL | JSON |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

---

### `instruction_files`

Stored `.github/instructions/*.md` files.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `filename` | TEXT UNIQUE | |
| `applies_to` | TEXT DEFAULT '**/*' | Glob pattern |
| `content` | TEXT | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

---

### `skill_definitions`

SKILL.md skill definitions for on-demand agent loading.

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | |
| `name` | TEXT UNIQUE | e.g. `pyside6-mvc` |
| `category` | TEXT NULL | |
| `tags` | TEXT NULL | JSON: `string[]` |
| `language_targets` | TEXT NULL | JSON: `string[]` |
| `framework_targets` | TEXT NULL | JSON: `string[]` |
| `content` | TEXT | Full SKILL.md content |
| `description` | TEXT NULL | |
| `created_at` | TEXT | |
| `updated_at` | TEXT | |

---

## 8. Audit Tables

### `update_log`

Workspace-scoped action audit trail (replaces legacy `workspace.context.json` `update_log` array).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `workspace_id` | TEXT FK → workspaces CASCADE | |
| `timestamp` | TEXT DEFAULT now | |
| `action` | TEXT NOT NULL | e.g. `plan_created`, `step_done` |
| `data` | TEXT NULL | JSON payload |

---

### `event_log`

Global server event log (replaces legacy `data/events/` JSON files).

| Column | Type | Description |
|--------|------|-------------|
| `id` | INTEGER PK AUTOINCREMENT | |
| `event_type` | TEXT NOT NULL | e.g. `agent_init`, `server_log` |
| `data` | TEXT NULL | JSON payload |
| `timestamp` | TEXT DEFAULT now | |

---

## 9. Archive Tables

Each active table has a corresponding `*_archive` mirror that adds an `archived_at` column. Archive rows are inserted when a plan is archived. The archive tables have no foreign-key constraints (to permit independent querying after the source plan is deleted).

| Archive Table | Source Table |
|---------------|-------------|
| `plans_archive` | `plans` |
| `phases_archive` | `phases` |
| `steps_archive` | `steps` |
| `sessions_archive` | `sessions` |
| `lineage_archive` | `lineage` |

---

## 10. Index Reference

| Index | Table | Columns | Notes |
|-------|-------|---------|-------|
| `idx_workspaces_path` | workspaces | path | Unique path lookup |
| `idx_workspaces_parent` | workspaces | parent_workspace_id | Hierarchy traversal |
| `idx_programs_workspace` | programs | workspace_id | |
| `idx_programs_status` | programs | workspace_id, status | |
| `idx_program_plans_program` | program_plans | program_id | |
| `idx_program_plans_plan` | program_plans | plan_id | |
| `idx_pwl_program` | program_workspace_links | program_id | |
| `idx_pwl_workspace` | program_workspace_links | workspace_id | |
| `idx_plans_workspace` | plans | workspace_id | |
| `idx_plans_workspace_status` | plans | workspace_id, status | Primary filtering index |
| `idx_plans_workspace_category` | plans | workspace_id, category | |
| `idx_plans_program_id` | plans | program_id WHERE NOT NULL | |
| `idx_plans_paused_at` | plans | paused_at WHERE NOT NULL | |
| `idx_phases_plan_order` | phases | plan_id, order_index | Ordered phase retrieval |
| `idx_steps_phase_order` | steps | phase_id, order_index | Ordered step retrieval |
| `idx_steps_plan` | steps | plan_id | |
| `idx_steps_plan_status` | steps | plan_id, status | Pending/active step lookup |
| `idx_sessions_plan` | sessions | plan_id | |
| `idx_lineage_plan` | lineage | plan_id | |
| `idx_context_parent` | context_items | parent_type, parent_id | |
| `idx_context_parent_type` | context_items | parent_type, parent_id, type | Full key lookup |
| `idx_research_workspace` | research_documents | workspace_id | |
| `idx_research_parent` | research_documents | parent_type, parent_id | |
| `idx_knowledge_workspace` | knowledge | workspace_id | |
| `idx_build_scripts_workspace` | build_scripts | workspace_id | |
| `idx_build_scripts_plan` | build_scripts | plan_id | |
| `idx_deps_source` | dependencies | source_type, source_id | |
| `idx_deps_target` | dependencies | target_type, target_id | |
| `idx_sfe_workspace` | step_file_edits | workspace_id | |
| `idx_sfe_plan` | step_file_edits | plan_id | |
| `idx_sfe_step` | step_file_edits | step_id | |
| `idx_sfe_file_path` | step_file_edits | file_path | Fuzzy file search |
| `idx_sfe_edited_at` | step_file_edits | edited_at | Chronological queries |
| `idx_update_log_workspace` | update_log | workspace_id | |
| `idx_update_log_timestamp` | update_log | timestamp | |
| `idx_event_log_type` | event_log | event_type | |
| `idx_event_log_timestamp` | event_log | timestamp | |
| `idx_skill_category` | skill_definitions | category | |

---

## Schema Design Notes

### JSON Column Conventions

All JSON columns store text and must be parsed by the caller (`JSON.parse(row.field)`). They never contain `undefined` — omitted keys are simply absent. The TypeScript `types.ts` file documents the shape of each JSON column.

### Integer Booleans

Columns like `requires_confirmation` and `is_orphaned` are stored as `INTEGER 0|1` because SQLite has no native `BOOLEAN` type. Use `Boolean(row.field)` to convert.

### Text Dates

All timestamps are stored as ISO 8601 text (`YYYY-MM-DD HH:MM:SS` or `YYYY-MM-DDTHH:MM:SS.sssZ`). Use `nowIso()` from `query-helpers.ts` for consistent formatting.

### Cascade Behaviour

- Plans, phases, steps, sessions, and lineage all cascade-delete when their parent workspace is deleted.
- `program_id` on `plans` uses `SET NULL` so plans survive program deletion.
- Archive tables have no FK constraints — they are read-only history logs.
