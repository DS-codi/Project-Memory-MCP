# Guide: Using Project Memory MCP with CLI Agents

This document provides a standardized protocol for AI agents (Gemini CLI, Copilot CLI, Claude CLI) to interact with the Project Memory MCP server in a CLI-optimized environment.

## 1. Connection Details
- **CLI MCP Server Port**: `3466`
- **Transport**: Streamable HTTP
- **Shared Database**: All changes are reflected in the Supervisor GUI and main MCP server.

## 2. Available Tools (CLI Optimized)
Agents should prefer the following tools, prefixed by the server name (usually `mcp_project-memory_`):

| Tool | Action | Description |
| :--- | :--- | :--- |
| `memory_task` | `get_current` | **Primary Entry Point.** Returns the current active/pending step, goals, and success criteria. Automatically marks pending steps as `active`. |
| `memory_task` | `log_work` | Appends research findings and progress to the plan's research notes. Use frequently. |
| `memory_task` | `mark_done` | Marks the specified step as complete and returns the next pending step. |
| `memory_task` | `mark_blocked` | Marks a step as blocked with a reason. Use when stuck. |
| `memory_workspace` | `list` / `register` | Manage workspace roots. |
| `memory_plan` | `list` / `get` | View all plans or detailed state for a specific plan. |

## 3. Standard Operational Protocol
To ensure state consistency and context efficiency, agents MUST follow this loop:

1.  **Initialize Context**: Call `memory_task(action: "get_current", workspace_id: "...")` at the start of every session.
2.  **Execute & Document**: As work is performed, call `memory_task(action: "log_work", findings: "...")` to persist findings. This prevents loss of progress if the session is interrupted.
3.  **Validate & Close**: After verifying the change, call `memory_task(action: "mark_done", notes: "...")`.
4.  **No `memory_agent(init)`**: This action is for the main server only. Use `get_current` instead.

## 4. Best Practices
- **Workspace ID**: Always provide the `workspace_id` to every tool call.
- **Context Efficiency**: `memory_task` returns slimmed-down objects to save tokens. Avoid reading full workspace dumps.
- **Verification**: Never mark a task as done until you have empirically verified the result (e.g., via tests or shell commands).
