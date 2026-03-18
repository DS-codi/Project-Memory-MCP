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

## Context window management

This is a large Rust + TypeScript monorepo. To avoid hitting the context
window limit:

- **Do NOT read the entire project tree** — read only the specific files
  relevant to the current task.
- **Avoid `@`-referencing directories** like `target/`, `node_modules/`,
  `.projectmemory/`, `backup/`, `archive/`, or `data/` — these are excluded
  via `.geminiignore` but explicit reads will still bloat context.
- **Always pass `compact: true` and `context_budget: 80000` on every
  `memory_agent(init)` call.** The server defaults to 80 KB when
  `context_budget` is omitted, but being explicit keeps payloads
  predictable across all surface areas.
- **Use `/compress` when the conversation history grows long.** Run it
  proactively before starting a large new task, not only when the warning
  appears.
- **Use `/clear` to start a fresh session** when switching to an unrelated
  task — accumulated history from previous tasks wastes tokens.
- When reading MCP tool responses, prefer targeted queries (a single plan or
  step) over full workspace dumps.
