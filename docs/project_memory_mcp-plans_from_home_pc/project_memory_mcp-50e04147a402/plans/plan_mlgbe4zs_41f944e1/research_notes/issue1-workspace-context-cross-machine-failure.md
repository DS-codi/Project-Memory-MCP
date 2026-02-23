---
plan_id: plan_mlgbe4zs_41f944e1
created_at: 2026-02-10T08:06:29.319Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Issue 1: Workspace Context Storage Fails on Other Machines

## Root Cause Analysis

### The Validation Chain

The full validation chain for workspace context operations (get/set/update/delete) is:

1. **`workspace-context.tools.ts` → `loadWorkspace()`** (line 140)
   - Calls `store.getWorkspace(workspaceId)` to load `workspace.meta.json`
   - Then calls **`validateWorkspaceIdentity(workspaceId, workspace)`** (line 147)

2. **`validateWorkspaceIdentity()`** (line 35)
   - Gets `workspace_path` from the workspace meta (either `.workspace_path` or `.path`)
   - Calls **`store.resolveWorkspaceIdForPath(workspacePath)`** which delegates to `resolveCanonicalWorkspaceId()`

3. **`resolveCanonicalWorkspaceId()`** in `workspace-identity.ts` (line 196)
   - Calls `safeResolvePath(workspacePath)` to resolve the path
   - Calls **`readWorkspaceIdentityFile(resolvedPath)`** to read `.projectmemory/identity.json` from the workspace directory
   - If identity file exists and is valid → uses its `workspace_id`
   - Otherwise → falls back to hash-based `getWorkspaceIdFromPath()`

4. **`readWorkspaceIdentityFile()`** (line 160)
   - Reads `<workspace_path>/.projectmemory/identity.json`
   - **CRITICAL CHECK**: Compares `normalizeWorkspacePath(resolvedPath)` with `normalizeWorkspacePath(identity.workspace_path)`
   - If they DON'T match → **returns null** (identity file is rejected)

### Exactly What Fails

When running on a different machine with different paths, here's the failure cascade:

1. `workspace.meta.json` was created on Machine A with `workspace_path: "S:\\NotionArchive"`
2. On Machine B, the same workspace is accessed via a different path (e.g., `\\\\server\\share\\NotionArchive` or `D:\\Shared\\NotionArchive`)
3. `validateWorkspaceIdentity()` gets `workspacePath = "S:\\NotionArchive"` from the stored meta
4. `resolveCanonicalWorkspaceId("S:\\NotionArchive")` tries to:
   - Read `S:\NotionArchive\.projectmemory\identity.json` → **FAILS** because path doesn't exist on Machine B
   - Falls back to `getWorkspaceIdFromPath("S:\\NotionArchive")` which produces a hash-based ID
5. This hash-based ID is compared to the stored `workspaceId` → **MISMATCH** → validation fails
6. Error returned: `"Workspace ID mismatch: resolved X for path Y, but got Z"`

### Secondary Issue: identity.json Path Lock

Even if `identity.json` exists in the workspace, `readWorkspaceIdentityFile()` also compares the stored `workspace_path` against the current path. If the workspace was registered with path `S:\NotionArchive` but is now accessed as `D:\Shared\NotionArchive`, the identity file is rejected because the normalized paths don't match.

This means `identity.json` ITSELF is path-locked — it can't be used to resolve the workspace on a different machine.

### The Dashboard Bypass

**Critically, the dashboard REST API does NOT have this problem.** Looking at `dashboard/server/src/routes/workspaces.ts`:

- `GET /:id/context` (line 247): Reads directly from `<MBS_DATA_ROOT>/<workspaceId>/workspace.context.json` using `readWorkspaceMeta(workspaceId)` which just reads the meta file by ID — **NO identity validation**
- `PUT /:id/context` (line 264): Similarly reads meta by ID and writes to the context JSON file directly — **NO identity validation**

The dashboard uses the workspace ID as a direct folder lookup, bypassing the entire `validateWorkspaceIdentity()` → `resolveCanonicalWorkspaceId()` → `readWorkspaceIdentityFile()` chain.

**This means the dashboard CAN read and write workspace context, but the MCP tools CANNOT** when on a different machine.

### Where identity.json Lives

The identity file lives **inside the workspace itself** at:
```
<workspace_root>/.projectmemory/identity.json
```

This is defined in `workspace-identity.ts`:
```typescript
export function getWorkspaceIdentityPath(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory', 'identity.json');
}
```

### Network Drive Problem

When the workspace is on a network drive:
1. Machine A registers it as `S:\NotionArchive` → identity.json is written with `workspace_path: "S:\\NotionArchive"`
2. Machine B accesses same share as `N:\NotionArchive` or `\\\\server\\share\\NotionArchive`
3. `readWorkspaceIdentityFile()` normalizes both paths → `s:/notionarchive` vs `n:/notionarchive` → **MISMATCH** → returns null
4. Falls back to hash-based ID which will also be different (different path = different hash)
5. All context operations fail

## Proposed Fix Directions

1. **Skip path validation for workspace context ops** — the workspace_id alone should be sufficient (the dashboard already works this way)
2. **Allow identity.json to match on workspace_id alone** without comparing paths (since the ID IS the identity)  
3. **Support path aliases** in identity.json — store multiple accepted paths
4. **Use workspace_id-based lookup** instead of path-based resolution for context operations
