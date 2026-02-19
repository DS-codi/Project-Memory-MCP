---
applyTo: "agents/migrator.agent.md"
---

# Migrator Operations

Detailed operational procedures for the Migrator agent, covering v1 plan detection, complexity assessment, simple and complex migration workflows, archival conventions, category mapping, and error handling.

---

## 1. V1 Plan Detection

A plan is considered **v1** (legacy) when any of the following are true:

- The `schema_version` field is missing from `state.json`
- The `schema_version` field is present but less than `'2.0'`
- The `phases` array is missing or empty

### Detection at Coordinator Level

The Coordinator detects v1 plans during `continue` / `resume` flow by calling `memory_plan(action: get)` and checking:

```
isPlanV2(planState) === false
```

If false, the Coordinator spawns the Migrator instead of proceeding with normal execution.

### Detection at Migrator Level

After init + validate, the Migrator calls `memory_plan(action: get)` and confirms:

```javascript
const isV1 = !state.schema_version || state.schema_version < '2.0';
```

If the plan is already v2, add a note and handoff immediately — no migration work needed.

---

## 2. Complexity Assessment

Complexity determines which migration path to follow.

### Metrics to Collect

| Metric | How to Compute |
|--------|----------------|
| **Step count** | `state.steps.length` |
| **Unique phase count** | Count of distinct `step.phase` values across all steps |

### Heuristic

| Condition | Classification |
|-----------|---------------|
| Step count ≤ 15 **AND** unique phases ≤ 3 | **Simple** — direct step mapping |
| Step count > 15 **OR** unique phases > 3 | **Complex** — intent extraction only |

### Edge Cases

| Situation | Classification |
|-----------|---------------|
| 0 steps | Simple (empty plan — set v2 fields and move on) |
| Steps with no `phase` field | Simple — assign all to default phase "Implementation" |
| Steps with `null` or empty `phase` | Treat as single phase — normalize to "Implementation" |

---

## 3. Simple Migration Workflow

For plans classified as **simple** (≤ 15 steps AND ≤ 3 unique phases).

### Step-by-Step Procedure

#### 3.1 Read Current State

```
memory_plan(action: get, workspace_id, plan_id)
```

Capture the full plan state including steps, sessions, lineage, goals, and context.

#### 3.2 Archive V1 Files

Follow the [Archival Procedure](#5-archival-procedure) below.

#### 3.3 Build Phases Array

Apply `buildPhasesFromSteps()` logic to create the phases array:

1. Iterate through `state.steps` in order
2. For each step, extract `step.phase` (normalize empty/null to "Implementation")
3. Build ordered list of unique phase names (preserve first-appearance order)
4. For each unique phase name, create a `PlanPhase`:
   ```typescript
   {
     name: "<phase name>",
     status: "pending",   // or derive from step statuses
     steps: [<indices>]   // indices of steps with this phase
   }
   ```
5. Phase status derivation:
   - All steps `done` → phase status `done`
   - Any step `active` → phase status `active`
   - Otherwise → phase status `pending`

#### 3.4 Map Category to V2

Apply `migrateCategoryToV2()` mapping (see [Category Assignment Rules](#6-category-assignment-rules)).

#### 3.5 Update Plan State

Update the plan with v2 fields:

- `schema_version`: `'2.0'`
- `phases`: the array built in step 3.3
- `category`: the mapped v2 category from step 3.4

All existing fields (title, description, steps, sessions, lineage, goals, success_criteria) are **preserved unchanged**.

#### 3.6 Store Migration Log

```
memory_context(action: store, type: "migration_log", data: {
  migration_path: "simple",
  original_step_count: <n>,
  original_phase_count: <n>,
  phases_created: [<phase names>],
  category_original: "<old>",
  category_mapped: "<new>",
  archived_files: [<list>],
  migrated_at: "<ISO timestamp>"
})
```

#### 3.7 Add Plan Note

```
memory_plan(action: add_note, note: "Migrated from v1 to v2 (simple path). {n} steps mapped into {m} phases. Category: {old} → {new}.")
```

#### 3.8 Handoff

```
memory_agent(action: handoff, from_agent: "Migrator", to_agent: "Coordinator",
  reason: "v1→v2 migration complete (simple path). Plan ready for execution.",
  data: { recommendation: "Executor", migration_path: "simple" })
memory_agent(action: complete, summary: "...")
```

---

## 4. Complex Migration Workflow

For plans classified as **complex** (> 15 steps OR > 3 unique phases).

### Step-by-Step Procedure

#### 4.1 Read Current State

Same as simple path — `memory_plan(action: get)`.

#### 4.2 Extract Intent Summary

Build a migration intent document from the v1 plan:

1. **Title and description**: Copy directly from plan state
2. **Goals**: Copy `state.goals` if present
3. **Success criteria**: Copy `state.success_criteria` if present
4. **Step summary**: For each step, extract `step.task` and `step.phase`
   - Group by phase for readability
   - Note which steps were `done` vs `pending` / `blocked`
5. **Constraints**: Extract from stored context if available (`memory_context(action: get, type: "constraints")`)
6. **Overall intent**: Write 2-3 sentences summarizing what the plan was trying to accomplish, derived from the above

#### 4.3 Archive V1 Files

Follow the [Archival Procedure](#5-archival-procedure) below.

#### 4.4 Update Plan State (Minimal V2)

Update the plan with minimal v2 structure:

- `schema_version`: `'2.0'`
- `phases`: single placeholder phase:
  ```typescript
  [{ name: "Migration Pending", status: "pending", steps: [] }]
  ```
- `category`: best-guess v2 category (same mapping as simple path)

Existing steps are **preserved** but the phases array does NOT reference them — the Architect will redesign the step structure.

#### 4.5 Store Migration Intent

```
memory_context(action: store, type: "migration_intent", data: {
  migration_path: "complex",
  original_step_count: <n>,
  original_phase_count: <n>,
  intent_summary: "<generated summary>",
  original_goals: [...],
  original_success_criteria: [...],
  step_summary_by_phase: { "<phase>": ["<task>", ...] },
  done_steps: [<indices>],
  constraints: [...],
  migrated_at: "<ISO timestamp>"
})
```

#### 4.6 Add Plan Note

```
memory_plan(action: add_note, note: "Migrated from v1 to v2 (complex path). Original plan had {n} steps across {m} phases. Intent extracted — Architect should redesign steps for v2.", note_type: "instruction")
```

#### 4.7 Handoff

```
memory_agent(action: handoff, from_agent: "Migrator", to_agent: "Coordinator",
  reason: "v1→v2 migration complete (complex path). Plan needs step redesign by Architect.",
  data: { recommendation: "Architect", migration_path: "complex" })
memory_agent(action: complete, summary: "...")
```

---

## 5. Archival Procedure

Before modifying the plan state, archive the original v1 data for traceability.

### Archive Directory

Create `_archived-v1/` within the plan's data directory:

```
data/{workspace_id}/plans/{plan_id}/_archived-v1/
```

### Files to Archive

| Source File | Archive Destination | Notes |
|------------|-------------------|-------|
| `state.json` | `_archived-v1/state.v1.json` | Full v1 plan state snapshot |
| Context files (research, architecture, etc.) | `_archived-v1/{filename}` | All files from the context directory |
| Research notes | `_archived-v1/research_notes/{filename}` | Preserve directory structure |

### Archival Method

Use `memory_filesystem` actions:

1. `memory_filesystem(action: list)` — list the plan directory contents
2. `memory_filesystem(action: read)` — read each file to archive
3. `memory_filesystem(action: write)` — write to `_archived-v1/` with `create_dirs: true`

**Do not use `memory_filesystem(action: move)`** for the primary `state.json` — it must remain in place while we update it. Copy first, then update in place.

### Naming Convention

- Archived state file: `state.v1.json`
- Other files: keep original filename, prefix directory with `_archived-v1/`
- Timestamp is recorded in the migration log, not in filenames

---

## 6. Category Assignment Rules

V2 plans require a category from the valid 7-value enum. Map v1 categories using `migrateCategoryToV2()`:

| V1 Category | V2 Category | Notes |
|-------------|-------------|-------|
| `feature` | `feature` | Direct mapping |
| `bug` | `bug` | Direct mapping |
| `change` | `change` | Direct mapping |
| `refactor` | `refactor` | Direct mapping |
| `analysis` | `analysis` | Direct mapping |
| `investigation` | `investigation` | Direct mapping |
| `documentation` | `documentation` | Direct mapping |
| `debug` | `bug` | Consolidated into `bug` |
| `undefined` / missing | *inferred* | See inference rules below |
| Unknown string | `change` | Safe default |

### Category Inference (when missing)

If the v1 plan has no category or an unrecognized value:

1. Check plan **title** for keywords:
   - "fix", "bug", "error", "crash" → `bug`
   - "refactor", "cleanup", "restructure" → `refactor`
   - "add", "feature", "implement", "create" → `feature`
   - "analyze", "investigate", "research" → `analysis`
   - "document", "docs", "readme" → `documentation`
2. Check plan **description** for the same keywords
3. If no match → default to `change`

---

## 7. Post-Migration Validation Checklist

After migration, verify the following before handoff:

| Check | Expected | Action if Failed |
|-------|----------|-----------------|
| `schema_version` is `'2.0'` | Present and correct | Re-apply update |
| `phases` array exists and is non-empty | At least one phase | Add default phase |
| `category` is valid v2 value | One of 7 valid values | Re-map or default to `change` |
| Original steps preserved | Step count unchanged | Report error, do not proceed |
| `_archived-v1/state.v1.json` exists | File present | Re-archive before proceeding |
| Migration log stored | Context type `migration_log` or `migration_intent` | Store if missing |
| Plan note added | Note present on plan | Add note if missing |

---

## 8. Error Handling

### Missing or Corrupted Plan State

```
memory_plan(action: add_note, note: "Migration aborted: plan state missing/corrupted. Details: {error}", note_type: "warning")
memory_agent(action: handoff, ..., data: { recommendation: "Revisionist" })
```

### Already V2

```
memory_plan(action: add_note, note: "Plan already v2 (schema_version={version}), no migration needed.")
memory_agent(action: handoff, ..., reason: "Plan already v2, no migration needed.")
```

### Empty Plan (0 Steps)

Proceed with migration but use defaults:
- Phases: empty array `[]`
- Category: infer from title/description or default to `change`
- Handoff recommending Architect (plan needs steps)

### Filesystem Errors During Archival

If archival fails (permission, missing path, etc.):
1. Log the error in migration notes
2. **Continue with migration** — archival is best-effort, not blocking
3. Note which files could not be archived in the migration log

### Partial Migration Recovery

If migration fails mid-way:
1. The archived `_archived-v1/state.v1.json` serves as the recovery point
2. Handoff to Coordinator recommending Revisionist
3. Include details of what was completed and what failed

---

## 9. Utility Reference

These server-side utilities are available for migration logic reference. The Migrator agent implements equivalent logic via MCP tool calls.

| Utility | Location | Purpose |
|---------|----------|---------|
| `buildPhasesFromSteps()` | `server/src/tools/plan/plan-version.ts:38` | Creates phases array from step phase strings |
| `isPlanV2()` | `server/src/tools/plan/plan-version.ts:27` | Checks if plan has v2 schema |
| `getPlanSchemaVersion()` | `server/src/tools/plan/plan-version.ts` | Returns current schema version |
| `migrateCategoryToV2()` | `server/src/types/context.types.ts:59` | Maps v1 category to valid v2 category |
| `PLAN_SCHEMA_VERSION` | `server/src/tools/plan/plan-version.ts` | Current schema version constant (`'2.0'`) |

The Migrator does not call these functions directly — it replicates their logic through MCP tool interactions. These references are for understanding the expected behavior.
