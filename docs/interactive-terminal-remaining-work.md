# Interactive Terminal — Remaining Work

> **Plan ID:** `plan_mlpp9332_b1df7260`  
> **Plan Title:** Interactive Terminal: Persistent Process & End-to-End Connectivity  
> **Snapshot Date:** 2026-02-18  
> **Progress:** 15/23 steps done, 8 remaining

---

## Summary

The Interactive Terminal plan was revised on 2026-02-18 after reconciling with the home PC's work (commit `c83c32b`). The home PC implemented output persistence (Phase 6) and some idle-timeout improvements but did NOT wire the `read_output`/`kill` protocol handling into the Rust GUI — leaving that as the critical blocker.

The TypeScript side (MCP server) is fully implemented and ready. The Rust protocol types exist. The gap is **only** in `runtime_tasks.rs` where the `msg_task` and `exec_task` need to use the already-written `OutputTracker` from `completed_outputs.rs`.

---

## Critical Blocker: Steps 7–8 (Wire read_output/kill in Rust)

### What exists (already written, currently dead code)

- **`src/cxxqt_bridge/completed_outputs.rs`** — Fully implemented `OutputTracker` and `CompletedOutput` structs with:
  - `store()` — record output for a running/completed command
  - `mark_completed()` — finalise entry with exit code and output
  - `register_kill_sender()` — store a `oneshot::Sender<()>` for kill signaling
  - `build_read_output_response()` — create a `ReadOutputResponse` message
  - `try_kill()` — send kill signal via oneshot channel
  - `evict_stale()` — remove entries older than 30 minutes
  - 5 unit tests

- **`src/cxxqt_bridge/session_runtime.rs`** — `AppState` already has `output_tracker: OutputTracker` field, initialised in `TerminalAppRust::default()`

- **`src/protocol.rs`** — All 4 message types exist in the `Message` enum:
  - `ReadOutputRequest { id, session_id }`
  - `ReadOutputResponse { id, session_id, running, exit_code, stdout, stderr, truncated }`
  - `KillSessionRequest { id, session_id }`
  - `KillSessionResponse { id, session_id, killed, message, error }`
  - 28 protocol tests pass

### What needs to happen in `runtime_tasks.rs`

**File:** `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs`

#### 1. Add match arms in `msg_task` (around line 305)

The `msg_task` match block currently handles `CommandRequest`, `SavedCommandsRequest`, `Heartbeat`, and `_ => {}`. Add two new arms before the wildcard:

```rust
Message::ReadOutputRequest(req) => {
    let response = {
        let s = state.lock().unwrap();
        s.output_tracker.build_read_output_response(&req.id, &req.session_id)
    };
    let s = state.lock().unwrap();
    s.send_response(response);
}
Message::KillSessionRequest(req) => {
    let response = {
        let mut s = state.lock().unwrap();
        s.output_tracker.try_kill(&req.id, &req.session_id)
    };
    let s = state.lock().unwrap();
    s.send_response(response);
}
```

#### 2. Wire OutputTracker in `exec_task` (around line 363)

In the `exec_task` block, **before** executing the command:

```rust
// Create kill channel
let (kill_tx, kill_rx) = tokio::sync::oneshot::channel::<()>();

// Register initial running entry + kill sender
{
    let mut s = state.lock().unwrap();
    s.output_tracker.store(CompletedOutput {
        request_id: req.id.clone(),
        stdout: String::new(),
        stderr: String::new(),
        exit_code: None,
        running: true,
        completed_at: tokio::time::Instant::now(),
    });
    s.output_tracker.register_kill_sender(&req.id, kill_tx);
}
```

Then replace the direct `execute_command_with_timeout` call with a `tokio::select!` that races execution against the kill signal:

```rust
let result = tokio::select! {
    exec_result = command_executor::execute_command_with_timeout(&req, output_tx) => {
        exec_result
    }
    _ = kill_rx => {
        // Kill signal received — the child process handle should be dropped
        Err("Process killed by user".to_string())
    }
};
```

After execution completes (in both Ok and Err branches), mark the output tracker entry as completed:

```rust
{
    let mut s = state.lock().unwrap();
    let (stdout, stderr) = /* split captured_lines by stream */;
    s.output_tracker.mark_completed(&req.id, exit_code, stdout, stderr);
}
```

#### 3. Required imports

Add to the imports at the top of `runtime_tasks.rs`:

```rust
use crate::cxxqt_bridge::completed_outputs::CompletedOutput;
use crate::protocol::{ReadOutputRequest, KillSessionRequest};  // for pattern matching
```

### Verification

After wiring:
1. `cargo build --release` must succeed with no errors (warnings for completed_outputs.rs dead code should disappear)
2. `cargo test` — all existing 123 tests should still pass
3. The 20 dead-code warnings should be eliminated

---

## Remaining Steps (Full List)

### Step 7 — Wire completed-session output tracking (PENDING)
- **Phase:** Phase 5: Protocol Extension
- **What:** Add `ReadOutputRequest` handling in `msg_task`, register `CompletedOutput` entries in `exec_task`, mark completed after execution
- **Files:** `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs`
- **Dependencies:** None (completed_outputs.rs is ready)

### Step 8 — Wire kill handling (PENDING)
- **Phase:** Phase 5: Protocol Extension
- **What:** Add `KillSessionRequest` handling in `msg_task`, create oneshot kill channel in `exec_task`, use `tokio::select!` to race execution vs kill signal
- **Files:** `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs`
- **Dependencies:** Same file as step 7, implement together

### Step 11 — End-to-end validation of read_output/kill (PENDING)
- **Phase:** Phase 5: Protocol Extension
- **What:** Send a long-running command via `memory_terminal run`, then call `read_output` with returned session_id to confirm GUI output, then call `kill` to confirm process termination. Test in both local (127.0.0.1:9100) and container modes.
- **Dependencies:** Steps 7–8 must be done first

### Step 16 — Container support hardening (PENDING)
- **Phase:** Phase 7: Container Support Hardening
- **What:** Review/harden container config. Verify Containerfile sets `PM_RUNNING_IN_CONTAINER=true`, verify `host.containers.internal` resolves, verify port/env alignment between `podman-compose.yml` and `run-container.ps1`. Simplify any remote-host logic (container always on same machine).
- **Notes:** Home PC partially addressed this — added `has_ever_connected` idle-timeout fix. Still needs explicit review pass and doc update.
- **Files:** `Containerfile`, `run-container.ps1`, `podman-compose.yml`

### Step 17 — Container end-to-end validation (PENDING)
- **Phase:** Phase 7: Container Support Hardening
- **What:** Build container image, run MCP server in container, send command via MCP tool from container, verify GUI approval dialog on host, verify response flows back. Test `read_output` and `kill` from container mode.
- **Dependencies:** Steps 7–8, 16

### Step 18 — Unit tests for memory_terminal tool (PENDING)
- **Phase:** Phase 8: Testing & Documentation
- **What:** Test all 5 actions, error handling, allowlist authorization flow, read_output/kill routing (GUI vs local sessions). Mock TCP adapter.
- **Directory:** `server/`
- **Command:** `npx vitest run`

### Step 19 — Integration tests for TCP adapter (PENDING)
- **Phase:** Phase 8: Testing & Documentation
- **What:** Mock TCP server tests for ReadOutput/Kill round-trips. Test partial NDJSON and edge cases.
- **Directory:** `server/`

### Step 20 — Rust-side tests (PENDING)
- **Phase:** Phase 8: Testing & Documentation
- **What:** Test output file writing + rolling retention, test read_output/kill message handling in tcp_server, test completed-session cache eviction.
- **Directory:** `interactive-terminal/`
- **Command:** `cargo test`

### Step 21 — Documentation updates (PENDING)
- **Phase:** Phase 8: Testing & Documentation
- **What:** Update `interactive-terminal/README.md` with persistent process architecture. Update `.github/instructions/` files to reflect `memory_terminal` tool. Remove stale references to `memory_terminal_interactive`. Update `mcp-usage.instructions.md` terminal sections.

### Step 22 — Final end-to-end validation (PENDING)
- **Phase:** Phase 8: Testing & Documentation
- **What:** Full flow validation — MCP server (local) → `memory_terminal run` → GUI approval → execution → output file written → tool returns summary + file path. Verify heartbeat progress notifications, allowlisted auto-execute, read_output/kill. Run `npx vitest run` in `server/`, `cargo test` in `interactive-terminal/`.

---

## Build Commands

| Component | Command | Directory |
|-----------|---------|-----------|
| Interactive Terminal (Rust) | `.\build-interactive-terminal.ps1` | `interactive-terminal/` |
| MCP Server | `npm run build` | `server/` |
| Server Tests | `npx vitest run` | `server/` |
| Rust Tests | `cargo test` | `interactive-terminal/` |

---

## Known Issues / Deferred Items

1. **Security (deferred):** Port 45459 host bridge has no authentication. Any process on the same machine could send commands. Remedy: implement rotating auth keys. Address after LIVE PROOF works.

2. **Socket reuse bug (deferred):** `memory_terminal` MCP tool's first call succeeds but 2nd+ calls fail with "Socket closed while awaiting response". Likely cause: TcpTerminalAdapter per-request connection lifecycle vs single-client TCP server accept loop. May resolve with steps 7–8 wiring changes; retest after.

3. **20 Cargo warnings:** All from dead code in `completed_outputs.rs` and `session.rs`. Will resolve once steps 7–8 wire the code.

---

## File Map

| File | Status | Role |
|------|--------|------|
| `interactive-terminal/src/protocol.rs` | Done | NDJSON message types (all 9 variants) |
| `interactive-terminal/src/cxxqt_bridge/completed_outputs.rs` | Done (dead code) | OutputTracker + CompletedOutput — ready to wire |
| `interactive-terminal/src/cxxqt_bridge/session_runtime.rs` | Done | AppState with `output_tracker` field |
| `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs` | **Needs work** | msg_task + exec_task — wire read_output/kill |
| `interactive-terminal/src/output_persistence.rs` | Done | JSON output file writing + rolling retention |
| `server/src/tools/terminal-ipc-protocol.ts` | Done | TS protocol interfaces |
| `server/src/tools/terminal-tcp-adapter.ts` | Done | sendReadOutput() + sendKill() |
| `server/src/tools/consolidated/memory_terminal.ts` | Done | guiSessions routing for read_output/kill |
| `setup-firewall-rule.ps1` | Done | Windows Firewall rule for port 45459 |
| `run-container.ps1` | Done | --add-host + preflight checks |
| `podman-compose.yml` | Done | extra_hosts: host.containers.internal |
