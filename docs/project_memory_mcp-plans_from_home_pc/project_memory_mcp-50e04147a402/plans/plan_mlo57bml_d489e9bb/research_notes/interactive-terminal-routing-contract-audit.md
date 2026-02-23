---
plan_id: plan_mlo57bml_d489e9bb
created_at: 2026-02-15T19:37:18.993Z
sanitized: false
injection_attempts: 0
warnings: 0
---

## Interactive Terminal MCP Routing Audit (Step 0)

### Scope
- Analyzed current routing/approval/visibility/instance-reuse behavior for interactive vs headless execution.
- No code edits.

### File-level behavior map

#### Canonical contract + parsing
- `server/src/tools/interactive-terminal-contract.ts`
  - Normalizes canonical + legacy actions (`run/kill/send/close/create`).
  - Defaults mode to `headless` unless legacy mapping sets interactive (`create` => `interactive/open_only`, `send` => `interactive/execute_command`).
  - Validates target identity rules (`read_output`/`terminate` require `session_id` or `terminal_id`).

#### Server execution + adapter routing
- `server/src/tools/interactive-terminal.tools.ts`
  - Headless path: `handleInteractiveTerminalRun` -> shared `spawnAndTrackSession`.
  - Interactive path currently also resolves to `handleInProcessInteractiveExecute` using `createInProcessInteractiveAdapter`.
  - `resolveRuntimeAdapterMode` computes `local|bundled|container_bridge`, but adapter selection is not actually branched into distinct runtime adapters.
  - `runContainerBridgePreflight` probes host aliases/port only; bridge transport is not used after preflight.

#### Shared terminal session engine + auth
- `server/src/tools/terminal.tools.ts`
  - Process spawn/session store, read_output/kill.
  - Uses `windowsHide: true` for spawned commands.
- `server/src/tools/terminal-auth.ts`
  - Strict headless auth (`memory_terminal`): destructive, shell operators, and non-allowlisted commands blocked.
- `server/src/tools/consolidated/memory_terminal.ts`
  - Exposes strict actions `run/read_output/kill/get_allowlist/update_allowlist`.

#### Interactive consolidated MCP tool
- `server/src/tools/consolidated/memory_terminal_interactive.ts`
  - Delegates to parser + `executeCanonicalInteractiveRequest`.

#### Container mode env + bridge expectations
- `container/entrypoint.sh`, `Containerfile`, `run-container.ps1`
  - Set `PM_RUNNING_IN_CONTAINER=true`, `PM_TERM_ADAPTER_MODE=container_bridge`, host alias/port/timeouts.
  - `run-container.ps1` preflight checks localhost host-bridge listener.

#### Host GUI app + bridge process
- `interactive-terminal/src/main.rs`
  - Starts GUI app, local runtime listener on `127.0.0.1:{port}`, and host bridge listener.
- `interactive-terminal/src/host_bridge_listener.rs`
  - Binds `0.0.0.0:{host_port}`, proxies to local runtime port.
- `interactive-terminal/src/cxxqt_bridge/*`, `interactive-terminal/src/protocol.rs`
  - Human approval queue (`approve_command` / `decline_command`) and per-session command routing.

#### Extension-side visible terminal surface
- `vscode-extension/src/chat/tools/terminal-tool.ts`
  - `memory_terminal_interactive` handler forwards canonical payload to server MCP tool.
  - Separate `memory_terminal_vscode` creates/sends/closes visible VS Code terminals (`terminal.show()`).
- `vscode-extension/src/chat/ToolProvider.ts`
  - Registers both `memory_terminal_interactive` and `memory_terminal_vscode`.

### Requirement gap analysis

1. GUI interactive terminal must always run on host machine, never in container
- **FAIL**
- Current server interactive execution does not route through host GUI bridge; it executes in-process via server-side adapter (`createInProcessInteractiveAdapter`).
- No hard guard prevents GUI service from being started in container context.

2. Non-headless command sends must always show a visible terminal window
- **FAIL**
- Server-side `memory_terminal_interactive` interactive mode does not create/show host-visible terminal windows.
- Execution uses spawned hidden/background process paths (`windowsHide` / `CREATE_NO_WINDOW` in execution stack).
- Visible window behavior exists only in extension-only `memory_terminal_vscode` path, not canonical server path.

3. Approval required unless command is allowlisted
- **FAIL**
- Interactive server path uses relaxed auth (`allowed_with_warning`) and executes non-allowlisted commands without approval.
- Human approval in Rust GUI exists but is bypassed by in-process adapter flow.

4. Behavior must be identical in local and container app modes
- **FAIL**
- Tests currently encode auto-fallback from container_bridge preflight failure to local in-process interactive success.
- This creates divergent semantics: container bridge preflight may fail but command still runs via local in-process path.

5. MCP tools should send commands to existing interactive instance if available
- **FAIL (server canonical path)**
- Canonical tool accepts `target.session_id/terminal_id` but does not bind to a live host GUI instance transport.
- Extension-only `memory_terminal_vscode` reuses tracked visible terminals; canonical server path does not reuse host GUI instance.

### Proposed canonical execution contract (implementation target)

#### Decision table
| Invocation | Runtime mode | Required adapter | Visibility | Approval policy | Identity reuse |
|---|---|---|---|---|---|
| `execute` + `headless` | local/container | Headless process adapter (`memory_terminal`) | No visible UI required | Strict allowlist gate (block if not allowlisted/destructive/shell-op policy) | `session_id` only |
| `execute` + `interactive` | local | Host GUI bridge adapter (to interactive-terminal host instance) | Must be visible host GUI | Human approval unless allowlisted auto-approve policy explicitly enabled | Reuse existing `terminal_id/session_id` if provided; otherwise attach/create deterministic default instance |
| `execute` + `interactive` | container | Container bridge -> host GUI bridge adapter only | Must be visible on host | Same as local interactive | Same identity semantics as local |
| `read_output` | any | Route by identity type to owning adapter | N/A | N/A | Require existing identity |
| `terminate` | any | Route by identity type to owning adapter | N/A | N/A | Require existing identity |
| `list` | any | Merge identity inventory from active adapters | N/A | N/A | Return adapter + identity metadata |

#### State machine (high-level)
1. Parse + canonicalize request.
2. Resolve adapter (`headless` => headless adapter; `interactive` => host-only bridge adapter).
3. If interactive and runtime container: require successful bridge connection; no local in-process interactive fallback.
4. Resolve identity: attach existing instance/session if provided; else discover existing default interactive instance before creating.
5. Authorization:
   - headless: strict allowlist gate.
   - interactive: require approval unless allowlisted.
6. Execute/send, then persist correlation + identity metadata.

### Implementation-ready notes (Architect/Executor)

#### Priority files to change
1. `server/src/tools/interactive-terminal.tools.ts`
   - Replace/retire in-process interactive execution path for canonical interactive mode.
   - Enforce host-only interactive routing and remove auto fallback to local in-process when container bridge preflight fails.
   - Enforce approval-required-unless-allowlisted semantics in interactive mode.
   - Implement real identity attach/reuse for existing interactive instance.

2. `server/src/tools/interactive-terminal-orchestration.ts`
   - Use concrete runtime adapters (`local`, `bundled`, `container_bridge`) for interactive mode; not synthetic in-process approval.

3. `server/src/tools/interactive-terminal-protocol.ts`
   - Ensure transport payload carries identity and approval metadata needed for attach/reuse and policy parity.

4. `interactive-terminal/src/host_bridge_listener.rs`, `interactive-terminal/src/main.rs`
   - Add runtime guardrails for host-only operation contract (especially when server runs in container mode).
   - Ensure instance discovery/attach handshake supports command routing to existing process.

5. `vscode-extension/src/chat/tools/terminal-tool.ts`
   - Keep adapter override parity and ensure canonical interactive calls always target host bridge for interactive mode.
   - Align `memory_terminal_vscode` and canonical MCP semantics so visible-host contract is coherent.

6. Tests
   - `server/src/__tests__/tools/interactive-terminal.test.ts`
   - Add/adjust parity tests to assert **no** in-process fallback for interactive container mode and explicit existing-instance reuse behavior.

### Notes for handoff
- Existing tests currently validate behavior that conflicts with required contract (auto fallback to local in-process interactive path in container scenarios).
- Architectural decision needed: whether allowlisted interactive commands auto-approve (still visible), or still require explicit UI acknowledgement while bypassing warning text.
