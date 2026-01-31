---
applyTo: "**/*"
---

# Project Memory MCP Usage Guidelines

This workspace uses the **Project Memory MCP** for tracking work across agent sessions.

## Required Initialization

Before doing any work, agents MUST:

1. **Call `initialise_agent`** with your agent type and plan context
2. **Call the validation tool** for your agent type (e.g., `validate_executor`)
3. **Set up your todo list** from the validation response

## Tool Usage Patterns

### Creating Plans
```
mcp_project-memor_create_plan({
  workspace_id: "...",
  title: "Feature: ...",
  description: "...",
  category: "feature|bug|change|refactor|documentation",
  priority: "low|medium|high|critical"
})
```

### Updating Step Progress
```
mcp_project-memor_update_step({
  workspace_id: "...",
  plan_id: "...",
  step_id: "...",
  status: "pending|active|done|blocked"
})
```

### Recording Handoffs
```
mcp_project-memor_handoff({
  workspace_id: "...",
  plan_id: "...",
  from_agent: "Executor",
  to_agent: "Reviewer",
  reason: "Implementation complete"
})
```

### Completing Agent Sessions
```
mcp_project-memor_complete_agent({
  workspace_id: "...",
  plan_id: "...",
  agent_type: "Executor",
  summary: "Completed all steps..."
})
```

## Hub-and-Spoke Model

- **Coordinator** is the hub - it spawns all other agents
- Other agents are **spokes** - they complete tasks and return to Coordinator
- Use `handoff` to **recommend** the next agent (Coordinator decides)
- Always call `complete_agent` when done
