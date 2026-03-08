# Project Memory MCP

Project Memory MCP is a local-first orchestration platform for AI-assisted software delivery.
It combines a Model Context Protocol server, a VS Code extension, a dashboard, and desktop runtime components so multi-agent workflows can persist across sessions.

This README reflects the current repository state (early March 2026).

## What this project does

- Provides persistent workspace memory (plans, context, sessions, lineage, and knowledge).
- Orchestrates hub-and-spoke agent workflows with MCP tools.
- Exposes plan and workspace operations through VS Code, MCP, and dashboard interfaces.
- Supports desktop interactive terminal flows for command execution/approval runtime.

## Current architecture

High-level runtime model:

1. VS Code extension hosts chat participant, dashboard webview, and MCP bridge.
2. MCP server (`server/`) exposes consolidated tools and stores structured state.
3. Dashboard (`dashboard/`) provides web/API views over workspace + plan state.
4. Supervisor and GUI binaries (Rust/QML) support orchestration and UX flows.
5. Interactive terminal (Rust/CxxQt/QML) provides host runtime bridge behavior.

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

- `vscode-extension/`  
  VS Code extension (`project-memory-dashboard`, v0.2.0) with dashboard, commands, chat integration, and tooling bridge.

- `dashboard/`  
  React + TypeScript UI plus dashboard server for API/WebSocket-driven views.

- `interactive-terminal/`  
  Rust + CxxQt + QML interactive runtime endpoint and bridge listener.

- `interactive-terminal/pty-host/`  
  Out-of-process PTY host binary (Cargo workspace member) for the interactive terminal GUI.

- `python-core/memory_cartographer/`  
  Python cartography engine and schema producer. Runs as a subprocess invoked by the MCP server via single-line NDJSON on stdin/stdout. Handles file-system scanning, symbol extraction, dependency graph resolution, and database schema cartography.

- `supervisor/`, `pm-approval-gui/`, `pm-brainstorm-gui/`, `pm-gui-forms/`  
  Rust workspace members for orchestration and desktop form workflows.

## Active utility scripts

The active script set is intentionally small and standardized:

- `install.ps1`
- `new-install.ps1`
- `install-animated.ps1`
- `run-tests.ps1`
- `interactive-terminal/build-interactive-terminal.ps1`
- `scripts/preflight-machine.ps1`
- `scripts/folder_cleanup/*.py` (non-destructive cleanup + organization helpers)

Detailed arguments and use-cases are documented in:

- `docs/utility-scripts-reference.md`

### Integration harness

The `scripts/` directory also contains an integration test harness suite for container-based validation:

- `integration-harness-matrix.ps1` — Matrix test runner (smoke/fault/resilience tiers)
- `integration-harness-lifecycle.ps1` — Podman Compose lifecycle (up/down/restart/reset)
- `integration-harness-readiness.ps1` — Startup readiness gate
- `integration-harness-fault-runner.ps1` — Fault injection runner
- `integration-harness-recovery-assertions.ps1` — Recovery assertion checks
- `integration-harness-event-aggregate.ps1` — Event aggregation
- `integration-harness-health-timeline.ps1` — Health timeline tracking
- `integration-harness-extension-headless.ps1` — Headless extension testing
- `integration-harness-extension-reconnect.ps1` — Extension reconnect scenarios
- `integration-harness-run-summary.ps1` — Run summary generation

Integration harness design and contracts are documented in `docs/integration-harness/`.

Legacy helper scripts have been moved to:

- `archive/legacy-scripts/2026-03-01/`

## Quick start (current)

### 0) Run machine preflight

From repo root:

```powershell
.\scripts\preflight-machine.ps1
```

This checks required toolchains and required repository assets before a first-time build.

### 0.5) First-time install (Wizard)

For a guided experience that installs Project Memory MCP to your user directories and sets up your environment:

```powershell
.\install-wizard.ps1
```

This is the recommended way to "install" the system into your OS (setting up PATH, PM_DATA_ROOT, and permanent binaries).

### 0.6) First-time cross-machine install + migration

For more advanced data migration and repo-local setup:

```powershell
.\new-install.ps1
```

### 1) Prerequisites

- Node.js 20+
- npm 9+
- VS Code 1.109+
- Rust toolchain (`cargo`, `rustc`)
- Qt 6 MSVC kit (default path used by scripts: `C:\Qt\6.10.2\msvc2022_64`)
- PowerShell 7+

### 2) Build/install core components

From repo root:

```powershell
.\install.ps1 -Component Server
.\install.ps1 -Component Extension
```

Available `-Component` values: `Server`, `Extension`, `Container`, `Supervisor`, `InteractiveTerminal`, `Dashboard`, `GuiForms`, `All`.

`-Component All` expands to: Supervisor → GuiForms → InteractiveTerminal → Server → Dashboard → Extension.

Optional full build pass:

```powershell
.\install.ps1 -Component All
```

For a clean-machine DB bootstrap during server install:

```powershell
.\install.ps1 -Component Server -NewDatabase
```

### 3) Run tests

```powershell
.\run-tests.ps1
```

Targeted example:

```powershell
.\run-tests.ps1 -Component Extension -TailLines 120 -FullOutputOnFailure
```

### 4) Build interactive terminal

```powershell
cd interactive-terminal
.\build-interactive-terminal.ps1 -Clean -Profile release
```

### 5) Launch supervisor (preferred)

`launch-supervisor.ps1` is archived. Use direct executable launch:

```powershell
cd "C:\Users\<username>\Project-Memory-MCP\Project-Memory-MCP\target\release\"
.\supervisor.exe
```

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

## MCP tool surface (current)

Primary consolidated tools:

- `memory_workspace`
- `memory_plan`
- `memory_steps`
- `memory_context`
- `memory_agent`
- `memory_session` — agent session management: prep, deploy_and_prep, list_sessions, get_session
- `memory_brainstorm` — GUI form routing: route, route_with_fallback, refine

Additional runtime/tooling surfaces in active use:

- `memory_terminal`
- `memory_filesystem`
- `memory_terminal_interactive`
- `memory_terminal_vscode`
- `memory_spawn_agent` (prep-only context builder)

## Data and state model

- MCP server state is DB-backed (SQLite-based storage used by the server runtime).
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
  dashboard/                   # React + TypeScript dashboard UI
  vscode-extension/            # VS Code extension
  interactive-terminal/        # Rust + CxxQt + QML interactive terminal
    pty-host/                  # Out-of-process PTY host (Cargo member)
  python-core/                 # Python cartography engine
    memory_cartographer/
  supervisor/                  # Rust orchestration supervisor
  pm-gui-forms/                # Rust desktop form workflows
  pm-approval-gui/             # Rust approval GUI
  pm-brainstorm-gui/           # Rust brainstorm GUI
  agents/                      # Permanent agent definitions
  prompts/                     # Prompt templates
  scripts/                     # Preflight + integration harness scripts
  database-seed-resources/     # DB reproducibility packages
  docs/
    cartography/               # Database schema cartography artifacts
    guide/                     # CLI reference guides (Gemini, Copilot)
    integration-harness/       # Integration test framework docs
    design docs/               # Architecture design documents
  archive/
```

## Database cartography

The `python-core/memory_cartographer` engine produces comprehensive database documentation artifacts under `docs/cartography/`:

- Unified schema model (tables, indexes, FK edges, triggers)
- Relation graph with centrality rankings and hub detection
- Migration lineage and schema drift reports
- Code-to-DB symbol mapping and touchpoint analysis

See `docs/cartography/db/unified-cartography-model.md` for the master reference.

## Container notes

- Container assets remain in `Containerfile`, `podman-compose.yml`, and `container/`.
- Build via install script:

```powershell
.\install.ps1 -Component Container
```

## Why this README changed

The repo has diverged substantially from older snapshots (large file and feature deltas, major tooling and runtime changes).  
Comparison artifacts used during this refresh include:

- `folder-diff-details.json`
- `folder-diff-report.md`
- `same-name-file-diff-report.md`

This README is now aligned with the current scripts, component boundaries, and launch flows.

## Contributing and maintenance

- Prefer updating docs with any script/tool contract changes.
- Keep script usage centralized in `docs/utility-scripts-reference.md`.
- Keep legacy workflows archived, not active, unless intentionally restored.

## License

MIT
