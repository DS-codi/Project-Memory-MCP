---
applyTo: "**/*"
---

# Agent Deployment (`deploy_for_task`) Lifecycle

On-demand agent and context deployment into `.projectmemory/active_agents/`. Hub agents call `deploy_for_task` before spawning subagents to ensure each agent has its context bundle ready.

---

## Directory Structure

When `deploy_for_task` is called, the following is written to the workspace:

```
.projectmemory/active_agents/{AgentName}/
├── {AgentName}.agent.md          # Agent instruction file
├── manifest.json                 # Deployment metadata
├── context/
│   └── context-bundle.json       # Assembled context bundle
└── instructions/
    └── *.md                      # Matched instruction files
```

Only one agent of each type is active at a time. Redeployment overwrites the previous bundle.

---

## Context Bundle Contents

The `context-bundle.json` is assembled from up to 8 sources (graceful fallback if any are missing):

| Source | Key | Description |
|--------|-----|-------------|
| Research notes | `research` | Researcher/Analyst findings from `research_notes/` |
| Architecture decisions | `architecture` | Design decisions from `architecture.json` |
| Handoff data | `handoff` | Last agent's handoff payload (includes execution notes) |
| Phase context | `phase_context` | Phase-scoped context markers |
| Matched skills | `skills` | Skills matching the current task domain |
| Instruction files | `instructions` | Agent-specific instruction `.md` files |
| Workspace context | `workspace_context` | Workspace-scoped context summary |
| Knowledge files | `knowledge` | Workspace knowledge entries |

### Execution Notes (Revisionist Context)

When Coordinator deploys Revisionist after a failure, the `execution_notes` field in the context bundle contains the failed agent's error context, blockers, and debugging notes — extracted from the handoff data.

---

## Lifecycle

```
1. Hub calls deploy_for_task
   └─ Writes agent .md, manifest, context bundle, instructions

2. Hub calls runSubagent (native spawn)
   └─ Subagent executes, reads context from .projectmemory/active_agents/{name}/

3. Subagent calls memory_agent(action: handoff)
   └─ Cleanup hook fires:
      a. Execution notes → .projectmemory/reviewed_queue/{planId}/{name}_{timestamp}/
      b. active_agents/{name}/ directory removed

4. Subagent calls memory_agent(action: complete)
   └─ Same cleanup hook fires (idempotent, skips if already cleaned)
```

---

## Context Persistence Markers

Architect can mark context items with persistence scope:

| Marker | Behavior |
|--------|----------|
| `phase-persistent` | Context survives across agents within the same phase. Included in every `deploy_for_task` call for that phase. |
| `single-agent` | Context is consumed by one agent and removed after cleanup. |

Default is `single-agent` if no marker is set.

---

## How Agents Read Their Context

Agents don't need special tools to access deployed context. The bundle is available at a known path:

```
.projectmemory/active_agents/{AgentName}/context/context-bundle.json
```

Agents can also use `memory_filesystem(action: read, path: ".projectmemory/active_agents/{name}/context/context-bundle.json")` to read the bundle through the MCP filesystem tool.

---

## Cleanup Behavior

### On Handoff
- `execution_notes` from handoff data are written to `reviewed_queue/{planId}/{name}_{timestamp}/`
- The `active_agents/{name}/` directory is removed
- Cleanup is non-fatal — failures are logged but don't block the handoff

### On Complete
- Same cleanup runs (idempotent — skips if directory already removed by handoff cleanup)

### Manual Cleanup
Not needed. The lifecycle is fully managed by the handoff and complete hooks in `memory_agent`.

---

## Reviewed Queue

After cleanup, execution notes are preserved for review:

```
.projectmemory/reviewed_queue/{planId}/{AgentName}_{timestamp}/
└── execution_notes.json
```

This allows Coordinators and Reviewers to audit past agent work without losing context.
