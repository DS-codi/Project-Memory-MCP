# Project Memory MCP — Executive Summary

This is a concise onboarding summary of the Project Memory MCP platform. For full technical depth, see [docs/system-overview.md](docs/system-overview.md).

---

## What this system is

Project Memory MCP is a local-first platform that gives AI coding workflows durable memory and structure. It enables multi-agent execution across sessions with persistent plans, context, handoffs, and workspace history.

In practice, it turns one-off chat interactions into a reproducible delivery workflow.

---

## Why it exists

Typical AI coding sessions lose context between runs and lack reliable coordination. This system addresses that by:

- Persisting plan state, context, and handoff lineage to disk
- Enforcing explicit lifecycle transitions (`init` → `validate` → work → `handoff` → `complete`)
- Separating orchestration from execution through a hub-and-spoke agent model
- Providing both editor-native and dashboard-native operational surfaces

---

## Core architecture (4 runtime layers)

1. **VS Code layer**
   - Extension provides `@memory` chat participant, tool routing, deployers, and dashboard embedding.

2. **MCP server layer**
   - Consolidated tool engine and system-of-record for workspace/plan/step/context/agent lifecycle.

3. **Persistence layer**
   - File-based data store (`data/`) holding workspace registry, plans, context, knowledge, and lineage.

4. **Terminal execution layer**
   - Headless server-side terminal path + host interactive terminal path (Rust/CxxQt runtime).

---

## Major components and roles

### `server/`

The core platform backend. It handles tool calls, state mutation, storage safety, transport modes, and security hardening.

### `vscode-extension/`

The editor control plane. It bridges Copilot/chat workflows to MCP tools, manages server connectivity, and deploys operational assets (agents/prompts/instructions/skills).

### `dashboard/`

A React + Express operations console for monitoring and managing plans, workspaces, agents, scripts, and context with live updates.

### `interactive-terminal/`

Native host runtime for interactive terminal command lifecycle (approval/routing/execution), used when workflows require host-visible execution.

### `agents/`, `instructions/`, `prompts/`, `skills/`

Behavior/policy knowledge surfaces that define orchestration conventions and execution constraints.

### `data/`

Durable memory substrate shared by all components.

---

## Operating model (agent orchestration)

Project Memory uses a **hub-and-spoke model**:

- Hub agents (primarily Coordinator) orchestrate flow
- Spoke agents (Executor/Reviewer/Tester/etc.) perform scoped work
- Handoffs always return recommendations to hub for next-action routing

This keeps control explicit, auditable, and resumable.

---

## Consolidated tool API (v2 concept)

The primary tool surface is organized around five core domains:

- `memory_workspace` — workspace identity/profile lifecycle
- `memory_plan` — plan/program/build-script lifecycle
- `memory_steps` — granular step progression and ordering
- `memory_context` — context/research/knowledge persistence
- `memory_agent` — session lifecycle, validation, handoffs, lineage

Together, these form the durable orchestration contract.

---

## Security and safety posture

- Workspace-scoped filesystem boundaries
- Allowlist-first headless terminal model
- Explicit contracts for host interactive execution paths
- Sanitization and injection-aware handling in server-side flows
- Scope guardrails for subagent execution

---

## Typical workflow snapshot

1. Register/select workspace
2. Create or load plan
3. Initialize and validate active agent
4. Execute steps with status transitions
5. Run review/build/test loops
6. Record handoffs and completion
7. Archive and reindex when done

Result: consistent, inspectable progress over long-running tasks.

---

## When to use this system

Use Project Memory MCP when you need:

- Multi-session continuity for AI-assisted development
- Structured collaboration across specialized agents
- Traceable plan execution and decision history
- Editor-integrated operational tooling plus dashboard observability

---

## Quick links

- Full system detail: [docs/system-overview.md](docs/system-overview.md)
- Platform architecture and setup: [README.md](README.md)
- Tooling contract: [instructions/mcp-usage.instructions.md](instructions/mcp-usage.instructions.md)
- Handoff/orchestration protocol: [instructions/handoff-protocol.instructions.md](instructions/handoff-protocol.instructions.md)
