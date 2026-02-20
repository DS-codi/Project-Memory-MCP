````instructions
---
applyTo: "**/*"
---

# memory_workspace — Tool Reference

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)

Consolidated workspace management tool for registering directories, listing workspaces, and managing codebase profiles.

### Actions

#### `register`
Register a workspace directory with the Project Memory system.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"register"` |
| `workspace_path` | string | ✅ | Absolute path to the workspace directory |

**Returns:** Workspace metadata including `workspace_id`, indexing status, and optional codebase profile.

**Example:**
```json
{
  "action": "register",
  "workspace_path": "/home/user/my-project"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "register",
    "data": {
      "workspace": {
        "id": "my-project-652c624f8f59",
        "path": "/home/user/my-project",
        "name": "my-project",
        "registered_at": "2026-02-04T10:00:00.000Z"
      },
      "first_time": true,
      "indexed": true,
      "profile": {
        "languages": ["typescript", "javascript"],
        "frameworks": ["react", "node"],
        "package_manager": "npm"
      }
    }
  }
}
```

**When to use:** At the start of any work session, or when setting up a new project.

**Used by:** Coordinator, any agent starting work on a new project.

---

#### `list`
List all registered workspaces.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |

**Returns:** Array of workspace metadata objects.

**Example:**
```json
{
  "action": "list"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "list",
    "data": [
      {
        "id": "my-project-652c624f8f59",
        "path": "/home/user/my-project",
        "name": "my-project",
        "registered_at": "2026-02-04T10:00:00.000Z"
      }
    ]
  }
}
```

**When to use:** When you need to find a workspace by name or see all available workspaces.

**Used by:** Coordinator, any agent needing to discover workspaces.

---

#### `info`
Get detailed information about a workspace including all plans.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"info"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Returns:** Workspace metadata plus all plans (active and archived).

**Example:**
```json
{
  "action": "info",
  "workspace_id": "my-project-652c624f8f59"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "action": "info",
    "data": {
      "workspace": { /* workspace metadata */ },
      "plans": [ /* array of plan states */ ],
      "active_plans": 2,
      "archived_plans": 5
    }
  }
}
```

**When to use:** When starting work on a workspace to see existing plans.

**Used by:** Coordinator, Architect.

---

#### `reindex`
Re-analyze the workspace to update the codebase profile.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"reindex"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Returns:** Previous profile, new profile, and detected changes.

**Example:**
```json
{
  "action": "reindex",
  "workspace_id": "my-project-652c624f8f59"
}
```

**When to use:** After significant changes to the project structure (new dependencies, language additions, etc.).

**Used by:** Archivist, Coordinator.

````
