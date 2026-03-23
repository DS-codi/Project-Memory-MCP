---
applyTo: "**/*"
---

# Plan and Workspace Context Files

This workspace uses file-based context storage for persistent plan and workspace state.

## Context File Locations

Context files are stored in the plan's data directory:
```
data/{workspace_id}/plans/{plan_id}/
├── state.json              # Current plan state
├── original_request.json   # User's initial request (Researcher/Architect read)
├── research_findings.json  # Research results
├── architecture.json       # Design decisions
├── review_findings.json    # Review results
└── research_notes/         # Detailed research documents
```

Workspace context lives at the workspace root:
```
data/{workspace_id}/
├── workspace.context.json  # Workspace-wide context and notes
├── workspace.meta.json     # Metadata, timestamps, and lineage
└── (update_log, audit_log are stored inside workspace.context.json)
```

## Reading Context

Use `memory_plan` (action: get) to fetch current plan state including:
- Steps and their statuses
- Current phase
- Agent sessions history
- Lineage (handoff history)

Use `memory_context` (action: get) to read specific context files:
```
memory_context (action: get) with
  workspace_id: "...",
  plan_id: "...",
  type: "original_request|research|architecture|review"
```

Use workspace-scoped context when the information applies to the whole workspace:
```
memory_context (action: workspace_get) with
  workspace_id: "..."
```

## Writing Context

Use `memory_context` (action: store) to save findings:
```
memory_context (action: store) with
  workspace_id: "...",
  plan_id: "...",
  type: "research|architecture|review|audit",
  data: { ... }
```

Use workspace-scoped context updates for shared notes, audit entries, or workspace preferences:
```
memory_context (action: workspace_update) with
  workspace_id: "...",
  data: { ... }
```

## Who Reads What

| Agent | Reads | Writes |
|-------|-------|--------|
| Researcher | original_request | research_findings |
| Architect | original_request, research_findings | architecture |
| Executor | architecture, steps | step updates |
| Reviewer | architecture, implementation | review_findings |
| Revisionist | review_findings, errors | modified steps |
