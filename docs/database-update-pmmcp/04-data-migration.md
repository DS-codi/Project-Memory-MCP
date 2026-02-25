# Plan 4: Data Migration

**Category:** Feature  
**Priority:** Critical  
**Status:** Implementation Complete — Execution Pending  
**Parent Program:** [Database Migration & System Stabilization](00-program-overview.md)  
**Dependencies:** Plan 3 (Schema Design & DB Foundation), Plan 3.5 (Plan Type Schema Extension)  
**Workspace Directory:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`

## Goal

Build migration scripts that read the entire existing `data/` directory tree and populate the new SQLite database. Every workspace, plan, step, session, lineage entry, context file, research note, knowledge file, program, event, and log must be migrated. Validate referential integrity post-migration. Handle all known edge cases (ghost workspaces, duplicate IDs, missing files, legacy ID redirects).

### Scope

The migration is **one-way and permanent**. After migration, the file-based `data/` directory becomes read-only archival material. The migration script must be idempotent (safe to re-run) and produce a detailed report of what was migrated, skipped, or failed.

### Plan & Program Type Variants

The `data/` directory contains multiple plan/program variants that each require specific handling:

| Variant | How to Identify | Key Differences | Migration Action |
|---------|----------------|-----------------|------------------|
| **V1 plan** | No `schema_version` in `state.json` | Legacy categories (`bug`, `change`, `analysis`, `investigation`, `debug`, `documentation`). Phases are implicit strings on `steps[].phase`, no `phases[]` array. | Normalize category via `migrateCategoryToV2()`. Extract unique phase strings from steps, create `phases` rows with inferred `order_index` (by first occurrence). Write `schema_version = '2.0'` in DB. |
| **V2 plan** | `schema_version: '2.0'` | Structured `phases[]` array with `order_index`, `title`, `description`, `status`. Uses v2 categories (`feature`, `bugfix`, `refactor`, `orchestration`, `quick_task`, `advisory`). | Direct mapping — phases and steps insert cleanly. |
| **Program container (v1)** | `is_program: true` + `child_plan_ids[]` on `PlanState` | Plan masquerading as a program shell. Has no meaningful steps of its own. | Create a `programs` row from plan metadata. Convert `child_plan_ids` → `program_plans` join rows. Set `program_id` FK on each child plan. Do **not** insert into `plans` table. |
| **Program (v2)** | Separate `programs/{id}/` directory with `program.json` | Independent `ProgramState` type. Has `manifest.json` (child plan list), `dependencies.json` (DAG: `blocks`/`informs` edges between plans), `risks.json` (risk register: `functional_conflict`/`behavioral_change`/`dependency_risk`). | Insert into `programs` table. Parse manifest → `program_plans`. Parse dependencies → `dependencies` table. Parse risks → program-scoped context or dedicated table. |
| **Archived plan** | Located in `plans/_archived/` | Same structure as active plans (v1 or v2). May have been archived mid-work. | Migrate to archive tables (`plans_archive`, `phases_archive`, etc.). Apply same v1→v2 normalization as active plans. |
| **Child plan** | Has `program_id` set in `state.json` | Regular plan that belongs to a program. May also have `depends_on_plans[]` array. | Insert as regular plan. Set `program_id` FK. Insert `depends_on_plans` entries into `dependencies` table. |
| **Paused plan** | Has `paused_at_snapshot` in `state.json` | Plan was paused at an approval gate. Snapshot contains `confirmation_state`, `paused_at` timestamp. | Preserve `paused_at_snapshot` as a JSON column on the plan row. Restore `confirmation_state` data. |

**Category migration map** (`migrateCategoryToV2()` from `server/src/types/context.types.ts`):

| Legacy (v1) | V2 Equivalent |
|-------------|---------------|
| `bug` | `bugfix` |
| `change` | `feature` |
| `analysis` | `advisory` |
| `investigation` | `advisory` |
| `debug` | `bugfix` |
| `documentation` | `quick_task` |

---

## Phase 1: Migration Script Scaffolding

- [x] **1.1** Create `server/src/migration/migrate.ts` — main migration entry point:
  - Accepts `--data-root <path>` CLI argument (defaults to `MBS_DATA_ROOT` env var)
  - Accepts `--dry-run` flag (logs what would be migrated without writing)
  - Accepts `--verbose` flag (detailed per-file logging)
  - Opens the SQLite database (from Plan 3's `connection.ts`)
  - Runs all migrations (from Plan 3's `migration-runner.ts`)
  - Executes migration phases in order
  - Produces a summary report at the end
- [x] **1.2** Create `server/src/migration/report.ts` — migration report builder:
  - Tracks counts per entity type (workspaces, plans, steps, etc.)
  - Tracks skipped items with reasons
  - Tracks errors with file paths
  - Outputs a formatted report to stdout and optionally to a JSON file

## Phase 2: Workspace Migration

- [x] **2.1** Create `server/src/migration/migrate-workspaces.ts`:
  - Read `workspace-registry.json` from data root (5 entries currently)
  - For each registered path → ID mapping, create a workspace row
  - Then scan all directories in data root for `workspace.meta.json`
  - For unregistered directories (ghost workspaces), create workspace rows with `source: 'ghost'` flag
- [x] **2.2** Parse `workspace.meta.json` → insert into `workspaces` table:
  - `workspace_id`, `path`, `name`, `display_name`, `created_at`, `updated_at`, `registered_at`, `last_accessed`, `last_seen_at`
  - `indexed`, `profile` (JSON column), `parent_workspace_id`, `schema_version`
  - Handle `legacy_workspace_ids` array — insert redirect entries or alias mappings
- [x] **2.3** Parse `workspace.context.json` → insert into `context_items` table:
  - Each section in `sections` becomes a context_item with `parent_type: 'workspace'`, `parent_id: workspace_id`, `type: section_key`
  - The `update_log.entries` array → insert into `update_log` table (one row per entry)
- [x] **2.4** Parse `terminal-allowlist.json` → store as a workspace-scoped context_item or dedicated column
- [x] **2.5** Handle edge cases:
  - `ws_nonexistent/` and `ws_test_buildscripts_123/` — skip test stubs (log as skipped)
  - `DS-Program-Hotkeys-97bde3e31ca8` — migrate as ghost workspace
  - `Project-Memory-MCP-1f58de42e4a0` — migrate as ghost, note case difference from main
  - Legacy ID `project-memory-mcp-40f6678f5a9b` — migrate data, record as legacy alias of `project_memory_mcp-50e04147a402`

## Phase 3: Plan Migration

- [x] **3.1** Create `server/src/migration/migrate-plans.ts`:
  - For each workspace, scan `plans/` directory
  - For each plan directory, read `state.json`
  - **Detect plan variant** (see "Plan & Program Type Variants" table):
    - If `is_program: true` → **skip** here, handled in Phase 7 (Program Migration)
    - If `schema_version` is absent → **v1 plan**: normalize category via `migrateCategoryToV2()` (see category migration map above)
    - If `schema_version: '2.0'` → **v2 plan**: use category as-is
  - Insert into `plans` table using the following column mapping (full spec in Plan 3.5, Phase 6.1):

    | `state.json` field | `plans` column | Transformation |
    |--------------------|----------------|----------------|
    | `plan_id` | `id` | Direct |
    | *(workspace context)* | `workspace_id` | From enclosing workspace |
    | `program_id` | `program_id` | Nullable; `null` if absent |
    | `title` | `title` | Direct |
    | `description` | `description` | Default `''` if absent |
    | `category` | `category` | `migrateCategoryToV2(cat)` for v1; default `'feature'` if absent |
    | `priority` | `priority` | Default `'medium'` if absent |
    | `status` | `status` | Default `'active'` if absent |
    | *(always)* | `schema_version` | Hard-code `'2.0'` |
    | `goals` | `goals` | `JSON.stringify(v ?? [])` |
    | `success_criteria` | `success_criteria` | `JSON.stringify(v ?? [])` |
    | `categorization` | `categorization` | `JSON.stringify(v) ?? null` |
    | `deployment_context` | `deployment_context` | `JSON.stringify(v) ?? null` |
    | `confirmation_state` | `confirmation_state` | `JSON.stringify(v) ?? null` |
    | `paused_at_snapshot?.paused_at` | `paused_at` | Extracted timestamp or `null` |
    | `paused_at_snapshot` | `paused_at_snapshot` | `JSON.stringify(v) ?? null` |
    | `recommended_next_agent` | `recommended_next_agent` | Nullable |
    | `created_at` | `created_at` | Direct |
    | `updated_at` | `updated_at` | Fall back to `created_at` if absent |
    | `completed_at` | `completed_at` | Nullable |
    | `depends_on_plans[]` | *(not a column)* | Each entry → `dependencies` row: `{source_type: 'plan', source_id: plan_id, target_type: 'plan', target_id: dep_id, dep_type: 'blocks', dep_status: 'pending'}` |

  - Always write `schema_version = '2.0'` in DB (all plans normalized to v2 on migration)
  - If the plan has `program_id`, preserve it as FK to `programs` table (programs migrated first — see Phase 7 ordering note)
  - If the plan has `paused_at_snapshot`, extract `paused_at` timestamp for the indexed column
  - Plans with unknown or missing `category` → default to `'feature'`, log a warning
- [x] **3.2** Extract phases from plan state:
  - **V2 plans** (`phases[]` array present): insert each phase into `phases` table with its `order_index`, `title`, `description`, `status`
  - **V1 plans** (no `phases[]`): extract unique phase names from `steps[].phase` strings, create phase rows, assign `order_index` by first occurrence order in the steps array
  - Log a warning for any plan with zero phases (steps with no `phase` field — assign to a default "Unphased" phase)
- [x] **3.3** Migrate steps:
  - For each step in `state.json.steps`, insert into `steps` table
  - Map `step.phase` string to the correct `phase_id` (from step 3.2)
  - Preserve `order_index` (use `step.index` if present, else array position)
  - Map `status`, `type`, `assignee`, `notes`, `completed_at`, `depends_on`
- [x] **3.4** Migrate sessions:
  - For each entry in `state.json.agent_sessions`, insert into `sessions` table
  - Map `session_id`, `agent_type`, `started_at`, `completed_at`, `summary`, `artifacts`
  - Store `context`, `handoff_stats`, `stats_validation` as JSON columns
- [x] **3.5** Migrate lineage:
  - For each entry in `state.json.lineage`, insert into `lineage` table
  - Map `timestamp`, `from_agent`, `to_agent`, `reason`
- [x] **3.6** Migrate plan notes:
  - `state.json.notes` array → insert into `plan_notes` table
  - `state.json.pending_notes` → insert with `pending: true` flag
- [x] **3.7** Migrate plan metadata:
  - `goals`, `success_criteria` — store as JSON arrays on the plan row
  - `confirmation_state` — store as JSON column
  - `build_scripts` — insert into `build_scripts` table
  - `categorization` — store as JSON column
  - `deployment_context` — store as JSON column
- [x] **3.8** Handle `_archived/` directory:
  - Scan `plans/_archived/` for archived plan directories
  - Apply the **same v1/v2 detection and normalization** as active plans:
    - V1 archived plans: normalize category via `migrateCategoryToV2()`, extract phases from step strings
    - V2 archived plans: use structured `phases[]` directly
  - Insert into archive tables (`plans_archive`, `phases_archive`, `steps_archive`, `sessions_archive`, `lineage_archive`)
  - Handle the recovery `state.json` in `_archived/` root (if present)
- [x] **3.9** Handle edge cases:
  - `plan_temporary/` — migrate as-is with a warning note
  - Plan dirs without `plan_` prefix (e.g., `mlgu8tma_ace7925a/`) — migrate, deduplicate against `plan_mlgu8tma_ace7925a/` if both exist
  - Plans with `is_program: true` — **skip** (handled in Phase 7 as program containers)
  - Plans with unknown or missing `category` — default to `'feature'`, log a warning
  - Plans with legacy v1 categories — normalize via `migrateCategoryToV2()` (covered in 3.1, but double-check here)
  - Plans with no `state.json` — skip, log as error
  - Plans with corrupt JSON — skip, log as error with file path

## Phase 4: Context File Migration

- [x] **4.1** Create `server/src/migration/migrate-context.ts`:
  - For each plan directory, scan for known context files
- [x] **4.2** Migrate each context file type:

  | File | Context Type | Notes |
  |------|-------------|-------|
  | `original_request.json` | `original_request` | Contains user request, files mentioned, requirements, constraints |
  | `research.json` | `research_findings` | Research results with security metadata |
  | `architecture.json` | `architecture` | Design decisions, file maps |
  | `review.json` | `review_findings` | Review results |
  | `execution_log.json` | `execution_log` | Executor work log |
  | `test_context.json` | `test_context` | Test setup data |
  | `test_plan.json` | `test_plan` | Test plan |
  | `test_results.json` | `test_results` | Test outcomes |
  | `discovery.json` | `discovery` | Investigation data |
  | `pivot.json` | `pivot` | Plan pivot data |
  | `build_failure_analysis.json` | `build_failure_analysis` | Build diagnostics |
  | `active_run_lane.json` | `active_run_lane` | Active run tracking |
  | `stale_run_recovery.json` | `stale_run_recovery` | Recovery metadata |
  | `handoff_*.json` | `handoff_record` | Individual handoff records |

- [x] **4.3** Insert each context file as a `context_items` row with `parent_type: 'plan'`, `parent_id: plan_id`, `type: <context_type>`, `data: <parsed JSON content>`

## Phase 5: Research Notes Migration

- [x] **5.1** Create `server/src/migration/migrate-research.ts`:
  - For each plan with a `research_notes/` directory, read all `.md` files
- [x] **5.2** For each markdown file, insert into `research_documents` table:
  - `plan_id`, `workspace_id`, `filename`, `content` (full markdown text)
  - Derive `created_at` from file system mtime

## Phase 6: Knowledge Migration

- [x] **6.1** Create `server/src/migration/migrate-knowledge.ts`:
  - For each workspace with a `knowledge/` directory, read all JSON files
- [x] **6.2** For each knowledge file, insert into `knowledge` table:
  - `workspace_id`, `slug` (derived from filename), `title`, `category`, `tags`, `data` (full JSON), `created_at`, `updated_at`
  - Handle both `.json` and `.md` formats if present

## Phase 7: Program Migration

**⚠️ Execution order: Run Phase 7 BEFORE Phase 3** — plans reference `program_id` as a FK, so `programs` rows must exist first. The main `migrate.ts` entry point must call `migrate-programs` before `migrate-plans`.

- [x] **7.1** Create `server/src/migration/migrate-programs.ts`:
  - For each workspace, scan for **both** program sources:
    - **V2 programs**: `programs/` directory (independent `ProgramState` with `program.json`)
    - **V1 program containers**: `plans/` directory (`state.json` with `is_program: true`)
  - Log which type each program is for the migration report
- [x] **7.2** Migrate v2 programs (from `programs/{id}/` directories):
  - Read `program.json` → insert into `programs` table using this column mapping (full spec in Plan 3.5, Phase 6.2):

    | `program.json` field | `programs` column | Transformation |
    |----------------------|-------------------|----------------|
    | `id` | `id` | Direct |
    | *(workspace context)* | `workspace_id` | From enclosing workspace |
    | `title` | `title` | Direct |
    | `description` | `description` | Default `''` |
    | `category` | `category` | `migrateCategoryToV2(cat)` if needed; default `'feature'` |
    | `priority` | `priority` | Default `'medium'` |
    | `status` | `status` | Default `'active'` |
    | *(always)* | `schema_version` | Hard-code `'2.0'` |
    | `goals` | `goals` | `JSON.stringify(v ?? [])` |
    | `success_criteria` | `success_criteria` | `JSON.stringify(v ?? [])` |
    | *(always)* | `source` | `'v2'` |
    | `created_at` | `created_at` | Direct |
    | `updated_at` | `updated_at` | Fall back to `created_at` |

  - Read `manifest.json` → insert child plan links into `program_plans` join table:
    - `program_id` ← program ID
    - `plan_id` ← each entry in `manifest.child_plan_ids`
    - `order_index` ← array position
    - `added_at` ← DB default (`datetime('now')`)

  - Read `dependencies.json` → insert into `dependencies` table:
    - `source_type: 'plan'`, `source_id: dep.source_plan_id`
    - `target_type: 'plan'`, `target_id: dep.target_plan_id`
    - `dep_type: dep.type` — must be `'blocks'` or `'informs'`
    - `dep_status: dep.status` — must be `'pending'` or `'satisfied'`

  - Read `risks.json` → insert into `program_risks` table:
    - `id` ← `risk.id` or `crypto.randomUUID()`
    - `program_id` ← program ID
    - `risk_type` ← `risk.risk_type` (`'functional_conflict'` | `'behavioral_change'` | `'dependency_risk'`)
    - `severity` ← `risk.severity` (`'low'` | `'medium'` | `'high'` | `'critical'`)
    - `description` ← `risk.description`
    - `affected_plan_ids` ← `JSON.stringify(risk.affected_plan_ids ?? [])`
    - `mitigation` ← `risk.mitigation ?? null`
- [x] **7.3** Migrate v1 program containers (from plan `state.json` with `is_program: true`):
  - Create a `programs` row using the same column mapping as 7.2, with two differences:
    - `source: 'v1_migrated'` (not `'v2'`) — preserves provenance
    - Apply `migrateCategoryToV2()` unconditionally (v1 program containers use legacy categories)
  - Convert `child_plan_ids` array → `program_plans` join rows (same mapping as 7.2)
  - Do **not** insert into the `plans` table — the plan was a program shell, not a real plan
  - If the v1 program had `steps[]`, log a warning (program containers shouldn't have steps) and migrate them as program-scoped context if present
- [x] **7.4** Update `migrate.ts` execution order: Programs (Phase 7) → Workspaces (Phase 2) → Plans (Phase 3) → remaining phases. This ensures FK integrity for `program_id` on plans.

## Phase 8: Event & Log Migration

- [x] **8.1** Create `server/src/migration/migrate-events.ts`:
  - Read all `evt_*.json` files from `data/events/`
  - Parse each event JSON and insert into `event_log` table
  - Handle corrupt/malformed event files gracefully (skip and log)
- [x] **8.2** Migrate `events.log` — parse line-by-line (NDJSON format) into `event_log` rows
- [ ] **8.3** Create `server/src/migration/migrate-logs.ts`:
  - Read daily log files from `data/logs/`
  - Optionally store as rows in a `server_logs` table or skip (these are diagnostic, not operational data)
  - At minimum, migrate `dashboard-errors.log` and `process-audit.log` as server metadata

## Phase 9: Agent, Instruction & Skill Seeding

- [x] **9.1** Create `server/src/migration/migrate-agents.ts`:
  - Read all agent markdown files from `agents/` directory (coordinator.agent.md, executor.agent.md, etc.)
  - Parse frontmatter/headers for metadata
  - Insert into `agent_definitions` table with name, content, metadata
- [x] **9.2** Create `server/src/migration/migrate-instructions.ts`:
  - Read all instruction files from `.github/instructions/`
  - Parse the `applyTo` YAML frontmatter
  - Insert into `instruction_files` table with filename, applies_to pattern, content
- [x] **9.3** Create `server/src/migration/migrate-skills.ts`:
  - Read all skill SKILL.md files from `.github/skills/*/SKILL.md`
  - Parse structured frontmatter (category, tags, language_targets, framework_targets)
  - Insert into `skill_definitions` table with name, category, tags, content
- [x] **9.4** These operations are also performed by the seed script (Plan 3, Phase 5). The migration script should call the seed functions and then additionally migrate any workspace-specific agent/skill deployments.

## Phase 10: Validation

- [x] **10.1** Create `server/src/migration/validate.ts` — post-migration validation:
  - Count comparison: workspaces in DB vs directories on disk
  - Count comparison: plans in DB vs plan directories (per workspace)
  - Count comparison: steps in DB vs steps in `state.json` (per plan)
  - Count comparison: sessions and lineage entries
  - Count comparison: context items vs context files
  - Count comparison: knowledge entries vs knowledge files
  - Count comparison: events in DB vs event files
- [x] **10.2** Referential integrity check:
  - Every plan has a valid `workspace_id` in `workspaces` table
  - Every phase has a valid `plan_id` in `plans` table
  - Every step has a valid `phase_id` in `phases` table
  - Every session has a valid `plan_id` in `plans` table
  - Every lineage entry has a valid `plan_id`
  - All FK constraints are satisfied (SQLite enforces this, but verify explicitly)
- [ ] **10.3** Content verification (spot check):
  - Read 5 random plans from the database
  - Compare reconstructed `PlanState` (via mappers from Plan 3) against the original `state.json`
  - Verify steps order, phase assignments, session data, lineage chain
- [x] **10.4** Produce a validation report: pass/fail with detailed counts and any discrepancies

## Phase 11: Build & Verify

- [x] **11.1** `npm run build` in `server/` — migration script compiles.
- [ ] **11.2** Run the migration in `--dry-run` mode against the actual `data/` directory. Review the report.
- [ ] **11.3** Run the migration for real. Review the report and validation output.
- [ ] **11.4** Open the resulting `project-memory.db` in `sqlite3 CLI`. Run sample queries:
  - `SELECT COUNT(*) FROM workspaces;` (expect 8–10)
  - `SELECT COUNT(*) FROM plans;` (expect ~148)
  - `SELECT COUNT(*) FROM steps;` (expect hundreds)
  - `SELECT COUNT(*) FROM event_log;` (expect ~1000)
  - `SELECT * FROM plans WHERE workspace_id = '...' AND status = 'active';`
- [ ] **11.5** Run `npx vitest run` in `server/` — all migration tests pass alongside existing tests.
- [ ] **11.6** Verify the original `data/` directory is untouched (migration is read-only on the source).

---

## References

### New Files

| Path | Purpose |
|------|---------|
| `server/src/migration/migrate.ts` | Main migration entry point |
| `server/src/migration/report.ts` | Migration report builder |
| `server/src/migration/migrate-workspaces.ts` | Workspace + context + registry migration |
| `server/src/migration/migrate-plans.ts` | Plan + phase + step + session + lineage migration |
| `server/src/migration/migrate-context.ts` | Per-plan context file migration |
| `server/src/migration/migrate-research.ts` | Research notes migration |
| `server/src/migration/migrate-knowledge.ts` | Knowledge file migration |
| `server/src/migration/migrate-programs.ts` | Program + manifest + dependency migration |
| `server/src/migration/migrate-events.ts` | Event + log migration |
| `server/src/migration/migrate-agents.ts` | Agent definition seeding |
| `server/src/migration/migrate-instructions.ts` | Instruction file seeding |
| `server/src/migration/migrate-skills.ts` | Skill definition seeding |
| `server/src/migration/validate.ts` | Post-migration validation |

### Source Data (Current)

| Source | Destination Table(s) | Records (approx.) |
|--------|----------------------|-------------------|
| `workspace-registry.json` | `workspaces` | 5 registered entries |
| `workspace.meta.json` × 8+ | `workspaces` | 8–10 workspaces |
| `workspace.context.json` × 8+ | `context_items`, `update_log` | ~10K update_log entries from main workspace alone |
| `terminal-allowlist.json` | `context_items` | 1–2 workspaces |
| `state.json` × ~148 | `plans`, `phases`, `steps`, `sessions`, `lineage`, `plan_notes` | ~148 plans, hundreds of steps |
| Context files × ~50 | `context_items` | Varies per plan |
| `research_notes/*.md` × ~20 | `research_documents` | ~20 documents |
| `knowledge/*.json` × ~62 | `knowledge` | ~62 entries |
| `programs/*/program.json` × 1 | `programs`, `dependencies` | 1 program, 4 child plans |
| `events/evt_*.json` × ~1000 | `event_log` | ~1000 events |
| Agent .md files × ~15 | `agent_definitions` | ~15 agents |
| Instruction .md files × ~25 | `instruction_files` | ~25 instructions |
| Skill SKILL.md files × ~20 | `skill_definitions` | ~20 skills |

### Edge Cases Checklist

| Edge Case | Handling |
|-----------|----------|
| Ghost workspaces (not in registry) | Migrate with `source: 'ghost'` flag |
| Legacy workspace ID redirects | Create alias entries |
| Duplicate plan dirs (with/without `plan_` prefix) | Deduplicate, keep the richer one |
| Plans with no `state.json` | Skip, log error |
| Corrupt JSON files | Skip, log error with path |
| `_archived/` directory structure | Migrate to archive tables (same v1→v2 normalization as active plans) |
| Test stub workspaces (`ws_nonexistent`, `ws_test_*`) | Skip, log as skipped |
| 10K-line `workspace.context.json` | Migrate all update_log entries |
| `plan_temporary/` non-standard name | Migrate with warning |
| **V1 plans** (no `schema_version`) | Normalize category via `migrateCategoryToV2()`, extract phases from step strings, write as v2 in DB |
| **V1 legacy categories** (`bug`, `change`, `analysis`, etc.) | Map: `bug→bugfix`, `change→feature`, `analysis→advisory`, `investigation→advisory`, `debug→bugfix`, `documentation→quick_task` |
| **V1 program containers** (`is_program: true`) | Convert to `programs` table row + `program_plans` join. Do **not** insert as a plan |
| **V2 programs** (`programs/` directory) | Insert into `programs` + `program_plans` + `dependencies` + risks |
| **Child plans** (have `program_id`) | Preserve FK — programs migrated first (Phase 7 before Phase 3) |
| **Plans with `depends_on_plans[]`** | Insert into `dependencies` table as `plan→plan` edges |
| **Paused plans** (`paused_at_snapshot`) | Preserve snapshot as JSON column, restore `confirmation_state` |
| Plans with unknown/missing `category` | Default to `'feature'`, log warning |
