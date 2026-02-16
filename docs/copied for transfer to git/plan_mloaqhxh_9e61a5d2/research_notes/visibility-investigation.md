---
plan_id: plan_mloaqhxh_9e61a5d2
created_at: 2026-02-16T00:18:20.572Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Interactive Terminal Visibility Investigation — Research Findings

**Researcher:** Researcher agent  
**Date:** 2026-02-16  
**Plan:** plan_mloaqhxh_9e61a5d2  
**Symptom:** Interactive terminal (Rust+CxxQt+QML) binds to port 9100 but window never appears on secondary machine after pulling from remote.

---

## 1. Window Lifecycle Flow (Critical Path)

### main.rs Startup Sequence
1. Parse CLI args (`--port`, `--heartbeat-interval`, `--idle-timeout`)
2. Resolve port from `TERMINAL_PORT` env var or CLI (default: 9100)
3. Resolve host bridge port from `PM_INTERACTIVE_TERMINAL_HOST_PORT` env (default: 45459)
4. Store globals: `SERVER_PORT`, `HEARTBEAT_INTERVAL`, `IDLE_TIMEOUT`
5. **Pre-bind runtime listener** on `127.0.0.1:{port}` — this is what makes port 9100 appear "bound"
6. Print `"Interactive Terminal listening on 127.0.0.1:{port}"` to stderr
7. Spawn host bridge listener thread
8. Set `QT_QPA_PLATFORM=windows:darkmode=2` (Windows only)
9. Create `QGuiApplication`
10. Create `QQmlApplicationEngine`
11. **Load QML:** `engine.load("qrc:/qt/qml/com/projectmemory/terminal/main.qml")`
12. **Enter Qt event loop:** `app.exec()`

### Critical Observation: Port Binding ≠ Window Visibility

The port pre-bind (step 5) happens **before** any Qt initialization (steps 8-12). Therefore, **port 9100 being bound only proves the Rust process started — NOT that the Qt GUI initialized successfully.**

If Qt initialization crashes or QML fails to load between steps 8-12, the port remains bound but no window appears.

### No QML Load Error Handling

```rust
if let Some(engine) = engine.as_mut() {
    engine.load(&QUrl::from("qrc:/qt/qml/com/projectmemory/terminal/main.qml"));
}
```

There is **zero error handling** after the QML load:
- No check on whether root objects were created
- No `objectCreated` signal connection to verify the QML instantiated
- If `engine.as_mut()` returns `None`, load is silently skipped
- If the QML load fails (missing types, resource errors), the engine creates no root objects but doesn't crash

The Qt event loop then runs with nothing to display → window never appears.

### Console Output is Suppressed

```rust
#![windows_subsystem = "windows"]
```

This Windows-specific attribute tells the OS **not to create a console window**. All stderr output (including Qt error messages like "Could not find the Qt platform plugin" or QML errors) is silently discarded. The process runs visually headless even if Qt is failing.

---

## 2. QML Configuration

### main.qml
- Uses `ApplicationWindow` (QtQuick.Controls) with `visible: true` — correct
- `width: 800, height: 600` — standard sizing
- Instantiates `TerminalApp { id: terminalApp }` in the body — this triggers `cxx_qt::Initialize` which starts the TCP server
- Imports `com.projectmemory.terminal 1.0` — the CxxQt-registered QML module

### QML File Registration (build.rs)
```rust
CxxQtBuilder::new_qml_module(
    QmlModule::new("com.projectmemory.terminal")
        .qml_files(["qml/main.qml", "qml/CommandCard.qml", "qml/DeclineDialog.qml", "qml/OutputView.qml"]),
)
.file("src/cxxqt_bridge/ffi.rs")
.build();
```

QML files are compiled as Qt resources into the binary by CxxQt. This means the files themselves are always available if the binary was built successfully.

---

## 3. CRITICAL BUG: Bridge Definition Mismatch (ffi.rs vs mod.rs)

### The Problem

There are **two separate CxxQt bridge definitions**:

1. **`src/cxxqt_bridge/mod.rs`** — Contains the full `#[cxx_qt::bridge] pub mod ffi` with all 15 invokables. This is what the Rust compiler sees.
2. **`src/cxxqt_bridge/ffi.rs`** — Contains a **partial** `#[cxx_qt::bridge] pub mod ffi` with only 10 invokables. This is what `CxxQtBuilder` processes to generate C++ code.

### Missing from ffi.rs (5 invokables)
- `open_saved_commands(self: Pin<&mut TerminalApp>, workspace_id: QString) -> bool`
- `saved_commands_json(self: &TerminalApp) -> QString`
- `saved_commands_workspace_id(self: &TerminalApp) -> QString`
- `reopen_saved_commands(self: Pin<&mut TerminalApp>) -> bool`
- `execute_saved_command(self: Pin<&mut TerminalApp>, command_id: QString) -> bool`

### Impact
- The Rust compiler processes `mod.rs` and expects C++ to provide all 15 invokable bindings
- The CxxQt build processes `ffi.rs` and generates C++ for only 10 invokables
- This **mismatch can cause**:
  - Linker errors at build time (undefined symbols)
  - Silent crash at runtime if CxxQt handles the mismatch differently
  - QML type registration failure if the TerminalApp QObject can't be constructed
  - If TerminalApp fails to register, `main.qml` can't instantiate it → no window

### Root Cause Theory
This mismatch likely arose when saved commands features were added to `mod.rs` but `ffi.rs` was not updated to match. On the original development machine, cached build artifacts may have masked the issue. On a secondary machine with a clean build, the mismatch manifests.

---

## 4. Qt DLL Deployment Requirements

### Build Script Deploy Step
`build-interactive-terminal.ps1` runs `windeployqt` which copies:
- Qt6Core.dll, Qt6Gui.dll, Qt6Qml.dll, Qt6Quick.dll
- Platform plugins (platforms/qwindows.dll)
- QML engine plugins
- Other Qt dependencies

### The Deployment Gap
- Direct `cargo build --release` does NOT deploy Qt DLLs
- The build script only deploys when `$doDeploy` is true (release profile by default, or `-Deploy` flag)
- After pulling from remote, `target/` is typically in `.gitignore` — no pre-built binary or deployed DLLs exist
- If the user builds with plain `cargo build --release` instead of the build script, Qt DLLs won't be deployed
- Without `qwindows.dll`, Qt can't create a window → process runs but no GUI appears

### Required DLLs (verified in build script)
```powershell
$requiredDlls = @('Qt6Core.dll', 'Qt6Gui.dll', 'Qt6Qml.dll', 'Qt6Quick.dll')
```

### Qt Installation Dependency
Build script hardcodes `C:\Qt\6.10.2\msvc2022_64`. If the secondary machine has a different Qt path, the build script fails at step 1 (qmake check). But if building directly with cargo, the Qt path must be correct in the environment.

---

## 5. CxxQt Bridge Initialization Sequence

When QML instantiates `TerminalApp {}`:
1. `TerminalAppRust::default()` creates the initial state
2. `cxx_qt::Initialize::initialize()` runs:
   - Creates `TcpServer` with the pre-bound port
   - Sets up channels (incoming_rx, outgoing_tx)
   - Stores response_tx in AppState
   - Loads saved commands from disk
   - Spawns runtime tasks (server, message handler, event handler, command executor, idle timeout)

If the TerminalApp QObject can't be registered due to the ffi.rs mismatch, this initialization never runs. The TCP server inside the bridge never starts (even though the port was pre-bound in main.rs).

---

## 6. Host Bridge Listener

`host_bridge_listener.rs` spawns a TCP proxy on `0.0.0.0:{host_bridge_port}` (default 45459):
- Accepts connections from container bridge
- Proxies bidirectionally to `127.0.0.1:{runtime_port}` (9100)
- Simple transparent TCP proxy (no protocol awareness)
- Listener spawns before Qt initialization

This listener is functional and not a likely cause of the visibility issue.

---

## 7. MCP Server Integration Architecture

### Key Finding: MCP Server Doesn't Connect to the GUI

The `local` adapter mode in `interactive-terminal.tools.ts`:
- `connect()` returns immediately `{ ok: true }` — **no TCP connection to port 9100**
- `sendRequest()` calls `handleInteractiveTerminalRun()` → `spawnAndTrackSession()` — spawns commands as child processes directly
- `awaitResponse()` returns the stored result immediately

**The MCP server in `local` mode bypasses the Rust GUI entirely.** It uses the same session/process infrastructure as `memory_terminal`. The GUI-based command approval workflow requires:
1. The interactive-terminal.exe to be running separately
2. An MCP client that connects to port 9100 over TCP (not the current `local` adapter)

### Container Bridge Mode
In `container_bridge` mode:
- Preflight checks resolve host alias and probe the host bridge port
- If successful, it would connect through the host bridge (port 45459) → runtime (port 9100)
- But this path is for containerized MCP servers, not local usage

---

## 8. Identified Root Causes (Ranked by Likelihood)

### RC-1: ffi.rs / mod.rs Bridge Mismatch (HIGH — likely primary cause)
- ffi.rs is missing 5 invokables present in mod.rs
- CxxQtBuilder generates incomplete C++ bindings
- On clean build (secondary machine), this likely causes:
  - Link failure, OR
  - Runtime QML type registration failure → no window
- On original machine, cached build artifacts may have hidden the mismatch

### RC-2: Missing Qt Runtime DLLs (HIGH — secondary cause)
- Without `windeployqt`, Qt platform plugin is missing
- Qt can't create windows → silent failure
- `#![windows_subsystem = "windows"]` hides all error output
- User may have built with `cargo build --release` instead of the build script

### RC-3: No QML Load Error Handling (MEDIUM — exacerbating factor)
- QML load failure is completely silent
- No `objectCreated` check, no fallback behavior
- Event loop runs with zero root objects → no window
- Makes diagnosis impossible without redirecting stderr

### RC-4: Qt Installation Path Mismatch (MEDIUM — environment-specific)
- Build script hardcodes `C:\Qt\6.10.2\msvc2022_64`
- Secondary machine may have different Qt version/path
- `QMAKE` env and PATH must be set correctly for both build and runtime

### RC-5: `#![windows_subsystem = "windows"]` Hides Errors (LOW — diagnostic issue)
- All Qt/QML errors go to stderr which is invisible
- Makes the process appear to "run fine" while actually failing
- Not a root cause itself, but a major obstacle to diagnosis

---

## 9. Recommendations for Architect

### Immediate Fixes
1. **Sync ffi.rs with mod.rs**: Add the 5 missing invokable declarations to ffi.rs so CxxQtBuilder generates matching C++ code
2. **Add QML load verification**: After `engine.load()`, check `engine.rootObjects()` and log/panic if empty
3. **Add conditional console output**: When `--debug` flag or env var is set, skip `#![windows_subsystem = "windows"]` or re-attach console for diagnostics

### Build/Deploy Hardening
4. **Add a Qt DLL presence check at startup**: Before creating QGuiApplication, verify critical DLLs exist adjacent to the executable
5. **Document the required build flow**: Make it clear that `build-interactive-terminal.ps1` (not bare `cargo build`) must be used

### Testing Strategy
6. **Integration test for window creation**: Verify that the QML engine creates at least one root object
7. **Bridge definition parity test**: Add a build-time or CI check that ffi.rs and mod.rs have matching bridge definitions
8. **Qt DLL deployment verification test**: Check that all required DLLs are present after build

### MCP Integration Clarification
9. **Document that `local` mode doesn't use the GUI**: The current MCP `local` adapter spawns child processes directly — it never connects to the GUI's TCP server. The GUI-based approval workflow is a separate concern.
10. **Consider adding a "GUI launch" option**: If MCP calls are expected to trigger the GUI, implement a mechanism to auto-launch the interactive-terminal.exe when the first interactive command arrives

---

## 10. Files Examined

| File | Status | Notes |
|------|--------|-------|
| `interactive-terminal/src/main.rs` | Read | Startup sequence, port prebind, Qt init |
| `interactive-terminal/src/cxxqt_bridge/mod.rs` | Read | Full bridge definition (15 invokables) |
| `interactive-terminal/src/cxxqt_bridge/ffi.rs` | Read | Partial bridge definition (10 invokables) — MISMATCH |
| `interactive-terminal/src/cxxqt_bridge/initialize.rs` | Read | TCP server start in CxxQt Initialize |
| `interactive-terminal/src/cxxqt_bridge/runtime_tasks.rs` | Read | Async runtime tasks (server, msg, evt, exec, idle) |
| `interactive-terminal/src/cxxqt_bridge/state.rs` | Read | Session/command state management |
| `interactive-terminal/src/cxxqt_bridge/session_runtime.rs` | Read | TerminalAppRust struct, AppState |
| `interactive-terminal/src/cxxqt_bridge/invokables.rs` | Read | All invokable implementations |
| `interactive-terminal/src/host_bridge_listener.rs` | Read | TCP proxy for container bridge |
| `interactive-terminal/src/tcp_server.rs` | Read | Single-client NDJSON TCP server |
| `interactive-terminal/src/protocol.rs` | Read (partial) | Message types, NDJSON protocol |
| `interactive-terminal/qml/main.qml` | Read | ApplicationWindow visible:true, TerminalApp instantiation |
| `interactive-terminal/build.rs` | Read | CxxQtBuilder with ffi.rs, QML resource compilation |
| `interactive-terminal/Cargo.toml` | Read | CxxQt 0.8 deps, Qt 6 |
| `interactive-terminal/build-interactive-terminal.ps1` | Read | Build+deploy script, windeployqt |
| `interactive-terminal/resources/app.manifest` | Read | DPI awareness manifest |
| `interactive-terminal/.cargo/config.toml` | Read | Cargo network config |
| `interactive-terminal/README.md` | Read | Documentation, prereqs, troubleshooting |
| `server/src/tools/interactive-terminal.tools.ts` | Read (relevant sections) | MCP adapter, local mode bypasses GUI |
| `server/src/tools/interactive-terminal-protocol.ts` | Read | NDJSON protocol serialization |
| `server/src/tools/interactive-terminal-orchestration.ts` | Read | Lifecycle orchestration |
| `docs/interactive-terminal-contract-unification-design.md` | Read (partial) | Contract design |
