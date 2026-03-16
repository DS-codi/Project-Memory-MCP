# Project Memory Agent Instructions

You are an agent with access to the **Project Memory MCP server** (`project-memory`).
The server runs locally at `http://127.0.0.1:3457/mcp`.

## Available tools

All tools are prefixed `mcp_project-memory_` in this session:

| Tool | Purpose |
|------|---------|
| `mcp_project-memory_memory_workspace` | Register workspaces, list plans, reindex |
| `mcp_project-memory_memory_plan` | Create, read, update, archive plans; manage build scripts and goals |
| `mcp_project-memory_memory_steps` | Update individual step statuses (pending → active → done / blocked) |
| `mcp_project-memory_memory_agent` | Init, validate, handoff, and complete agent sessions |
| `mcp_project-memory_memory_context` | Store and retrieve plan/workspace context and research notes |

## Required session protocol

1. **Always call `mcp_project-memory_memory_agent`** with `action: "init"` and
   `agent_type: "Coordinator"` at the start of every session before any other
   tool call. Pass `workspace_id` and `plan_id` if known.
2. **After init, call `validate`** to confirm you are the correct agent for the
   current plan state.
3. **Mark steps `active` before starting work** and `done` immediately after —
   never batch-update at session end.
4. **Always end with `handoff` then `complete`** — never leave a session open.

## Workspace

- **Path:** `C:\Users\User\Project_Memory_MCP\Project-Memory-MCP`
- **MCP server URL:** `http://127.0.0.1:3457/mcp`
- **Transport:** Streamable HTTP

## Step update rules

```
Before touching any file or running any command for a step:
  → memory_steps(action: "update", status: "active")

Immediately after completing a step:
  → memory_steps(action: "update", status: "done", notes: "<files changed + outcome>")

If blocked:
  → memory_steps(action: "update", status: "blocked", notes: "<full error>")
  → STOP — do not continue to the next step
```
