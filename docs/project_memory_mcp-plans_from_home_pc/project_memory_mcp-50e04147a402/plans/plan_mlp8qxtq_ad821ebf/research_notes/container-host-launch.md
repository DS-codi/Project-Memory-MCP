---
plan_id: plan_mlp8qxtq_ad821ebf
created_at: 2026-02-16T14:14:23.168Z
sanitized: false
injection_attempts: 0
warnings: 1
---

# Container-to-Host Process Launching Research

## Problem Statement

The MCP server (Node.js) runs inside a Podman container on Windows. The GUI terminal app (`interactive-terminal`) is a native Windows binary (Rust/CxxQt/Qt). When the server detects the GUI is NOT running (TCP health-check on port 45459 fails), it needs to launch the GUI binary on the **host machine**. Containers are inherently sandboxed — they cannot directly spawn host processes.

## Current State in the Codebase

The codebase already has a partial foundation:
- **Container env vars**: `PM_RUNNING_IN_CONTAINER=true`, `PM_TERM_ADAPTER_MODE=container_bridge`
- **Host bridge port**: Port 45459 configured via `PM_INTERACTIVE_TERMINAL_HOST_PORT`
- **Host aliases**: `host.containers.internal` / `host.docker.internal` / gateway detection via `/proc/net/route`
- **Preflight check**: `runContainerBridgePreflight()` in `interactive-terminal.tools.ts` probes the host port
- **Host bridge listener**: `host_bridge_listener.rs` binds `0.0.0.0:45459` and proxies TCP to the runtime port (127.0.0.1:9100)
- **`run-container.ps1`**: Already checks for host bridge availability and warns if not detected

**Gap**: There is NO mechanism to auto-launch the GUI binary from within the container. The current design assumes the GUI is already running or the user manually starts it.

---

## Approach 1: Host-Side Lightweight Daemon (TCP Listener)

### Description
A small daemon process runs on the Windows host, listening on a dedicated TCP port (e.g., 45460 or reuse 45459 with a launch-request protocol). When the containerized MCP server detects the GUI is not running, it sends a "launch" message to this daemon. The daemon spawns the GUI binary.

### Implementation
- **Daemon**: Could be a simple Rust binary (reuse crate ecosystem), a Python script, or a PowerShell background job
- **Protocol**: Simple JSON-over-TCP: `{"action": "launch", "binary": "C:\\path\\to\\interactive-terminal.exe", "args": ["--port", "9100"]}` → `{"status": "launched" | "already_running" | "error", "pid": 12345}`
- **Container side**: MCP server adds a `launchHostGui()` function that connects to the daemon port before the bridge preflight

### Pros
- **Most architecturally clean**: Explicit, well-defined contract between container and host
- **Low latency**: Direct TCP connection, sub-second launch
- **Secure by design**: Daemon can validate requests (whitelist allowed binaries, verify PID, etc.)
- **Bidirectional**: Daemon can report launch status, PID, health
- **Reusable**: Can be extended for other container-to-host needs
- **Already partially implemented**: The host bridge listener on 45459 already accepts TCP from the container; could be extended to handle pre-connection "launch" messages

### Cons
- **Additional daemon to deploy/run**: User must start the daemon (or it must auto-start)
- **Port management**: Need to coordinate with existing port 45459 or use a second port
- **Windows-specific auto-start**: Needs Task Scheduler, startup folder, or Windows Service registration

### Security
- **Medium risk**: The daemon must validate the binary path against a whitelist to prevent arbitrary code execution
- Recommend: Bind to `127.0.0.1` only, authenticate with a shared secret/token, limit to launching specific whitelisted binaries
- Since the Podman VM routes through `host.containers.internal`, traffic originates from the WSL VM, not the broader network

### Recommendation: **STRONG CANDIDATE** (first choice)

---

## Approach 2: SSH from Container to Host (Podman Machine SSH)

### Description
Podman on Windows uses a WSL2 or HyperV VM. `podman machine ssh` can execute commands inside the VM, but the VM itself can SSH back to the Windows host if an SSH server is configured on Windows.

### Implementation
- Enable Windows built-in OpenSSH Server (Settings > Apps > Optional Features)
- Configure SSH keys for passwordless auth
- From container: `ssh user@host.containers.internal "C:\\path\\to\\interactive-terminal.exe --port 9100"`
- Or use `podman machine ssh` if there's a reverse path

### Pros
- **Uses standard infrastructure**: SSH is well-understood
- **Works across network boundaries**: No special port forwarding needed beyond SSH
- **Can verify host identity**: SSH host key verification

### Cons
- **Significant setup burden**: Requires Windows OpenSSH server enabled, key management, firewall rules
- **Latency**: SSH connection setup adds 500ms-2s overhead
- **Fragile**: SSH server on Windows is optional and may be disabled by IT policies
- **Shell escaping**: Windows paths with backslashes and spaces are notoriously tricky to pass through SSH
- **No bidirectional status**: Hard to get real-time launch status back

### Security
- **High risk**: An SSH server listening on the host machine opens an attack surface
- Key management is critical — leaked keys grant arbitrary command execution on host
- Must restrict SSH to specific commands or use `ForceCommand` in sshd_config

### Recommendation: **AVOID** unless other approaches fail; too fragile and over-engineered for this use case

---

## Approach 3: Volume-Mapped Sentinel File with Host File Watcher

### Description
The container writes a "launch request" file to a volume-mounted directory (e.g., `./data/.launch-requests/`). A lightweight host-side watcher service detects the new file and spawns the GUI binary. Status is communicated back via a "launch result" file.

### Implementation
- Container writes: `./data/.launch-requests/<uuid>.json` with `{"binary": "...", "args": [...], "timestamp": "..."}`
- Host watcher: PowerShell `FileSystemWatcher` or Rust `notify` crate watches the directory
- On detect: Watcher spawns the binary, writes `./data/.launch-results/<uuid>.json` with `{"status": "launched", "pid": ...}`
- Container polls for the result file

### Pros
- **Simple to implement**: File I/O is trivial on both sides
- **No network ports needed**: Works purely through the filesystem volume mount
- **Easy to debug**: Launch requests/results are visible as files

### Cons
- **Higher latency**: File system polling adds 500ms-2s delay (even with `FileSystemWatcher`, there's overhead)
- **Podman volume mount timing**: File change events may not propagate instantly through Podman's volume mounts on Windows (especially with 9p/virtiofs)
- **Race conditions**: Multiple concurrent launch requests need coordination
- **No keep-alive/health**: Can't easily monitor ongoing GUI health through files

### Security
- **Low risk**: Only reads specific JSON files from a known directory
- Watcher should still validate the binary path against a whitelist
- Files should be cleaned up promptly to avoid stale requests

### Recommendation: **VIABLE FALLBACK** if TCP daemon is not feasible; higher latency but simpler

---

## Approach 4: Podman-Specific Capabilities

### Description
Explore whether Podman (or its underlying WSL2 VM) provides built-in mechanisms to execute commands on the host.

### Findings
- `podman machine ssh`: Executes commands **inside the Podman WSL2 VM**, not on the Windows host. Not useful for launching Windows GUI binaries.
- `podman exec` from host: Runs commands **inside** the container, opposite direction
- `podman run --privileged` with bind mounts: Still runs inside the container namespace
- Podman does NOT have a `docker host exec` equivalent (Docker itself doesn't have one either)
- **`host.containers.internal`**: Only provides network routing FROM the container TO the host — no process execution
- Podman rootless on Windows: No capability for host process spawning by design

### Pros
- Would be ideal if it existed — zero additional infrastructure

### Cons
- **Does not exist**: No Podman flag or API to spawn host processes from within a container
- This is a fundamental container security boundary

### Security
- N/A — the capability doesn't exist precisely because of the security implications

### Recommendation: **NOT VIABLE** — Podman's architecture intentionally prevents this

---

## Approach 5: Windows Named Pipes Mapped into Container

### Description
Windows named pipes (`\\.\pipe\...`) can be exposed to containers. A host-side listener on a named pipe receives launch requests.

### Implementation
- Host: Create a named pipe server (`\\.\pipe\ProjectMemoryLauncher`)
- Container: Map the pipe into the container via `-v //./pipe/ProjectMemoryLauncher://./pipe/ProjectMemoryLauncher`
- Container sends launch requests through the pipe

### Findings
- **Named pipe mapping works with Docker on Windows** (both Windows and Linux containers, depending on mode)
- **Podman on Windows**: Named pipe volume mapping is **NOT supported** in rootless Podman. Podman uses WSL2, and WSL2 does not natively expose Windows named pipes to Linux containers. This is a Docker Desktop-specific feature tied to the Moby daemon.
- Docker Desktop for Windows: Supports `-v //./pipe/docker_engine://./pipe/docker_engine` pattern
- Podman rootless: Uses `gvproxy` networking and 9p/virtiofs for file mounts — no named pipe pass-through

### Pros
- Low latency, bidirectional
- No network port needed

### Cons
- **Not supported by Podman on Windows**: Fatal blocker
- Only works with Docker Desktop on Windows containers

### Security
- Named pipes have ACL-based security on Windows
- Well-understood security model

### Recommendation: **NOT VIABLE** for Podman; would work with Docker Desktop

---

## Approach 6: Extend the Existing Host Bridge Listener (Port 45459)

### Description
The GUI app already runs a `host_bridge_listener` on port 45459 that proxies TCP traffic. However, the GUI must already be running for this to work. The innovation would be to create a **separate, minimal launcher service** that:
1. Listens on port 45459 when the GUI is NOT running
2. On first connection, launches the GUI binary
3. Hands off the port 45459 listener to the GUI (or waits for the GUI to bind and then proxies)

### Implementation
- **"Launcher shim"**: A tiny Rust or PowerShell binary
- Binds 45459 on startup
- On first incoming TCP connection: 
  1. Accept the connection, hold it
  2. Spawn the GUI binary (`interactive-terminal.exe --port 9100 --host-bridge-port 45459`)
  3. Wait for the GUI's internal TCP server (port 9100) to be ready
  4. Proxy the held connection to port 9100
  5. Either: (a) exit and let the GUI take over 45459, or (b) continue proxying
- Alternative: The shim always runs and always launches the GUI on first connection. GUI inherits the listener socket.

### Pros
- **Elegant**: From the container's perspective, nothing changes — it connects to `host.containers.internal:45459` exactly as today
- **No additional ports**: Reuses the existing port
- **Auto-launch is transparent**: Container doesn't even need to know the GUI wasn't running
- **Can be made into a Windows Service**: Always running, minimal footprint

### Cons
- **Socket handoff complexity**: Transferring a bound socket between processes on Windows requires careful handling (or the shim must proxy forever)
- **Single point of failure**: If the shim crashes, nothing works
- **Startup latency**: First connection must wait for GUI to launch + initialize Qt (could be 2-5 seconds)

### Security
- Same as Approach 1 — shim validates binary path
- Binds to `0.0.0.0:45459` which is exposed to the network (same as the current host bridge listener)
- Should limit to known binary paths

### Recommendation: **STRONG CANDIDATE** (most transparent to existing architecture; co-equal with Approach 1)

---

## Approach 7: Windows Task Scheduler + Podman Event Hook

### Description
Register a Windows Task Scheduler task that monitors for a specific condition (e.g., a Podman container starting) and auto-launches the GUI binary.

### Implementation
- Create a Scheduled Task triggered by Event Log entries (Podman start events)
- OR: Create a startup task that launches the GUI minimized when the user logs in
- OR: `run-container.ps1` already checks for the GUI — add auto-launch there

### Pros
- **No daemon needed**: Uses built-in Windows infrastructure
- **Reliable**: Task Scheduler is well-tested

### Cons
- **Not reactive**: Can't respond to individual tool calls that need the GUI
- **Fragile coupling**: Tied to Podman container lifecycle, not MCP tool calls
- **Over-broad**: Launches GUI even when not needed (waste of resources)

### Security
- Task Scheduler tasks run with user privileges
- Binary path should be absolute and validated

### Recommendation: **SUPPLEMENTARY** — good for "always running" mode but doesn't solve the on-demand launch problem

---

## Summary & Recommendation Matrix

| Approach | Viability | Latency | Complexity | Security | Recommendation |
|----------|-----------|---------|------------|----------|----------------|
| 1. Host TCP Daemon | ✅ High | ~100ms | Medium | Medium | **Primary choice** |
| 2. SSH to Host | ⚠️ Medium | 500ms-2s | High | High risk | Avoid |
| 3. Sentinel File Watcher | ✅ Medium | 500ms-2s | Low-Medium | Low | Fallback option |
| 4. Podman Capabilities | ❌ None | N/A | N/A | N/A | Not viable |
| 5. Named Pipes | ❌ None (Podman) | N/A | N/A | N/A | Not viable (Podman) |
| 6. Extend Host Bridge | ✅ High | 2-5s first, 0 after | Medium-High | Medium | **Co-primary choice** |
| 7. Task Scheduler | ⚠️ Supplementary | N/A | Low | Low | Supplementary only |

### Primary Recommendation

**Approach 6 (Extend Host Bridge Listener as Launcher Shim)** is the most architecturally elegant:
- Zero changes needed on the container side
- Reuses existing port 45459
- Transparent to the MCP server — it just connects to `host.containers.internal:45459` as before
- The "shim" can be a tiny Rust binary or even a PowerShell script

**Combined with Approach 1 fallback**: If the shim approach proves too complex (socket handoff), a dedicated TCP daemon on a second port (e.g., 45460) that the container probes before the bridge preflight adds minimal overhead.

### Key Architectural Decision for Architect

The Architect should decide between:
1. **Launcher Shim on 45459** (Approach 6): Transparent, but needs socket proxy complexity
2. **Separate Launch Daemon on 45460** (Approach 1): Cleaner separation, but adds a second port
3. **Combination**: Shim on 45459 that also exposes a launch-request protocol on the initial connection before proxying
