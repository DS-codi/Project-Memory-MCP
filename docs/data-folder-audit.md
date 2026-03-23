# Data Folder Audit

> Generated: 2026-03-23  
> Audit of `server/src/` files using `getWorkspacePath()`, `getDataRoot()`, and writing to `data/{workspaceId}/`

## Summary

| Metric | Count |
|--------|-------|
| Total files using `getWorkspacePath()` | 8 |
| Total files using `getDataRoot()` | 10 |
| Files writing workspace data | 6 |
| Files writing plan data | 4 |
| Files writing to data root level | 2 |

## Data Folder Structure (Current)

```
data/
├── workspace-registry.json              # Global registry (written by workspace.tools.ts)
├── {workspaceId}/
│   ├── workspace.meta.json              # Workspace metadata
│   ├── workspace.context.json           # Workspace-level context sections
│   ├── terminal-allowlist.json          # Terminal command allowlist
│   ├── knowledge/
│   │   └── {slug}.json                  # Knowledge files
│   └── plans/
│       └── {planId}/
│           ├── state.json               # Plan state (steps, sessions, lineage)
│           ├── plan.md                  # Legacy rendered plan
│           ├── {contextType}.json       # Plan context files
│           ├── research_notes/
│           │   └── *.md                 # Research note files
│           └── investigations/
│               └── {investigationId}/
│                   └── state.json       # Investigation state
```

---

## Files Using `getWorkspacePath()`

### 1. server/src/storage/db-store.ts

**Primary Path Functions:**
```typescript
export function getWorkspacePath(workspaceId: string): string {
  return path.join(getDataRoot(), workspaceId);
}
export function getWorkspaceMetaPath(workspaceId: string): string
export function getWorkspaceContextPath(workspaceId: string): string
export function getPlansPath(workspaceId: string): string
export function getPlanPath(workspaceId: string, planId: string): string
export function getPlanStatePath(workspaceId: string, planId: string): string
export function getPlanMdPath(workspaceId: string, planId: string): string
export function getResearchNotesPath(workspaceId: string, planId: string): string
export function getContextPath(workspaceId: string, planId: string, contextType: string): string
export function getInvestigationsDir(workspaceId: string, planId: string): string
```

**Writes:**
- `workspace.meta.json` (via `saveWorkspace()`)
- `workspace.context.json` (via `writeJson()`, `writeJsonLocked()`)
- `plans/{planId}/state.json` (via `savePlanState()`)
- `plans/{planId}/plan.md` (legacy, via `generatePlanMd()`)
- `plans/{planId}/{contextType}.json` (via `writeJson()`)
- `plans/{planId}/research_notes/*.md` (via `writeText()`)
- `plans/{planId}/investigations/{id}/state.json` (via `saveInvestigation()`)

**Target SQLite Tables:**
- `workspace.meta.json` → `workspaces` table ✅ (already migrated)
- `workspace.context.json` → `context_items` table (type='workspace_context')
- `state.json` → `plans`, `steps`, `sessions`, `lineage` tables ✅ (already migrated)
- `{contextType}.json` → `context_items` table (parent_type='plan')
- `research_notes/*.md` → `context_items` table (type='research_note:*')
- `investigations/*/state.json` → `context_items` table OR dedicated `investigations` table

---

### 2. server/src/tools/knowledge.tools.ts

**Functions:**
```typescript
export function getKnowledgeDirPath(workspaceId: string): string {
  return path.join(store.getWorkspacePath(workspaceId), 'knowledge');
}
export function getKnowledgeFilePath(workspaceId: string, slug: string): string {
  return path.join(getKnowledgeDirPath(workspaceId), `${slug}.json`);
}
```

**Writes:**
- `data/{workspaceId}/knowledge/{slug}.json`

**Target SQLite Table:** `knowledge` table (already exists in schema)

**Migration Notes:**
- Knowledge files are workspace-scoped, long-lived documents
- Already has a `knowledge` table with columns: `id`, `workspace_id`, `slug`, `title`, `category`, `content`, `tags`, `created_at`, `updated_at`
- Migration script exists: `migrate-knowledge.ts`

---

### 3. server/src/tools/terminal-auth.ts

**Functions:**
```typescript
function getAllowlistPath(workspaceId: string): string {
  return join(store.getWorkspacePath(workspaceId), ALLOWLIST_FILENAME);
}
// ALLOWLIST_FILENAME = 'terminal-allowlist.json'
```

**Writes:**
- `data/{workspaceId}/terminal-allowlist.json`

**Target SQLite Table:** `context_items` table (type='terminal_allowlist')

**Migration Notes:**
- Simple JSON structure: `{ patterns: string[], updated_at: string }`
- Already handled in `migrate-workspaces.ts` (lines 109-110)
- Can use `context_items` table with `parent_type='workspace'`, `type='terminal_allowlist'`

---

### 4. server/src/tools/workspace-context.tools.ts

**Functions:**
```typescript
function getWorkspacePathForValidation(workspace: WorkspaceMeta): string {
  return workspace.workspace_path ?? workspace.path ?? '';
}
```

**Note:** This function returns the **physical workspace path** (codebase location), NOT the data folder path. Does not write to data folder.

---

### 5. server/src/tools/context.tools.ts

**Functions:**
- Uses `store.getContextPath(workspace_id, plan_id, type)` internally

**Writes:**
- `data/{wsId}/plans/{planId}/{contextType}.json` (via `store.writeJsonLocked()`)

**Target SQLite Table:** `context_items` table (parent_type='plan')

---

### 6. server/src/logging/workspace-update-log.ts

**Functions:**
```typescript
const dataRoot = normalizePath(store.getDataRoot());
```

**Writes:**
- Log entries to `data/{wsId}/workspace-update.log` (optional, if enabled)

**Target SQLite Table:** `update_log` table (already exists)

---

## Files Using `getDataRoot()`

### 1. server/src/storage/db-store.ts (lines 1002-1016)

**Definition:**
```typescript
export function getDataRoot(): string {
  // Priority: PM_DATA_ROOT → MBS_DATA_ROOT → platform app-data
  const override = process.env['PM_DATA_ROOT'] ?? process.env['MBS_DATA_ROOT'];
  return override ? path.resolve(override) : path.join(platformDataDir(), 'ProjectMemory');
}
```

**Usage:**
- Foundation for all workspace path resolution
- Used by `getWorkspacePath()`, `getInvestigationsDir()`, etc.

---

### 2. server/src/storage/workspace-operations.ts

**Functions using `getDataRoot()`:**
- `findCanonicalForLegacyId()` - scans data root directories
- `scanGhostFolders()` - scans for orphan workspace folders
- `mergeWorkspace()` - merge ghost folders into canonical workspace
- `migrateWorkspace()` - full workspace migration

**Writes:**
- Copies/moves files between workspace directories during merge/migrate

**Target SQLite Tables:** Already handles DB operations internally

---

### 3. server/src/storage/workspace-identity.ts

**Functions using `getDataRoot()`:**
- `resolveCanonicalWorkspaceId()` - reads registry for path→ID mapping

**Writes:**
- `.projectmemory/identity.json` (in physical workspace, NOT data folder)

---

### 4. server/src/tools/workspace.tools.ts

**Functions:**
```typescript
const dataRoot = store.getDataRoot();
const registryPath = path.join(dataRoot, 'workspace-registry.json');
```

**Writes:**
- `data/workspace-registry.json` - global path→ID registry

**Target SQLite Table:** Built into `workspaces` table (FK path lookups)

**Migration Notes:**
- `workspace-registry.json` is a legacy companion file for the interactive terminal
- Contains `{ entries: { [path: string]: workspaceId } }`
- DB now has `workspaces.path` column with index for lookups
- File is still written for backward compatibility with external tools

---

### 5. server/src/index.ts

**Functions:**
```typescript
console.error(`Data root: ${store.getDataRoot()}`);
setDataRoot(store.getDataRoot());
```

**Usage:**
- Startup logging
- Initializes data root for interactive terminal

---

## Migration Plan Summary

| Current Location | Target SQLite Table | Status | Notes |
|------------------|---------------------|--------|-------|
| `workspace.meta.json` | `workspaces` | ✅ Done | `migrate-workspaces.ts` |
| `workspace.context.json` | `context_items` | ✅ Done | `type='workspace_context'` |
| `workspace-registry.json` | `workspaces.path` | ✅ Done | Still written for compat |
| `terminal-allowlist.json` | `context_items` | ✅ Done | `type='terminal_allowlist'` |
| `plans/{id}/state.json` | `plans`, `steps`, `sessions`, `lineage` | ✅ Done | `migrate-plans.ts` |
| `plans/{id}/{ctx}.json` | `context_items` | ✅ Done | `migrate-context.ts` |
| `plans/{id}/research_notes/*.md` | `context_items` | ✅ Done | `migrate-research.ts` |
| `knowledge/{slug}.json` | `knowledge` | ✅ Done | `migrate-knowledge.ts` |
| `investigations/{id}/state.json` | `context_items` | ⚠️ Partial | Uses file I/O with virtual path detection |

---

## Virtual Path System (db-store.ts)

The codebase uses a **virtual path detection** system that intercepts file operations and redirects them to SQLite:

```typescript
function tryParseVirtualPlanPath(filePath: string): VirtualPlanPath | null {
  // Matches: data/{wsId}/plans/{planId}/... patterns
  // Returns: { planId, kind: 'state' | 'context' | 'research_note', ... }
}
```

**Intercepted patterns:**
- `plans/{planId}/state.json` → `plans` + `steps` + `sessions` + `lineage` tables
- `plans/{planId}/{contextType}.json` → `context_items` (parent_type='plan')
- `plans/{planId}/research_notes/{filename}.md` → `context_items` (type='research_note:{filename}')

This virtual path system allows existing code to use file paths while transparently reading/writing to SQLite.

---

## Remaining File I/O (Non-DB)

These files are intentionally kept as file I/O:

| File | Location | Reason |
|------|----------|--------|
| `identity.json` | `.projectmemory/identity.json` (in workspace) | External discovery by tools |
| `workspace-registry.json` | `data/` | Backward compat for interactive terminal |
| Agent deploy files | `.projectmemory/active_agents/` | Runtime agent context |
| Focused workspaces | `.projectmemory/workspaces/*.code-workspace` | VS Code workspace files |

---

## Recommendations

1. **Investigations Migration:**
   - The `investigations/` directory still uses file I/O
   - Consider adding to virtual path detection in `tryParseVirtualPlanPath()`
   - Or create dedicated `investigations` table

2. **workspace-registry.json:**
   - Keep writing for backward compatibility
   - Mark as deprecated in documentation
   - Update interactive terminal to use DB eventually

3. **Terminal Allowlist:**
   - Already migrated to `context_items`
   - In-memory cache in `terminal-auth.ts` loads from file on startup → should check DB first

4. **Knowledge Files:**
   - Already has `knowledge` table
   - `knowledge.tools.ts` still writes to filesystem
   - Consider updating to use DB directly (already has `storeKnowledge` DB function)
