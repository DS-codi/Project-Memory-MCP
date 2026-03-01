# Project Memory MCP

Project Memory MCP is a local-first orchestration platform for AI-assisted software delivery.
It combines a Model Context Protocol server, a VS Code extension, a dashboard, and desktop runtime components so multi-agent workflows can persist across sessions.

This README reflects the current repository state (March 2026).

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

## Main components

- `server/`  
  TypeScript MCP server (`project-memory-mcp`, v1.0.0) with build/test scripts and consolidated tool handlers.

- `vscode-extension/`  
  VS Code extension (`project-memory-dashboard`, v0.2.0) with dashboard, commands, chat integration, and tooling bridge.

- `dashboard/`  
  React + TypeScript UI plus dashboard server for API/WebSocket-driven views.

- `interactive-terminal/`  
  Rust + CxxQt + QML interactive runtime endpoint and bridge listener.

- `supervisor/`, `pm-approval-gui/`, `pm-brainstorm-gui/`, `pm-gui-forms/`  
  Rust workspace members for orchestration and desktop form workflows.

## Active utility scripts

The active script set is intentionally small and standardized:

- `install.ps1`
- `install-animated.ps1`
- `run-tests.ps1`
- `interactive-terminal/build-interactive-terminal.ps1`

Detailed arguments and use-cases are documented in:

- `docs/utility-scripts-reference.md`

Legacy helper scripts have been moved to:

- `archive/legacy-scripts/2026-03-01/`

## Quick start (current)

### 0) Run machine preflight

From repo root:

```powershell
.\scripts\preflight-machine.ps1
```

This checks required toolchains and required repository assets before a first-time build.

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
cd "C:\Users\User\Project_Memory_MCP\Project-Memory-MCP\target\release\"
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
  server/
  dashboard/
  vscode-extension/
  interactive-terminal/
  supervisor/
  pm-gui-forms/
  pm-approval-gui/
  pm-brainstorm-gui/
  agents/
  prompts/
  docs/
  archive/
```

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
