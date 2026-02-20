````instructions
---
applyTo: "**/*"
---

# memory_context — Tool Reference

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)

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

#### `workspace_get`
Retrieve workspace-scoped context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"workspace_get"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Used by:** Coordinator, Architect, Reviewer.

---

#### `workspace_set`
Replace workspace-scoped context with a new payload.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"workspace_set"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `data` | object | ✅ | Replacement workspace context |

**Used by:** Coordinator (for resets/migrations).

---

#### `workspace_update`
Merge updates into workspace-scoped context.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"workspace_update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `data` | object | ✅ | Partial updates to merge |

**Example:**
```json
{
  "action": "workspace_update",
  "workspace_id": "my-project-652c624f8f59",
  "data": {
    "notes": ["Shared decision log updated"],
    "tags": ["frontend", "react"]
  }
}
```

**Used by:** Coordinator, Architect, Reviewer.

---

#### `workspace_delete`
Delete workspace-scoped context (use sparingly).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"workspace_delete"` |
| `workspace_id` | string | ✅ | The workspace ID |

**Used by:** Coordinator (for cleanup or migrations).

---

#### `knowledge_store`
Store a workspace-scoped knowledge file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"knowledge_store"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `slug` | string | ✅ | URL-safe identifier for the knowledge file |
| `title` | string | ✅ | Human-readable title |
| `data` | object | ✅ | The knowledge content |
| `category` | string | ❌ | Category for organization |
| `tags` | string[] | ❌ | Tags for discovery |
| `created_by_agent` | string | ❌ | Agent that created this knowledge |
| `created_by_plan` | string | ❌ | Plan that created this knowledge |

**Used by:** Any agent storing long-lived workspace knowledge.

---

#### `knowledge_get`
Retrieve a knowledge file by slug.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"knowledge_get"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `slug` | string | ✅ | The knowledge file slug |

**Used by:** Any agent needing workspace knowledge.

---

#### `knowledge_list`
List all knowledge files for a workspace.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"knowledge_list"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `category` | string | ❌ | Filter by category |

**Returns:** Array of knowledge file metadata (slug, title, category, tags, timestamps).

**Used by:** Any agent discovering available knowledge.

---

#### `knowledge_delete`
Delete a knowledge file.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"knowledge_delete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `slug` | string | ✅ | The knowledge file slug |

**Used by:** Coordinator, Archivist.

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

#### `batch_store`
Store multiple context items at once.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"batch_store"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `items` | object[] | ✅ | Array of `{ type, data }` objects |

**Used by:** Any agent storing multiple context items efficiently.

````
