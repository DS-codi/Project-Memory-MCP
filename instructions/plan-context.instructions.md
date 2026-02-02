---
applyTo: "**/*"
---

# Plan Context Files

This workspace uses file-based context storage for persistent plan state.

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

## Writing Context

Use `memory_context` (action: store) to save findings:
```
memory_context (action: store) with
  workspace_id: "...",
  plan_id: "...",
  type: "research|architecture|review|audit",
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
