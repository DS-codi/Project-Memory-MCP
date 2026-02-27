---
applyTo: "**/*"
---

# Project Memory MCP Usage Guidelines (v2.0)

This workspace uses the **Project Memory MCP** for tracking work across agent sessions.

## Consolidated Tools (v2.0)

The MCP server provides 5 unified tools with action parameters, plus 2 extension-side tools:

| Tool | Actions |
|------|--------|
| `memory_workspace` | `register`, `info`, `list`, `reindex`, `merge`, `scan_ghosts`, `migrate` |
| `memory_plan` | `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `add_note`, `delete`, `consolidate`, `set_goals`, `add_build_script`, `list_build_scripts`, `run_build_script`, `delete_build_script`, `create_from_template`, `list_templates`, `confirm` |
| `memory_steps` | `add`, `update`, `batch_update`, `insert`, `delete`, `reorder`, `move`, `sort`, `set_order`, `replace` |
| `memory_agent` | `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions`, `deploy`, `get_briefing`, `get_lineage` |
| `memory_context` | `get`, `store`, `store_initial`, `list`, `append_research`, `list_research`, `generate_instructions`, `workspace_get`, `workspace_set`, `workspace_update`, `workspace_delete` |
| `memory_terminal` | `run`, `read_output`, `kill`, `get_allowlist`, `update_allowlist` |
| `memory_filesystem` | `read`, `write`, `search`, `list`, `tree`, `delete`, `move`, `copy`, `append`, `exists` |
| `memory_terminal_interactive` | `execute`, `read_output`, `terminate`, `list` *(canonical MCP contract; legacy aliases accepted with compatibility metadata)* |
| `memory_terminal_vscode` | `create`, `send`, `close`, `list` *(extension-side, visible VS Code terminals)* |
| `memory_spawn_agent` | Context-prep only *(extension-side, returns `prep_config` for native `runSubagent`)* |

**Build script paths:** `list_build_scripts` includes `directory_path` and `command_path` when available so builders can run scripts directly in the terminal.

## Required Initialization

Before doing any work, agents MUST:

1. **Call `memory_agent` (action: init)** with your agent type and plan context
2. **Call `memory_agent` (action: validate)** for your agent type
3. **Set up your todo list** from the validation response

If your workflow supports it, you may use `memory_agent` with `validation_mode: "init+validate"` to combine steps 1-2.

## Tool Usage Patterns

### Creating Plans
```
memory_plan (action: create) with
  workspace_id: "...",
  title: "Feature: ...",
  description: "...",
  category: "feature|bug|change|refactor|documentation",
  priority: "low|medium|high|critical"
```

### Plan Templates
Use templates when the user wants a standard plan structure.

```
memory_plan (action: list_templates)
```

```
memory_plan (action: create_from_template) with
  workspace_id: "...",
  title: "...",
  description: "...",
  template: "feature|bugfix|refactor|documentation|analysis|investigation",
  category: "feature|bug|change|analysis|debug|refactor|documentation",
  priority: "low|medium|high|critical"
```

### Updating Step Progress
```
memory_steps (action: update) with
  workspace_id: "...",
  plan_id: "...",
  step_index: 0,
  status: "pending|active|done|blocked"
```

### Confirmation Gate (Phase/Step)
Some plans require user confirmation before completing a phase or step. When the plan state indicates confirmation is needed, ask the user for approval and then call:

```
memory_plan (action: confirm) with
  workspace_id: "...",
  plan_id: "...",
  confirmation_scope: "phase|step",
  confirm_phase: "Phase Name",         # when scope = phase
  confirm_step_index: 12,               # when scope = step
  confirmed_by: "user"
```

### Step Ordering Rules
- **Step indices in the MCP API are 0-based.** The dashboard displays them as 1-based (Step #1 = index 0). When referencing steps to users, use the 1-based display number. MCP tool responses include a `display_number` field on each step for this purpose.
- Insert new steps with `memory_steps` (action: insert) using `at_index` to keep a sequential order.
- Use `move` or `reorder` when changing order; do not manually edit indices or skip numbers.
- If a new step belongs earlier in the plan, insert it instead of appending it.
- Reindexing is required if indices are non-sequential or duplicated, or after multiple inserts/deletes.
  - Use `set_order` with the full desired index order, or `sort` if phase ordering is acceptable.
- Avoid marking steps done out of order unless you explicitly document why.

### Recording Handoffs
```
memory_agent (action: handoff) with
  workspace_id: "...",
  plan_id: "...",
  from_agent: "Executor",
  to_agent: "Coordinator",
  reason: "Implementation complete; recommend Reviewer"
```

### Workspace vs Plan Context
- Use plan context (`memory_context` `get`/`store`) for plan-scoped work: research, architecture, reviews, and step execution logs.
- Use workspace context (`memory_context` `workspace_get`/`workspace_update`) for shared notes that span plans, workspace-wide preferences, or audit/update logs.

Example (workspace-scoped update):
```
memory_context (action: workspace_update) with
  workspace_id: "...",
  data: {
    "notes": ["Workspace-wide context updated"]
  }
```

### Completing Agent Sessions
```
memory_agent (action: complete) with
  workspace_id: "...",
  plan_id: "...",
  agent_type: "Executor",
  summary: "Completed all steps..."
```

## Workspace Identity Rules

- **Always obtain `workspace_id` from the `memory_workspace` (action: register) response** — never compute or derive it yourself.
- If you receive a `workspace_id` from a handoff, validate it by calling `memory_workspace` (action: info) before using it.
- The `.projectmemory/identity.json` file in the workspace root is the canonical source of workspace identity. Do not modify it manually.
- Workspace IDs follow the format `{foldername}-{12-hex-sha256}`. Do not construct IDs by hand.
- If a tool returns a "workspace not registered" error, call `memory_workspace` (action: register) with the workspace path first.
- Legacy workspace IDs are transparently redirected to canonical IDs — if you see a redirect note in a response, update your stored `workspace_id`.
- Use `memory_workspace` (action: scan_ghosts) to detect unregistered data-root directories.
- Use `memory_workspace` (action: merge) with `dry_run: true` to preview merges before executing them.

## Terminal Authorization Model (`memory_terminal`)

`memory_terminal` is a **server-side, headless** terminal that runs commands inside the MCP server process (or container). It enforces a strict authorization model:

| Authorization | Meaning | Agent Action |
|---------------|---------|--------------|
| `allowed` | Command matches the auto-approve allowlist | Executes immediately |
| `blocked` | Destructive command (rm, del, format, etc.) | Rejected entirely |

> **Note:** Since server terminal hardening, only allowlisted commands execute. Non-allowlisted commands are blocked (not queued for approval).

### Common Patterns
```
memory_terminal (action: run) with
  command: "npm",
  args: ["run", "build"],
  cwd: "./server",
  workspace_id: "..."
```

```
memory_terminal (action: get_allowlist) with
  workspace_id: "..."
```

```
memory_terminal (action: update_allowlist) with
  patterns: ["npm *", "npx vitest *"],
  operation: "add",
  workspace_id: "..."
```

## Interactive Terminal (`memory_terminal_interactive`)

`memory_terminal_interactive` is the **canonical MCP interactive/headless terminal contract** used across server, extension, dashboard, and chat-button callers. It is not the VS Code terminal-management surface.

Canonical actions:

- **`execute`** — run command or open interactive session (based on `invocation.intent`)
- **`read_output`** — read buffered output for `target.session_id` / `target.terminal_id`
- **`terminate`** — terminate by `target.session_id` / `target.terminal_id`
- **`list`** — list active terminal/session identities

Canonical request fields:

- `action`, `invocation`, `correlation`, `runtime`
- Optional: `execution`, `target`, `compat`

Legacy compatibility/deprecation behavior:

- Accepted aliases: `run`, `kill`, `send`, `close`, `create`, `list`
- Alias calls are normalized to canonical actions and reflected in `resolved.alias_applied` and `resolved.legacy_action`
- Callers should migrate to canonical actions; aliases are compatibility-only and may be rejected in strict/deprecation phases

Runtime adapter mode resolution (deterministic):

1. `runtime.adapter_override`
2. `PM_TERM_ADAPTER_MODE`
3. `PM_RUNNING_IN_CONTAINER=true` => `container_bridge`
4. Default `local`

Container bridge preflight expectations:

- Host alias resolution uses `PM_INTERACTIVE_TERMINAL_HOST_ALIAS` then fallback alias
- TCP connectivity probe uses `PM_INTERACTIVE_TERMINAL_HOST_PORT` and `PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS`
- Invalid bridge env returns `PM_TERM_INVALID_MODE`; unreachable bridge returns `PM_TERM_GUI_UNAVAILABLE`

### Key Differences

| Feature | `memory_terminal` | `memory_terminal_interactive` |
|---------|-------------------|-------------------------------|
| Runs where | Server/container (headless) | Canonical MCP contract (server-side orchestration; mode-aware interactive/headless behavior) |
| Authorization | Allowlist-only (strict) | Destructive blocked; non-destructive allowed (warnings when applicable) |
| Output capture | Buffered via `read_output` | Structured canonical response with `result` + deterministic error/fallback payloads |
| Use case | Automated build/test in CI-like environment | Unified command lifecycle for MCP callers across surfaces |

### Canonical Request Shape

```json
{
  "action": "execute",
  "invocation": { "mode": "interactive", "intent": "execute_command" },
  "correlation": { "request_id": "req_...", "trace_id": "trace_..." },
  "runtime": { "workspace_id": "...", "cwd": "...", "timeout_ms": 30000, "adapter_override": "auto" },
  "execution": { "command": "npm", "args": ["run", "build"] },
  "compat": { "caller_surface": "extension" }
}
```

### Common Patterns
```
memory_terminal_interactive (action: execute) with
  invocation: { mode: "interactive", intent: "execute_command" },
  runtime: { workspace_id: "...", cwd: "./server", adapter_override: "auto" },
  execution: { command: "npm", args: ["run", "build"] }
```

```
memory_terminal_interactive (action: read_output) with
  target: { session_id: "sess_..." }
```

```
memory_terminal_interactive (action: terminate) with
  target: { session_id: "sess_..." }
```

## VS Code Terminal Management (`memory_terminal_vscode`)

`memory_terminal_vscode` is the extension-side visible terminal API. Use it when a workflow explicitly requires opening/managing real VS Code integrated terminals.

Actions:

- **`create`** — open terminal
- **`send`** — send command to tracked terminal
- **`close`** — close tracked terminal
- **`list`** — list tracked terminals

## Canonical Terminal Surface Selection

Use this matrix as the single source of truth when choosing a terminal surface.

| Surface | Choose when | Do not choose when | Execution environment | Approval/authorization model |
|---------|-------------|--------------------|-----------------------|------------------------------|
| `memory_terminal` | You need deterministic, automated, non-interactive command execution for build/lint/test style tasks | You need visible user-facing terminal interaction or host-only tooling | MCP server/container (headless) | Strict allowlist only; destructive commands blocked |
| `memory_terminal_interactive` | You need canonical MCP interactive/headless command lifecycle with deterministic schema/error/fallback behavior | You only need direct VS Code terminal create/send/close/list UX | MCP server/container orchestration with runtime adapter selection (`local`, `bundled`, `container_bridge`) | Destructive commands blocked; non-destructive commands allowed with warnings when applicable |
| `memory_terminal_vscode` | You need visible VS Code terminal lifecycle management on host | You need container/server-side deterministic MCP orchestration | User's VS Code host terminal (visible) | Destructive commands blocked; other commands allowed with warning/visibility |
| Rust+QML Interactive Terminal gateway path | Workspace flows require GUI-mediated approval/queueing/event-driven terminal orchestration through the Rust+QML app (where this integration exists) | You only need direct MCP terminal execution with no GUI mediation | Rust+QML app + bridge layer, then routed to the selected terminal surface | Gateway-level approval and routing policy, plus downstream terminal contract |

### Gateway Routing Rule (Rust+QML)

When the Rust+QML Interactive Terminal gateway is in play, treat it as an orchestration and approval layer, not a replacement terminal API. After gateway approval/routing, execute via:
- `memory_terminal` for strict allowlisted headless server/container jobs
- `memory_terminal_interactive` for canonical MCP interactive/headless lifecycle calls
- `memory_terminal_vscode` for visible host-terminal lifecycle management

## Contract-Collision Warnings

- **Do not mix terminal contracts in one flow.** `memory_terminal`, `memory_terminal_interactive`, and `memory_terminal_vscode` have different action semantics and runtime assumptions.
- **Do not cross-copy action payloads between tools.** Keep parameters aligned to the selected surface contract for the current runtime.
- **Do not treat the Rust+QML gateway as a third terminal executor.** It selects/routes; execution still happens on one terminal surface.
- **If docs or prompts conflict, this section is canonical for surface selection.** Escalate unresolved contract ambiguity to Coordinator/Reviewer before execution.

## Filesystem Safety Boundaries (`memory_filesystem`)

`memory_filesystem` provides workspace-scoped file operations with built-in safety:

- **All paths are workspace-scoped** — relative to the registered workspace root
- **Path traversal blocked** — `../` and absolute paths outside the workspace are rejected
- **Sensitive files blocked** — `.env`, private keys, credentials files are inaccessible
- **Destructive ops explicit** — `delete` requires `confirm: true`; `delete`/`move` support `dry_run` previews
- **Symlink policy enforced** — symlink traversal is allowed only when final resolution stays inside workspace root
- **Guardrails applied** — write/append payload limits and list/search/tree result limits prevent runaway operations
- **1 MB read cap** — large files are truncated to prevent context overflow

### Common Patterns
```
memory_filesystem (action: read) with
  workspace_id: "...",
  path: "src/index.ts"
```

```
memory_filesystem (action: write) with
  workspace_id: "...",
  path: "src/new-module.ts",
  content: "...",
  create_dirs: true
```

```
memory_filesystem (action: search) with
  workspace_id: "...",
  pattern: "**/*.test.ts"
```

```
memory_filesystem (action: tree) with
  workspace_id: "...",
  path: "src",
  max_depth: 3
```

## Filesystem Safety Model

- **Destructive-op policy**
  - Use `confirm: true` for `delete`; treat missing confirm as a hard error.
  - Prefer `dry_run: true` first for `delete`/`move` when impact is uncertain.
  - Expect structured audit metadata for destructive operation outcomes.

- **Symlink policy**
  - Symlinks are permitted only when every resolved target remains under workspace root.
  - Symlink escapes and broken-link unsafe paths are denied.

- **Guardrails**
  - `write`/`append` enforce payload-size limits.
  - `search`/`list`/`tree` enforce result-count limits and report truncation/limit metadata.

- **Tool selection (`memory_filesystem` vs `memory_terminal`)**
  - Use `memory_filesystem` for deterministic workspace file CRUD/search/tree operations with built-in boundary checks.
  - Use `memory_terminal` for command execution workflows (build/test/lint), not direct file mutation APIs.
  - Avoid emulating file operations through shell commands when `memory_filesystem` already provides the action.
## Spawn Context Preparation (`memory_spawn_agent`)

`memory_spawn_agent` is an **extension-side, context-prep-only** tool. It does NOT execute subagent launches.

Hub agents (Coordinator, Analyst, Runner, TDDDriver) call it before `runSubagent` to:
1. Enrich the prompt with workspace/plan context
2. Inject scope boundaries and anti-spawning instructions for spoke targets
3. Add git stability guardrails

```
memory_spawn_agent with
  agent_name: "Executor",
  prompt: "Implement feature X...",
  workspace_id: "...",
  plan_id: "...",
  compat_mode: "strict",
  prep_config: {
    scope_boundaries: {
      files_allowed: ["src/feature.ts"],
      directories_allowed: ["src/"]
    }
  }
```

Then launch the agent natively:
```
runSubagent({
  agentName: prepResult.prep_config.agent_name,
  prompt: prepResult.prep_config.enriched_prompt
})
```

**Key rules:**
- `execution.spawn_executed` is always `false` — the tool never launches agents
- `compat_mode: "strict"` returns only `prep_config`; `"legacy"` also includes deprecated `spawn_config` alias
- Spoke agents MUST NOT call `memory_spawn_agent` — use `memory_agent(action: handoff)` instead

> **Migration note:** If you have code or documentation referencing `memory_spawn_agent` as an execution tool, update it to the prep-only flow: call `memory_spawn_agent` for context, then `runSubagent` natively.

## Hub-and-Spoke Model

- **Coordinator** is the hub - it spawns all other agents
- Other agents are **spokes** - they complete tasks and return to Coordinator
- Use `memory_agent` (action: handoff) to **recommend** the next agent (Coordinator decides)
- Always call `memory_agent` (action: complete) when done
