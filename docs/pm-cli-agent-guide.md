# PM-CLI Agent Guide

Reference for AI agents connecting to the Project Memory CLI MCP server (`index-cli.ts`).

---

## What is the CLI MCP server?

A standalone HTTP MCP server purpose-built for CLI agents (Gemini CLI, Copilot CLI, Claude Code, etc.) running in interactive terminal sessions. It shares the same SQLite database as the VS Code MCP server but runs independently on its own port.

- **Transport**: HTTP Streamable (`POST /mcp`)
- **Health check**: `GET /health`
- **Default endpoint**: `http://127.0.0.1:3466/mcp`

---

## Starting the server

### Basic

```sh
node dist/index-cli.js
```

### With arguments

| Argument | Default | Description |
|---|---|---|
| `--port <n>` | `3466` | TCP port to listen on |
| `--host <addr>` | `127.0.0.1` | Bind address |

```sh
# Custom port
node dist/index-cli.js --port 4000

# Bind to all interfaces (container / remote access)
node dist/index-cli.js --host 0.0.0.0 --port 3466
```

### Environment variable fallbacks

| Variable | Overrides |
|---|---|
| `PM_CLI_MCP_PORT` | `--port` (CLI arg takes precedence) |
| `PM_CLI_MCP_HOST` | `--host` (CLI arg takes precedence) |

---

## Connecting as an agent

Configure your MCP client to point at the running server:

```json
{
  "mcpServers": {
    "project-memory-cli": {
      "url": "http://127.0.0.1:3466/mcp"
    }
  }
}
```

For Gemini CLI / other HTTP MCP clients, supply the endpoint URL directly in the session configuration.

---

## Available tools

The CLI server exposes the full consolidated tool surface plus one CLI-optimised composite tool.

### Core tools

| Tool | Purpose |
|---|---|
| `memory_workspace` | Register, list, inspect, and manage workspaces |
| `memory_plan` | Full plan lifecycle — create, update, archive, templates, programs |
| `memory_steps` | Step mutation, ordering, and status management |
| `memory_context` | Research notes, architecture, knowledge, prompts |
| `memory_agent` | Agent session init/complete/handoff, skills, instructions |
| `memory_terminal` | Execute terminal commands with GUI approval flow |
| `memory_session` | Session minting and deployment prep |
| `memory_brainstorm` | GUI form routing and Brainstorm refinement |
| `memory_cartographer` | Plan dependency graph and codebase architecture traversal |
| `memory_instructions` | Read and search instruction files |
| `memory_filesystem` | Workspace-scoped safe file operations |
| `memory_sprint` | Sprint lifecycle and goal management |

### CLI-optimised composite tool

| Tool | Purpose |
|---|---|
| `memory_task` | Replaces 4-5 round-trips for the get-step → work → mark-done loop |

`memory_task` is the recommended starting point for CLI agents on an active plan. It returns only what is needed and omits lineage/session history overhead.

---

## Recommended startup sequence for CLI agents

```
1. memory_workspace(action: register, workspace_path: "<abs-path>")
   → returns workspace_id

2. memory_agent(action: init, agent_type: "Coordinator", workspace_id: "...")
   → check orphaned_sessions; resolve any stuck active steps before continuing

3. memory_task(action: get_current, workspace_id: "...")
   → returns active or next pending step + goals + lookahead
```

After startup, use `memory_task` for the work loop. **Marking steps done is mandatory** — if you skip `mark_done` the step stays `active` forever and the plan shows no progress.

### Step work loop — required pattern

```
1. memory_task(action: "get_current", workspace_id: "...", plan_id: "...")
   → read: step.index, step.task, next_required_call

2. do the work described in step.task

3. memory_task(action: "mark_done", workspace_id: "...", plan_id: "...", step_index: <from step 1>)
   → confirms completion, returns next_step

4. repeat from step 1 until next_step is null (plan complete)
```

> **`next_required_call` field**: every `get_current` response includes a `next_required_call` string that tells you the exact tool call to make when the step is done. Use it as a checklist item — do not move on until you have made that call.

### Example

```
get_current response:
{
  "step": { "index": 2, "task": "Write unit tests", "status": "active" },
  "next_required_call": "memory_task(action: \"mark_done\", workspace_id: \"ws_abc\", plan_id: \"plan_xyz\", step_index: 2) — REQUIRED when step is complete"
}

→ write the tests
→ memory_task(action: "mark_done", workspace_id: "ws_abc", plan_id: "plan_xyz", step_index: 2)
→ get_current again for the next step
```

Switch to full `memory_steps` / `memory_plan` tools only when you need operations not covered by `memory_task` (e.g. creating steps, reordering, modifying step content).

---

## Agent type reference

The `agent_type` field accepted by `memory_agent` and `memory_session` maps to these canonical values:

| Canonical value | Role |
|---|---|
| `Coordinator` | Hub / orchestrator (also accepts `Hub` as alias — normalized internally) |
| `Analyst` | Investigation and routing (PromptAnalyst spoke) |
| `Researcher` | Information gathering |
| `Architect` | Design and architecture |
| `Executor` | Implementation |
| `Reviewer` | Code and artifact review |
| `Tester` | Test execution and validation |
| `Revisionist` | Targeted rework |
| `Archivist` | Completion and archiving |
| `Brainstorm` | Guided exploration and refinement |
| `Runner` | Ad-hoc task execution |
| `SkillWriter` | Skill authoring |
| `Worker` | Generic scoped work |
| `TDDDriver` | Test-driven development orchestration |
| `Cognition` | Reasoning and synthesis |
| `Migrator` | Data or schema migration |

---

## Step types

Used in `memory_steps` and `memory_plan` when creating or updating steps:

`standard` · `analysis` · `validation` · `user_validation` · `complex` · `critical` · `build` · `fix` · `refactor` · `confirmation` · `research` · `planning` · `code` · `test` · `documentation`

---

## Plan categories and priorities

**Categories**: `feature` · `bugfix` · `refactor` · `orchestration` · `program` · `quick_task` · `advisory`

**Priorities**: `low` · `medium` · `high` · `critical`

---

## Session instrumentation

All tools accept an optional `_session_id` field. Pass the session ID minted by `memory_session(action: prep)` to correlate tool calls with a specific agent session in logs and the dashboard.

---

## Terminal tool contract

`memory_terminal` enforces a **sequential rule**: wait for each `run` response before issuing the next `run` call. Concurrent calls to the same session are automatically rerouted to a new terminal tab and include a `rate_limit_note` in the response.

Allowlisted commands execute immediately. Destructive commands are blocked by default. Unknown commands trigger a GUI approval flow when the interactive terminal runtime is available.

---

## Key constraints for CLI agents

- **Never derive or register a workspace ID independently** if spawned as a spoke by a Hub agent — use the `workspace_id` passed in your prompt.
- **Check for orphaned sessions** on `init` before spawning subagents or modifying plan state.
- **Confirm destructive operations** via `confirm: true` — tools will reject unconfirmed destructive actions.
- **Use `memory_task` for step loops** — it is purpose-built for CLI latency and token budgets.
