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
| `memory_filesystem` | `read`, `write`, `search`, `list`, `tree` |
| `memory_terminal_interactive` | `create`, `send`, `close`, `list` *(extension-side, visible VS Code terminals)* |

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

`memory_terminal_interactive` is an **extension-side** tool that creates real, visible VS Code integrated terminals on the user's host machine. Unlike `memory_terminal`, the user can see and interact with these terminals directly.

### Key Differences

| Feature | `memory_terminal` | `memory_terminal_interactive` |
|---------|-------------------|-------------------------------|
| Runs where | Server/container (headless) | VS Code host (visible) |
| Authorization | Allowlist-only (strict) | Destructive blocked, others allowed with warning |
| Output capture | Buffered via `read_output` | User sees output directly in terminal |
| Use case | Automated build/test in CI-like environment | Interactive work, debugging, manual commands |

### Actions

- **`create`** — Open a new VS Code terminal. Optional: `name`, `cwd`, `env`. Returns `terminal_id`.
- **`send`** — Send a command to an open terminal. Requires `terminal_id`, `command`. Optional `workspace_id` for allowlist lookups. Destructive commands are always blocked.
- **`close`** — Close/dispose a terminal by `terminal_id`.
- **`list`** — List all tracked open terminals.

### Common Patterns
```
memory_terminal_interactive (action: create) with
  name: "Build Server",
  cwd: "./server"
```

```
memory_terminal_interactive (action: send) with
  terminal_id: "term_1_Build_Server",
  command: "npm run build",
  workspace_id: "..."
```

```
memory_terminal_interactive (action: list)
```

## Filesystem Safety Boundaries (`memory_filesystem`)

`memory_filesystem` provides workspace-scoped file operations with built-in safety:

- **All paths are workspace-scoped** — relative to the registered workspace root
- **Path traversal blocked** — `../` and absolute paths outside the workspace are rejected
- **Sensitive files blocked** — `.env`, private keys, credentials files are inaccessible
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

## Hub-and-Spoke Model

- **Coordinator** is the hub - it spawns all other agents
- Other agents are **spokes** - they complete tasks and return to Coordinator
- Use `memory_agent` (action: handoff) to **recommend** the next agent (Coordinator decides)
- Always call `memory_agent` (action: complete) when done
