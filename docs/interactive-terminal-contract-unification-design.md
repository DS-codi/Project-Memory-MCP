# Interactive Terminal Contract Unification Design (Phases 1-2 Steps 0-5)

Date: 2026-02-15
Plan: `plan_mllgocd5_95a81ffe`
Scope: Contract and runtime-adapter design only (no implementation)

> Source-of-truth note: The matrix below documents collision analysis at design time. For active terminal-surface policy and routing semantics, follow `instructions/mcp-usage.instructions.md` (`Canonical Terminal Surface Selection` and `Contract-Collision Warnings`).

## 1) Contract Matrix + Compatibility Alias Strategy (Step 0)

### Current Surface Comparison

| Surface | Tool | Current Actions | Primary Intent | Key Request Keys | Key Response Shape |
| --- | --- | --- | --- | --- | --- |
| Server (MCP consolidated tool) | `memory_terminal_interactive` | `run`, `read_output`, `kill`, `list` | Headless/relaxed execution with session tracking | `command`, `args`, `cwd`, `timeout`, `workspace_id`, `session_id` | `success`, action-scoped payload, `authorization`/`warning` on `run` |
| VS Code extension LM tool | `memory_terminal_interactive` | `create`, `send`, `close`, `list` | Visible VS Code terminal lifecycle | `terminal_id`, `name`, `cwd`, `env`, `command`, `workspace_id` | `success`, terminal-scoped payload (`terminal_id`, status, warnings) |

### Collision Summary

- Tool name is shared but action enums differ, causing cross-surface ambiguity.
- Server is session-centric (`session_id`), extension is terminal-centric (`terminal_id`).
- Server `run` assumes command execution; extension `create` may be open-terminal only.

### Canonical Action Contract (Target)

Canonical action set for unified invocation:

- `execute` — start command/open-terminal operation
- `read_output` — fetch buffered output by resolved execution identity
- `terminate` — terminate active execution identity
- `list` — list active identities

### Backward Compatibility Aliases

Alias resolution is deterministic, one-way, and recorded in response metadata.

| Legacy Action | Canonical Action | Required Transform |
| --- | --- | --- |
| `run` | `execute` | Map as-is; preserve server command semantics |
| `kill` | `terminate` | `session_id` passthrough |
| `send` | `execute` | Treat as interactive execute against existing `terminal_id` |
| `close` | `terminate` | `terminal_id` => identity target |
| `create` | `execute` | `intent: "open_only"`, interactive mode, no command required |
| `list` | `list` | No transform |

### Deprecation Strategy

- **Phase A (compat on):** accept canonical + aliases; emit `compat.alias_applied` when alias used.
- **Phase B (warn):** emit deterministic deprecation warning for alias callers.
- **Phase C (strict):** reject aliases with canonical migration hint in error payload.

---

## 2) Canonical Request/Response Schema (Step 1)

## 2.1 Canonical Request

```json
{
  "action": "execute | read_output | terminate | list",
  "invocation": {
    "mode": "interactive | headless",
    "intent": "open_only | execute_command"
  },
  "correlation": {
    "request_id": "req_<uuid-or-ulid>",
    "trace_id": "trace_<uuid-or-ulid>",
    "client_request_id": "optional-caller-id"
  },
  "runtime": {
    "workspace_id": "optional",
    "cwd": "optional",
    "timeout_ms": 30000
  },
  "execution": {
    "command": "optional",
    "args": ["optional", "args"],
    "env": { "OPTIONAL_KEY": "value" }
  },
  "target": {
    "session_id": "optional",
    "terminal_id": "optional"
  },
  "compat": {
    "legacy_action": "optional-original-action",
    "caller_surface": "server | extension | dashboard | chat_button"
  }
}
```

## 2.2 Canonical Response

```json
{
  "success": true,
  "action": "execute | read_output | terminate | list",
  "status": "accepted | completed | failed",
  "correlation": {
    "request_id": "req_...",
    "trace_id": "trace_...",
    "client_request_id": "optional"
  },
  "resolved": {
    "canonical_action": "execute",
    "alias_applied": false,
    "legacy_action": null,
    "mode": "interactive | headless"
  },
  "identity": {
    "session_id": "optional",
    "terminal_id": "optional"
  },
  "result": {
    "authorization": "allowed | allowed_with_warning | blocked",
    "warning": "optional",
    "stdout": "optional",
    "stderr": "optional",
    "exit_code": 0,
    "running": false,
    "items": []
  },
  "error": null
}
```

## 2.3 Validation Rules

### Action + Field Coupling

- `execute`
  - requires `invocation.mode`
  - requires `invocation.intent`
  - if `intent = execute_command`, `execution.command` is required
  - if `intent = open_only`, `execution.command` must be absent
- `read_output`
  - requires at least one of `target.session_id`, `target.terminal_id`
- `terminate`
  - requires at least one of `target.session_id`, `target.terminal_id`
- `list`
  - forbids `execution`, forbids `target`

### Mode Constraints

- `mode = headless`
  - forbids `target.terminal_id` for new execute requests
  - allows `target.session_id` for follow-up `read_output`/`terminate`
- `mode = interactive`
  - allows `target.terminal_id` for attach/send semantics
  - allows `intent = open_only`

### Correlation Constraints

- `correlation.request_id` is required for every request.
- If absent from caller, bridge/tool must generate deterministically before execution.
- `trace_id` must be propagated unchanged across server/extension/adapter/GUI boundaries.

### Alias Validation

- If `compat.legacy_action` is present, it must map to exactly one canonical action.
- Unknown alias must fail fast with canonical-action migration hint.

---

## 3) Canonical Error Taxonomy + Deterministic Fallback Contract (Step 2)

## 3.1 Error Taxonomy

| Code | Category | Trigger | Retriable | Default Fallback |
| --- | --- | --- | --- | --- |
| `PM_TERM_INVALID_ACTION` | validation | unknown action/alias | false | `reject_no_retry` |
| `PM_TERM_INVALID_PAYLOAD` | validation | schema/field rule violation | false | `reject_no_retry` |
| `PM_TERM_INVALID_MODE` | validation | unsupported `invocation.mode` | false | `reject_no_retry` |
| `PM_TERM_DECLINED` | user_decision | user declined interactive command | false | `report_decline` |
| `PM_TERM_TIMEOUT` | runtime_timeout | command or handshake timeout | true | `suggest_retry_headless_or_interactive` |
| `PM_TERM_DISCONNECTED` | transport | bridge/socket dropped | true | `suggest_reconnect_retry` |
| `PM_TERM_GUI_UNAVAILABLE` | runtime_unavailable | GUI binary/endpoint unavailable | true | `fallback_to_headless_if_allowed` |
| `PM_TERM_BLOCKED_DESTRUCTIVE` | authorization | destructive command blocked | false | `reject_with_safety_hint` |
| `PM_TERM_NOT_FOUND` | identity | unknown terminal/session id | false | `refresh_list_then_retry` |
| `PM_TERM_INTERNAL` | internal | unclassified exception | true | `deterministic_internal_fallback` |

## 3.2 Deterministic Error Payload

```json
{
  "success": false,
  "action": "execute | read_output | terminate | list",
  "status": "failed",
  "correlation": {
    "request_id": "req_...",
    "trace_id": "trace_...",
    "client_request_id": "optional"
  },
  "resolved": {
    "canonical_action": "execute",
    "alias_applied": true,
    "legacy_action": "send",
    "mode": "interactive"
  },
  "error": {
    "code": "PM_TERM_TIMEOUT",
    "category": "runtime_timeout",
    "message": "Interactive terminal request timed out while waiting for response.",
    "retriable": true,
    "details": {
      "timeout_ms": 30000,
      "target": "session_id|terminal_id"
    }
  },
  "fallback": {
    "strategy": "suggest_retry_headless_or_interactive",
    "next_action": "execute",
    "recommended_mode": "headless",
    "user_message": "The interactive path timed out. You can retry now or run in headless mode.",
    "can_auto_retry": false
  }
}
```

## 3.3 Fallback Strategy Rules

- Same error code + same request class must always produce the same `fallback.strategy`.
- Fallback section is mandatory on `success: false` responses.
- `PM_TERM_INTERNAL` always returns sanitized message plus trace-linked diagnostics, never raw stack trace.
- Decline path (`PM_TERM_DECLINED`) is never auto-retried.

---

## 4) Phase-1 Design Output Summary

- Step 0 complete: matrix + alias/deprecation strategy defined.
- Step 1 complete: canonical request/response schema and validation rules defined.
- Step 2 complete: error taxonomy and deterministic fallback payload defined.

This document is the Phase 1-2 design artifact to be consumed by implementation steps 6+.

---

## 5) Runtime Adapter Interface + Mode Resolution (Step 3)

## 5.1 Adapter Interface Contract

All runtime adapters expose the same shape so server orchestration can remain mode-agnostic.

```ts
interface InteractiveTerminalRuntimeAdapter {
  readonly adapter_type: "local" | "bundled" | "container_bridge";
  connect(input: ConnectInput): Promise<ConnectResult>;
  healthCheck(input: HealthCheckInput): Promise<HealthCheckResult>;
  sendRequest(input: SendRequestInput): Promise<SendRequestResult>;
  awaitResponse(input: AwaitResponseInput): Promise<AwaitResponseResult>;
  close(input: CloseInput): Promise<CloseResult>;
  recover(input: RecoverInput): Promise<RecoverResult>;
}
```

## 5.2 Runtime Mode Detection + Override Precedence

Mode resolution is deterministic and evaluated in this order:

1. Explicit request override (`runtime.adapter_override`)
2. Server configuration override (`PM_TERM_ADAPTER_MODE`)
3. Container detection signal (`PM_RUNNING_IN_CONTAINER=true`)
4. Default local path (`local_or_bundled_auto`)

Supported explicit override values:

- `local`
- `bundled`
- `container_bridge`
- `auto` (default)

Validation rules:

- `container_bridge` requires bridge connectivity inputs; otherwise fail with `PM_TERM_INVALID_MODE`.
- Unknown override values fail fast with `PM_TERM_INVALID_PAYLOAD`.
- `auto` in container mode resolves to `container_bridge`; otherwise resolves to `local_or_bundled_auto`.

## 5.3 Auto Resolution in Non-Container Environments

When resolved mode is `local_or_bundled_auto`:

1. Attempt local adapter policy first (configured binary path if present).
2. Fall through to bundled adapter policy.
3. Fall through to PATH lookup policy.
4. If all fail, return `PM_TERM_GUI_UNAVAILABLE` with attempted sources in `error.details`.

---

## 6) Local/Bundled Adapter Discovery + Launch + Readiness Policy (Step 4)

## 6.1 Binary Discovery Order

Discovery order for local/bundled execution is strict:

1. **Configured absolute path** (`PM_INTERACTIVE_TERMINAL_BINARY` or request-level `runtime.binary_path`)
2. **Bundled binary path** (extension/server packaged binary known at build time)
3. **PATH lookup** (`interactive-terminal`, platform-specific executable name)

Selection constraints:

- Candidate must exist and be executable.
- Relative configured paths are rejected (`PM_TERM_INVALID_PAYLOAD`).
- First valid candidate wins; no parallel races.

## 6.2 Launch and Readiness Handshake

Launch lifecycle:

1. Spawn selected binary with resolved environment.
2. Start readiness timer (`spawn_timeout_ms`, default 8000, max 30000).
3. Require readiness handshake (`ready` event or TCP accept acknowledgement).
4. On handshake success, mark adapter state `ready`.
5. On timeout/failure, terminate spawned process and continue fallback policy.

Readiness requirements:

- Adapter must confirm protocol version compatibility before accepting command requests.
- Handshake payload includes `trace_id` and `runtime_session_id` for diagnostics correlation.

## 6.3 Retry/Fallback and Non-Destructive Failure Behavior

Retry policy:

- Max 1 retry per candidate for transient launch failures (`EADDRINUSE`, startup race).
- No retry for validation failures (missing executable, bad permissions).
- Move to next discovery candidate after retry exhaustion.

Non-destructive guarantees:

- Never kill unrelated processes.
- Never mutate user config to force success.
- Never auto-install binaries/dependencies.
- Always return structured failure with `attempted_candidates`, `spawn_errors`, and next recommended action.

---

## 7) Container Bridge Adapter Contract + Container Inputs (Step 5)

## 7.1 Bridge Network Contract

Container bridge adapter assumes MCP server runs in container and GUI service runs on host.

Required network contract:

- Host alias: `host.containers.internal` (primary), `host.docker.internal` (fallback)
- Protocol: TCP loopback bridge
- Port: `PM_INTERACTIVE_TERMINAL_HOST_PORT` (default `45459`)
- Connect timeout: `PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS` (default `3000`)
- Request timeout: `PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS` (default `30000`)

Connection policy:

1. Resolve host alias list in configured priority order.
2. Attempt TCP connection with bounded timeout.
3. Perform protocol handshake (version + capabilities).
4. If handshake fails, classify as `PM_TERM_DISCONNECTED` or `PM_TERM_TIMEOUT`.
5. Return actionable diagnostics including alias/port attempted.

## 7.2 Required Environment Inputs

Container adapter expects these inputs to be available to server runtime:

- `PM_RUNNING_IN_CONTAINER=true`
- `PM_TERM_ADAPTER_MODE=container_bridge` (or auto + container detection)
- `PM_INTERACTIVE_TERMINAL_HOST_ALIAS` (optional override)
- `PM_INTERACTIVE_TERMINAL_HOST_PORT`
- `PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS`
- `PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS`

Optional diagnostics input:

- `PM_INTERACTIVE_TERMINAL_TRACE_BRIDGE=1` (verbose bridge telemetry)

## 7.3 Expected Container Configuration Inputs

Adapter contract depends on these config surfaces being wired in implementation phases:

- `Containerfile`
  - Define defaults for bridge env vars (without hard-coding host-specific aliases)
  - Preserve ability to override at run time
- `container/entrypoint.sh`
  - Export/validate bridge env vars before server launch
  - Emit startup diagnostics when required variables are missing
- `run-container.ps1` (and compose equivalents)
  - Provide host alias mapping (`--add-host`/equivalent)
  - Pass host port/env overrides into container runtime
  - Surface a preflight warning when host bridge port is unreachable

Failure classification:

- Missing required bridge config => `PM_TERM_INVALID_MODE`
- Host unreachable/refused => `PM_TERM_GUI_UNAVAILABLE`
- Midstream socket drop => `PM_TERM_DISCONNECTED`

---

## 8) Phase-2 Design Output Summary

- Step 3 complete: runtime adapter interface and deterministic mode-resolution/override policy defined.
- Step 4 complete: local/bundled binary discovery, launch lifecycle, readiness handshake, and safe retry policy defined.
- Step 5 complete: container bridge network contract and expected container configuration inputs defined.

---

## 9) Phase-7 Migration + Deprecation Guidance (Implementation-Facing)

This section documents how existing callers migrate to the canonical contract without action-schema collisions.

### 9.1 Canonical Tool Split (No Contract Collision)

- `memory_terminal_interactive` is the canonical MCP lifecycle contract (`execute`, `read_output`, `terminate`, `list`).
- `memory_terminal_vscode` is the extension-visible VS Code terminal management contract (`create`, `send`, `close`, `list`).
- `memory_terminal` remains strict allowlisted headless execution and should not be mixed with interactive lifecycle payloads.

### 9.2 Legacy Action Migration Map

| Legacy Invocation | Canonical Replacement | Notes |
| --- | --- | --- |
| `action: "run"` | `action: "execute"` + `invocation.intent: "execute_command"` | command fields move under `execution.*` |
| `action: "kill"` | `action: "terminate"` + `target.session_id` | terminal/session identity accepted |
| `action: "send"` | `action: "execute"` + `target.terminal_id` | attach/send semantics preserved |
| `action: "close"` | `action: "terminate"` + `target.terminal_id` | deterministic close path |
| `action: "create"` | `action: "execute"` + `invocation.intent: "open_only"` | interactive open without command |

### 9.3 Compatibility + Deprecation Behavior

- Compatibility mode accepts legacy aliases and emits resolution metadata:
  - `resolved.alias_applied`
  - `resolved.legacy_action`
- Migration-complete callers SHOULD send canonical actions directly.
- Deprecation path is staged:
  1. accept aliases + metadata
  2. add deterministic deprecation warning
  3. strict rejection with canonical migration hint

### 9.4 Runtime Adapter Behavior Reference (Operator-Facing)

Resolution precedence is fixed:

1. `runtime.adapter_override`
2. `PM_TERM_ADAPTER_MODE`
3. `PM_RUNNING_IN_CONTAINER=true`
4. default local mode

Container bridge readiness is preflighted before interactive execute:

- invalid bridge env => `PM_TERM_INVALID_MODE`
- host bridge unreachable => `PM_TERM_GUI_UNAVAILABLE`

### 9.5 Container Bridge Setup Checklist

- Set container runtime defaults for:
  - `PM_RUNNING_IN_CONTAINER=true`
  - `PM_TERM_ADAPTER_MODE=container_bridge` (or `auto` + container detection)
  - `PM_INTERACTIVE_TERMINAL_HOST_ALIAS`
  - `PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS`
  - `PM_INTERACTIVE_TERMINAL_HOST_PORT`
  - `PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS`
  - `PM_INTERACTIVE_TERMINAL_REQUEST_TIMEOUT_MS`
- Ensure host alias routing is configured (`--add-host`/equivalent).
- Ensure host GUI bridge listener is running before interactive requests.

### 9.6 Operator Troubleshooting

Use [Interactive Terminal Operator Troubleshooting](interactive-terminal-operator-troubleshooting.md) for expected error payloads and response patterns for GUI-unavailable, bridge-unreachable, timeout, and decline flows.
