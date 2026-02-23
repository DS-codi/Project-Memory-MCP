---
plan_id: plan_ml72da5d_09189d1a
created_at: 2026-02-03T20:43:56.523Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Data Storage Architecture

## Directory Structure

### Root Data Folder
- Path: `data/` (configurable via `MBS_DATA_ROOT` env var)
- Contains workspace directories identified by hashed workspace IDs

### Workspace Structure
```
data/
  {workspace-id}/                    # Generated from workspace path hash
    workspace.meta.json              # Workspace metadata
    plans/
      {plan-id}/                     # e.g., plan_ml72da5d_09189d1a
        state.json                   # Plan state (PlanState type)
        plan.md                      # Markdown plan summary
        original_request.json        # Initial user request
        research_notes/              # Research findings (.md files)
        logs/                        # Agent session logs
        {context-type}.json          # Various context files
```

## File Formats

### workspace.meta.json
```typescript
interface WorkspaceMeta {
  id: string;
  path: string;
  name: string;
  registered_at: string;
  last_active: string;
  profile?: WorkspaceProfile;
}
```

### state.json (PlanState)
From `server/src/types/index.ts`:
```typescript
interface PlanState {
  id: string;
  workspace_id: string;
  title: string;
  description: string;
  priority: PlanPriority;
  status: PlanStatus;
  category: RequestCategory;
  categorization?: RequestCategorization;
  current_phase: string;
  current_agent: AgentType | null;
  recommended_next_agent?: AgentType;
  pending_notes?: PlanNote[];
  agent_sessions: AgentSession[];
  lineage: LineageEntry[];
  steps: PlanStep[];
  created_at: string;
  updated_at: string;
}
```

## Storage Layer

### File: `server/src/storage/file-store.ts`

Key functions:
- `generateWorkspaceId(workspacePath)` - Creates hashed workspace ID
- `generatePlanId()` - Creates unique plan ID (plan_timestamp_random)
- `getWorkspacePath(workspaceId)` - Returns workspace directory path
- `getPlanPath(workspaceId, planId)` - Returns plan directory path
- `readJson<T>(filePath)` / `writeJson(filePath, data)` - JSON I/O with file locking

### File Locking
- Uses `FileLockManager` class for concurrent access prevention
- Serializes writes to same file path
- Prevents race conditions in multi-agent scenarios

## Adding Build Scripts Storage

### Option 1: Extend PlanState (Per-Plan Scripts)
Add to `server/src/types/index.ts`:
```typescript
interface BuildScript {
  id: string;
  name: string;
  description: string;
  created_at: string;
  required_directory: string;  // Relative to workspace root
  mcp_handle?: string;         // Optional MCP tool handle
  command: string;
  environment?: Record<string, string>;
}

// Add to PlanState interface:
build_scripts?: BuildScript[];
```

### Option 2: Separate Per-Workspace Scripts File
Create `workspace.meta.json` extension:
```typescript
interface WorkspaceMeta {
  // ... existing fields
  build_scripts?: BuildScript[];
}
```

Or create separate file:
```
data/{workspace-id}/build_scripts.json
```

### Option 3: Both (Recommended)
- **Workspace-level**: Reusable scripts for all plans
- **Plan-level**: Plan-specific build configurations

### Storage Functions Needed
```typescript
// In file-store.ts
export async function addBuildScript(
  workspaceId: string, 
  planId: string | null,  // null = workspace-level
  script: BuildScript
): Promise<void>

export async function getBuildScripts(
  workspaceId: string,
  planId?: string
): Promise<BuildScript[]>

export async function updateBuildScript(
  workspaceId: string,
  planId: string | null,
  scriptId: string,
  updates: Partial<BuildScript>
): Promise<void>
```
