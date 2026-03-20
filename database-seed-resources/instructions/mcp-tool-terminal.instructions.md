---
applyTo: "**/*"
---

# memory_terminal — Tool Reference

Server-side headless terminal that runs commands inside the MCP server process (or container). Enforces a strict authorization model — only allowlisted commands execute automatically; destructive commands are blocked entirely.

## Authorization model

| Authorization | Meaning | Behaviour |
|---------------|---------|-----------|
| `allowed` | Command matches auto-approve allowlist | Executes immediately |
| `blocked` | Destructive command (rm, del, format, drop, etc.) | Rejected — not queued |
| Non-allowlisted | Command not on allowlist | Blocked (since server terminal hardening) |

## Sequential execution rule (hard rule)

> ⛔ You MUST wait for each `run` response before issuing the next `run` call.

- Every `run` acquires an **in-flight lock** on its target session.
- A second `run` targeting the same session while locked is **automatically redirected to a new terminal tab** with a `rate_limit_note` in the response.
- If you see `rate_limit_note` — you violated this rule. Add a sequential dependency before the next invocation.

**Never fire multiple `run` calls in parallel.**

---

## Actions

### `run`

Execute a command in the terminal.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"run"` |
| `command` | string | ✅ | Command to execute |
| `args` | string[] | — | Command arguments |
| `cwd` | string | — | Working directory |
| `timeout_ms` | number | — | Execution timeout in milliseconds |
| `workspace_id` | string | — | Workspace ID |
| `session_id` | string | — | Session ID — used when `session_target: "specific"` or as explicit override |
| `session_target` | string | — | `"selected"` (default), `"default"`, or `"specific"` (requires session_id) |
| `env` | object | — | Per-request environment variables — supports Gemini/Google API key alias auto-expansion |

**Returns:** `{ success, output, exit_code, session_id, rate_limit_note? }`

**Examples:**
```json
{
  "action": "run",
  "command": "npm",
  "args": ["run", "build"],
  "cwd": "./server",
  "workspace_id": "my-project-652c624f8f59"
}
```

```json
{
  "action": "run",
  "command": "npx",
  "args": ["vitest", "run", "--reporter=verbose"],
  "cwd": "./server",
  "workspace_id": "my-project-652c624f8f59"
}
```

---

### `spawn_cli_session`

Validated provider session spawn (Gemini, Copilot) with provider/cwd/prompt/context payload.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"spawn_cli_session"` |
| `provider` | string | ✅ | Provider to launch: `"gemini"` or `"copilot"` |
| `prompt` | string | — | Startup prompt for the session |
| `cwd` | string | — | Working directory |
| `workspace_id` | string | — | Workspace ID |
| `context` | object | — | Structured context payload (see below) |

**`context` object fields:**

| Field | Type | Description |
|-------|------|-------------|
| `requesting_agent` | string | Agent requesting the spawn |
| `plan_id` | string | Plan ID |
| `session_id` | string | Session ID |
| `step_notes` | string | Current step notes |
| `relevant_files` | array | `[{ path, snippet? }]` |
| `workspace_instructions` | string | Workspace-level instructions |
| `custom_instructions` | string | Custom instructions for this session |
| `output_format` | string | `"text"`, `"json"`, or `"stream-json"` |
| `session_mode` | string | `"new"` or `"resume"` |
| `resume_session_id` | string | Session ID to resume (for `session_mode: "resume"`) |

---

### `read_output`

Get buffered output from a terminal session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"read_output"` |
| `session_id` | string | ✅ | Session ID to read from |
| `workspace_id` | string | — | Workspace ID |

---

### `kill`

Terminate a terminal session.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"kill"` |
| `session_id` | string | ✅ | Session ID to terminate |
| `workspace_id` | string | — | Workspace ID |

---

### `get_allowlist`

View the current allowlist of auto-approved command patterns.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"get_allowlist"` |
| `workspace_id` | string | — | Workspace ID |

**Returns:** `{ patterns: string[] }` — glob-style patterns currently on the allowlist.

---

### `update_allowlist`

Add, remove, or replace allowlist patterns.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"update_allowlist"` |
| `patterns` | string[] | ✅ | Patterns to add/remove/set |
| `operation` | string | ✅ | `"add"`, `"remove"`, or `"set"` |
| `workspace_id` | string | — | Workspace ID |

**Examples:**
```json
{
  "action": "update_allowlist",
  "patterns": ["npm *", "npx vitest *", "npx tsc *"],
  "operation": "add",
  "workspace_id": "my-project-652c624f8f59"
}
```

```json
{
  "action": "get_allowlist",
  "workspace_id": "my-project-652c624f8f59"
}
```

---

## Terminal surface selection

Use this to choose the right terminal surface:

| Surface | Choose when |
|---------|-------------|
| `memory_terminal` | Automated, non-interactive build/lint/test commands; strict allowlist environment |
| `memory_terminal_interactive` | Canonical MCP interactive/headless lifecycle with deterministic schema/error/fallback behavior |
| `memory_terminal_vscode` | Visible VS Code terminal lifecycle management on host |

Never mix terminal contracts in one workflow — they have different action semantics and runtime assumptions.
