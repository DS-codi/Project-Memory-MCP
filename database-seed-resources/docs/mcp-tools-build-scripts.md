# MCP Tools - Build Script Actions Reference

## Tool: `memory_plan`

Build script actions are part of the consolidated `memory_plan` tool. They manage reusable build commands that agents can store, resolve, and execute.

---

## `add_build_script`

Add a reusable build script to the workspace or plan.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `"add_build_script"` |
| `workspace_id` | string | Yes | The workspace ID |
| `plan_id` | string | No | Associate with a specific plan (omit for workspace-level) |
| `script_name` | string | Yes | Human-readable name for the script |
| `script_description` | string | No | Description of what the script does |
| `script_command` | string | Yes | The shell command to run |
| `script_directory` | string | Yes | Working directory (relative to workspace root) |
| `script_mcp_handle` | string | No | MCP handle for programmatic execution |

### Example

```json
{
  "action": "add_build_script",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123",
  "script_name": "Build Server",
  "script_description": "Compiles TypeScript server code",
  "script_command": "npm run build",
  "script_directory": "./server"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "action": "add_build_script",
    "data": {
      "script": {
        "id": "bs_abc123",
        "name": "Build Server",
        "description": "Compiles TypeScript server code",
        "command": "npm run build",
        "directory": "./server",
        "workspace_id": "my-project-652c624f8f59",
        "created_at": "2026-01-15T10:30:00Z"
      }
    }
  }
}
```

**Used by:** Reviewer, Executor

---

## `list_build_scripts`

List all build scripts available for a workspace. Merges workspace-level and plan-level scripts.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `"list_build_scripts"` |
| `workspace_id` | string | Yes | The workspace ID |
| `plan_id` | string | No | Filter to a specific plan's scripts |

### Example

```json
{
  "action": "list_build_scripts",
  "workspace_id": "my-project-652c624f8f59"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "action": "list_build_scripts",
    "data": {
      "scripts": [
        {
          "id": "bs_001",
          "name": "Build Server",
          "command": "npm run build",
          "directory": "./server",
          "directory_path": "/workspace/server",
          "description": "Compiles TypeScript server code",
          "workspace_id": "my-project-652c624f8f59",
          "created_at": "2026-01-15T10:30:00Z"
        }
      ]
    }
  }
}
```

Note: `directory_path` is resolved at response time using the workspace root path.

**Used by:** Reviewer, Executor, Tester

---

## `run_build_script`

Resolve a registered build script by ID and return its command and directory for terminal execution. This action does **not** execute the command — the agent must run it in the terminal.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `"run_build_script"` |
| `workspace_id` | string | Yes | The workspace ID |
| `script_id` | string | Yes | The script ID to resolve |
| `plan_id` | string | No | The plan ID (for plan-scoped scripts) |

### Example

```json
{
  "action": "run_build_script",
  "workspace_id": "my-project-652c624f8f59",
  "script_id": "bs_001"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "action": "run_build_script",
    "data": {
      "script_id": "bs_001",
      "script_name": "Build Server",
      "command": "npm run build",
      "directory": "./server",
      "directory_path": "/workspace/server",
      "message": "Run this command in your terminal: npm run build (working directory: /workspace/server)"
    }
  }
}
```

### Agent Workflow

After receiving the response, use `run_in_terminal` with the returned `command` and set the working directory to `directory_path`.

**Used by:** Reviewer, Executor, Tester

---

## `delete_build_script`

Delete a build script by ID.

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | Yes | `"delete_build_script"` |
| `workspace_id` | string | Yes | The workspace ID |
| `script_id` | string | Yes | The script ID to delete |
| `plan_id` | string | No | The plan ID (if plan-scoped) |

### Example

```json
{
  "action": "delete_build_script",
  "workspace_id": "my-project-652c624f8f59",
  "script_id": "bs_001"
}
```

### Response

```json
{
  "success": true,
  "data": {
    "action": "delete_build_script",
    "data": {
      "deleted": true,
      "script_id": "bs_001"
    }
  }
}
```

**Used by:** Reviewer, Archivist
