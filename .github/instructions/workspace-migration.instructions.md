---
applyTo: "**/*"
---

# Workspace Migration Guide

## When to Use

Use the `migrate` action when opening a workspace that was created under an older version of the Project Memory system. Common signs:

- The workspace has no `.projectmemory/identity.json` file
- Plans or history appear missing after updating the MCP server
- `memory_workspace` (action: register) returns `first_time: true` for a workspace that should already have data
- The data root contains duplicate or ghost folders for the same workspace

## How to Migrate

Call `memory_workspace` with action `migrate` and the workspace's absolute path:

```json
{
  "action": "migrate",
  "workspace_path": "C:\\Users\\User\\path\\to\\workspace"
}
```

This single call performs the full migration:

1. **Resolves** the canonical workspace ID (from `identity.json` or hash-based fallback)
2. **Creates** the canonical data folder and `workspace.meta.json` if missing
3. **Scans** every folder in the data root for ghost/duplicate folders belonging to this workspace
4. **Moves** all plans from matching ghost folders into the canonical workspace
5. **Updates** `workspace_id` in each recovered plan's `state.json`
6. **Merges** logs from ghost folders
7. **Deletes** the now-empty ghost folders
8. **Refreshes** `active_plans` and `archived_plans` in the workspace meta
9. **Writes** `.projectmemory/identity.json` into the workspace directory

## Response Fields

| Field | Description |
|-------|-------------|
| `workspace_id` | The canonical workspace ID after migration |
| `workspace_path` | The resolved filesystem path |
| `identity_written` | Whether `identity.json` was written/refreshed |
| `ghost_folders_found` | Array of duplicate/ghost folders detected |
| `ghost_folders_merged` | Names of ghost folders that had plans merged |
| `plans_recovered` | Plan IDs that were moved into the canonical workspace |
| `folders_deleted` | Ghost folder names that were cleaned up |
| `notes` | Skipped duplicates, errors, or other details |

## When NOT to Use

- **Fresh workspaces** — just use `register` instead
- **Workspaces already on the current version** — `register` handles incremental updates automatically
- **If you only need ghost detection without cleanup** — use `scan_ghosts` for a read-only scan

## Recommended Workflow for Old Workspaces

```
1. memory_workspace(action: "migrate", workspace_path: "<path>")
2. memory_workspace(action: "info", workspace_id: "<returned id>")
3. Continue normal agent workflow
```

## Related Actions

| Action | Purpose |
|--------|---------|
| `register` | Normal workspace registration (also runs legacy migration, but does not scan for unrelated ghost folders) |
| `scan_ghosts` | Read-only scan of data root for orphaned folders |
| `merge` | Manually merge a specific source folder into a target workspace (supports `dry_run`) |
| `migrate` | Full automated migration: register + scan + merge + cleanup in one call |
