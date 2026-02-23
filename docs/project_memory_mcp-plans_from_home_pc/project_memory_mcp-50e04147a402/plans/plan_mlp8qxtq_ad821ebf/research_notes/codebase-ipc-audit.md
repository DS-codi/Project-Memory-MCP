---
plan_id: plan_mlp8qxtq_ad821ebf
created_at: 2026-02-16T14:19:24.572Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Codebase IPC Protocol Audit

## Overview

This audit covers all files involved in the interactive terminal IPC flow — from the MCP server (Node.js/TypeScript) to the GUI application (Rust/CxxQt) — identifying protocol mismatches, missing implementations, reuse opportunities, and alignment gaps.

## File Inventory

### TypeScript (MCP Server) — `server/src/tools/`

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `interactive-terminal-protocol.ts` | 170 | NDJSON wire protocol types + serialization | ✅ Complete |
| `interactive-terminal-orchestration.ts` | 195 | Adapter interface + orchestration lifecycle | ✅ Complete |
| `interactive-terminal.tools.ts` | 1515 | Main tool execution, authorization, bridging | ✅ Complete (but see findings) |
| `interactive-terminal-contract.ts` | 580 | Canonical request/response types + parser | ✅ Complete |
| `terminal-auth.ts` | 350 | Authorization model (allowlist, destructive check) | ✅ Complete |
| `terminal-approval-context.ts` | 283 | One-time approval context (old mechanism) | ✅ Complete (being replaced) |

### Rust (GUI Application) — `interactive-terminal/src/`

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `main.rs` | 280 | Entry point, CLI args, TCP prebind, Qt init | ✅ Complete |
| `tcp_server.rs` | 519 | Single-client TCP server, NDJSON, heartbeat | ✅ Complete |
| `protocol.rs` | 519 | Wire protocol message types | ✅ Complete (but mismatched) |
| `host_bridge_listener.rs` | 180 | Port 45459 TCP proxy to runtime 9100 | ✅ Complete |
| `command_executor.rs` | 579 | Async command execution with streaming | ✅ Complete |
| `cxxqt_bridge/mod.rs` | 170 | QObject bridge exposing Rust to QML | ✅ Complete |

### Infrastructure

| File | Lines | Purpose | Status |
|------|-------|---------|--------|
| `Containerfile` | 125 | Container build + env config | ✅ Complete |
| `podman-compose.yml` | 58 | Container composition | ✅ Complete |
| `run-container.ps1` | 463 | Container lifecycle management | ✅ Complete |
| `server/src/index.ts` | 676 | MCP server init, tool registration | ✅ Complete |

---

## CRITICAL FINDING 1: Protocol Mismatch Between TS and Rust

### TypeScript Protocol (`interactive-terminal-protocol.ts`)

The TypeScript NDJSON protocol defines messages with these fields:

**CommandRequest (TS)**:
```typescript
{
  type: "command_request",
  trace_id: string,           // ← NOT IN RUST
  request_id: string,         // ← NOT IN RUST (Rust uses `id`)
  command: string,
  working_directory: string,
  context: string,
  session_id?: string,
  terminal_profile?: string,
  approval_required: boolean,  // ← NOT IN RUST
  adapter: string,            // ← NOT IN RUST ('headless_process' | 'host_bridge_local' | 'container_bridge_to_host')
  visibility: string,         // ← NOT IN RUST ('visible' | 'background' | 'hidden')
  workspace_id?: string,      // ← NOT IN RUST
  workspace_path?: string
}
```

**CommandResponse (TS)**:
```typescript
{
  type: "command_response",
  trace_id: string,           // ← NOT IN RUST
  request_id: string,         // ← NOT IN RUST (Rust uses `id`)
  status: "approved" | "declined" | "timeout" | "error",  // ← Different values
  approved: boolean,          // ← NOT IN RUST (Rust uses status: "Approved"|"Declined")
  output?: string,
  exit_code?: number,
  reason?: string,
  execution_time_ms?: number, // ← NOT IN RUST
  adapter: string,            // ← NOT IN RUST
  visibility: string          // ← NOT IN RUST
}
```

### Rust Protocol (`protocol.rs`)

**CommandRequest (Rust)**:
```rust
{
  id: String,                // ← Maps to request_id in TS? Or trace_id?
  command: String,
  working_directory: Option<String>,
  context: Option<String>,
  session_id: Option<String>,
  terminal_profile: Option<String>,
  workspace_path: Option<String>,
  venv_path: Option<String>,      // ← NOT IN TS
  activate_venv: Option<bool>,    // ← NOT IN TS
  timeout_seconds: Option<u64>    // ← NOT IN TS
}
```

**CommandResponse (Rust)**:
```rust
{
  id: String,
  status: String,           // "Approved" | "Declined" — note capitalization differs from TS
  output: Option<String>,
  exit_code: Option<i32>,
  reason: Option<String>
}
```

### Mismatch Summary

| Field | TypeScript | Rust | Impact |
|-------|-----------|------|--------|
| Request ID field name | `request_id` | `id` | ❌ Will NOT match during JSON parse |
| Trace ID | `trace_id` (required) | Not present | ❌ TS sends it, Rust ignores it |
| Approval metadata | `approval_required`, `approved` | Not present | ⚠️ Approval info lost |
| Adapter type | `adapter` | Not present | ⚠️ Routing info lost |
| Visibility | `visibility` | Not present | ⚠️ UI hint lost |
| Status values | `"approved"` (lowercase) | `"Approved"` (PascalCase) | ❌ String comparison will fail |
| Workspace ID | `workspace_id` | Not present | ⚠️ Auth scoping lost |
| Venv support | Not present | `venv_path`, `activate_venv` | ⚠️ TS can't activate venvs |
| Timeout | Not present | `timeout_seconds` | ⚠️ TS can't set per-command timeout |
| Execution time | `execution_time_ms` | Not present | ⚠️ Timing data lost |

### Resolution Required
The Architect MUST align these protocols. Options:
1. **Rust adopts TS protocol**: Expand Rust's `CommandRequest`/`CommandResponse` to include all TS fields
2. **TS adopts Rust protocol**: Simplify TS protocol (loses metadata)
3. **Create a shared protocol schema**: Define a canonical protocol in a shared location, generate or manually sync both sides

**Recommendation**: Option 1 (Rust adopts TS protocol) — the TS side has more context needed for routing and approval. Rust should be the superset.

---

## CRITICAL FINDING 2: In-Process Adapter is a Mock

### Location
`interactive-terminal.tools.ts`, function `createInProcessInteractiveAdapter()`

### Finding
The "in-process" adapter does NOT communicate with the GUI app over TCP. Instead it:
1. Serializes the request to NDJSON (calling `serializeCommandRequestToNdjson()`)
2. Immediately deserializes it back (calling `parseNdjsonMessage()`)
3. Runs the command directly via `handleInteractiveTerminalRun()` (which spawns a local process)
4. Fakes the approval flow using environment variables:
   - `PM_INTERACTIVE_TERMINAL_AUTO_DECLINE=true` → auto-decline
   - `PM_INTERACTIVE_TERMINAL_FORCE_TIMEOUT=true` → simulate timeout
5. Constructs a fake `CommandResponse` and deserializes it

**This means**: There is NO real TCP client in the MCP server that connects to the GUI's TCP server (port 9100). The NDJSON roundtrip is purely cosmetic — it validates the serialization but doesn't cross a network boundary.

### Implication
A **real TCP adapter** must be written that:
1. Opens a TCP connection to `127.0.0.1:9100` (local) or `host.containers.internal:45459` (container)
2. Sends NDJSON-encoded `CommandRequest` messages
3. Reads NDJSON-encoded `CommandResponse` messages
4. Handles heartbeats bidirectionally
5. Implements reconnection/recovery logic

The existing `InteractiveRuntimeAdapter` interface in `interactive-terminal-orchestration.ts` is well-designed for this — just needs a real TCP implementation.

---

## FINDING 3: Orchestration Layer is Solid and Reusable

### Location
`interactive-terminal-orchestration.ts`

### Finding
The orchestration lifecycle is well-designed:
```
spawn → ready → request_sent → correlation_verified → user_decision → response_returned
```

The `InteractiveRuntimeAdapter` interface is clean:
```typescript
interface InteractiveRuntimeAdapter {
  connect(): Promise<boolean>;
  sendRequest(request: NdjsonMessage): Promise<boolean>;
  awaitResponse(correlationId: string, timeout: number): Promise<NdjsonMessage | null>;
  recover(reason: 'timeout' | 'disconnect' | 'error'): Promise<boolean>;
  close(): Promise<void>;
}
```

This interface can be implemented by:
- `TcpAdapter`: Real TCP connection to GUI
- `ContainerBridgeAdapter`: TCP through `host.containers.internal:45459`
- Mock adapter (existing in-process one, for testing)

**No changes needed** to the orchestration layer itself.

---

## FINDING 4: Host Bridge Listener Works Correctly

### Location
`interactive-terminal/src/host_bridge_listener.rs`

### Finding
The host bridge listener is a straightforward TCP proxy:
- Binds `0.0.0.0:{host_bridge_port}` (default 45459)
- For each incoming connection, opens a connection to `127.0.0.1:{runtime_port}` (default 9100)
- Bidirectional byte-level proxying using `std::io::copy()` on two threads
- Clean shutdown via `Arc<AtomicBool>` flag

This is **correctly implemented and tested**. No changes needed for the basic bridge flow.

**However**: It currently uses std threads (not tokio). If the Architect wants to add more sophisticated behavior (request inspection, logging, launch-on-connect), this would need reworking.

---

## FINDING 5: Container Bridge Preflight is Complete

### Location
`interactive-terminal.tools.ts`, function `runContainerBridgePreflight()`

### Finding
The preflight logic:
1. Reads `PM_CONTAINER_TO_HOST_BRIDGE_HOST` env var (default: `host.containers.internal`)
2. Probes multiple fallback hosts: primary, `host.docker.internal`, gateway IP from `/proc/net/route`
3. TCP connect timeout from `PM_HOST_BRIDGE_CONNECT_TIMEOUT` (default: 3000ms)
4. On success: returns the working host address
5. On failure: returns structured error with `PM_TERM_GUI_UNAVAILABLE` code and `start_gui_app` fallback strategy

This is well-implemented. The container knows when the GUI isn't reachable.

**Gap**: There's no "launch the GUI" step after preflight failure. Currently, it just returns an error with a suggestion. This is where the container-to-host launch mechanism (Research Area 1) would plug in.

---

## FINDING 6: Terminal Auth is Dual-Mode

### Location
`terminal-auth.ts`

### Finding
Two authorization models exist:
1. **Strict (headless `memory_terminal`)**: Only allowlisted commands pass. Everything else is blocked.
2. **Relaxed (interactive `memory_terminal_interactive`)**: Destructive commands blocked, unlisted commands allowed with a warning, allowlisted commands auto-approved.

The relaxed model is used for the interactive terminal tool. Authorization happens in `interactive-terminal.tools.ts` and the result feeds into the NDJSON request's `approval_required` field.

The auth system loads workspace-scoped allowlists from `terminal-allowlist.json` and supports headless policy overlays from `headless-allowlist-policy.v1.json`.

**Reuse opportunity**: The auth module is well-isolated and can be reused as-is. The only question is where to put the "requires GUI approval" decision: before NDJSON serialization (current) or as a separate step in the orchestration lifecycle.

---

## FINDING 7: CxxQt Bridge and QML Properties

### Location
`interactive-terminal/src/cxxqt_bridge/mod.rs`

### Finding
The Rust-to-QML bridge exposes:

**Properties**: commandText, workingDirectory, contextInfo, statusText, outputText, isConnected, pendingCount, currentRequestId, currentSessionId, currentTerminalProfile, pendingCommandsJson, sessionTabsJson, headlessPolicyWorkspaceId, headlessPolicyPatternsJson

**Signals**: commandReceived, commandCompleted, outputLineReceived, connectionStatusChanged

**Invokables**: approveCommand, declineCommand, clearOutput, createSession, switchSession, closeSession, renameSession, setSessionTerminalProfile, openSavedCommands, openHeadlessPolicy, saveHeadlessPolicy, runCommand, exportOutputText, exportOutputJson

The `approveCommand()` and `declineCommand()` invokables are the key entry points for the GUI approval flow. When the user clicks "Approve" in the QML UI, it calls `approveCommand()`, which should send a `CommandResponse` with `status: "Approved"` back through the TCP connection.

**Gap**: Need to verify the data flow from `approveCommand()` → TCP response. The bridge defines the interface but the actual implementation details of how approval triggers a TCP write would be in the QObject implementation (Rust side, likely `impl qobject::TerminalApp`).

---

## FINDING 8: Server Index Doesn't Capture `extra`

### Location
`server/src/index.ts`

### Finding
The current tool registration pattern:
```typescript
server.tool("memory_terminal_interactive", schema, async (params) => {
    return await handleInteractiveTerminalTool(params, ...);
});
```

The `extra` parameter (containing `sendNotification`, `signal`) is available from the MCP SDK but may not be captured in the current handler signature. The Architect needs to ensure tool handlers accept `(params, extra)` so that:
- Progress notifications can be sent during approval wait
- Cancellation signals propagate to the orchestration layer

**Quick check**: The `server.tool()` registration in the SDK supports `(params: Record<string, unknown>, extra: RequestHandlerExtra) => Promise<CallToolResult>`. Need to confirm current handlers accept both args.

---

## Architecture Diagram: Current State

```
┌─────────────────────────────────────────────────────────────────────────┐
│ Container (Podman)                                                       │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ MCP Server (Node.js)                                              │   │
│ │                                                                   │   │
│ │ index.ts → tool registration                                      │   │
│ │   ↓                                                               │   │
│ │ interactive-terminal.tools.ts → handleInteractiveTerminalTool()   │   │
│ │   ↓                                                               │   │
│ │ terminal-auth.ts → authorizeCommand()                             │   │
│ │   ↓                                                               │   │
│ │ interactive-terminal-contract.ts → parseRequest()                 │   │
│ │   ↓                                                               │   │
│ │ ┌─────────────────────────┐  ┌──────────────────────────────┐    │   │
│ │ │ In-Process Adapter      │  │ Container Bridge Adapter     │    │   │
│ │ │ (MOCK - no real TCP)    │  │ (preflight only, no TCP)     │    │   │
│ │ │ Serializes/deserializes │  │ Probes host:45459            │    │   │
│ │ │ locally, runs commands  │  │ Returns error if unreachable │    │   │
│ │ └─────────────────────────┘  └──────────────────────────────┘    │   │
│ │   ↓                                                               │   │
│ │ interactive-terminal-orchestration.ts → orchestrateLifecycle()    │   │
│ │ (Would drive real TCP flow, but adapter is mock)                  │   │
│ └───────────────────────────────────────────────────────────────────┘   │
│                                                                         │
│ Port 3000 (MCP) ────────── host.containers.internal:45459 ──────→      │
└─────────────────────────────────────────────────────────────────────────┘
                                        │ (TCP)
                                        ↓
┌─────────────────────────────────────────────────────────────────────────┐
│ Windows Host                                                             │
│                                                                         │
│ ┌───────────────────────────────────────────────────────────────────┐   │
│ │ interactive-terminal.exe (Rust + CxxQt + Qt/QML)                  │   │
│ │                                                                   │   │
│ │ main.rs → CLI args, prebind TCP, init Qt                          │   │
│ │   ↓                                                               │   │
│ │ host_bridge_listener.rs ← 0.0.0.0:45459 (bridge proxy)           │   │
│ │   ↓ (proxies to)                                                  │   │
│ │ tcp_server.rs ← 127.0.0.1:9100 (runtime server)                  │   │
│ │   ↓                                                               │   │
│ │ protocol.rs → parse NDJSON messages                               │   │
│ │   ↓                                                               │   │
│ │ cxxqt_bridge/mod.rs → update QML properties                       │   │
│ │   ↓                                                               │   │
│ │ [QML UI] → User sees command, clicks Approve/Decline              │   │
│ │   ↓                                                               │   │
│ │ cxxqt_bridge/mod.rs → approveCommand()/declineCommand()           │   │
│ │   ↓                                                               │   │
│ │ tcp_server.rs → send CommandResponse back via TCP                 │   │
│ │   ↓                                                               │   │
│ │ command_executor.rs → (if approved) execute command, stream output │   │
│ └───────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Gap Analysis Summary

| Gap | Severity | Description |
|-----|----------|-------------|
| Protocol mismatch | 🔴 Critical | TS and Rust protocols are incompatible (field names, values, missing fields) |
| No real TCP client | 🔴 Critical | MCP server has no TCP adapter to connect to GUI — the in-process adapter is a mock |
| `extra` not captured | 🟡 Medium | Tool handlers may not receive `extra` for progress notifications |
| No auto-launch | 🟡 Medium | When GUI isn't running, server just errors; no launch mechanism |
| Missing venv support in TS | 🟢 Low | Rust supports venv_path/activate_venv but TS protocol doesn't send them |
| No shared schema | 🟢 Low | Protocol defined independently in both languages; no shared spec |

## Reuse Opportunities

| Component | Reusable? | Notes |
|-----------|-----------|-------|
| `InteractiveRuntimeAdapter` interface | ✅ Yes | Perfect abstraction for TCP adapters |
| `orchestrateInteractiveLifecycle()` | ✅ Yes | Works with any adapter implementation |
| `serializeCommandRequestToNdjson()` | ✅ Yes | Just align field names |
| `parseNdjsonMessage()` | ✅ Yes | Will work once protocols align |
| `terminal-auth.ts` | ✅ Yes | Fully isolated, clean API |
| `host_bridge_listener.rs` | ✅ Yes | Works as-is for TCP proxying |
| `tcp_server.rs` | ✅ Yes | Clean single-client server with heartbeat |
| `command_executor.rs` | ✅ Yes | Solid async command execution |
| Container bridge preflight | ✅ Yes | Well-implemented host probing |

## Recommendations for Architect

1. **Priority 1**: Align the NDJSON protocol between TS and Rust. Create a canonical schema doc that both sides implement.
2. **Priority 2**: Implement a real `TcpAdapter` implementing `InteractiveRuntimeAdapter` with actual TCP socket I/O.
3. **Priority 3**: Wire `extra.sendNotification` through the tool handler chain for progress keep-alive.
4. **Priority 4**: Decide on the container-to-host GUI launch mechanism (see `container-host-launch.md`).
5. **Priority 5**: Extend CxxQt bridge to handle the additional TS protocol fields.
