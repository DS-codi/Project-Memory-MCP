---
applyTo: "**/*"
---

# memory_plan — Tool Reference

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)

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

**Used by:** Archivist (after successful completion), Coordinator.

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

**Used by:** Coordinator, Architect.

#### `find`
Find a plan by ID across all workspaces.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"find"` |
| `plan_id` | string | ✅ | The plan ID to find |

**Returns:** Plan state and workspace information if found.

**Used by:** Any agent that knows the plan ID but not the workspace.

#### `add_note`
Add a note to a plan's notes array.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add_note"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `note` | string | ✅ | The note content |
| `note_type` | string | ❌ | One of: `info`, `warning`, `instruction` |

**Used by:** Coordinator, Reviewer, any agent needing to record important information.

#### `delete`
Permanently delete a plan. **Requires confirmation.**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `confirm` | boolean | ✅ | Must be `true` to confirm deletion |

**Used by:** Coordinator (for abandoned or duplicate plans).

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

**Used by:** Reviewer, Executor.

---

#### `list_build_scripts`
List all build scripts for a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_build_scripts"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ❌ | Filter to a specific plan |

**Returns:** Array of scripts with `id`, `name`, `description`, `command`, `directory`, `directory_path`, `command_path`.

**Used by:** Reviewer, Executor, Tester.

#### `run_build_script`
Resolve a registered build script and return its command and directory for terminal execution. The agent should then run the resolved command in the terminal using `run_in_terminal`.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"run_build_script"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `script_id` | string | ✅ | The script ID to resolve |

**Returns:** `{ command, directory_path, script_name }` — use these to run the script in a terminal.

**Used by:** Reviewer, Executor, Tester.

---

#### `delete_build_script`
Delete a build script. Params: `workspace_id`, `script_id`, optional `plan_id`.

**Used by:** Reviewer, Archivist.

#### `create_from_template`
Create a plan from a predefined template.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"create_from_template"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `title` | string | ✅ | Plan title |
| `description` | string | ❌ | Plan description |
| `template` | string | ✅ | One of: `feature`, `bugfix`, `refactor`, `documentation`, `analysis`, `investigation` |
| `category` | string | ✅ | Request category |
| `priority` | string | ❌ | Priority level |

**Used by:** Coordinator, Architect.

#### `list_templates`
List available plan templates. No parameters required beyond `action`.

**Used by:** Coordinator, Architect.

---

#### `confirm`
Confirm a phase or step when user approval is required.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"confirm"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `confirmation_scope` | string | ✅ | `"phase"` or `"step"` |
| `confirm_phase` | string | ❌ | Required when scope is `phase` |
| `confirm_step_index` | number | ❌ | Required when scope is `step` |
| `confirmed_by` | string | ❌ | Who confirmed (e.g. `"user"`) |

**Used by:** Coordinator.

---

#### `create_program`
Create an Integrated Program — a multi-plan container that groups related plans together.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"create_program"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `title` | string | ✅ | Program title |
| `description` | string | ✅ | Program description |
| `category` | string | ❌ | Category for the program |
| `priority` | string | ❌ | Priority level |

**Returns:** The created program as a PlanState with `is_program: true`.

**Used by:** Coordinator, Architect.

---

#### `add_plan_to_program`
Link an existing plan to a program as a child plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add_plan_to_program"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `program_id` | string | ✅ | The program's plan ID |
| `plan_id` | string | ✅ | The plan ID to add |

**Returns:** Updated program and plan state.

**Used by:** Coordinator.

---

#### `upgrade_to_program`
Upgrade an existing plan to a program. The original plan becomes the first child plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"upgrade_to_program"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID to upgrade |

**Notes:**
- Plans with 100+ steps automatically receive an auto-upgrade suggestion note.
- The original plan becomes a child plan within the new program.

**Used by:** Coordinator.

---

#### `list_program_plans`
List all child plans within a program.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_program_plans"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `program_id` | string | ✅ | The program's plan ID |

**Returns:** Array of child plan summaries with progress information.

**Used by:** Coordinator, Architect.
