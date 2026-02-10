# BuildScript Schema & Storage Architecture

## Overview

Build scripts are reusable command definitions that agents (primarily the Builder) can store, resolve, and execute. They enable repeatable build verification across plan phases and workspace sessions.

## BuildScript Interface

```typescript
interface BuildScript {
  id: string;            // Auto-generated unique ID (e.g., "bs_abc123")
  name: string;          // Human-readable name (e.g., "Build Server")
  description: string;   // What the script does
  command: string;       // Shell command to run (e.g., "npm run build")
  directory: string;     // Working directory, relative to workspace root
  created_at: string;    // ISO 8601 timestamp
  plan_id?: string;      // If associated with a specific plan
  workspace_id: string;  // Workspace this script belongs to
  mcp_handle?: string;   // Optional MCP tool handle for programmatic execution
  directory_path?: string; // Absolute directory path (resolved at runtime by MCP tool)
  command_path?: string;   // Absolute command path (when command is a file path)
}
```

## Storage Architecture

### Workspace-Level Scripts

Workspace-level scripts are stored in the workspace metadata file:

```
data/<workspace_id>/workspace.json
```

These scripts are available to all plans in the workspace and persist across plan lifecycles.

### Plan-Level Scripts

Plan-level scripts are stored in the plan state file:

```
data/<workspace_id>/plans/<plan_id>/state.json
```

Plan-level scripts are scoped to a specific plan. When listing scripts, the `list_build_scripts` action merges both workspace-level and plan-level scripts.

### Storage Format

Scripts are stored as an array within the `build_scripts` property of either `workspace.json` or `state.json`:

```json
{
  "build_scripts": [
    {
      "id": "bs_001",
      "name": "Build Server",
      "description": "Compiles TypeScript server code",
      "command": "npm run build",
      "directory": "./server",
      "created_at": "2026-01-15T10:30:00Z",
      "workspace_id": "my-project-abc123"
    }
  ]
}
```

## Path Resolution

When `run_build_script` is called, the MCP tool resolves relative paths to absolute paths using the workspace root:

- `directory` → `directory_path` (e.g., `./server` → `/workspace/server`)
- `command` → `command_path` (when command is a file path, e.g., `./scripts/build.sh`)

The `parseCommandTokens` utility splits the command into tokens for safe path resolution.

## Result Types

```typescript
interface AddBuildScriptResult {
  script: BuildScript;
}

interface ListBuildScriptsResult {
  scripts: BuildScript[];
}

interface RunBuildScriptResult {
  script_id: string;
  script_name: string;
  command: string;
  directory: string;
  directory_path: string;   // Absolute resolved path
  command_path?: string;
  message: string;          // Human-readable instruction for terminal execution
}

interface DeleteBuildScriptResult {
  deleted: boolean;
  script_id: string;
}
```

## File Operations

All file operations use JSON-locked writes (`modifyJsonLocked`) to prevent concurrent modification issues. Each mutation appends to the workspace file update log for auditability.
