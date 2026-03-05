# Object-Level Change Timeline

**Source:** Migration files 001–009 (read directly from `server/src/db/migrations/`)  
**Date:** 2026-03-05

---

## 001-initial-schema.sql

**Summary:** Establishes the complete initial schema — workspace/plan/agent domain plus tool catalog, audit, and all archive tables.

### Tables Created (30 total: 25 active + 5 archive)

#### Workspace & Organization
- **workspaces** — `id TEXT PK, path TEXT UNIQUE NOT NULL, name TEXT NOT NULL, parent_workspace_id TEXT→workspaces (SET NULL), registered_at TEXT, updated_at TEXT, profile TEXT (JSON), meta TEXT (JSON)`
- **programs** — `id TEXT PK, workspace_id→workspaces (CASCADE), title, description, category CHECK(6 values), priority CHECK(4 values), status CHECK(4 values), schema_version DEFAULT '2.0', goals/success_criteria (JSON), source, created_at, updated_at, archived_at`

#### Plans & Structure
- **plans** — `id TEXT PK, workspace_id→workspaces (CASCADE), program_id→programs (SET NULL NULLABLE), title, description, category, priority, status, schema_version, goals, success_criteria, categorization (JSON), deployment_context (JSON), confirmation_state (JSON), paused_at, paused_at_snapshot (JSON), recommended_next_agent, created_at, updated_at, archived_at, completed_at`
- **program_plans** — `id INTEGER PK AUTOINCR, program_id→programs (CASCADE), plan_id→plans (CASCADE), order_index DEFAULT 0, added_at; UNIQUE(program_id, plan_id)`
- **program_workspace_links** — `id INTEGER PK AUTOINCR, program_id→programs (CASCADE), workspace_id→workspaces (CASCADE), linked_at, linked_by; UNIQUE(program_id, workspace_id)`
- **program_risks** — `id TEXT PK, program_id→programs (CASCADE), risk_type CHECK(3 values), severity CHECK(4 values), description, affected_plan_ids (JSON), mitigation, created_at`
- **phases** — `id TEXT PK, plan_id→plans (CASCADE), name, order_index DEFAULT 0, created_at; UNIQUE(plan_id, name)`
- **steps** — `id TEXT PK, phase_id→phases (CASCADE), plan_id→plans (CASCADE), task, type DEFAULT 'standard', status DEFAULT 'pending', assignee, notes, order_index, requires_confirmation/requires_user_confirmation/requires_validation (INTEGER 0/1), created_at, updated_at, completed_at, completed_by_agent`
- **plan_notes** — `id TEXT PK, plan_id→plans (CASCADE), content, note_type DEFAULT 'info', created_at`

#### Agent Lifecycle
- **sessions** — `id TEXT PK, plan_id→plans (CASCADE), agent_type, started_at, completed_at, summary, artifacts (JSON), is_orphaned INTEGER DEFAULT 0, context (JSON)`
- **lineage** — `id TEXT PK, plan_id→plans (CASCADE), from_agent, to_agent, reason, data (JSON), timestamp`

#### Context & Knowledge
- **context_items** — `id TEXT PK, parent_type TEXT (polymorphic), parent_id TEXT, type TEXT, data TEXT (JSON), created_at, updated_at`
- **research_documents** — `id INTEGER PK AUTOINCR, workspace_id→workspaces (CASCADE), parent_type CHECK(4 values), parent_id TEXT NULLABLE, filename, content, created_at, updated_at; UNIQUE(workspace_id, parent_type, parent_id, filename)`
  > Note: 001 defines this as plan-scoped only; 002 transforms it to polymorphic.
- **knowledge** — `id TEXT PK, workspace_id→workspaces (CASCADE), slug, title, data (JSON), category, tags (JSON), created_by_agent, created_by_plan, created_at, updated_at; UNIQUE(workspace_id, slug)`

#### Build & Dependencies
- **build_scripts** — `id TEXT PK, workspace_id→workspaces (CASCADE), plan_id→plans (SET NULL NULLABLE), name, description, command, directory, mcp_handle, created_at`
- **dependencies** — `id INTEGER PK AUTOINCR, source_type CHECK(4 values), source_id TEXT, target_type CHECK(4 values), target_id TEXT, dep_type CHECK('blocks','informs'), dep_status CHECK('pending','satisfied'), created_at; UNIQUE(source_type, source_id, target_type, target_id)`

#### Tool Catalog
- **tools** — `id TEXT PK, name TEXT UNIQUE NOT NULL, description`
- **tool_actions** — `id TEXT PK, tool_id→tools (CASCADE), name, description; UNIQUE(tool_id, name)`
- **tool_action_params** — `id TEXT PK, action_id→tool_actions (CASCADE), name, type DEFAULT 'string', required INTEGER DEFAULT 0, description, default_value; UNIQUE(action_id, name)`

#### Agent / Instruction / Skill Storage
- **agent_definitions** — `id TEXT PK, name TEXT UNIQUE NOT NULL, content DEFAULT '', metadata (JSON), created_at, updated_at`
- **instruction_files** — `id TEXT PK, filename TEXT UNIQUE NOT NULL, applies_to DEFAULT '**/*', content DEFAULT '', created_at, updated_at`
- **skill_definitions** — `id TEXT PK, name TEXT UNIQUE NOT NULL, category, tags (JSON), language_targets (JSON), framework_targets (JSON), content, description, created_at, updated_at`

#### Audit
- **update_log** — `id INTEGER PK AUTOINCR, workspace_id→workspaces (CASCADE), timestamp, action, data (JSON)`
- **event_log** — `id INTEGER PK AUTOINCR, event_type, data (JSON), timestamp`
- **step_file_edits** — `id INTEGER PK AUTOINCR, workspace_id→workspaces (CASCADE), plan_id→plans (CASCADE), step_id→steps (SET NULL NULLABLE), file_path, change_type CHECK(4 values), previous_path, edited_at, agent_type, session_id, notes`

#### Archive Tables
- **plans_archive** — mirror of plans + `archived_at` (no FK constraints)
- **phases_archive** — mirror of phases + `archived_at`
- **steps_archive** — mirror of steps + `archived_at`
- **sessions_archive** — mirror of sessions + `archived_at`
- **lineage_archive** — mirror of lineage + `archived_at`

### Indexes Created (57 in 001)
All key query patterns indexed: workspace lookups, plan status, steps by phase/plan, context by parent, etc.

---

## 002-gap-closure.sql

**Summary:** Three gap-closure changes — adds `program_workspace_links`, transforms `research_documents` to polymorphic, adds `step_file_edits`.

### Tables Created
- **program_workspace_links** — `id INTEGER PK AUTOINCR, program_id→programs (CASCADE), workspace_id→workspaces (CASCADE), linked_at, linked_by; UNIQUE(program_id, workspace_id)`
  > Idempotent: IF NOT EXISTS guard (already present in 001 for fresh schemas)
- **step_file_edits** (formally) — same structure as in 001; IF NOT EXISTS guard makes both migrations safe
  > Also idempotent: IF NOT EXISTS guard

### Tables Structurally Transformed
- **research_documents** — Replaced via rename strategy:
  1. Create `research_documents_v2` with polymorphic `parent_type`/`parent_id` replacing flat `plan_id`
  2. Migrate plan-scoped rows: `parent_type='plan', parent_id=<plan_id>`
  3. Migrate workspace-scoped rows: `parent_type='workspace', parent_id=NULL`
  4. `DROP TABLE research_documents` (old); `ALTER TABLE research_documents_v2 RENAME TO research_documents`
  - Added columns vs 001 version: `parent_type CHECK(4 values)`, `parent_id TEXT NULLABLE`
  - Removed columns: `plan_id` (replaced by polymorphic `parent_id`)

### Columns Removed (Soft)
- `steps.depends_on` — documented as never having been in 001; no DROP needed

### Indexes Added
- `idx_pwl_program`, `idx_pwl_workspace` on program_workspace_links
- `idx_research_workspace`, `idx_research_parent` on research_documents
- `idx_sfe_*` (5 indexes) on step_file_edits

---

## 003-program-extended.sql

**Summary:** Fills missing columns on `program_risks` and `dependencies` to match application-level types.

### Tables Altered

**program_risks** — 5 columns added:
| Column | Type | Default |
|--------|------|---------|
| `title` | TEXT | `''` |
| `risk_status` | TEXT | `'identified'` |
| `detected_by` | TEXT | `'manual'` |
| `source_plan_id` | TEXT | `NULL` |
| `updated_at` | TEXT | `datetime('now')` |

**dependencies** — 3 columns added:
| Column | Type | Default |
|--------|------|---------|
| `source_phase` | TEXT | `NULL` |
| `target_phase` | TEXT | `NULL` |
| `satisfied_at` | TEXT | `NULL` |

---

## 004-agent-deployments.sql

**Summary:** Adds agent deployment tracking table.

### Tables Created
- **agent_deployments** — `id TEXT PK, workspace_id→workspaces (CASCADE), agent_name TEXT, deployed_path, version_hash, is_customized INTEGER DEFAULT 0, sync_status CHECK('synced','outdated','customized','missing'), deployed_at, last_updated; UNIQUE(workspace_id, agent_name)`

### Indexes Added
- `idx_agent_deployments_workspace` on agent_deployments(workspace_id)
- `idx_agent_deployments_agent` on agent_deployments(agent_name)

---

## 005-instruction-skill-deployments.sql

**Summary:** Adds instruction and skill deployment tracking tables.

### Tables Created
- **instruction_deployments** — `id TEXT PK, workspace_id→workspaces (CASCADE), filename, deployed_path, version_hash, is_customized DEFAULT 0, sync_status CHECK(4 values), deployed_at, last_updated; UNIQUE(workspace_id, filename)`
- **skill_deployments** — `id TEXT PK, workspace_id→workspaces (CASCADE), skill_name, deployed_path, version_hash, is_customized DEFAULT 0, sync_status CHECK(4 values), deployed_at, last_updated; UNIQUE(workspace_id, skill_name)`

### Indexes Added
- `idx_instruction_deployments_workspace`, `idx_instruction_deployments_filename`
- `idx_skill_deployments_workspace`, `idx_skill_deployments_skill`

---

## 006-dynamic-hub-agent-model.sql

**Summary:** Dynamic hub agent model — extends `agent_definitions`, adds workspace session registry and GUI routing contracts.

### Tables Altered

**agent_definitions** — 5 columns added:
| Column | Type | Notes |
|--------|------|-------|
| `allowed_tools` | TEXT | JSON: string[] of tool:action patterns |
| `blocked_tools` | TEXT | JSON: string[] of blocked tool:action patterns |
| `required_context_keys` | TEXT | JSON: string[] of required context key names |
| `checkpoint_triggers` | TEXT | JSON: trigger conditions for mandatory checkpoints |
| `is_permanent` | INTEGER NOT NULL DEFAULT 0 | 1 = hub/prompt-analyst (persist at .github/agents/) |

### Tables Created
- **workspace_session_registry** — `id TEXT PK, workspace_id→workspaces (CASCADE), plan_id→plans (SET NULL NULLABLE), agent_type, current_phase, step_indices_claimed (JSON), files_in_scope (JSON), materialised_path, status CHECK('active','stopping','completed'), started_at, updated_at`
- **gui_routing_contracts** — `id TEXT PK, contract_type TEXT UNIQUE CHECK('approval','brainstorm'), version DEFAULT '1.0', trigger_criteria (JSON), invocation_params_schema (JSON), response_schema (JSON), feedback_paths (JSON), fallback_behavior CHECK(3 values), enabled INTEGER DEFAULT 1, created_at, updated_at`

### Indexes Added
- `idx_wsr_workspace`, `idx_wsr_workspace_status`, `idx_wsr_plan` on workspace_session_registry
- `idx_gui_contracts_type` on gui_routing_contracts

---

## 007-deployable-workflow-definitions.sql

**Summary:** Adds deployable hub agent profile registry and per-category workflow definitions.

### Tables Created
- **deployable_agent_profiles** — `id TEXT PK, agent_name TEXT UNIQUE→agent_definitions(name) (CASCADE), role TEXT UNIQUE CHECK('hub','prompt_analyst'), enabled DEFAULT 1, metadata (JSON), created_at, updated_at`
- **category_workflow_definitions** — `id TEXT PK, category TEXT UNIQUE CHECK(7 categories), scope_classification CHECK(4 values), planning_depth, workflow_path (JSON), skip_agents (JSON), requires_research INTEGER, requires_brainstorm INTEGER, recommends_integrated_program INTEGER, recommended_plan_count, recommended_program_count, candidate_plan_titles (JSON), decomposition_strategy, hub_agent_name→deployable_agent_profiles(agent_name) (SET NULL NULLABLE), prompt_analyst_agent_name→deployable_agent_profiles(agent_name) (SET NULL NULLABLE), metadata (JSON), created_at, updated_at`

### Indexes Added
- `idx_deployable_profiles_enabled` on deployable_agent_profiles(enabled)
- `idx_category_workflow_scope` on category_workflow_definitions(scope_classification)

---

## 008-workspace-instruction-skill-assignments.sql

**Summary:** Workspace-scoped instruction and skill assignment tables (explicit per-workspace binding beyond glob-based `applies_to`).

### Tables Created
- **workspace_instruction_assignments** — `id TEXT PK, workspace_id→workspaces (CASCADE), filename TEXT, notes, assigned_at; UNIQUE(workspace_id, filename)`
- **workspace_skill_assignments** — `id TEXT PK, workspace_id→workspaces (CASCADE), skill_name TEXT, notes, assigned_at; UNIQUE(workspace_id, skill_name)`

### Indexes Added
- `idx_wia_workspace`, `idx_wia_filename` on workspace_instruction_assignments
- `idx_wsa_workspace`, `idx_wsa_skill` on workspace_skill_assignments

---

## 009-workflow-mode.sql

**Summary:** Adds per-plan workflow mode settings table and a DELETE trigger.

### Tables Created
- **plan_workflow_settings** — `id INTEGER PK AUTOINCR, plan_id→plans (CASCADE), workflow_mode CHECK('standard','tdd','enrichment','overnight') DEFAULT 'standard', set_at TEXT NOT NULL, updated_at TEXT NOT NULL; UNIQUE(plan_id)`

### Triggers Created
- **trg_delete_workflow_settings** — `AFTER DELETE ON plans FOR EACH ROW: DELETE FROM plan_workflow_settings WHERE plan_id = OLD.id`
  > Note: This duplicates the FK CASCADE behavior but was added as an explicit trigger, likely for compatibility or explicit intent signaling.

---

## Change Summary by Table

| Table | First Appeared | Last Modified | Migrations That Touch It |
|-------|---------------|--------------|--------------------------|
| workspaces | 001 | 001 | 001 |
| programs | 001 | 001 | 001 |
| plans | 001 | 001 | 001 |
| program_plans | 001 | 001 | 001 |
| program_workspace_links | 001 | 002 | 001, 002 (idempotent) |
| program_risks | 001 | 003 | 001 (create), 003 (extend) |
| phases | 001 | 001 | 001 |
| steps | 001 | 001 | 001 |
| plan_notes | 001 | 001 | 001 |
| sessions | 001 | 001 | 001 |
| lineage | 001 | 001 | 001 |
| context_items | 001 | 001 | 001 |
| research_documents | 001 | 002 | 001 (create), 002 (transform to polymorphic) |
| knowledge | 001 | 001 | 001 |
| build_scripts | 001 | 001 | 001 |
| dependencies | 001 | 003 | 001 (create), 003 (extend) |
| tools | 001 | 001 | 001 |
| tool_actions | 001 | 001 | 001 |
| tool_action_params | 001 | 001 | 001 |
| agent_definitions | 001 | 006 | 001 (create), 006 (extend) |
| instruction_files | 001 | 001 | 001 |
| skill_definitions | 001 | 001 | 001 |
| update_log | 001 | 001 | 001 |
| event_log | 001 | 001 | 001 |
| step_file_edits | 001 | 002 | 001 (create), 002 (idempotent re-create) |
| agent_deployments | 004 | 004 | 004 |
| instruction_deployments | 005 | 005 | 005 |
| skill_deployments | 005 | 005 | 005 |
| workspace_session_registry | 006 | 006 | 006 |
| gui_routing_contracts | 006 | 006 | 006 |
| deployable_agent_profiles | 007 | 007 | 007 |
| category_workflow_definitions | 007 | 007 | 007 |
| workspace_instruction_assignments | 008 | 008 | 008 |
| workspace_skill_assignments | 008 | 008 | 008 |
| plan_workflow_settings | 009 | 009 | 009 |
| plans_archive | 001 | 001 | 001 |
| phases_archive | 001 | 001 | 001 |
| steps_archive | 001 | 001 | 001 |
| sessions_archive | 001 | 001 | 001 |
| lineage_archive | 001 | 001 | 001 |
| _migrations | auto | — | (created by runner, not migrations) |
