---
applyTo: "**/*"
---

# memory_agent — Tool Reference

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)

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
- Full plan state (if workspace_id and plan_id provided) — compact by default
- Workspace status
- Role boundaries (what this agent can/cannot do)
- Instruction files (if any exist in `.memory/instructions/`)
- `context_size_bytes` — total byte size of the response payload for monitoring context usage
- Matched skills (if `include_skills: true`)

**Context Optimization Parameters:**

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `compact` | boolean | `true` | Return compact plan state (≤3 sessions, ≤3 lineage, pending/active steps only) |
| `context_budget` | number | — | Byte budget for progressive payload trimming |
| `include_workspace_context` | boolean | `false` | Include workspace context summary |
| `include_skills` | boolean | — | Include matched skills for the current task |

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

**Skills Deployment:**
When `include_skills` is `true`, the deploy action also copies skills from the source skills directory into the workspace's `.github/skills/` folder. Skills are structured knowledge files (`SKILL.md`) containing domain-specific patterns, conventions, and best practices that agents can load on demand.

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

## Skill Discovery

These actions let agents enumerate and fetch skills directly via MCP, without relying solely on auto-injection at spawn time.

#### `list_skills`
List all skills in the database with metadata (no full content).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_skills"` |
| `skill_category` | string | ❌ | Filter results to a specific category |

**Returns:** Array of `{ name, category, description, tags, language_targets, framework_targets, updated_at }`.

**Example:**
```json
{
  "action": "list_skills",
  "skill_category": "react"
}
```

**Used by:** Hub (when building spawn prompts that enumerate relevant skills), any agent needing to discover available patterns.

---

#### `get_skill`
Get the full content of a specific skill by name.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_skill"` |
| `skill_name` | string | ✅ | The exact skill name |

**Returns:** `{ name, category, description, tags, language_targets, framework_targets, content, updated_at }`.

**Example:**
```json
{
  "action": "get_skill",
  "skill_name": "react-components"
}
```

**Used by:** Any agent that needs to read the full instructions in a domain-specific skill.

---

#### `assign_skill`
Assign a skill to a specific workspace. Skill will be included in agent context for that workspace regardless of auto-injection pattern matching.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"assign_skill"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `skill_name` | string | ✅ | The skill name to assign |
| `notes` | string | ❌ | Optional notes explaining the assignment |

**Used by:** Hub, Coordinator.

---

#### `unassign_skill`
Remove a skill assignment from a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"unassign_skill"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `skill_name` | string | ✅ | The skill name to remove |

**Used by:** Hub, Coordinator, Archivist.

---

#### `list_workspace_skills`
List all skills explicitly assigned to a workspace, with full content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_workspace_skills"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Returns:** Array of `{ name, category, description, tags, language_targets, framework_targets, assignment_notes, content }`.

**Used by:** Hub (when composing spawn prompts), any agent needing workspace-specific skill context.

---

## Instruction Discovery

These actions let agents list, read, and manage workspace-specific instruction assignments.

#### `list_instructions`
List all instruction files in the database (global listing, no content).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_instructions"` |

**Returns:** Array of `{ filename, applies_to, updated_at }`.

**Used by:** Hub, PromptAnalyst.

---

#### `get_instruction`
Get the full content of a specific instruction file by filename.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_instruction"` |
| `instruction_filename` | string | ✅ | The instruction filename (e.g. `"build-scripts.instructions.md"`) |

**Returns:** `{ filename, applies_to, content, updated_at }`.

**Used by:** Any agent that needs to read a specific instruction on demand.

---

#### `assign_instruction`
Assign an instruction file to a specific workspace. The instruction will be included in agent context for that workspace in addition to glob-matched instructions.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"assign_instruction"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `instruction_filename` | string | ✅ | The instruction filename to assign |
| `notes` | string | ❌ | Optional notes explaining why this instruction applies |

**Used by:** Hub, Coordinator, Architect.

---

#### `unassign_instruction`
Remove an instruction assignment from a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"unassign_instruction"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `instruction_filename` | string | ✅ | The instruction filename to remove |

**Used by:** Hub, Coordinator, Archivist.

---

#### `list_workspace_instructions`
List all instructions explicitly assigned to a workspace, with full content.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"list_workspace_instructions"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Returns:** Array of `{ filename, applies_to, assignment_notes, content }`.

**Used by:** Hub, Shell agents that need to self-load workspace-specific instructions on init.
