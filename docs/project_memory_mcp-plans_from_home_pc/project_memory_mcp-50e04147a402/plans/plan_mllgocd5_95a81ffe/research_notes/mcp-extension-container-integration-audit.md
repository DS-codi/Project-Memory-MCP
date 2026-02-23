---
plan_id: plan_mllgocd5_95a81ffe
created_at: 2026-02-14T17:29:50.389Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# MCP/Extension/Container Integration Research Audit

## Scope reviewed
- `server/` interactive terminal tools and consolidated registration
- `vscode-extension/` LM tool invocation + bridge/router/runtime mode logic
- `container/` runtime startup and port/env wiring
- `interactive-terminal/` GUI app, TCP server, and NDJSON protocol
- `instructions/` behavior contract docs

## Existing plan context
- `original_request` exists and confirms research-first mission.
- No prior `research` or `architecture` context artifacts were present.

## Current-state findings

### 1) `memory_terminal_interactive` behavior is split and currently inconsistent by surface

**Server-side MCP implementation (headless process execution)**
- Tool defined in `server/src/index.ts` with actions: `run | read_output | kill | list`.
- Routed to `server/src/tools/consolidated/memory_terminal_interactive.ts`.
- Uses `handleInteractiveTerminalRun` from `server/src/tools/interactive-terminal.tools.ts`.
- Runs commands via shared session infra (`spawnAndTrackSession`) in `server/src/tools/terminal.tools.ts`.
- Authorization model: destructive commands blocked, non-allowlisted/shell-operator commands allowed with warning.

**Extension-side LM tool implementation (visible VS Code terminal management)**
- Tool registered in `vscode-extension/src/chat/ToolProvider.ts`.
- Declared in `vscode-extension/package.json` with actions: `create | send | close | list`.
- Implemented in `vscode-extension/src/chat/tools/terminal-tool.ts`.
- This handler does **not** call server `memory_terminal_interactive`; it manages VS Code terminals directly and only calls `memory_terminal(action=get_allowlist)` for optional allowlist warning.

**Net effect**
- Same tool name (`memory_terminal_interactive`) has different action contracts depending on runtime surface.
- This is a major integration hazard for cross-mode behavior and documentation consistency.

### 2) VS Code extension invocation path

- Extension LM tools are registered directly in `ToolProvider` and invoked locally.
- Server-backed tools route via `McpBridge.callTool -> routeToolToHttp` (`vscode-extension/src/chat/McpBridge.ts`, `vscode-extension/src/chat/McpToolRouter.ts`).
- `memory_terminal_interactive` is currently handled as an extension-native tool, not MCP-routed.
- The bridge/router currently focuses on consolidated workspace/plan/steps/context/agent HTTP mappings; no dedicated interactive-terminal GUI protocol bridge exists.

### 3) Container/runtime mode handling

- Runtime mode switching lives in extension (`ServerManager`, `ContainerDetection`, `ContainerHealthService`).
- Modes: `auto | local | container`, with health probes to container MCP/dashboard endpoints.
- Container image (`Containerfile`) and startup (`container/entrypoint.sh`) run only MCP server + dashboard; no interactive-terminal GUI binary included or started.
- Exposed ports: `3000/3001/3002`; no explicit `9100` interactive-terminal TCP exposure.
- `run-container.ps1` injects `MBS_HOST_MCP_URL`; server has host-proxy client in `server/src/storage/remote-file-proxy.ts` (pattern potentially reusable for host-bridge design).

### 4) Interactive-terminal GUI app + TCP protocol support status

- GUI app exists and is functional as a TCP server (`interactive-terminal/src/main.rs`, `interactive-terminal/src/tcp_server.rs`).
- Binds to `127.0.0.1:{port}` (default `9100`), single-client accept loop, heartbeat monitoring.
- Protocol in `interactive-terminal/src/protocol.rs`:
  - `command_request` (id, command, working_directory, context, timeout_seconds)
  - `command_response` (approved/declined, output/exit_code/reason)
  - `heartbeat`
  - NDJSON framing.
- Execution path in `cxxqt_bridge.rs` + `command_executor.rs` supports approve/decline and command execution with timeout.

## Key constraints

1. **Contract collision**: identical tool name with divergent action schema (`run/read_output/kill/list` vs `create/send/close/list`).
2. **Container networking**: GUI binds localhost; container localhost is isolated from host localhost by default.
3. **GUI locality**: GUI must run on host desktop session, not inside headless container.
4. **Single-client server**: current GUI TCP server is designed for one client connection at a time.
5. **Security parity**: destructive-command controls exist in both server and extension but are implemented in separate codepaths.

## Risks

- Agents may call wrong action set depending on which runtime/tool surface is active.
- In container mode, MCP cannot reach host GUI unless explicit bridge/network path exists.
- Tool/docs drift can cause silent integration failures and hard-to-debug behavior.
- Potential deadlocks/timeouts if GUI lifecycle and TCP client lifecycle are not coordinated (spawn, readiness, reconnect, heartbeat).

## Design options considered

### Option A — Server-canonical interactive approval flow (recommended for architecture planning)
- Make MCP `memory_terminal_interactive` the canonical approval tool contract.
- Server-side implementation manages request lifecycle and response semantics.
- Add host GUI bridge support:
  - **Local mode**: MCP server spawns GUI app if absent, connects TCP client to `127.0.0.1:9100`.
  - **Container mode**: MCP server connects to host-reachable endpoint (e.g., host bridge URL / host alias + forwarded port) via explicit bridge config.
- Keep extension terminal manager as a separate tool name (or compatibility alias) to avoid contract collision.

**Pros**: unified MCP semantics for all agents; easier plan-level consistency.  
**Cons**: requires robust host bridge design for container mode; migration needed for existing extension tool name.

### Option B — Extension-canonical interactive approval flow
- Keep approval UI orchestration entirely extension-side.
- Extension handles GUI spawn + TCP dialog and returns decision/results to MCP via a new callback endpoint/tool.

**Pros**: native host access is straightforward.  
**Cons**: splits core approval logic between extension and MCP server; harder to support non-extension clients.

### Option C — Dual-mode with explicit tool separation
- Preserve both capabilities but with distinct names/contracts:
  - `memory_terminal_interactive` => approval protocol flow (MCP-level)
  - `memory_terminal_vscode` (or equivalent) => VS Code integrated terminal management
- Maintain backward-compat aliases temporarily.

**Pros**: least ambiguous long-term API; cleaner docs.  
**Cons**: requires deprecation/migration management.

## Recommended integration direction (for Architect)

1. **Resolve naming/contract collision first** (high priority).
2. **Adopt explicit request/response schema based on existing GUI NDJSON protocol** (reuse `command_request/command_response/heartbeat` as canonical transport contract).
3. **Introduce runtime adapter layer** in MCP interactive tool:
   - Local adapter: spawn/attach GUI on host.
   - Container adapter: connect via host bridge endpoint with configurable host/port.
4. **Define strict lifecycle states**: `spawn -> ready -> request_sent -> user_decision -> response_returned`, with timeout + reconnect policy.
5. **Keep extension’s visible terminal management separate from approval gateway semantics** to avoid ambiguity.

## Suggested architecture deliverables next
- Tool contract matrix (server vs extension) with deprecations and aliases.
- Sequence diagrams:
  - Local host flow (server + GUI on same host)
  - Container-to-host GUI flow (bridge path)
- Error model for declines/timeouts/disconnects and how those map to tool responses.
- Compatibility strategy for existing prompts/instructions referencing current action sets.
