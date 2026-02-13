---
applyTo: "**/*"
---

# MCP Agent Workflow Examples

> Split from [mcp-best-practices.instructions.md](./mcp-best-practices.instructions.md). Part of the [Project Memory MCP](./project-memory-system.instructions.md) system reference.

## Complete Workflow: Feature Request to Completion

```
┌─────────────────────────────────────────────────────────────────┐
│                    USER REQUEST                                  │
│              "Add user authentication"                           │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                   │
│  1. memory_workspace (register)                                  │
│  2. memory_plan (create)                                         │
│  3. memory_context (store_initial)                               │
│  4. memory_agent (handoff → Researcher)                          │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    RESEARCHER                                    │
│  1. memory_agent (init, validate)                                │
│  2. memory_context (append_research) - analyze codebase          │
│  3. memory_agent (handoff → Coordinator, recommend Architect)    │
│  4. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHITECT                                     │
│  1. memory_agent (init, validate)                                │
│  2. memory_plan (update) - add steps                             │
│  3. memory_plan (set_goals) - define success criteria            │
│  4. memory_agent (handoff → Coordinator, recommend Executor)     │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EXECUTOR                                      │
│  1. memory_agent (init, validate)                                │
│  2. For each step:                                               │
│     - memory_steps (update status: active)                       │
│     - Implement the code                                         │
│     - memory_steps (update status: done)                         │
│  3. memory_context (store execution_log)                         │
│  4. memory_agent (handoff → Coordinator, recommend Tester)       │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TESTER                                        │
│  1. memory_agent (init, validate)                                │
│  2. memory_steps (update) - mark test steps active/done          │
│  3. memory_agent (handoff → Coordinator, recommend Reviewer)     │
│  4. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    REVIEWER                                      │
│  1. memory_agent (init, validate)                                │
│  2. Check goals/success_criteria from memory_plan (get)          │
│  3. memory_plan (add_note) - document review findings            │
│  4. memory_agent (handoff → Coordinator, recommend Archivist)    │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    ARCHIVIST                                     │
│  1. memory_agent (init, validate)                                │
│  2. memory_plan (archive)                                        │
│  3. memory_workspace (reindex)                                   │
│  4. memory_agent (handoff → Coordinator)                         │
│  5. memory_agent (complete)                                      │
└────────────────────────┬────────────────────────────────────────┘
                         ▼
┌─────────────────────────────────────────────────────────────────┐
│                    COORDINATOR                                   │
│  All steps complete. Report success to user.                     │
└─────────────────────────────────────────────────────────────────┘
```

## Common Pattern: Executor Blocked → Revisionist

```json
// Executor encounters error
{
  "action": "update",
  "step_index": 5,
  "status": "blocked",
  "notes": "Build fails: Cannot find module 'jsonwebtoken'"
}

// Executor hands off
{
  "action": "handoff",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Step 5 blocked - missing dependency",
  "data": {
    "recommendation": "Revisionist",
    "blockers": ["Missing jsonwebtoken package"]
  }
}

// Coordinator spawns Revisionist
// Revisionist fixes the issue:
{
  "action": "insert",
  "at_index": 5,
  "step": {
    "phase": "Fix",
    "task": "Install missing jsonwebtoken dependency",
    "type": "fix",
    "assignee": "Revisionist"
  }
}

// Revisionist marks fix done, unblocks original step
{
  "action": "batch_update",
  "updates": [
    { "index": 5, "status": "done", "notes": "Installed jsonwebtoken@9.0.0" },
    { "index": 6, "status": "pending" }  // Unblock the original step
  ]
}
```

---

*This document is part of the Project Memory MCP system reference. See [project-memory-system.instructions.md](./project-memory-system.instructions.md) for the overview and tool index.*
