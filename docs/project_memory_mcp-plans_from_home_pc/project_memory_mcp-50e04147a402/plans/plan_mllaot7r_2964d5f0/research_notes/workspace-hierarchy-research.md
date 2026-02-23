---
plan_id: plan_mllaot7r_2964d5f0
created_at: 2026-02-13T19:47:01.770Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Workspace Hierarchy Research

## 1. Registration Flow

### Entry Point
- `memory_workspace(action: register)` is handled by `server/src/tools/consolidated/memory_workspace.ts`
- Delegates to `workspaceTools.registerWorkspace()` in `server/src/tools/workspace.tools.ts`

### Registration Steps (in order)
1. **Resolve workspace ID**: `resolveWorkspaceIdForPath(workspace_path)` → delegates to `resolveCanonicalWorkspaceId()` in `workspace-identity.ts`
   - Checks `.projectmemory/identity.json` first
   - Falls back to `workspace-registry.json` lookup
   - Last resort: hash-based ID from `getWorkspaceIdFromPath()`
2. **Check if workspace exists**: `getWorkspace(workspaceId)` reads `data/{id}/workspace.meta.json`
3. **Index if needed**: Runs `indexWorkspace()` for new workspaces or stale profiles
4. **Create workspace**: `createWorkspace(path, profile)` in `file-store.ts`
   - Runs legacy migration first (looks for old IDs mapped to same path)
   - Checks for existing workspace, updates if found
   - Path-based dedup scan (`findExistingWorkspaceByPath`) — scans ALL `workspace.meta.json` files
   - Creates new workspace dir + meta if none found
   - Updates `workspace-registry.json` via `upsertRegistryEntry()`
5. **Write identity file**: `writeWorkspaceIdentityFile()` creates `.projectmemory/identity.json` in workspace dir
6. **Seed context**: On first registration with profile, creates `workspace.context.json`

### Key Functions
| Function | File | Purpose |
|----------|------|---------|
| `resolveCanonicalWorkspaceId()` | workspace-identity.ts | Core ID resolution (identity.json → registry → hash) |
| `createWorkspace()` | file-store.ts | Creates/updates workspace data folder |
| `writeWorkspaceIdentityFile()` | file-store.ts | Writes `.projectmemory/identity.json` |
| `upsertRegistryEntry()` | workspace-registry.ts | Updates central path→ID mapping |
| `getWorkspaceIdFromPath()` | workspace-utils.ts | Hash-based ID generation |



## 2. Data Model

### identity.json (`.projectmemory/identity.json` in workspace dir)
```typescript
interface WorkspaceIdentityFile {
  schema_version: string;       // "1.0.0"
  workspace_id: string;         // e.g. "project-memory-mcp-40f6678f5a9b"
  workspace_path: string;       // Original host path
  data_root: string;            // Data storage root
  created_at: string;
  updated_at: string;
  project_mcps?: Array<{        // MCP server configs
    name: string;
    description?: string;
    config_path?: string;
    url?: string;
  }>;
}
```

### workspace.meta.json (`data/{workspace_id}/workspace.meta.json`)
```typescript
interface WorkspaceMeta {
  schema_version?: string;
  workspace_id: string;
  workspace_path?: string;
  path: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  registered_at: string;
  last_accessed: string;
  last_seen_at?: string;
  data_root?: string;
  legacy_workspace_ids?: string[];   // Old IDs that map to this workspace
  source?: string;
  status?: string;
  active_plans: string[];
  archived_plans: string[];
  active_programs: string[];
  indexed: boolean;
  profile?: WorkspaceProfile;
  workspace_build_scripts?: BuildScript[];
}
```

**NOTE: No parent_workspace_id, child_workspace_ids, or hierarchy fields exist.**

### workspace-registry.json (`data/workspace-registry.json`)
```typescript
interface WorkspaceRegistry {
  schema_version: string;
  entries: Record<string, string>;  // normalizedPath → canonicalWorkspaceId
  updated_at: string;
}
```

Current content shows the overlap problem:
```json
{
  "entries": {
    "c:/users/user/project_memory_mcp/project-memory-mcp": "project-memory-mcp-40f6678f5a9b",
    "c:/users/user/project_memory_mcp": "project_memory_mcp-50e04147a402"
  }
}
```



## 3. Existing Hierarchy Support: NONE

### What exists
- **Programs** (`is_program`, `program_id` in PlanState) — this is plan-level hierarchy, not workspace-level
- **Legacy workspace IDs** (`legacy_workspace_ids` in WorkspaceMeta) — for migrations, not parent/child
- **Ghost detection** (`scanGhostFolders`, `migrateWorkspace`) — for duplicate cleanup, not hierarchy

### What's missing
- No `parent_workspace_id` field in WorkspaceMeta or identity.json
- No `child_workspace_ids` field
- No path-overlap detection during registration
- No dashboard UI for showing workspace relationships
- No API endpoint for hierarchy data



## 4. Dashboard Workspace Listing

### Data Flow
1. **Component**: `WorkspaceList.tsx` renders a grid of `WorkspaceCard` components
2. **Type**: `WorkspaceSummary` has: workspace_id, name, path, health, active_plan_count, archived_plan_count, last_activity, languages
3. **API**: `GET /api/workspaces` → `workspacesRouter.get('/')` in `dashboard/server/src/routes/workspaces.ts`
4. **Scanner**: `scanWorkspaces(dataRoot)` in `dashboard/server/src/services/fileScanner.ts`
   - Reads all directories in data root
   - Filters for directories with valid `workspace.meta.json`
   - Returns flat list of WorkspaceSummary objects

### Extension Points
- `WorkspaceSummary` needs `parent_workspace_id?: string` and `child_workspace_ids?: string[]`
- `WorkspaceList` component can group/nest workspaces by hierarchy
- `scanWorkspaces` can add hierarchy fields from meta
- `WorkspaceCard` can show parent/children indicators



## 5. Ghost Workspace Scenario

### The Problem
- `c:\Users\User\Project_Memory_MCP` was registered as `project_memory_mcp-50e04147a402`
- `c:\Users\User\Project_Memory_MCP\Project-Memory-MCP` (a subdirectory) is the real workspace as `project-memory-mcp-40f6678f5a9b`
- Both appear in workspace-registry.json with separate entries
- Both have separate data folders with workspace.meta.json
- The parent directory has NO plans (empty workspace) but takes up space and causes confusion
- The parent directory does NOT have a `.projectmemory/identity.json` (only the child does)

### Why It Happened
- Registration has no path-overlap check
- When parent dir was registered, hash-based ID was generated independently
- Nothing compares the new path against existing workspace paths to detect containment
- `findExistingWorkspaceByPath()` only checks for exact path matches, not containment

### Detection Opportunity
During registration, when `createWorkspace()` is called:
1. Normalize the new path
2. Check ALL entries in workspace-registry.json
3. If `newPath.startsWith(existingPath + '/')` → new workspace is CHILD of existing
4. If `existingPath.startsWith(newPath + '/')` → new workspace is PARENT of existing
5. Store the relationship in both WorkspaceMeta objects



## 6. Monorepo Patterns

### Typical Structure
```
/myapp/                    → parent workspace
  /myapp/frontend/         → child workspace (React app)
  /myapp/backend/          → child workspace (Node.js API)
  /myapp/shared/           → child workspace (shared libs)
```

### Design Considerations
- Parent should aggregate child plans in dashboard view
- Children should be independently registrable and workable
- Identity is per-workspace (each has own .projectmemory/identity.json)
- Parent registration should NOT prevent child registration
- Child registration should NOT prevent parent registration

### Implementation Options

#### Option A: Bidirectional References in WorkspaceMeta
```typescript
// In WorkspaceMeta
parent_workspace_id?: string;
child_workspace_ids?: string[];
```
- Pros: Simple, explicit, discoverable
- Cons: Must keep sync'd when workspaces are registered/unregistered

#### Option B: Registry-Level Hierarchy
```typescript
// In workspace-registry.json
interface WorkspaceRegistry {
  entries: Record<string, string>;
  hierarchy: {
    [parentId: string]: string[];  // parent → children
  };
}
```
- Pros: Single source of truth
- Cons: Registry is just a path→ID cache, adding hierarchy changes its role

#### Option C: Computed at Query Time
- At `list` or `info` time, compare all workspace paths to detect containment
- Pros: No schema changes, always accurate
- Cons: O(n²) comparison on every query, no persistent state

#### Recommendation: Option A (bidirectional references) with auto-detection at registration time
- During `createWorkspace()`, scan registry for path overlaps
- Update both parent and child WorkspaceMeta with references
- Dashboard reads the references from meta — fast and schema-driven



## 7. Files to Modify (Architecture Scope)

### Server Types
- `server/src/types/workspace.types.ts` — Add `parent_workspace_id`, `child_workspace_ids` to WorkspaceMeta

### Server Registration Logic
- `server/src/storage/file-store.ts` (`createWorkspace`) — Add overlap detection
- `server/src/storage/workspace-registry.ts` — Helper to find overlapping paths
- `server/src/storage/workspace-identity.ts` (`ensureIdentityFile`) — Possibly warn on overlap

### Server Tools
- `server/src/tools/consolidated/memory_workspace.ts` — Return hierarchy info in register/list/info responses

### Dashboard Types
- `dashboard/src/types/index.ts` — Add hierarchy fields to WorkspaceSummary

### Dashboard API
- `dashboard/server/src/services/fileScanner.ts` — Include hierarchy in scan results
- `dashboard/server/src/routes/workspaces.ts` — Return hierarchy data

### Dashboard UI
- `dashboard/src/components/workspace/WorkspaceList.tsx` — Group by hierarchy
- `dashboard/src/components/workspace/WorkspaceCard.tsx` — Show parent/child indicators
