# Project Memory MCP — Full Project Description

**Version**: February 2026  
**Status**: Active Development  
**Repository**: Project-Memory-MCP

---

## 1. Overview

**Project Memory MCP** is a persistent memory and orchestration platform for AI coding agents. It provides structured plan management, agent coordination, and durable context storage via the Model Context Protocol (MCP), enabling multi-session workflows where AI agents can pick up where they (or other agents) left off.

The system is designed around a **hub-and-spoke agent model** where a Coordinator agent orchestrates specialized spoke agents (Executor, Reviewer, Tester, etc.) through structured plans with tracked steps, handoffs, and lineage history — all persisted to disk for cross-session continuity.

### Core Value Proposition

- **Persistent memory** across AI agent sessions — plans, context, research, and execution history survive session boundaries
- **Structured orchestration** — plans with phased steps, status tracking, goals, and success criteria
- **Agent specialization** — 16 purpose-built agents with defined roles, boundaries, and handoff protocols
- **Multi-modal deployment** — local development, containerized server, or hybrid configurations
- **Observability** — real-time dashboard for monitoring plans, agents, workspaces, and execution state

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                         VS Code                               │
│  ┌─────────────────┐  ┌──────────────────────────────────┐   │
│  │  @memory Chat    │  │  Dashboard Sidebar (WebView)      │   │
│  │  Participant     │  │  React + Vite + TailwindCSS       │   │
│  └────────┬────────┘  └──────────────┬───────────────────┘   │
│           │                          │                        │
│  ┌────────┴──────────────────────────┴───────────────────┐   │
│  │              VS Code Extension (TypeScript)            │   │
│  │  Server lifecycle · Agent deploy · File watchers       │   │
│  │  Language model tools · Spawn prep · Interactive term  │   │
│  └────────────────────────┬──────────────────────────────┘   │
└───────────────────────────┼──────────────────────────────────┘
                            │ stdio / HTTP / SSE
┌───────────────────────────┼──────────────────────────────────┐
│  ┌────────────────────────┴──────────────────────────────┐   │
│  │                 MCP Server (TypeScript)                 │   │
│  │  5 consolidated tools · Storage engine · Security      │   │
│  │  Terminal executor · Filesystem safety                 │   │
│  └────────────────────────┬──────────────────────────────┘   │
│                           │                                   │
│  ┌────────────────────────┴──────────────────────────────┐   │
│  │              File-Based Data Store (data/)              │   │
│  │  Workspaces · Plans · Context · Knowledge · Lineage    │   │
│  └───────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────┐  ┌────────────────────────────────┐
│  Interactive Terminal     │  │  Local Supervisor (Rust)        │
│  Rust + CxxQt + QML      │  │  Process registry · Control API │
│  Host-side approval UI   │  │  Named pipe / TCP transport     │
└──────────────────────────┘  └────────────────────────────────┘
```

### Transport Modes

| Mode | Use Case |
|------|----------|
| **stdio** | Default local development — extension manages server lifecycle |
| **HTTP** | Remote or containerized server access |
| **SSE** | Server-Sent Events for streaming connections |

---

## 3. Components

### 3.1 MCP Server (`server/`)

**Language**: TypeScript  
**Purpose**: Core MCP protocol implementation providing persistent memory operations

The server exposes 5 consolidated MCP tools (reduced from 39 individual tools on Feb 3, 2026):

| Tool | Purpose | Key Actions |
|------|---------|-------------|
| `memory_workspace` | Workspace registration and management | register, info, list, reindex, migrate, merge, scan_ghosts |
| `memory_plan` | Plan lifecycle, goals, build scripts, programs | create, get, list, update, archive, delete, set_goals, templates, build scripts, programs |
| `memory_steps` | Granular step manipulation | add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace |
| `memory_context` | Context, research, knowledge storage | store, get, store_initial, append_research, generate_instructions, knowledge CRUD, workspace context |
| `memory_agent` | Agent lifecycle and coordination | init, validate, complete, handoff, get_instructions, deploy, get_briefing, get_lineage |

**Server internals**:
- `tools/` — Action handlers for each consolidated tool, plus orchestration, program, preflight modules
- `storage/` — File-based persistent storage with locking, identity management, workspace registry
- `transport/` — stdio, HTTP, SSE transport implementations
- `security/` — Content sanitization, path traversal prevention, terminal authorization

### 3.2 VS Code Extension (`vscode-extension/`)

**Language**: TypeScript  
**Build**: esbuild  
**Version**: 0.2.0

The extension is the primary user-facing integration point:

- **`@memory` chat participant** — natural language interface for plan management, agent coordination, and workspace operations
- **Language model tools** — VS Code language model tool registrations for MCP operations
- **Dashboard sidebar** — WebView-based React dashboard embedded in the VS Code sidebar
- **Server lifecycle management** — automatic MCP server startup/shutdown, process monitoring
- **Agent/prompt/instruction/skill deployer** — copies operational knowledge files into workspaces
- **File watchers** — auto-deploy on source changes (agents, instructions, skills)
- **Spawn preparation** (`memory_spawn_agent`) — context enrichment for subagent launches (prep-only, not execution)
- **Interactive terminal** (`memory_terminal_interactive`) — visible VS Code terminal creation/management

### 3.3 Dashboard (`dashboard/`)

**Language**: TypeScript  
**Stack**: React 18 + Vite + TailwindCSS + Zustand + TanStack Query  
**Backend**: Express + WebSocket (for real-time updates)

A full management console providing:

| Page | Purpose |
|------|---------|
| Dashboard | Overview with workspace/plan summaries and system health |
| Plans | Plan list with status, progress bars, phase tracking |
| Plan Detail | Step-by-step view with status updates, notes, agent assignments |
| Workspaces | Workspace registry, codebase profiles, identity management |
| Agents | Agent definitions, session history, handoff visualization |
| Programs | Integrated program hierarchy with child plan progress |
| Instructions | Instruction file browser and editor |
| Skills | Skills registry browser |
| Context | Workspace and plan context viewer |
| Metrics | Execution statistics and performance data |

**Key features**:
- Program-aware filtering (show/hide child plans)
- Real-time WebSocket updates from the server
- Step filtering and sorting
- Copy plan ID to clipboard
- Inline SVG icons

### 3.4 Interactive Terminal (`interactive-terminal/`)

**Language**: Rust  
**UI**: CxxQt (C++ bridge) + QML  
**Purpose**: Host-side interactive terminal with approval UI

A native desktop application providing:

- **System tray** integration for background operation
- **TCP server** for receiving command requests from the MCP server
- **Command executor** with session tracking
- **Host bridge listener** for routed terminal operations
- **Output tracking** with `read_output` / `kill` support via TCP
- **QML-based UI** for command approval/rejection

When configured, the MCP server's `memory_terminal` routes commands through this application for host-side approval before execution.

### 3.5 Local Supervisor (`supervisor/`)

**Language**: Rust  
**Status**: In development (Epics A–B complete, C–F planned)  
**Purpose**: Local process supervision for Project Memory components

A Windows-first process supervisor for managing the MCP server, dashboard, and interactive terminal as coordinated processes:

| Epic | Title | Status |
|------|-------|--------|
| A | Supervisor Foundation | ✅ Complete |
| B | Control API + Handshake Transport | ✅ Complete |
| C | Runtime Runners | 🔄 In progress (7/11 steps) |
| D | VS Code Extension Integration | ⏳ Planned (0/13 steps) |
| E | Observability + Operations | ⏳ Planned (0/11 steps) |
| F | Optional Service Mode | ⏳ Planned (0/6 steps) |

**Completed architecture**:
- `config.rs` — TOML-based configuration with process definitions
- `lock.rs` — Cross-process singleton lock
- `registry.rs` — Process registry with lifecycle tracking
- `control/` — Named pipe + TCP transport layer, JSON-RPC protocol, handshake authentication
- `runner/` — Process runner infrastructure (in progress)

### 3.6 Container (`container/`)

**Runtime**: Podman (OCI-compatible)  
**Image**: `project-memory-mcp-project-memory:latest` (332 MB)

Containerized deployment for the MCP server + dashboard:

- `Containerfile` — Multi-stage build (server + dashboard)
- `entrypoint.sh` — Runtime bootstrap
- `podman-compose.yml` — Compose configuration
- `run-container.ps1` — Container lifecycle management (run/stop/logs/status)
- Workspace volume mounts for data persistence
- Proxy support for host workspace access

---

## 4. Agent System

### 4.1 Hub-and-Spoke Model

```
                    ┌───────────────┐
                    │  COORDINATOR  │  ← Primary Hub
                    └───────┬───────┘
           ┌────────┬───────┼───────┬────────┐
           ▼        ▼       ▼       ▼        ▼
        Executor Reviewer Tester Architect  ...
           │        │       │       │        │
           └────────┴───────┴───────┴────────┘
                    Return to Hub
```

**Hub agents** (can spawn subagents):
- **Coordinator** — Primary orchestrator for all plan execution
- **Analyst** — Investigation hub for complex analysis cycles
- **Runner** — Ad-hoc execution for quick tasks
- **TDDDriver** — Test-driven development cycle orchestrator

**Spoke agents** (hand off to hub only):

| Agent | Role |
|-------|------|
| **Executor** | Implements plan steps, writes code |
| **Reviewer** | Code review + build verification |
| **Tester** | Test writing (WRITE mode) and test execution (RUN mode) |
| **Architect** | Plan design with phased steps |
| **Researcher** | External documentation and knowledge gathering |
| **Brainstorm** | Idea exploration and option analysis |
| **Revisionist** | Plan fixes when blockers occur |
| **Archivist** | Plan archival and workspace reindexing |
| **SkillWriter** | Generates SKILL.md files from codebase patterns |
| **Builder** | Build verification (regression check + final verification) |
| **Worker** | Lightweight scoped sub-tasks (≤5 steps) |
| **Cognition** | Read-only reasoning and analysis |

### 4.2 Agent Lifecycle

1. `memory_agent(init)` — Initialize session with workspace/plan context
2. `memory_agent(validate)` — Confirm correct agent for current task
3. Execute work — Update step statuses, modify files, run commands
4. `memory_agent(handoff)` — Recommend next agent to Coordinator
5. `memory_agent(complete)` — End session with summary and artifacts

### 4.3 Safety Mechanisms

- **Scope boundaries** — Explicit file/directory limits in subagent prompts
- **Anti-spawning rules** — Spoke agents cannot spawn other agents
- **Scope escalation** — Agents must hand off if out-of-scope changes needed
- **Recovery protocol** — Git diff, plan state check, error check, user consultation after interruptions
- **Session interruption** — Level 1 (graceful) → Level 2 (immediate) → Level 3 (terminated) stop directives

---

## 5. Data Model

### 5.1 Storage Structure

```
data/
└── {workspace_id}/
    ├── workspace.meta.json          # Workspace metadata
    ├── workspace.context.json       # Workspace-wide context
    ├── knowledge/                   # Knowledge files
    │   └── {slug}.json
    └── plans/
        └── {plan_id}/
            ├── state.json           # Plan state (steps, sessions, lineage)
            ├── original_request.json
            ├── research_findings.json
            ├── architecture.json
            ├── review_findings.json
            └── research_notes/
                └── *.md
```

### 5.2 Core Entities

| Entity | Description |
|--------|-------------|
| **Workspace** | Registered project root with canonical identity, codebase profile, and plan collection |
| **Plan** | Structured execution unit with steps, goals, success criteria, and session history |
| **Program** | Multi-plan container grouping related plans (e.g., Supervisor Epics A–F) |
| **Step** | Atomic task with phase, status (pending/active/done/blocked), assignee, and notes |
| **Context** | Plan-scoped (research, architecture, review) or workspace-scoped (shared notes, preferences) |
| **Knowledge** | Long-lived reusable reference files scoped to a workspace |
| **Session** | Agent session record with artifacts and summary |
| **Lineage** | Handoff history tracking agent transitions and recommendations |

### 5.3 Plan Templates

Pre-built plan structures available via `memory_plan(create_from_template)`:
- Feature, Bugfix, Refactor, Documentation, Analysis, Investigation

---

## 6. Skills System

18 domain-specific knowledge packs stored in `.github/skills/`:

| Skill | Domain |
|-------|--------|
| bugfix | Automated bug-fix orchestration |
| copilot-sdk | GitHub Copilot SDK integration |
| cxxqt-rust-gui | CxxQt GUI applications in Rust |
| embedded-python-launcher | Embedded Python execution |
| job-search-module | Job search functionality |
| message-broker | TCP pub/sub messaging |
| mvc-architecture | Model-View-Controller patterns |
| notion-archive-container-mcp | Notion data archiving |
| notion-custom-mcp | Notion API via MCP |
| pyside6-mvc | PySide6 with MVC |
| pyside6-qml-architecture | PySide6 + QML app structure |
| pyside6-qml-bridge | Python-QML bridge patterns |
| pyside6-qml-models-services | Domain models and services |
| pyside6-qml-views | QML view patterns |
| qml-build-deploy | QML build/deploy workflows |
| react-components | React component patterns |
| refactor | Module refactoring orchestration |
| vscode-chat-response-stream | VS Code chat participant responses |

Skills are matched to agent sessions during `init` and provide domain-specific guidance.

---

## 7. Instruction System

20+ instruction files in `.github/instructions/` defining:

- **Agent behavior** — coordinator-operations, analyst-methodology, runner-operations
- **Handoff protocol** — hub-and-spoke rules, anti-spawning, scope boundaries
- **Tool contracts** — MCP tool reference for each of the 5 consolidated tools
- **Workflow patterns** — MCP usage guidelines, workflow examples, best practices
- **Recovery** — subagent recovery, session interruption, scope guardrails
- **Build scripts** — registered build/test/deploy commands
- **Monolith prevention** — guidelines for avoiding/refactoring large files

---

## 8. Build & Deployment

### 8.1 Build Commands

| Component | Build | Test | Directory |
|-----------|-------|------|-----------|
| Server | `npm run build` | `npx vitest run` | `./server` |
| Dashboard | `npx vite build` | `npx vitest run` | `./dashboard` |
| Extension | `npm run compile` | — | `./vscode-extension` |
| Container | `podman build -t project-memory-mcp-project-memory:latest .` | — | `.` |

### 8.2 Install Script (`install.ps1`)

Comprehensive component-based installer:

```powershell
# Build and install everything
.\install.ps1 -Component All -Force

# Server only
.\install.ps1 -Component Server

# Extension only (compile, package, install)
.\install.ps1 -Component Extension -Force

# Container rebuild
.\install.ps1 -Component Container -Force

# Build without installing
.\install.ps1 -Component Extension -SkipInstall

# Install pre-built extension
.\install.ps1 -Component Extension -InstallOnly
```

### 8.3 Container Deployment

```powershell
# Build
podman build -t project-memory-mcp-project-memory:latest .

# Run
.\run-container.ps1 run

# Status / Logs / Stop
.\run-container.ps1 status
.\run-container.ps1 logs
.\run-container.ps1 stop
```

---

## 9. Current Active Plans

22 active plans as of February 20, 2026:

### Programs (Multi-Plan Containers)

| Program | Child Plans | Status |
|---------|-------------|--------|
| **Platform Evolution Program** | Container Resilience, New MCP Actions, and others | Active |
| **Context-Scoped Orchestration Overhaul** | Category & Intake Engine, Build/Test/Install, Approval Gate GUI | Active |
| **Project Memory Local Supervisor** | Epics A–F | Active |

### Completed Plans (awaiting archival)

| Plan | Progress |
|------|----------|
| Container Resilience & Auto-Mount | 11/11 ✅ |
| New MCP Actions — Context Dump & Plan Export | 12/12 ✅ |
| Fix extension workspace identity canonicalization | 4/4 ✅ |
| Global skills source fallback and unified resolver | 5/5 ✅ |
| Subagent Session Interruption & Injection System | 24/24 ✅ |
| Category & Intake Engine | 15/15 ✅ |
| Epic A — Supervisor Foundation | 10/10 ✅ |

### In-Progress Plans

| Plan | Progress | Current Phase |
|------|----------|---------------|
| MCP Terminal Tool & GUI Approval Flow | 32/41 | Phase 4: GUI Tray-Resident Mode |
| Host-only Interactive Terminal + MCP Integration | 9/11 | Phase 5: Verification |
| Build, Test & Install — Orchestration Overhaul Promotion | 11/14 | Phase 7: Smoke Test |
| Epic C — Runtime Runners | 7/11 | Phase 5: State Machine |
| Interactive Terminal GUI System | 5/7 | Focused Bugfix |
| Session Injection Test | 2/3 | Initialization |

### Planned (Not Yet Started)

| Plan | Steps |
|------|-------|
| Interactive Terminal: MCP Auto-Connect on Launch | 0/14 |
| Epic D — VS Code Extension Integration | 0/13 |
| Epic E — Observability + Operations | 0/11 |
| Epic F — Optional Service Mode | 0/6 |
| Replay Ops Hardening Follow-up | 0/2 |
| Approval Gate GUI | 0/0 (awaiting design) |

---

## 10. Security & Safety

- **Workspace-scoped filesystem** — all paths relative to workspace root, traversal blocked
- **Sensitive file protection** — `.env`, private keys, credentials inaccessible
- **Terminal allowlist** — only pre-approved commands execute in headless mode
- **Destructive command blocking** — `rm`, `del`, `format` etc. rejected
- **Content sanitization** — prompt injection defenses in server layers
- **1 MB read cap** — prevents context overflow from large files
- **Scope boundaries** — subagents receive explicit file/directory limits
- **Anti-spawning** — spoke agents cannot create other agents
- **Session interruption** — 3-level stop directive protocol (graceful → immediate → terminated)

---

## 11. Technology Stack

| Layer | Technology |
|-------|------------|
| MCP Server | TypeScript, Node.js |
| VS Code Extension | TypeScript, esbuild, VS Code API |
| Dashboard Frontend | React 18, Vite, TailwindCSS, Zustand, TanStack Query |
| Dashboard Backend | Express, WebSocket |
| Interactive Terminal | Rust, CxxQt, QML |
| Supervisor | Rust |
| Container | Podman, OCI |
| Testing | Vitest (server, dashboard), Playwright (dashboard E2E) |
| Package Management | npm |
| Version Control | Git |

---

## 12. Project Statistics

| Metric | Value |
|--------|-------|
| Components | 6 (server, extension, dashboard, interactive terminal, supervisor, container) |
| MCP Tools | 5 consolidated + 4 extension-side |
| Agent Types | 16 |
| Skills | 18 |
| Instruction Files | 20+ |
| Active Plans | 22 |
| Archived Plans | 56+ |
| Total Commits | ~80 (Jan 30 – Feb 20, 2026) |
| Languages | TypeScript, Rust, QML |
