# Project Memory MCP — System Overview

This document describes the Project Memory MCP system as a whole and its granular components, including runtime boundaries, data flow, module responsibilities, and operational surfaces.

---

## 1) System-at-a-Glance

Project Memory MCP is a local-first multi-agent orchestration platform for software work. It combines:

- A **TypeScript MCP server** with consolidated tools for workspace/plan/step/context/agent lifecycle.
- A **VS Code extension** that exposes tools to Copilot, provides `@memory` chat commands, and renders a dashboard.
- A **React dashboard** (frontend + API + WebSocket) for visual plan/workspace/agent operations.
- A **Rust + CxxQt + QML interactive terminal runtime** for host-side interactive terminal approval/execution flows.
- A **file-based data layer** used as persistent memory across sessions, plans, and workspaces.

Primary value: persistent memory + reproducible multi-agent workflows across coding sessions.

---

## 2) High-Level Architecture

```
VS Code / Copilot / @memory chat
        │
        ▼
VS Code Extension (bridge, tools, deployer, dashboard provider)
        │  (stdio / HTTP)
        ▼
MCP Server (tool execution + storage + orchestration)
        │
        ├── Data Root (workspace registry, plans, context, knowledge)
        ├── Dashboard API/WebSocket (dashboard/server)
        └── Interactive Terminal Routing (headless or host-interactive path)
                │
                ▼
        Rust Interactive Terminal runtime + host bridge
```

### Core runtime contracts

- **Headless terminal**: `memory_terminal` (server-side execution with allowlist constraints).
- **Interactive terminal**: `memory_terminal_interactive` (host-visible/approved flow, routed through runtime/bridge depending mode).
- **Hub-and-spoke agents**: Coordinator as primary hub, specialized spoke agents for implementation/review/test/research.

---

## 3) Top-Level Repository Components

### 3.1 `server/` — MCP Server Core

**Purpose**: Executes MCP tool actions and manages persistent state.

**Key internals (`server/src/`)**

- `tools/`
  - Consolidated and domain-specific tool handlers:
    - workspace, plan, steps, context, agent lifecycle
    - filesystem safety operations
    - terminal adapter/auth/routing helpers
    - prompt/skills/knowledge/workspace-context handling
- `storage/`
  - file-store, locking, workspace identity/registry, mount/hierarchy utilities
- `transport/`
  - stdio + streamable-http + SSE support and transport concerns
- `indexing/`
  - codebase profile detection (language/framework/build metadata)
- `security/`
  - sanitization and injection hardening paths
- `logging/`
  - structured tool call and operational logging
- `events/`
  - event publication for state changes
- `types/`
  - normalized type contracts used across tools/storage

**Operational role**: canonical source of truth for plan/workspace lifecycle.

---

### 3.2 `vscode-extension/` — VS Code Integration Layer

**Purpose**: Brings Project Memory into the editor UX and Copilot toolchain.

**Key internals (`vscode-extension/src/`)**

- `chat/`
  - `ChatParticipant`, command handlers (`/plan`, `/context`, `/handoff`, etc.)
  - MCP bridge/router and tool provider bindings
  - terminal contract helper docs + orchestration helpers
- `commands/`
  - extension command registrations and execution entrypoints
- `providers/`
  - tree/webview providers including dashboard surfaces
- `server/`
  - server process lifecycle and connectivity management
- `deployer/`
  - deploys agents/prompts/instructions/skills into workspace `.github/`
- `watchers/`
  - source watching + optional auto-deploy flows
- `services/`, `utils/`, `ui/`
  - support services, common utilities, UI glue code

**Operational role**: editor-native control plane over MCP capabilities.

---

### 3.3 `dashboard/` — Web Visualization + Operations Console

**Purpose**: Human-readable management UI for workspaces/plans/agents/scripts.

**Sub-components**

- `dashboard/src/` (React frontend)
  - pages for dashboard/plan/workspace/agents/prompts/instructions/context/metrics
  - `components/`, `hooks/`, Zustand `store/`, `api/` client layer
- `dashboard/server/` (Express backend)
  - APIs for workspace/plan/agent data reads and related operations
  - filesystem watchers and WebSocket updates for near-real-time state

**Operational role**: observability + operator tooling for the memory system.

---

### 3.4 `interactive-terminal/` — Native Host Interactive Terminal Runtime

**Purpose**: Secure/explicit host-side command lifecycle for interactive flows.

**Key internals (`interactive-terminal/src/`)**

- `main.rs` — app startup and runtime bootstrap
- `tcp_server.rs` — runtime listener/socket handling
- `host_bridge_listener.rs` — host bridge endpoint for routed calls
- `command_executor.rs` — command execution lifecycle
- `protocol.rs` — message protocol definitions
- `session.rs` — terminal session state model
- `saved_commands*.rs` — saved command persistence/retrieval
- `system_tray.rs` — tray integration lifecycle
- `cxxqt_bridge/` + `qml/` — Rust ↔ Qt/QML UI bridge

**Operational role**: host GUI/runtime endpoint for interactive terminal approval and execution in routed configurations.

---

### 3.5 `agents/`, `prompts/`, `instructions/`, `skills/` — Operational Knowledge Surfaces

- `agents/`: role definitions (Coordinator, Executor, Reviewer, etc.)
- `prompts/`: reusable prompting templates
- `instructions/`: policy/routing/workflow constraints and operational docs
- `skills/`: domain-specific knowledge packs (SKILL.md) used by agents

These artifacts define system behavior and orchestration policy as much as runtime code does.

---

### 3.6 `data/` — Persistent Memory Store

**Purpose**: durable memory across runs.

Contains:

- workspace registry and workspace identity mappings
- per-workspace context, logs, and metadata
- per-plan state/history/notes/research artifacts
- events/log streams and recovery-relevant records

---

### 3.7 Supporting operational assets

- `container/`, `Containerfile`, `podman-compose.yml`, `run-container.ps1`
  - containerized runtime/deployment paths
- `build-and-install.ps1`
  - end-to-end build + extension packaging/install convenience
- `docs/`
  - design notes, contracts, migration plans, troubleshooting, and runbooks
- `reference/`, `archive/`, `backup/`
  - historical/supporting material (backup folder is non-edit operational archive)

---

## 4) Core Data Model

### 4.1 Workspace

A registered project root with:

- canonical workspace identity
- codebase profile (language/framework/build metadata)
- collection of active/archived plans
- workspace-scoped context and knowledge files

### 4.2 Plan

A structured, persistent execution unit:

- category/priority/description
- steps and statuses
- goals/success criteria
- session history and lineage
- optional build scripts
- optional program relationships (multi-plan containers)

### 4.3 Step

Atomic task item in a plan:

- phase + task description
- status (`pending`/`active`/`done`/`blocked`)
- optional assignee, notes, dependencies, confirmation requirements

### 4.4 Context and Knowledge

- **Plan-scoped context**: research, architecture, execution logs, review findings.
- **Workspace-scoped context**: shared, cross-plan operational knowledge.
- **Knowledge files**: reusable long-lived references (schema/conventions/limitations/summaries).

### 4.5 Agent Session + Lineage

- Session records: who did what and artifacts produced.
- Handoff lineage: transition history and recommended next-agent path.

---

## 5) MCP Tooling Surface (Consolidated v2)

Primary consolidated tools:

- `memory_workspace` — register/list/info/reindex/migrate/merge/linking operations
- `memory_plan` — full lifecycle + goals + templates + build scripts + program features
- `memory_steps` — granular step mutation/order operations
- `memory_context` — context/research/knowledge/prompt persistence APIs
- `memory_agent` — init/validate/handoff/complete lifecycle and briefing/lineage support

Extended execution tools used in workflows:

- `memory_terminal` — headless allowlisted execution
- `memory_terminal_interactive` path (or equivalent routed contract) — host-visible execution flows
- workspace-scoped filesystem helpers for safe file operations

---

## 6) Agent-Orchestration Model

### 6.1 Hub-and-spoke control

- **Hub agents** (Coordinator/Analyst/Runner/TDDDriver) may spawn subagents.
- **Spoke agents** execute scoped tasks and hand off recommendations back to hub.
- Default control returns to hub after each spoke completes.

### 6.2 Typical lifecycle

1. Workspace registration/selection
2. Plan creation (or plan retrieval)
3. Agent `init` + `validate`
4. Step progression with status updates
5. Build/test/review loops
6. Handoff/lineage recording
7. Archive/reindex when complete

### 6.3 Scope and recovery constraints

- strict subagent scope boundaries are expected
- interruption recovery includes diff/error/plan-state checks before resuming
- destructive operations require explicit confirmation pathways

---

## 7) Build, Runtime, and Deployment Surfaces

### 7.1 Local development

- Server build/run from `server/`
- Extension compile/package/install from `vscode-extension/`
- Dashboard dev from `dashboard/`
- Interactive terminal build/run from `interactive-terminal/`

### 7.2 Container path

Container assets support remote-ish/self-contained MCP runtime, dashboard serving, and host-bridge interactive routing where configured.

### 7.3 Scripted workflows

Registered build scripts (workspace or plan scoped) are intended to replace ad-hoc command repetition and standardize review/test/build checks.

---

## 8) Security and Safety Posture (Operational)

- workspace-scoped filesystem boundaries
- allowlist-first headless terminal execution model
- blocked destructive command classes unless explicitly permitted by surface contract
- content sanitization and prompt-injection defensive handling in server layers
- explicit approval/routing semantics for interactive terminal paths

---

## 9) Granular Component Map (Quick Reference)

| Area | Sub-component | Primary Responsibility |
|------|---------------|------------------------|
| Server | `tools/*` | MCP action handling and domain behavior |
| Server | `storage/*` | durable state + locking + identity/registry |
| Server | `transport/*` | MCP transport modes and connectivity |
| Server | `security/*` | sanitization and safety controls |
| Extension | `chat/*` | `@memory` participant + command/tool routing |
| Extension | `deployer/*` | deployment of agents/prompts/instructions/skills |
| Extension | `server/*` | server lifecycle management in VS Code |
| Extension | `watchers/*` | source change detection and auto-deploy hooks |
| Dashboard | `src/pages/*` | operator UI workflows |
| Dashboard | `server/src/*` | API + websocket + data access |
| Interactive Terminal | runtime listener | command session runtime endpoint |
| Interactive Terminal | host bridge | external/routed host-side ingress |
| Interactive Terminal | executor/protocol/session | command lifecycle + wire protocol + state |
| Knowledge Surface | `agents/` | role behavior definitions |
| Knowledge Surface | `instructions/` | policy, governance, and operation rules |
| Knowledge Surface | `skills/` | domain expertise packs |
| Data | `data/*` | persistent memory and history |

---

## 10) Suggested Reading Order for New Contributors

1. `README.md` (root architecture and quick start)
2. `instructions/mcp-usage.instructions.md` (tooling contract + terminal surface policy)
3. `instructions/handoff-protocol.instructions.md` (hub-and-spoke orchestration rules)
4. `instructions/mcp-tool-*.instructions.md` (individual tool contracts)
5. `dashboard/README.md` + `interactive-terminal/README.md` (runtime-side operational specifics)
6. `docs/` design notes for advanced flows (dynamic prompts, terminal contracts, programs)

---

## 11) Summary

Project Memory MCP is a layered orchestration platform where **policy artifacts** (agents/instructions/skills) and **runtime code** (server/extension/dashboard/interactive terminal) work together over a **persistent file-based memory substrate**. Its design prioritizes: reproducibility, explicit agent workflow control, durable context, and auditable handoff-driven execution.
