---
applyTo: "**/*"
---

# Plan and Workspace Context Storage

This workspace uses DB-backed context storage for persistent plan and workspace state.

## Storage Locations

Plan/workspace context is stored in SQLite (`context_items`), keyed by parent scope:
- `parent_type = "plan"`, `parent_id = {plan_id}` for plan context and research notes
- `parent_type = "workspace"`, `parent_id = {workspace_id}` for workspace context

Plan/runtime tool logs are DB-backed as session records in `context_items`:
- plan scope: `type = "tool_log_session:{session_id}"` under `parent_type = "plan"`
- runtime scope: `type = "runtime_log_session:{session_id}"` under `parent_type = "workspace"`

Retention policy:
- Keep only the latest 3 session log records per scope.

Related artifacts may still be materialized under `.projectmemory/` for prompts, tool-response mirroring, and exports.

## Reading Context

Use `memory_plan` (action: get) to fetch current plan state including:
- Steps and their statuses
- Current phase
- Agent sessions history
- Lineage (handoff history)

Use `memory_context` (action: get) to read specific context types:
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

Use `memory_context` (action: store) to save findings in DB:
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
