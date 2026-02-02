---
applyTo: "**/*"
---

# Project Memory MCP Usage Guidelines (v2.0)

This workspace uses the **Project Memory MCP** for tracking work across agent sessions.

## Consolidated Tools (v2.0)

The MCP server provides 5 unified tools with action parameters:

| Tool | Actions |
|------|--------|
| `memory_workspace` | `register`, `info`, `list`, `reindex` |
| `memory_plan` | `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `add_note` |
| `memory_steps` | `add`, `update`, `batch_update` |
| `memory_agent` | `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions`, `deploy`, `get_briefing`, `get_lineage` |
| `memory_context` | `get`, `store`, `store_initial`, `list`, `append_research`, `list_research`, `generate_instructions` |

## Required Initialization

Before doing any work, agents MUST:

1. **Call `memory_agent` (action: init)** with your agent type and plan context
2. **Call `memory_agent` (action: validate)** for your agent type
3. **Set up your todo list** from the validation response

## Tool Usage Patterns

### Creating Plans
```
memory_plan (action: create) with
  workspace_id: "...",
  title: "Feature: ...",
  description: "...",
  category: "feature|bug|change|refactor|documentation",
  priority: "low|medium|high|critical"
```

### Updating Step Progress
```
memory_steps (action: update) with
  workspace_id: "...",
  plan_id: "...",
  step_index: 0,
  status: "pending|active|done|blocked"
```

### Recording Handoffs
```
memory_agent (action: handoff) with
  workspace_id: "...",
  plan_id: "...",
  from_agent: "Executor",
  to_agent: "Reviewer",
  reason: "Implementation complete"
```

### Completing Agent Sessions
```
memory_agent (action: complete) with
  workspace_id: "...",
  plan_id: "...",
  agent_type: "Executor",
  summary: "Completed all steps..."
```

## Hub-and-Spoke Model

- **Coordinator** is the hub - it spawns all other agents
- Other agents are **spokes** - they complete tasks and return to Coordinator
- Use `memory_agent` (action: handoff) to **recommend** the next agent (Coordinator decides)
- Always call `memory_agent` (action: complete) when done
