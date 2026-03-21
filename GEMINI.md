# Project Memory Agent Instructions

You are an agent with access to the **Project Memory MCP server** (`project-memory`).
The CLI server runs locally at `http://127.0.0.1:3466/mcp`.

## Available tools (CLI Server)

All tools are prefixed `mcp_project-memory_` in this session:

| Tool | Purpose |
|------|---------|
| `mcp_project-memory_memory_task` | CLI-optimized composite tool for state management |
| `mcp_project-memory_memory_workspace` | Register and list workspaces |
| `mcp_project-memory_memory_plan` | List and get state for plans |
| `mcp_project-memory_memory_context` | Store and retrieve research notes |

## Required session protocol (CLI Agents)

1. **Get Current State**: Always start by calling `mcp_project-memory_memory_task(action: "get_current", workspace_id: "...")`. This is idempotent and will automatically mark the current pending step as `active`.
2. **Log Findings**: Use `mcp_project-memory_memory_task(action: "log_work", findings: "...")` frequently to persist your research and progress.
3. **Complete Step**: Once a task is done and verified, call `mcp_project-memory_memory_task(action: "mark_done", notes: "...")`. This will return the next pending step.
4. **Handle Blocks**: If you encounter a fatal error or need user input, call `mcp_project-memory_memory_task(action: "mark_blocked", reason: "...")` and stop.

## Context window management

- **Use `memory_task(action: "get_current")`** as it returns a slimmed-down representation of the plan to save context.
- **Do NOT use `memory_agent(action: "init")`** on the CLI server (port 3466) as it is not available.
- **Always provide `workspace_id`** to all tool calls.
