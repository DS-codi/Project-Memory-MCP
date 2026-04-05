# Project Memory MCP

Project Memory MCP is a local-first orchestration platform for AI-assisted software delivery.
It combines a Model Context Protocol server, a VS Code extension, a dashboard, and desktop runtime components so multi-agent workflows can persist across sessions.

This README reflects the current repository state (April 2026).

## What this project does

- Provides persistent workspace memory (plans, context, sessions, lineage, and knowledge).
- Orchestrates hub-and-spoke agent workflows with MCP tools.
- Exposes plan and workspace operations through VS Code, MCP, and dashboard interfaces.
- Supports desktop interactive terminal flows for command execution/approval runtime.
- Routes all MCP traffic through a per-session stdio proxy (`client-proxy`) for graceful degradation when the supervisor is restarting.

## Current architecture

High-level runtime model:

1. VS Code extension hosts chat participant, dashboard webview, and MCP bridge.
2. MCP server (`server/`) exposes consolidated tools and stores structured state.
3. Dashboard (`dashboard/`) provides web/API views over workspace + plan state.
4. Supervisor and GUI binaries (Rust/QML) support orchestration and UX flows.
5. Interactive terminal (Rust/CxxQt/QML) provides host runtime bridge behavior.
6. **Client-proxy** (`client-server/`) sits between each Claude Code/VS Code session and the supervisor's HTTP MCP server via stdio, providing transparent forwarding and local SQLite fallback when the supervisor is unreachable.

### MCP connectivity model

```
Claude Code / VS Code
    └─ stdio → client-proxy (per-session, ~2–5 MB RAM)
                ├─ Always local: runtime_mode, ping
                ├─ Local-capable (direct SQLite when supervisor down):
                │    memory_workspace, memory_plan, memory_steps, memory_instructions
                └─ HTTP → supervisor MCP server (all tool calls when reachable)
```

**Supervisor UP:** every tool call is forwarded to the supervisor — proxy is transparent.
**Supervisor DOWN:** local-capable tools are served directly from the SQLite database. Other tools return an informative error. The tool list presented to the client is always identical regardless of supervisor state.

## Agent architecture

Project Memory MCP uses a **dynamic hub-and-spoke agent model** with four permanent agent definitions and one blank-slate spoke:

- **Hub** — Permanent orchestration agent. Owns the full plan lifecycle: registers the workspace, routes through PromptAnalyst, pulls role definitions from the database, composes complete spawn prompts, deploys Shell spokes, and validates completion after every spoke returns. Hub never implements code directly.

- **PromptAnalyst** — Permanent investigation and routing spoke. Reads code, plan state, and sessions to classify each incoming request. Returns a structured routing decision (hub mode, scope classification, pre-gathered code references, constraints) that Hub uses to select and provision the right Shell role.

- **Architect** — Permanent design spoke. Reads research findings and creates the implementation plan — atomic steps with clear phases, goals, and success criteria. Does not write source code.

- **Shell** — Blank-slate execution spoke. Receives a self-contained prompt from Hub containing its role instructions (fetched from the DB), task, complete context, session identifiers (`workspace_id`, `plan_id`, `session_id`, `current_phase`, `step_indices`), scope boundaries, and step update protocol. Shell does not self-gather context.

Role instructions for spoke roles (Researcher, Executor, Reviewer, Tester, Revisionist, Archivist, Worker, Brainstorm) are stored in the MCP SQLite database and fetched at spawn time via `memory_agent(action: get_instructions)`. Hub, PromptAnalyst, Architect, and Shell are maintained as permanent `agents/*.agent.md` files.

See [`docs/design docs/dynamic-hub-architecture.md`](docs/design%20docs/dynamic-hub-architecture.md) for the complete architecture specification.

## Main components

- `server/`
  TypeScript MCP server (`project-memory-mcp`, v1.0.0) with build/test scripts and consolidated tool handlers.

- `client-server/`
  Rust crate producing `client-proxy.exe` — a lightweight stdio MCP proxy. Each Claude Code/VS Code session spawns its own instance. Provides graceful degradation (direct SQLite access for key tools) when the supervisor is not reachable, and transparent HTTP forwarding when it is. See [Architecture](#mcp-connectivity-model).

- `pm-cli/`
  Rust TUI build orchestrator. Primary tool for building, deploying, and installing all project components. Handles component builds (native Rust and PowerShell fallbacks for Qt), binary deployment to the install directory, GlobalClaude install (agent files + MCP registration + Task Scheduler autostart), and supervisor launch.

- `vscode-extension/`
  VS Code extension (`project-memory-dashboard`, v0.2.0) with dashboard, commands, chat integration, and tooling bridge.

- `dashboard/`
  React + TypeScript UI plus dashboard server for API/WebSocket-driven views.

- `interactive-terminal/`
  Rust + CxxQt + QML interactive runtime endpoint and bridge listener.

- `interactive-terminal/pty-host/`
  Out-of-process PTY host binary (Cargo workspace member) for the interactive terminal GUI.

- `interactive-terminal-iced/`
  Pure Rust / iced 0.13 re-implementation of the interactive terminal GUI. Runs as an `iced::daemon` with multiple windows, embeds an xterm.js terminal area via a `wry` WebView2 OS window, and communicates with `pm-cli` over a local TCP bridge. Coexists alongside the CxxQt/QML `interactive-terminal`; no Qt dependency. **Windows only** for full WebView2 support; the iced/TCP logic is cross-platform. Build with `.\build-interactive-terminal-iced.ps1`.

- `python-core/memory_cartographer/`
  Python cartography engine and schema producer. Runs as a subprocess invoked by the MCP server via single-line NDJSON on stdin/stdout. Handles file-system scanning, symbol extraction, dependency graph resolution, and database schema cartography.

- `supervisor/`, `pm-approval-gui/`, `pm-brainstorm-gui/`, `pm-gui-forms/`
  Rust workspace members for orchestration and desktop form workflows. The QML-based `supervisor.exe` is the primary runtime supervisor.

- `supervisor-iced/`
  Work-in-progress Iced-based Rust supervisor (alternative backend, not yet production). Built by pm-cli alongside the QML supervisor; the deployed `supervisor.exe` is the QML version.

## pm-cli — build and deploy

`pm-cli` is the primary build and install tool. Run it from `target/release/pm-cli.exe` (or the deployed install directory) for an interactive TUI, or pass subcommands directly.

### TUI mode

```
pm-cli
```

Navigate with arrow keys. Select a component to build or deploy. The install directory is shown in the footer and can be changed with `D`.

### CLI mode

```
pm-cli install  <component>           # build component
pm-cli deploy   <component> [--dir PATH] [--no-shortcuts]  # copy artifacts to install dir
pm-cli launch   [supervisor|supervisor-iced]               # launch supervisor binary
pm-cli global-claude                  # run Global Claude Code install
pm-cli status                         # show install status
```

### Available components

| Component | Description |
|-----------|-------------|
| `Supervisor` | QML-based supervisor (PowerShell/Qt build) |
| `SupervisorIced` | Iced-based supervisor (native Rust build) |
| `GuiForms` | Approval + brainstorm GUI windows |
| `InteractiveTerminal` | Interactive terminal host |
| `Server` | TypeScript MCP server |
| `Dashboard` | React dashboard |
| `Extension` | VS Code extension |
| `Cartographer` | Python cartography engine |
| `ClientProxy` | stdio MCP proxy binary |
| `GlobalClaude` | Global Claude Code install (agents + MCP + autostart) |
| `All` | All of the above in order |

### GlobalClaude install

`pm-cli global-claude` (or component `GlobalClaude`) performs:

1. Copies `agents/*.agent.md` files to `~/.claude/agents/`
2. Registers three MCP servers in `~/.claude/settings.json` as stdio entries pointing at `client-proxy.exe`:
   - `project-memory-cli` → `http://127.0.0.1:3466/mcp`
   - `project-memory` → `http://127.0.0.1:3457/mcp`
   - `pmmcp` → `http://127.0.0.1:3467/mcp`
3. Adds all `mcp__project-memory*__` tool permissions to the Claude Code allowlist
4. Writes `supervisor.toml` to the install base directory
5. Registers `supervisor.exe` as a Windows Task Scheduler logon task (`ProjectMemorySupervisor`)

Recommended first-install order:

```
1. pm-cli install  ClientProxy    # build client-proxy.exe (release)
2. pm-cli deploy   ClientProxy    # copy to install dir
3. pm-cli install  GlobalClaude   # write settings.json with correct proxy path
4. pm-cli install  Server         # build TypeScript server
5. pm-cli deploy   Server
6. Restart Claude Code
```

## Quick start

### Prerequisites

- Node.js 20+
- npm 9+
- VS Code 1.109+
- Rust toolchain (`cargo`, `rustc`)
- Qt 6 MSVC kit (default path: `C:\Qt\6.10.2\msvc2022_64`) — required for Supervisor/GuiForms/InteractiveTerminal
- PowerShell 7+

### 1) Run machine preflight

```powershell
.\scripts\preflight-machine.ps1
```

### 2) Build pm-cli first

`pm-cli` is the build tool itself, so build it with cargo before using it:

```
cargo build --release -p pm-cli
```

The release binary lands at `target/release/pm-cli.exe`.

### 3) Build and deploy all components

```
pm-cli install All
pm-cli deploy  All
```

Or use the TUI (`pm-cli` with no args) for interactive component selection.

### 4) Global Claude Code setup

```
pm-cli global-claude
```

Then restart Claude Code to pick up the new MCP server registrations.

### 5) Launch supervisor

The supervisor is registered as a Task Scheduler logon task by GlobalClaude install and starts automatically on login. To start manually from the install directory:

```powershell
supervisor.exe --config "%APPDATA%\ProjectMemory\supervisor.toml"
```

Or via pm-cli:

```
pm-cli launch supervisor
```

### 6) Run tests

```powershell
.\run-tests.ps1
```

## Mobile App Setup

The Project Memory mobile app connects to the Supervisor over LAN.

### 1. Open Windows Firewall ports (run once as Administrator)

```powershell
.\scripts\setup-firewall-mobile.ps1
```

This opens inbound TCP ports **3464** (Supervisor HTTP) and **3458** (Terminal WebSocket).

### 2. Pair the mobile app

1. Right-click the Project Memory tray icon → **"Show Pairing QR"**
2. Open the Project Memory mobile app → tap **Scan QR Code**

### Port reference

| Component | Protocol | Port |
|-----------|----------|------|
| Supervisor HTTP | TCP | 3464 |
| CLI MCP server | TCP | 3466 |
| MCP server (main) | TCP | 3457 |
| Claude MCP server | TCP | 3467 |
| Interactive Terminal | WebSocket | 3458 |
| Dashboard | TCP | 3459 |

## Build/test command map

### Server

- Build: `npm run build` (in `server/`)
- Test: `npx vitest run` (in `server/`)

### Dashboard

- Dev: `npx vite` (in `dashboard/`)
- Build: `npx vite build` (in `dashboard/`)
- Test: `npx vitest run` (in `dashboard/`)

### VS Code extension

- Install deps: `npm install` (in `vscode-extension/`)
- Compile: `npm run compile`
- Test: `npm run test`
- Package: `npx @vscode/vsce package`

### Rust workspace

- Build all: `cargo build --release`
- Build specific: `cargo build --release -p <crate>`
- Crates: `pm-cli`, `client-proxy` (in `client-server/`), `supervisor`, `supervisor-iced`, `pm-gui-forms`, `pm-approval-gui`, `pm-brainstorm-gui`, `interactive-terminal`, `interactive-terminal-iced`, `pty-host`, `cartographer`

## MCP tool surface (current)

Primary consolidated tools:

- `memory_workspace`
- `memory_plan`
- `memory_steps`
- `memory_context`
- `memory_agent`
- `memory_session` — agent session management: prep, deploy_and_prep, list_sessions, get_session
- `memory_brainstorm` — GUI form routing: route, route_with_fallback, refine
- `memory_instructions`
- `memory_sprint`

Runtime tools (always available via client-proxy, no supervisor required):

- `runtime_mode` — proxy status: connected, client_type, uptime, last_connected
- `ping` — always returns `pong`

Additional runtime/tooling surfaces:

- `memory_terminal`
- `memory_filesystem`
- `memory_terminal_interactive`
- `memory_terminal_vscode`

## Data and state model

- MCP server state is DB-backed (SQLite at `%APPDATA%\ProjectMemory\project-memory.db`).
- WAL mode is enabled; client-proxy reads the same database concurrently when the supervisor is down.
- Workspace identity and project-scoped artifacts also live under each repo in `.projectmemory/`.
- Plan/workspace/session context is persisted and reused across agent sessions.

## Cross-machine DB reproducibility

- Reproducibility package root: `database-seed-resources/reproducibility/`
- Export on source machine: `npm run repro:export` (from `server/`)
- Import on target machine: `npm run repro:import` (from `server/`)
- Runbook: `docs/db-rebuild-runbook.md`

## Repository layout

```text
Project-Memory-MCP/
  server/                      # TypeScript MCP server
  client-server/               # Rust: client-proxy stdio MCP proxy
  pm-cli/                      # Rust: TUI build/deploy/install orchestrator
  dashboard/                   # React + TypeScript dashboard UI
  vscode-extension/            # VS Code extension
  interactive-terminal/        # Rust + CxxQt + QML interactive terminal
    pty-host/                  # Out-of-process PTY host (Cargo member)
  interactive-terminal-iced/   # Rust + iced 0.13 interactive terminal (no Qt)
  python-core/                 # Python cartography engine
    memory_cartographer/
  supervisor/                  # Rust + QML orchestration supervisor (primary)
  supervisor-iced/             # Rust + Iced supervisor (work in progress)
  pm-gui-forms/                # Rust desktop form workflows
  pm-approval-gui/             # Rust approval GUI
  pm-brainstorm-gui/           # Rust brainstorm GUI
  agents/                      # Permanent agent definitions
  prompts/                     # Prompt templates
  scripts/                     # Preflight + integration harness scripts
  database-seed-resources/     # DB reproducibility packages
  docs/
    cartography/               # Database schema cartography artifacts
    guide/                     # CLI reference guides
    integration-harness/       # Integration test framework docs
    design docs/               # Architecture design documents
    session-history/           # Session summaries documenting major changes
  archive/
```

## Database cartography

The `python-core/memory_cartographer` engine produces comprehensive database documentation artifacts under `docs/cartography/`:

- Unified schema model (tables, indexes, FK edges, triggers)
- Relation graph with centrality rankings and hub detection
- Migration lineage and schema drift reports
- Code-to-DB symbol mapping and touchpoint analysis

See `docs/cartography/db/unified-cartography-model.md` for the master reference.

## Integration harness

The `scripts/` directory contains an integration test harness suite for container-based validation:

- `integration-harness-matrix.ps1` — Matrix test runner (smoke/fault/resilience tiers)
- `integration-harness-lifecycle.ps1` — Podman Compose lifecycle (up/down/restart/reset)
- `integration-harness-readiness.ps1` — Startup readiness gate
- `integration-harness-fault-runner.ps1` — Fault injection runner
- `integration-harness-recovery-assertions.ps1` — Recovery assertion checks

Integration harness design and contracts are documented in `docs/integration-harness/`.

## Container notes

- Container assets remain in `Containerfile`, `podman-compose.yml`, and `container/`.
- Build via pm-cli: `pm-cli install Container`

## Contributing and maintenance

- Prefer updating docs with any script/tool contract changes.
- Keep script usage centralized in `docs/utility-scripts-reference.md`.
- Keep legacy workflows archived, not active, unless intentionally restored.
- Session history summaries for major changes live in `docs/session-history/`.

## License

MIT
