# Project Memory MCP - Complete Tool Reference

> **Version:** 2.0 (Consolidated Tools)  
> **Last Updated:** February 2026  
> **Purpose:** Definitive reference for all agents using the Project Memory MCP system

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Tool Summary](#tool-summary)
4. [memory_workspace](#memory_workspace)
5. [memory_plan](#memory_plan)
6. [memory_steps](#memory_steps)
7. [memory_agent](#memory_agent)
8. [memory_context](#memory_context)
9. [Agent Workflow Examples](#agent-workflow-examples)
10. [Best Practices](#best-practices)
11. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
12. [Tips by Agent Role](#tips-by-agent-role)

---

## Overview

The Project Memory MCP system provides persistent memory and coordination for AI agents working on software development tasks. It consists of **5 consolidated tools** that replace the previous 20+ individual tools.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Workspace** | A registered directory containing a software project |
| **Plan** | A structured task list with phases, steps, goals, and agent assignments |
| **Step** | A single task within a plan, with status and assignee |
| **Session** | An agent's active work period on a plan |
| **Handoff** | Transfer of responsibility from one agent to another |
| **Lineage** | The history of handoffs for a plan |
| **Context** | Stored data related to a plan (user request, research, etc.) |

### Agent Types

| Agent | Role | Primary Tools |
|-------|------|---------------|
| **Coordinator** | Orchestrates workflow, manages handoffs | `memory_agent`, `memory_plan`, `memory_context` |
| **Researcher** | Gathers context and information | `memory_context`, `memory_agent` |
| **Architect** | Designs solutions, creates plans | `memory_plan`, `memory_steps`, `memory_agent` |
| **Executor** | Implements code changes | `memory_steps`, `memory_agent` |
| **Builder** | Manages build scripts and processes | `memory_plan` (build script actions), `memory_agent` |
| **Tester** | Writes and runs tests | `memory_steps`, `memory_agent` |
| **Reviewer** | Reviews code and plan quality | `memory_plan`, `memory_agent` |
| **Revisionist** | Fixes issues and blockers | `memory_steps`, `memory_agent` |
| **Archivist** | Archives and documents completed work | `memory_plan`, `memory_context`, `memory_agent` |
| **Analyst** | Analyzes requirements and existing code | `memory_context`, `memory_agent` |
| **Brainstorm** | Generates ideas and solutions | `memory_context`, `memory_agent` |

---

## Quick Start

Every agent MUST follow these steps when starting:

```json
// 1. Initialize your session
{
  "action": "init",
  "agent_type": "Executor",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "context": {
    "deployed_by": "Coordinator",
    "reason": "Implementing feature X"
  }
}

// 2. Validate you're the right agent
{
  "action": "validate",
  "agent_type": "Executor",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789"
}

// 3. Update step status as you work
{
  "action": "update",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "step_index": 0,
  "status": "active"
}

// 4. When done, handoff to next agent
{
  "action": "handoff",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Phase complete, recommend Reviewer"
}

// 5. Complete your session
{
  "action": "complete",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "agent_type": "Executor",
  "summary": "Completed 5 steps, created 3 files",
  "artifacts": ["src/feature.ts", "src/feature.test.ts"]
}
```

---

## Tool Summary

| Tool | Actions | Purpose |
|------|---------|---------|
| `memory_workspace` | register, list, info, reindex | Manage workspace registration and profiles |
| `memory_plan` | list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script | Full plan lifecycle management |
| `memory_steps` | add, update, batch_update, insert, delete, reorder, move, sort, set_order | Step-level operations |
| `memory_agent` | init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage | Agent lifecycle and coordination |
| `memory_context` | store, get, store_initial, list, list_research, append_research, generate_instructions | Context and research management |

---

## memory_workspace

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

---

## memory_plan

Comprehensive plan lifecycle management including creation, modification, archiving, goals, and build scripts.

### Actions

#### `list`
List all plans in a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |
| `workspace_id` | string | ✅* | The workspace ID (*one of workspace_id or workspace_path required) |
| `workspace_path` | string | ✅* | The workspace path |
| `include_archived` | boolean | ❌ | Include archived plans (default: false) |

**Example:**
```json
{
  "action": "list",
  "workspace_id": "my-project-652c624f8f59",
  "include_archived": true
}
```

**Used by:** Coordinator, Architect, Archivist.

---

#### `get`
Get the full state of a specific plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Returns:** Full plan state including steps, sessions, lineage, goals, and success criteria.

**Example:**
```json
{
  "action": "get",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** All agents (to understand current state before starting work).

---

#### `create`
Create a new plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"create"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `title` | string | ✅ | Short title for the plan |
| `description` | string | ✅ | Detailed description of the work |
| `category` | string | ✅ | One of: `feature`, `bug`, `change`, `analysis`, `debug`, `refactor`, `documentation` |
| `priority` | string | ❌ | One of: `low`, `medium`, `high`, `critical` (default: `medium`) |
| `goals` | string[] | ❌ | High-level goals for this plan |
| `success_criteria` | string[] | ❌ | Measurable criteria for success |
| `categorization` | object | ❌ | Full categorization with suggested workflow |

**Example:**
```json
{
  "action": "create",
  "workspace_id": "my-project-652c624f8f59",
  "title": "Add user authentication",
  "description": "Implement JWT-based authentication with login/logout",
  "category": "feature",
  "priority": "high",
  "goals": [
    "Users can log in with email/password",
    "JWT tokens are used for session management",
    "Logout invalidates the session"
  ],
  "success_criteria": [
    "All auth endpoints return correct status codes",
    "Tokens expire after 24 hours",
    "Unit tests pass with >80% coverage"
  ]
}
```

**Used by:** Coordinator (after Architect designs the plan).

---

#### `update`
Replace the steps in a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `steps` | PlanStep[] | ✅ | Array of new steps to replace existing steps |

**Step structure:**
```typescript
{
  phase: string;      // e.g., "Phase 1: Setup"
  task: string;       // The task description
  type?: string;      // "standard", "analysis", "validation", "user_validation", etc.
  status?: string;    // "pending", "active", "done", "blocked"
  assignee?: string;  // Agent type assigned to this step
  notes?: string;     // Additional notes
}
```

**Example:**
```json
{
  "action": "update",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "steps": [
    { "phase": "Phase 1: Setup", "task": "Install dependencies", "assignee": "Executor" },
    { "phase": "Phase 1: Setup", "task": "Create database schema", "assignee": "Executor" },
    { "phase": "Phase 2: Testing", "task": "Write unit tests", "assignee": "Tester" }
  ]
}
```

**Used by:** Architect (to set initial steps), Revisionist (to fix plan issues).

---

#### `archive`
Archive a completed plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"archive"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Example:**
```json
{
  "action": "archive",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Archivist (after successful completion), Coordinator.

---

#### `import`
Import an existing plan markdown file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"import"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_file_path` | string | ✅ | Path to the markdown plan file |
| `category` | string | ✅ | Category for the imported plan |
| `title` | string | ❌ | Override the title from the file |
| `priority` | string | ❌ | Priority level |

**Example:**
```json
{
  "action": "import",
  "workspace_id": "my-project-652c624f8f59",
  "plan_file_path": "/home/user/my-project/docs/auth-plan.md",
  "category": "feature"
}
```

**Used by:** Coordinator, Architect.

---

#### `find`
Find a plan by ID across all workspaces.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"find"` |
| `plan_id` | string | ✅ | The plan ID to find |

**Returns:** Plan state and workspace information if found.

**Example:**
```json
{
  "action": "find",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Any agent that knows the plan ID but not the workspace.

---

#### `add_note`
Add a note to a plan's notes array.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add_note"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `note` | string | ✅ | The note content |
| `note_type` | string | ❌ | One of: `info`, `warning`, `instruction` |

**Example:**
```json
{
  "action": "add_note",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "note": "Customer requested priority on mobile support",
  "note_type": "instruction"
}
```

**Used by:** Coordinator, Reviewer, any agent needing to record important information.

---

#### `delete`
Permanently delete a plan. **Requires confirmation.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `confirm` | boolean | ✅ | Must be `true` to confirm deletion |

**Example:**
```json
{
  "action": "delete",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "confirm": true
}
```

**Used by:** Coordinator (for abandoned or duplicate plans).

---

#### `consolidate`
Merge multiple steps into a single step.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"consolidate"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_indices` | number[] | ✅ | Array of step indices to consolidate |
| `consolidated_task` | string | ✅ | The new task description for the merged step |

**Example:**
```json
{
  "action": "consolidate",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_indices": [2, 3, 4],
  "consolidated_task": "Set up authentication middleware and routes"
}
```

**Used by:** Architect, Revisionist (to simplify overly granular plans).

---

#### `set_goals`
Set or update the goals and success criteria for a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"set_goals"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `goals` | string[] | ❌* | High-level goals (*at least one of goals or success_criteria required) |
| `success_criteria` | string[] | ❌* | Measurable success criteria |

**Example:**
```json
{
  "action": "set_goals",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "goals": [
    "Implement secure JWT authentication",
    "Support refresh tokens",
    "Add rate limiting"
  ],
  "success_criteria": [
    "All auth tests pass",
    "No security vulnerabilities detected",
    "Response time under 100ms"
  ]
}
```

**Used by:** Architect (during plan design), Coordinator (to refine goals).

---

#### `add_build_script`
Add a reusable build script to the workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add_build_script"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ❌ | Associate with a specific plan |
| `script_name` | string | ✅ | Name for the script |
| `script_description` | string | ❌ | Description of what the script does |
| `script_command` | string | ✅ | The command to run |
| `script_directory` | string | ✅ | Working directory for the command |
| `script_mcp_handle` | string | ❌ | MCP handle for the script |

**Example:**
```json
{
  "action": "add_build_script",
  "workspace_id": "my-project-652c624f8f59",
  "script_name": "build-server",
  "script_description": "Build the TypeScript server",
  "script_command": "npm run build",
  "script_directory": "/home/user/my-project/server"
}
```

**Used by:** Builder, Executor.

---

#### `list_build_scripts`
List all build scripts for a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_build_scripts"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ❌ | Filter to a specific plan |

**Used by:** Builder, Executor, Tester.

---

#### `run_build_script`
Resolve a registered build script and return its command and directory for terminal execution. The agent should then run the resolved command in the terminal using `run_in_terminal`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"run_build_script"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `script_id` | string | ✅ | The script ID to resolve |

**Returns:** `{ command, directory_path, script_name }` — use these to run the script in a terminal.

**Used by:** Builder, Executor, Tester.

---

#### `delete_build_script`
Delete a build script.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete_build_script"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `script_id` | string | ✅ | The script ID to delete |
| `plan_id` | string | ❌ | The plan ID (if plan-scoped) |

**Used by:** Builder, Archivist.

---

## memory_steps

Step-level operations for managing individual tasks within a plan.

### Actions

#### `add`
Append new steps to the end of a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `steps` | PlanStep[] | ✅ | Array of steps to append |

**Example:**
```json
{
  "action": "add",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "steps": [
    { "phase": "Phase 3: Deployment", "task": "Deploy to staging", "assignee": "Builder" },
    { "phase": "Phase 3: Deployment", "task": "Run smoke tests", "assignee": "Tester" }
  ]
}
```

**Used by:** Architect, Revisionist.

---

#### `update`
Update a single step's status and notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The 0-based index of the step |
| `status` | string | ✅ | One of: `pending`, `active`, `done`, `blocked` |
| `notes` | string | ❌ | Notes about the step completion/status |
| `agent_type` | string | ❌ | The agent making the update |

**Example:**
```json
{
  "action": "update",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 3,
  "status": "done",
  "notes": "Implemented login endpoint, tests passing"
}
```

**Used by:** All agents (to track their progress).

---

#### `batch_update`
Update multiple steps at once.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"batch_update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `updates` | object[] | ✅ | Array of update objects |

**Update object structure:**
```typescript
{
  index: number;      // Step index
  status: string;     // New status
  notes?: string;     // Optional notes
}
```

**Example:**
```json
{
  "action": "batch_update",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "updates": [
    { "index": 0, "status": "done", "notes": "Setup complete" },
    { "index": 1, "status": "done", "notes": "Schema created" },
    { "index": 2, "status": "active" }
  ]
}
```

**Used by:** Executor (when completing multiple steps), Reviewer (when validating work).

---

#### `insert`
Insert a new step at a specific index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"insert"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `at_index` | number | ✅ | The index where the step should be inserted |
| `step` | PlanStep | ✅ | The step to insert |

**Example:**
```json
{
  "action": "insert",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "at_index": 2,
  "step": {
    "phase": "Phase 1: Setup",
    "task": "Add missing database migration",
    "assignee": "Executor"
  }
}
```

**Used by:** Revisionist (to add missing steps), Architect (to refine plans).

---

#### `delete`
Delete a step by index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The index of the step to delete |

**Example:**
```json
{
  "action": "delete",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 5
}
```

**Used by:** Revisionist (to remove obsolete steps), Architect.

---

#### `reorder`
Swap a step with an adjacent step (move up or down).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"reorder"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The index of the step to move |
| `direction` | string | ✅ | `"up"` or `"down"` |

**Example:**
```json
{
  "action": "reorder",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 3,
  "direction": "up"
}
```

**Notes:**
- Moving "up" swaps with the step at index - 1
- Moving "down" swaps with the step at index + 1
- Cannot move first step up or last step down

**Used by:** Architect, Revisionist (to fix step ordering).

---

#### `move`
Move a step to a specific index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"move"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `from_index` | number | ✅ | The current index of the step |
| `to_index` | number | ✅ | The target index |

**Example:**
```json
{
  "action": "move",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "from_index": 7,
  "to_index": 2
}
```

**Notes:**
- All steps between from_index and to_index are re-indexed
- Step indices are automatically recalculated

**Used by:** Architect, Revisionist (for major plan restructuring).

---

#### `sort`
Sort all steps by phase. Optionally provide a custom phase order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"sort"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `phase_order` | string[] | ❌ | Custom phase order (e.g., `["Research", "Design", "Implement", "Test"]`) |

**Example (alphabetic sort):**
```json
{
  "action": "sort",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Example (custom phase order):**
```json
{
  "action": "sort",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "phase_order": ["Research", "Architecture", "Implementation", "Testing", "Documentation"]
}
```

**Notes:**
- Without `phase_order`, steps are sorted alphabetically by phase
- With `phase_order`, steps are sorted according to the provided order
- Steps within the same phase maintain their relative order

**Used by:** Architect (for organizing plans by phase).

---

#### `set_order`
Completely reorder all steps according to a new order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"set_order"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `new_order` | number[] | ✅ | Array of current indices in desired new order |

**Example:**
```json
{
  "action": "set_order",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "new_order": [2, 0, 1, 3, 5, 4]
}
```

This means:
- Current step 2 becomes index 0
- Current step 0 becomes index 1
- Current step 1 becomes index 2
- Current step 3 stays at index 3
- Current step 5 becomes index 4
- Current step 4 becomes index 5

**Notes:**
- `new_order` must contain exactly as many indices as there are steps
- Each current step index must appear exactly once
- This is the most flexible reordering option

**Used by:** Architect, Revisionist (for complete plan reorganization).

---

## memory_agent

Agent lifecycle management including initialization, validation, handoffs, and coordination.

### Actions

#### `init`
Initialize an agent session. **MUST be called first by every agent.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"init"` |
| `agent_type` | string | ✅ | The agent type (Coordinator, Executor, etc.) |
| `workspace_id` | string | ❌ | The workspace ID (required if working on a plan) |
| `plan_id` | string | ❌ | The plan ID (required if working on a plan) |
| `context` | object | ❌ | Context data for this session |

**Context object (recommended):**
```typescript
{
  deployed_by: string;          // Which agent started this one
  reason: string;               // Why this agent was activated
  current_step_index?: number;  // Where to start
  steps_to_complete?: string[]; // What needs to be done
  environment?: {
    working_directory: string;
    build_command?: string;
    active_branch?: string;
  };
  blockers_to_avoid?: string[]; // Known issues from previous attempts
}
```

**Returns:**
- Session information (session_id, started_at)
- Full plan state (if workspace_id and plan_id provided)
- Workspace status
- Role boundaries (what this agent can/cannot do)
- Instruction files (if any exist in `.memory/instructions/`)

**Example:**
```json
{
  "action": "init",
  "agent_type": "Executor",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "context": {
    "deployed_by": "Coordinator",
    "reason": "Implementing Phase 2 - User Authentication",
    "current_step_index": 5,
    "steps_to_complete": ["Create login endpoint", "Create logout endpoint", "Add JWT middleware"]
  }
}
```

**Used by:** ALL agents (must be first action).

---

#### `complete`
Complete an agent session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"complete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `agent_type` | string | ✅ | The agent type |
| `summary` | string | ✅ | Summary of work completed |
| `artifacts` | string[] | ❌ | List of files created/modified |

**Example:**
```json
{
  "action": "complete",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "agent_type": "Executor",
  "summary": "Completed Phase 2: Created login/logout endpoints, added JWT middleware. All tests passing.",
  "artifacts": [
    "src/auth/login.ts",
    "src/auth/logout.ts",
    "src/middleware/jwt.ts",
    "src/__tests__/auth.test.ts"
  ]
}
```

**Used by:** ALL agents (must be called before ending session).

---

#### `handoff`
Transfer responsibility to another agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"handoff"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `from_agent` | string | ✅ | The agent handing off |
| `to_agent` | string | ✅ | The agent receiving (usually Coordinator) |
| `reason` | string | ✅ | Why the handoff is happening |
| `data` | object | ❌ | Additional handoff data |

**Handoff data (recommended):**
```typescript
{
  recommendation?: string;      // Which agent should handle next
  steps_completed?: number;     // How many steps were completed
  files_modified?: string[];    // What files were changed
  blockers?: string[];          // Any issues encountered
  next_steps?: string[];        // Suggested next actions
}
```

**Example:**
```json
{
  "action": "handoff",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Phase 2 complete, ready for code review",
  "data": {
    "recommendation": "Reviewer",
    "steps_completed": 5,
    "files_modified": ["src/auth/login.ts", "src/auth/logout.ts"]
  }
}
```

**Important:** Subagents should ALWAYS hand off to Coordinator, not directly to other agents. Include a `recommendation` in the data.

**Used by:** ALL agents (before completing their session).

---

#### `validate`
Validate that this agent is correct for the current task.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"validate"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `agent_type` | string | ✅ | The agent type to validate |

**Returns:**
- `action`: `"continue"` or `"switch"`
- `role_boundaries`: What this agent can/cannot do
- `current_phase`: The current plan phase
- `current_step`: The next pending step
- `switch_to`: (if action is "switch") Which agent should handle this
- `switch_reason`: (if action is "switch") Why a switch is needed
- `todo_list`: Suggested actions for this agent
- `warnings`: Any issues to be aware of

**Example:**
```json
{
  "action": "validate",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "agent_type": "Executor"
}
```

**Used by:** ALL agents (should be called immediately after `init`).

---

#### `list`
List all available agent types.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |

**Returns:** Array of agent type names.

**Example:**
```json
{
  "action": "list"
}
```

**Used by:** Coordinator.

---

#### `get_instructions`
Get the full instructions for an agent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_instructions"` |
| `agent_name` | string | ✅ | The agent name (e.g., "executor", "reviewer") |

**Returns:** The full markdown content of the agent's instruction file.

**Example:**
```json
{
  "action": "get_instructions",
  "agent_name": "executor"
}
```

**Used by:** Coordinator (when spawning new agents).

---

#### `deploy`
Deploy agent files to a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"deploy"` |
| `workspace_path` | string | ✅ | Path to the workspace |
| `agents` | string[] | ❌ | Specific agents to deploy (default: all) |
| `include_prompts` | boolean | ❌ | Include prompt files |
| `include_instructions` | boolean | ❌ | Include instruction files |

**Example:**
```json
{
  "action": "deploy",
  "workspace_path": "/home/user/my-project",
  "agents": ["coordinator", "executor", "tester"],
  "include_prompts": true,
  "include_instructions": true
}
```

**Used by:** Coordinator (when setting up a new project).

---

#### `get_briefing`
Get a mission briefing for the current plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_briefing"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Returns:** Mission briefing including plan summary, current phase, pending steps, and context.

**Example:**
```json
{
  "action": "get_briefing",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Any agent needing a quick overview of the current mission.

---

#### `get_lineage`
Get the handoff history for a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_lineage"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Returns:** Array of handoff entries with timestamps, agents, and reasons.

**Example:**
```json
{
  "action": "get_lineage",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Coordinator (to understand the work history), Archivist.

---

## memory_context

Context and research management for storing user requests, research notes, and generating instruction files.

### Actions

#### `store`
Store typed context data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"store"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `type` | string | ✅ | Context type (e.g., "execution_log", "design_decisions") |
| `data` | object | ✅ | The data to store |

**Example:**
```json
{
  "action": "store",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "type": "execution_log",
  "data": {
    "commands_run": ["npm install", "npm run build", "npm test"],
    "build_output": "success",
    "test_results": { "passed": 15, "failed": 0 }
  }
}
```

**Used by:** Executor (for logging work), any agent needing to persist data.

---

#### `get`
Retrieve stored context data.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `type` | string | ✅ | Context type to retrieve |

**Example:**
```json
{
  "action": "get",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "type": "execution_log"
}
```

**Used by:** Any agent needing to read previously stored context.

---

#### `store_initial`
Store the initial user request and context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"store_initial"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `user_request` | string | ✅ | The original user request |
| `files_mentioned` | string[] | ❌ | Files mentioned by the user |
| `file_contents` | object | ❌ | Contents of mentioned files |
| `requirements` | string[] | ❌ | Extracted requirements |
| `constraints` | string[] | ❌ | Constraints or limitations |
| `examples` | string[] | ❌ | Examples provided by user |
| `conversation_context` | string | ❌ | Additional conversation context |
| `additional_notes` | string | ❌ | Any other relevant notes |

**Example:**
```json
{
  "action": "store_initial",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "user_request": "Add JWT authentication to the API",
  "files_mentioned": ["src/server.ts", "package.json"],
  "requirements": [
    "Support login with email/password",
    "Use refresh tokens",
    "Tokens expire after 24 hours"
  ],
  "constraints": [
    "Must use existing User model",
    "No breaking changes to existing endpoints"
  ]
}
```

**Used by:** Coordinator (at the start of a new plan).

---

#### `list`
List all context files for a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Returns:** Array of context file names.

**Example:**
```json
{
  "action": "list",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Any agent needing to see available context.

---

#### `list_research`
List all research note files for a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_research"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |

**Returns:** Array of research file names.

**Example:**
```json
{
  "action": "list_research",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Used by:** Researcher, Analyst, any agent needing research notes.

---

#### `append_research`
Add content to a research note file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"append_research"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `filename` | string | ✅ | Research file name (e.g., "api-analysis.md") |
| `content` | string | ✅ | Content to append |

**Example:**
```json
{
  "action": "append_research",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "filename": "api-analysis.md",
  "content": "## Existing Endpoints\\n\\n- GET /users - List all users\\n- POST /users - Create user\\n"
}
```

**Security:** Content is sanitized for potential injection attempts.

**Used by:** Researcher, Analyst.

---

#### `generate_instructions`
Generate an instruction file for a subagent.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"generate_instructions"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `target_agent` | string | ✅ | The agent type this is for |
| `mission` | string | ✅ | The mission description |
| `context` | string[] | ❌ | Context items for the agent |
| `constraints` | string[] | ❌ | Constraints the agent must follow |
| `deliverables` | string[] | ❌ | Expected deliverables |
| `files_to_read` | string[] | ❌ | Files the agent should read |
| `output_path` | string | ❌ | Custom output path for the file |

**Returns:**
- `instruction_file`: The generated instruction file object
- `content`: The full markdown content
- `written_to`: Path where the file was saved

**Files are saved to:** `{workspace}/.memory/instructions/{agent}-{timestamp}.md`

**Example:**
```json
{
  "action": "generate_instructions",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "target_agent": "Executor",
  "mission": "Implement JWT authentication endpoints",
  "context": [
    "Using Express.js for the API",
    "PostgreSQL database with Prisma ORM",
    "Existing User model in prisma/schema.prisma"
  ],
  "constraints": [
    "Do not modify existing endpoints",
    "Use bcrypt for password hashing",
    "Tokens must expire after 24 hours"
  ],
  "deliverables": [
    "POST /auth/login endpoint",
    "POST /auth/logout endpoint",
    "JWT middleware for protected routes"
  ],
  "files_to_read": [
    "src/server.ts",
    "prisma/schema.prisma",
    "src/routes/index.ts"
  ]
}
```

**Discovery:** When an agent calls `init`, any instruction files for their agent type are automatically discovered and returned in the `instruction_files` array.

**Used by:** Coordinator (before spawning subagents).

---

## Agent Workflow Examples

### Complete Workflow: Feature Request to Completion

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER REQUEST                                  │
│              "Add user authentication"                           │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                   │
│  1. memory_workspace (register)                                  │
│  2. memory_plan (create)                                         │
│  3. memory_context (store_initial)                               │
│  4. memory_agent (handoff → Researcher)                          │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESEARCHER                                    │
│  1. memory_agent (init, validate)                                │
│  2. memory_context (append_research) - analyze codebase          │
│  3. memory_agent (handoff → Coordinator, recommend Architect)    │
│  4. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECT                                     │
│  1. memory_agent (init, validate)                                │
│  2. memory_plan (update) - add steps                             │
│  3. memory_plan (set_goals) - define success criteria            │
│  4. memory_agent (handoff → Coordinator, recommend Executor)     │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTOR                                      │
│  1. memory_agent (init, validate)                                │
│  2. For each step:                                               │
│     - memory_steps (update status: active)                       │
│     - Implement the code                                         │
│     - memory_steps (update status: done)                         │
│  3. memory_context (store execution_log)                         │
│  4. memory_agent (handoff → Coordinator, recommend Tester)       │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TESTER                                        │
│  1. memory_agent (init, validate)                                │
│  2. memory_steps (update) - mark test steps active/done          │
│  3. memory_agent (handoff → Coordinator, recommend Reviewer)     │
│  4. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REVIEWER                                      │
│  1. memory_agent (init, validate)                                │
│  2. Check goals/success_criteria from memory_plan (get)          │
│  3. memory_plan (add_note) - document review findings            │
│  4. memory_agent (handoff → Coordinator, recommend Archivist)    │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHIVIST                                     │
│  1. memory_agent (init, validate)                                │
│  2. memory_plan (archive)                                        │
│  3. memory_workspace (reindex)                                   │
│  4. memory_agent (handoff → Coordinator)                         │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                   │
│  All steps complete. Report success to user.                     │
└─────────────────────────────────────────────────────────────────┘
```

### Common Pattern: Executor Blocked → Revisionist

```json
// Executor encounters error
{
  "action": "update",
  "step_index": 5,
  "status": "blocked",
  "notes": "Build fails: Cannot find module 'jsonwebtoken'"
}

// Executor hands off
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Step 5 blocked - missing dependency",
  "data": {
    "recommendation": "Revisionist",
    "blockers": ["Missing jsonwebtoken package"]
  }
}

// Coordinator spawns Revisionist
// Revisionist fixes the issue:
{
  "action": "insert",
  "at_index": 5,
  "step": {
    "phase": "Fix",
    "task": "Install missing jsonwebtoken dependency",
    "type": "fix",
    "assignee": "Revisionist"
  }
}

// Revisionist marks fix done, unblocks original step
{
  "action": "batch_update",
  "updates": [
    { "index": 5, "status": "done", "notes": "Installed jsonwebtoken@9.0.0" },
    { "index": 6, "status": "pending" }  // Unblock the original step
  ]
}
```

---

## Best Practices

### 1. Always Initialize and Validate

```json
// ALWAYS do this first
{ "action": "init", "agent_type": "Executor", ... }
{ "action": "validate", "agent_type": "Executor", ... }
```

### 2. Update Steps Atomically

Mark a step `active` before starting, `done` or `blocked` when finished.

```json
// Before starting work
{ "action": "update", "step_index": 3, "status": "active" }

// After completing
{ "action": "update", "step_index": 3, "status": "done", "notes": "Completed successfully" }
```

### 3. Handoff Through Coordinator

Subagents should ALWAYS hand off to Coordinator with a recommendation:

```json
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",  // Not directly to Reviewer!
  "reason": "Phase complete",
  "data": { "recommendation": "Reviewer" }
}
```

### 4. Use Goals and Success Criteria

Architect should always set goals:

```json
{
  "action": "set_goals",
  "goals": ["Implement feature X", "Add tests", "Document API"],
  "success_criteria": ["All tests pass", "No regressions", "API docs updated"]
}
```

Reviewer should check them:

```json
// Get plan to see goals
{ "action": "get", "workspace_id": "...", "plan_id": "..." }
// Response includes goals and success_criteria
```

### 5. Generate Instructions for Complex Handoffs

Coordinator should generate instruction files for subagents:

```json
{
  "action": "generate_instructions",
  "target_agent": "Executor",
  "mission": "Implement login/logout endpoints",
  "context": ["Express.js API", "PostgreSQL with Prisma"],
  "files_to_read": ["src/server.ts", "prisma/schema.prisma"]
}
```

### 6. Document Your Work

Store execution logs and research:

```json
// Executor logs work
{
  "action": "store",
  "type": "execution_log",
  "data": { "files_created": [...], "commands_run": [...] }
}

// Researcher documents findings
{
  "action": "append_research",
  "filename": "codebase-analysis.md",
  "content": "## Findings\n\n..."
}
```

---

## Anti-Patterns to Avoid

### ❌ Don't Skip Initialization

```json
// BAD - Starting work without init
{ "action": "update", "step_index": 0, "status": "active" }

// GOOD - Always init first
{ "action": "init", "agent_type": "Executor", ... }
{ "action": "validate", "agent_type": "Executor", ... }
{ "action": "update", "step_index": 0, "status": "active" }
```

### ❌ Don't Handoff Directly Between Subagents

```json
// BAD - Direct handoff between subagents
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Tester"  // ❌ Wrong!
}

// GOOD - Always go through Coordinator
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "data": { "recommendation": "Tester" }
}
```

### ❌ Don't Forget to Complete Sessions

```json
// BAD - Handoff without complete
{ "action": "handoff", ... }
// Session ends without complete

// GOOD - Always complete after handoff
{ "action": "handoff", ... }
{ "action": "complete", "summary": "Finished Phase 2", ... }
```

### ❌ Don't Modify Steps Without Updating Status

```json
// BAD - Just making changes without tracking
// (Agent modifies files but doesn't update step status)

// GOOD - Always update step status
{ "action": "update", "step_index": 3, "status": "active" }
// ... do the work ...
{ "action": "update", "step_index": 3, "status": "done", "notes": "Implemented feature" }
```

### ❌ Don't Create Plans Without Goals

```json
// BAD - Plan without goals
{
  "action": "create",
  "title": "Add feature",
  "description": "Add new feature",
  "category": "feature"
  // No goals or success_criteria!
}

// GOOD - Include goals
{
  "action": "create",
  "title": "Add feature",
  "description": "Add new feature",
  "category": "feature",
  "goals": ["Users can do X", "System handles Y"],
  "success_criteria": ["Tests pass", "No performance regression"]
}
```

---

## Tips by Agent Role

### Coordinator

- **First action:** Register workspace if new, or get workspace info
- **Create plans with goals:** Always include goals and success_criteria
- **Generate instructions:** Use `generate_instructions` before complex handoffs
- **Track progress:** Check plan state after each subagent completes
- **Handle blockers:** Route to Revisionist when subagents report issues

### Researcher

- **Document everything:** Use `append_research` liberally
- **Structure findings:** Use markdown with headers and lists
- **Note dependencies:** Identify and document external dependencies
- **Be thorough:** Read all relevant files before concluding

### Architect

- **Design before steps:** Think through the solution before adding steps
- **Set goals early:** Use `set_goals` after creating the plan structure
- **Assign appropriately:** Match step complexity to agent capabilities
- **Phase logically:** Group related steps into phases

### Executor

- **One step at a time:** Complete each step fully before moving on
- **Update frequently:** Mark steps active when starting, done when complete
- **Document blockers:** Use detailed notes when marking steps blocked
- **Log your work:** Store execution logs for future reference

### Builder

- **Register scripts:** Add reusable build scripts early
- **Test commands:** Verify scripts work before marking steps done
- **Clean up:** Delete obsolete scripts when work is complete

### Tester

- **Cover edge cases:** Don't just test happy paths
- **Document failures:** Provide detailed notes when tests fail
- **Verify fixes:** Re-run tests after Revisionist fixes issues

### Reviewer

- **Check goals:** Compare work against defined success criteria
- **Be constructive:** Note issues clearly with suggested fixes
- **Approve or block:** Make clear decisions, don't leave things ambiguous

### Revisionist

- **Understand first:** Read the blocked step notes carefully
- **Fix minimally:** Make targeted fixes, don't over-engineer
- **Verify fix:** Ensure the original step can now proceed

### Archivist

- **Document completely:** Capture all relevant information before archiving
- **Reindex workspace:** Update the codebase profile after major changes
- **Preserve history:** Don't delete context or research prematurely

### Analyst

- **Focus on understanding:** Analyze before recommending action
- **Use research notes:** Document analysis in research files
- **Be specific:** Provide concrete recommendations, not vague suggestions

### Brainstorm

- **Generate options:** Provide multiple approaches, not just one
- **Consider tradeoffs:** Document pros and cons of each option
- **Be creative:** Don't limit yourself to obvious solutions

---

## Appendix: Type Reference

### StepStatus

```typescript
type StepStatus = 'pending' | 'active' | 'done' | 'blocked';
```

### StepType

```typescript
type StepType = 
  | 'standard' 
  | 'analysis' 
  | 'validation' 
  | 'user_validation' 
  | 'complex' 
  | 'critical' 
  | 'build' 
  | 'fix' 
  | 'refactor' 
  | 'confirmation'
  | 'research'
  | 'planning'
  | 'code'
  | 'test'
  | 'documentation';
```

### RequestCategory

```typescript
type RequestCategory = 
  | 'feature' 
  | 'bug' 
  | 'change' 
  | 'analysis' 
  | 'debug' 
  | 'refactor' 
  | 'documentation';
```

### AgentType

```typescript
type AgentType = 
  | 'Coordinator' 
  | 'Researcher' 
  | 'Architect' 
  | 'Executor' 
  | 'Builder'
  | 'Reviewer' 
  | 'Tester' 
  | 'Revisionist' 
  | 'Archivist'
  | 'Analyst'
  | 'Brainstorm';
```

### Priority

```typescript
type Priority = 'low' | 'medium' | 'high' | 'critical';
```

---

*This document is the definitive reference for the Project Memory MCP system. Keep it updated as new features are added.*
