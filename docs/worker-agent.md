# Worker Agent

## Overview

The Worker is a lightweight spoke agent designed for focused, scoped sub-tasks delegated by hub agents (Coordinator, Analyst, Runner). Unlike full spoke agents like Executor or Tester, Workers have strict scope limits and cannot modify plans or spawn subagents.

## When to Use Workers vs Full Spoke Agents

| Use Worker | Use Full Spoke Agent |
|-----------|---------------------|
| Single file change | Multi-file implementation |
| Rename or move a function | Design and implement a feature |
| Fix a typo or lint error | Debug a complex issue |
| Add a single test case | Write comprehensive test suite |
| Quick config update | Architectural changes |
| Task requires ≤ 5 steps | Task requires > 5 steps |

## Worker Capabilities

### What Workers CAN Do

- Read any source file in the workspace
- Create and modify source files within their assigned scope
- Run terminal commands (build, test, etc.)
- Access MCP tools: `memory_agent` (init, handoff, complete), `memory_context` (get, store)
- Report results back to the hub

### What Workers CANNOT Do

- Create, modify, or delete plans (`memory_plan`)
- Create, modify, or delete plan steps (`memory_steps`)
- Archive plans
- Spawn subagents (`runSubagent`)
- Expand scope beyond assigned files

## Worker Lifecycle

### 1. Hub Spawns Worker

A hub agent (Coordinator, Analyst, Runner) spawns a Worker with explicit scope:

```javascript
runSubagent({
  agentName: "Worker",
  prompt: `
    Plan: plan_abc123
    Workspace: my-project-abc123
    
    ## YOUR TASK
    Update the import paths in src/auth/middleware.ts
    
    ## SCOPE
    Files you may modify: src/auth/middleware.ts
    Files you may read: src/auth/*, src/types/*
    
    ## ANTI-SPAWNING RULES
    You are a spoke agent. Do NOT call runSubagent.
    Use memory_agent(action: handoff) to recommend next agent.
  `
});
```

### 2. Worker Initializes

```json
{
  "action": "init",
  "agent_type": "Worker",
  "workspace_id": "my-project-abc123",
  "plan_id": "plan_abc123",
  "context": {
    "deployed_by": "Coordinator",
    "reason": "Update import paths in middleware",
    "file_scope": ["src/auth/middleware.ts"],
    "read_scope": ["src/auth/*", "src/types/*"]
  }
}
```

### 3. Worker Executes

The Worker performs its task within scope limits:
- Reads only files in its read scope
- Modifies only files in its file scope
- Respects step and token budgets

### 4. Worker Reports Back

```json
{
  "action": "handoff",
  "from_agent": "Worker",
  "to_agent": "Coordinator",
  "reason": "Task complete: updated 3 import paths in middleware.ts",
  "data": {
    "files_modified": ["src/auth/middleware.ts"],
    "changes_summary": "Updated 3 import paths from old module to new barrel export"
  }
}
```

## Scope Limits

Workers have built-in limits to prevent runaway execution:

| Limit | Default | Description |
|-------|---------|-------------|
| `max_steps` | 5 | Maximum plan steps a Worker can touch |
| `max_context_tokens` | 50,000 | Maximum context tokens before budget warning |

### Budget Exceeded Handling

If a Worker exceeds its limits, it should:

1. Stop work immediately
2. Store partial progress via `memory_context(action: store)`
3. Set `budget_exceeded: true` in handoff data
4. Hand off to the hub with a recommendation to reassess

The hub agent then decides whether to:
- Split the task into smaller Workers
- Upgrade to a full Executor
- Adjust the scope and retry

### Scope Escalation

If a Worker discovers it needs to modify files outside its scope:

1. Stop work
2. Set `scope_escalation: true` in handoff data
3. Document what additional files are needed
4. Hand off to the hub for scope reassessment

## Hub Agent Guidelines

### Coordinator

The Coordinator includes Worker awareness with decision criteria:

- **Use Worker** for tasks that touch ≤ 3 files and require ≤ 5 steps
- **Use Executor** for multi-file, multi-step implementations
- **Monitor Worker handoffs** for `budget_exceeded` and `scope_escalation` flags

### Analyst / Runner

The Analyst and Runner can also spawn Workers for quick sub-tasks during investigation or ad-hoc execution. Same rules apply: include anti-spawning instructions and explicit file scope.

## Session Tracking

Worker sessions are tracked in the plan's `agent_sessions` array like any other agent. In the dashboard, Worker sessions are displayed with:
- Dashed borders (visually distinct from full agent sessions)
- Italic labels
- Smaller activity bars

## MCP Tools Available to Workers

| Tool | Actions | Purpose |
|------|---------|---------|
| `memory_agent` | `init`, `handoff`, `complete` | Lifecycle management |
| `memory_context` | `get`, `store` | Read/write context data |

Workers explicitly **do not** have access to `memory_plan` or `memory_steps` actions.
