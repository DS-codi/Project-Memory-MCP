# Project Memory MCP — DB Query Cookbook

Common query patterns drawn from the live DB modules.  
All examples use the **better-sqlite3** synchronous API via the module-level
singleton obtained from `getDb()`.

---

## Table of Contents

1. [Bootstrap — Get the DB handle](#1-bootstrap--get-the-db-handle)
2. [Plan State — Assembling the Full Object](#2-plan-state--assembling-the-full-object)
3. [Step Queries](#3-step-queries)
4. [Step Dependency Graph](#4-step-dependency-graph)
5. [Polymorphic Research Documents](#5-polymorphic-research-documents)
6. [Context Items (Workspace / Plan Blobs)](#6-context-items-workspace--plan-blobs)
7. [Cross-Workspace Program Visibility](#7-cross-workspace-program-visibility)
8. [File Edit History](#8-file-edit-history)
9. [Audit — Update Log & Event Log](#9-audit--update-log--event-log)
10. [Build Scripts](#10-build-scripts)
11. [Knowledge Files](#11-knowledge-files)
12. [Archive Queries](#12-archive-queries)
13. [Pagination & Filtering Conventions](#13-pagination--filtering-conventions)
14. [Performance Hints](#14-performance-hints)

---

## 1. Bootstrap — Get the DB handle

All DB modules call `getDb()` internally — callers **do not** pass a `db` handle to any module function.

```typescript
import { getDb } from '../db/connection.js';

const db = getDb(); // opens (or returns cached) the singleton
```

For raw one-off queries inside application code:

```typescript
const row = getDb().prepare('SELECT COUNT(*) AS c FROM plans').get() as { c: number };
```

In tests use the fixture helpers, **not** `getDb()` directly:

```typescript
import { setupTestDb, teardownTestDb } from '../__tests__/db/fixtures.js';

beforeAll(() => setupTestDb());   // creates temp dir, sets PM_DATA_ROOT, runs migrations
afterAll(() => teardownTestDb()); // closes DB, restores env, removes temp dir
```

---

## 2. Plan State — Assembling the Full Object

### High-level: use `getPlanState` from `db-store`

```typescript
import { getPlanState } from '../storage/db-store.js';

const state = await getPlanState(planId);
// Returns PlanState | null
```

### Low-level: `assemblePlanState` from mappers

`assemblePlanState` takes pre-loaded rows — it does not query the DB itself.

```typescript
import { assemblePlanState } from '../db/mappers.js';
import { getPhases }          from '../db/phase-db.js';
import { getAllSteps }         from '../db/step-db.js';
import { getSessions }         from '../db/session-db.js';
import { getLineage }          from '../db/lineage-db.js';
import { getDb }               from '../db/connection.js';

const planRow = getDb().prepare('SELECT * FROM plans WHERE id = ?').get(planId);
if (!planRow) return null;

const phases   = getPhases(planId);
const steps    = getAllSteps(planId);
const sessions = getSessions(planId);
const lineage  = getLineage(planId);

const state = assemblePlanState(planRow, phases, steps, sessions, lineage);
```

### What `getPlanState` does internally (abridged)

```sql
-- 1. Core plan row
SELECT * FROM plans WHERE id = ?;

-- 2. Phases ordered
SELECT * FROM phases WHERE plan_id = ? ORDER BY order_index;

-- 3. Steps per phase (ordered)
SELECT * FROM steps WHERE plan_id = ? ORDER BY order_index;

-- 4. Step dependencies (for each step)
SELECT source_id FROM dependencies
WHERE target_type = 'step' AND target_id = ?
  AND source_type = 'step';

-- 5. Sessions (recent)
SELECT * FROM sessions WHERE plan_id = ? ORDER BY started_at DESC LIMIT 3;

-- 6. Lineage (recent)
SELECT * FROM lineage WHERE plan_id = ? ORDER BY timestamp DESC LIMIT 10;

-- 7. Plan notes (included via getPlanState if present)
```

---

## 3. Step Queries

### Get all pending/active steps for a plan

```typescript
import { getDb } from '../db/connection.js';

const pending = getDb().prepare(`
  SELECT s.*, ph.name AS phase_name
  FROM steps s
  JOIN phases ph ON ph.id = s.phase_id
  WHERE s.plan_id = ?
    AND s.status IN ('pending', 'active')
  ORDER BY ph.order_index, s.order_index
`).all(planId);
```

### Get the next pending step

```typescript
import { getNextPendingStep } from '../db/step-db.js';

const next = getNextPendingStep(planId);
// Returns StepRow | null
```

### Update a step's status

```typescript
import { updateStep } from '../db/step-db.js';

updateStep(stepId, { status: 'done', notes: 'Implemented login endpoint' });
```

---

## 4. Step Dependency Graph

The `dependencies` table is a generic directed graph.  
Convention: **`source_id` = blocker**, **`target_id` = blocked step**.

### Get all blockers for a step

```typescript
import { getStepDependencies } from '../db/step-db.js';

// Which step IDs must complete before `stepId` can start?
const blockerIds = getStepDependencies(stepId); // string[]
```

### Get all dependents of a step

```typescript
import { getStepDependents } from '../db/step-db.js';

// Which step IDs are blocked by `stepId`?
const dependentIds = getStepDependents(stepId); // string[]
```

### Add a dependency

```typescript
import { addStepDependency } from '../db/step-db.js';

addStepDependency(blockedStepId, blockerStepId);
//               ^ the step that is blocked   ^ the step that must finish first
```

### Check if all blockers are satisfied

```typescript
import { markStepDependenciesSatisfied } from '../db/step-db.js';

markStepDependenciesSatisfied(stepId); // sets dep_status = 'satisfied' on all incoming deps

// Manual check:
const unsatisfied = getDb().prepare(`
  SELECT COUNT(*) AS cnt
  FROM dependencies d
  JOIN steps s ON s.id = d.source_id
  WHERE d.source_type = 'step'
    AND d.target_type = 'step'
    AND d.target_id = ?
    AND s.status != 'done'
`).get(stepId) as { cnt: number };

const canStart = unsatisfied.cnt === 0;
```

---

## 5. Polymorphic Research Documents

Research documents can be attached to any entity type (`workspace` / `plan` / `phase` / `step`).

### Append content to a research note (plan-scoped)

```typescript
import { appendPlanResearch } from '../db/research-db.js'; // backward-compat wrapper

appendPlanResearch(planId, workspaceId, 'codebase-analysis.md', 'New findings…');
//                 ^ planId first, then workspaceId
```

### Append to any parent type

```typescript
import { appendResearch } from '../db/research-db.js';

// For a step:
appendResearch(workspaceId, 'step', stepId, 'step-notes.md', 'analysis…');

// For a workspace (parentId = null is allowed for workspace-level):
appendResearch(workspaceId, 'workspace', null, 'workspace-notes.md', 'notes…');
```

### List all research note filenames for a plan

```typescript
import { listPlanResearch } from '../db/research-db.js';

const filenames = listPlanResearch(planId, workspaceId); // string[]
//                                 ^ planId first, then workspaceId
```

### Raw query by parent

```typescript
const docs = getDb().prepare(`
  SELECT * FROM research_documents
  WHERE workspace_id = ?
    AND parent_type = ?
    AND parent_id = ?
  ORDER BY filename
`).all(workspaceId, 'plan', planId);
```

---

## 6. Context Items (Workspace / Plan Blobs)

Context items are typed JSON blobs scoped to a parent.

### Store a context blob

```typescript
import { getDb } from '../db/connection.js';
import { newId, nowIso } from '../db/query-helpers.js';

getDb().prepare(`
  INSERT INTO context_items (id, parent_type, parent_id, type, data, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
  ON CONFLICT(parent_type, parent_id, type)
  DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`).run(newId(), 'plan', planId, 'execution_log', JSON.stringify(payload), nowIso());
```

### Get a context blob

```typescript
const row = getDb().prepare(`
  SELECT data FROM context_items
  WHERE parent_type = ? AND parent_id = ? AND type = ?
`).get('plan', planId, 'execution_log') as { data: string } | undefined;

const data = row ? JSON.parse(row.data) : null;
```

### Workspace-scoped context

```typescript
// Get
const row = getDb().prepare(`
  SELECT data FROM context_items
  WHERE parent_type = 'workspace' AND parent_id = ? AND type = 'workspace_context'
`).get(workspaceId) as { data: string } | undefined;

// Update (shallow merge)
const existing = row ? JSON.parse(row.data) : {};
const merged = { ...existing, ...patch };
getDb().prepare(`
  INSERT INTO context_items (id, parent_type, parent_id, type, data, updated_at)
  VALUES (?, 'workspace', ?, 'workspace_context', ?, ?)
  ON CONFLICT(parent_type, parent_id, type)
  DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at
`).run(newId(), workspaceId, JSON.stringify(merged), nowIso());
```

---

## 7. Cross-Workspace Program Visibility

A program can include plans from multiple workspaces. Use `program_workspace_links` to resolve visibility.

### Check if a workspace can contribute plans to a program

```typescript
import { canAcceptPlanFromWorkspace } from '../db/program-workspace-links-db.js';

const allowed = canAcceptPlanFromWorkspace(programId, foreignWorkspaceId);
```

### Get all workspaces linked to a program

```typescript
import { getLinkedWorkspaces } from '../db/program-workspace-links-db.js';

const links = getLinkedWorkspaces(programId);
// Returns ProgramWorkspaceLinkRow[] — each has { program_id, workspace_id, linked_at, linked_by }
```

### Get all programs visible from a workspace

```typescript
import { getProgramsLinkedToWorkspace } from '../db/program-workspace-links-db.js';

const programs = getProgramsLinkedToWorkspace(workspaceId); // ProgramRow[]
```

### Auto-link when adding a cross-workspace plan

```typescript
import { ensureWorkspaceLink } from '../db/program-workspace-links-db.js';

// Returns true if the link already existed, false if it was just created
const existed = ensureWorkspaceLink(programId, foreignWorkspaceId, 'Coordinator');
```

### Raw SQL — list all plans across linked workspaces for a program

```typescript
const plans = getDb().prepare(`
  SELECT p.*
  FROM plans p
  JOIN program_plans pp ON pp.plan_id = p.id
  WHERE pp.program_id = ?
  ORDER BY pp.order_index
`).all(programId);
```

---

## 8. File Edit History

`step_file_edits` records every file touched by an agent during a step.

### Record a single edit

```typescript
import { recordFileEdit } from '../db/file-edits-db.js';

recordFileEdit(
  workspaceId,
  planId,
  stepId,           // string | null — omit with null if not tied to a specific step
  'src/auth/login.ts',
  'edit',           // 'create' | 'edit' | 'delete' | 'rename'
  {
    agentType: 'Executor',
    sessionId,
    notes: 'Added JWT claims',
  }
);
```

### Record multiple edits in one call

```typescript
import { recordFileEdits } from '../db/file-edits-db.js';

recordFileEdits(workspaceId, planId, stepId, [
  { filePath: 'src/auth/login.ts',     changeType: 'create' },
  { filePath: 'src/auth/logout.ts',    changeType: 'create' },
  { filePath: 'src/middleware/jwt.ts', changeType: 'edit', agentType: 'Executor', sessionId },
]);
```

### Get all files touched in a plan

```typescript
import { getEditedFilesForPlan } from '../db/file-edits-db.js';

const files = getEditedFilesForPlan(planId); // string[] of unique file paths
```

### Get edit history for a specific file

```typescript
import { getFileEditHistory } from '../db/file-edits-db.js';

const history = getFileEditHistory(workspaceId, 'src/auth/login.ts');
// Returns FileEditRow[] sorted oldest-first
```

### Search edits by path fragment

```typescript
import { searchFileEdits } from '../db/file-edits-db.js';

// Pass a SQL LIKE pattern — use % for wildcards
const results = searchFileEdits(workspaceId, '%auth%');
```

---

## 9. Audit — Update Log & Event Log

### Append an update log entry

```typescript
import { addUpdateLog } from '../db/update-log-db.js';

addUpdateLog(workspaceId, 'plan_created', { planId, title });
```

### Read recent update log entries

```typescript
import { getUpdateLog } from '../db/update-log-db.js';

const entries = getUpdateLog(workspaceId, 50); // last 50 entries, newest first
```

### Append a global event

```typescript
getDb().prepare(`
  INSERT INTO event_log (event_type, data)
  VALUES (?, ?)
`).run('agent_init', JSON.stringify({ agentType: 'Executor', planId }));
```

---

## 10. Build Scripts

### List scripts for a workspace (workspace-level and plan-level)

```typescript
import { getBuildScripts } from '../db/build-script-db.js';

const wsScripts   = getBuildScripts(workspaceId);           // workspace-level only
const planScripts = getBuildScripts(workspaceId, planId);   // workspace + plan-scoped
```

### Resolve a script path

`directory` may be relative. Resolve against the workspace path:

```typescript
import path from 'node:path';

const absoluteDir = path.isAbsolute(script.directory)
  ? script.directory
  : path.join(workspacePath, script.directory);
```

---

## 11. Knowledge Files

### Store or replace a knowledge file

```typescript
import { getDb } from '../db/connection.js';
import { newId, nowIso } from '../db/query-helpers.js';

getDb().prepare(`
  INSERT INTO knowledge (id, workspace_id, slug, title, data, category, tags, created_by_agent, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(workspace_id, slug)
  DO UPDATE SET title = excluded.title, data = excluded.data,
                category = excluded.category, tags = excluded.tags,
                updated_at = excluded.updated_at
`).run(newId(), workspaceId, slug, title, JSON.stringify(data), category,
       JSON.stringify(tags), agentType, nowIso(), nowIso());
```

### List with optional category filter

```typescript
const rows = getDb().prepare(`
  SELECT id, slug, title, category, tags, created_at, updated_at
  FROM knowledge
  WHERE workspace_id = ?
  ${category ? 'AND category = ?' : ''}
  ORDER BY title
`).all(...(category ? [workspaceId, category] : [workspaceId]));
```

---

## 12. Archive Queries

Archives are append-only. When a plan is archived, current rows are copied (not moved) to the `*_archive` tables.

### Get the archived copy of a plan

```typescript
const archived = getDb().prepare(`
  SELECT * FROM plans_archive
  WHERE id = ? ORDER BY archived_at DESC LIMIT 1
`).get(planId);
```

### List all steps that were part of an archived plan

```typescript
const steps = getDb().prepare(`
  SELECT * FROM steps_archive
  WHERE plan_id = ?
  ORDER BY order_index
`).all(planId);
```

---

## 13. Pagination & Filtering Conventions

SQLite doesn't support named pagination natively. Use `LIMIT` + `OFFSET`:

```typescript
function paginate<T>(
  sql: string,
  params: unknown[],
  page: number,
  pageSize = 20
): T[] {
  return getDb().prepare(`${sql} LIMIT ? OFFSET ?`)
    .all(...params, pageSize, (page - 1) * pageSize) as T[];
}

// Example:
const page2 = paginate<PlanRow>(
  'SELECT * FROM plans WHERE workspace_id = ? ORDER BY updated_at DESC',
  [workspaceId],
  2, 20
);
```

**Filter building** — build the WHERE clause dynamically to avoid SQL injection:

```typescript
const clauses: string[] = ['workspace_id = ?'];
const values: unknown[] = [workspaceId];

if (status)   { clauses.push('status = ?');   values.push(status); }
if (category) { clauses.push('category = ?'); values.push(category); }

const sql = `SELECT * FROM plans WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC`;
const rows = getDb().prepare(sql).all(...values);
```

---

## 14. Performance Hints

| Pattern | Recommendation |
|---------|---------------|
| Loading a full plan | Use `getPlanState(planId)` from `db-store.ts` — it batches all child queries |
| Listing plans (dashboard) | Query `plans` with `idx_plans_workspace_status` (workspace_id + status filter) |
| Finding pending steps | Use `idx_steps_plan_status` (plan_id + status) |
| Dependency graph traversal | Use `idx_deps_source` and `idx_deps_target` together |
| File search across a plan | Use `idx_sfe_plan` + `idx_sfe_file_path`; pass `'%fragment%'` LIKE pattern to `searchFileEdits` |
| High-frequency writes (step updates) | Wrap multiple updates in a single `transaction(fn)` call |
| Read-only queries in HTTP handler | DB is opened in WAL mode — concurrent reads are safe without extra isolation |

### Transaction example

```typescript
import { transaction } from '../db/query-helpers.js';

transaction(() => {
  for (const u of batchUpdates) {
    updateStep(u.id, { status: u.status });
  }
})(); // transaction() returns a callable — invoke it to execute
```

### Prepared statement caching

Statements are re-compiled on every `getDb().prepare()` call in better-sqlite3. For hot paths, cache them in a module-level `const`:

```typescript
// At module scope:
const getStepStmt = getDb().prepare('SELECT * FROM steps WHERE id = ?');

// In handler:
const step = getStepStmt.get(stepId);
```
