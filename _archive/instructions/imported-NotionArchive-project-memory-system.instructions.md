# Project Memory MCP - Complete Tool Reference

> **Version:** 2.0 (Consolidated Tools)  
> **Last Updated:** February 2026  
> **Purpose:** Definitive reference for all agents using the Project Memory MCP system

---

## Table of Contents

1. [Overview](#overview)
2. [Quick Start](#quick-start)
3. [Tool Summary](#tool-summary)
4. [memory_workspace](#memory_workspace)
5. [memory_plan](#memory_plan)
6. [memory_steps](#memory_steps)
7. [memory_agent](#memory_agent)
8. [memory_context](#memory_context)
9. [Agent Workflow Examples](#agent-workflow-examples)
10. [Best Practices](#best-practices)
11. [Anti-Patterns to Avoid](#anti-patterns-to-avoid)
12. [Tips by Agent Role](#tips-by-agent-role)

---

## Overview

The Project Memory MCP system provides persistent memory and coordination for AI agents working on software development tasks. It consists of **5 consolidated tools** that replace the previous 20+ individual tools.

### Core Concepts

| Concept | Description |
|---------|-------------|
| **Workspace** | A registered directory containing a software project |
| **Plan** | A structured task list with phases, steps, goals, and agent assignments |
| **Step** | A single task within a plan, with status and assignee |
| **Session** | An agent's active work period on a plan |
| **Handoff** | Transfer of responsibility from one agent to another |
| **Lineage** | The history of handoffs for a plan |
| **Context** | Stored data related to a plan (user request, research, etc.) |

### Agent Types

| Agent | Role | Primary Tools |
|-------|------|---------------|
| **Coordinator** | Orchestrates workflow, manages handoffs | `memory_agent`, `memory_plan`, `memory_context` |
| **Researcher** | Gathers context and information | `memory_context`, `memory_agent` |
| **Architect** | Designs solutions, creates plans | `memory_plan`, `memory_steps`, `memory_agent` |
| **Executor** | Implements code changes | `memory_steps`, `memory_agent` |
| **Tester** | Writes and runs tests | `memory_steps`, `memory_agent` |
| **Reviewer** | Build verification + code review; manages build scripts | `memory_plan` (build script actions), `memory_agent` |
| **Revisionist** | Fixes issues and blockers | `memory_steps`, `memory_agent` |
| **Archivist** | Archives and documents completed work | `memory_plan`, `memory_context`, `memory_agent` |
| **Analyst** | Analyzes requirements and existing code | `memory_context`, `memory_agent` |
| **Brainstorm** | Generates ideas and solutions | `memory_context`, `memory_agent` |
| **SkillWriter** | Analyzes codebases and generates SKILL.md files | `memory_context`, `memory_agent`, `memory_steps` |
| **Worker** | Executes scoped sub-tasks delegated by hub agents | `memory_agent`, `memory_context` |

---

## Quick Start

Every agent MUST follow these steps when starting:

```json
// 1. Initialize your session
{
  "action": "init",
  "agent_type": "Executor",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "context": {
    "deployed_by": "Coordinator",
    "reason": "Implementing feature X"
  }
}

// 2. Validate you're the right agent
{
  "action": "validate",
  "agent_type": "Executor",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789"
}

// 3. Update step status as you work
{
  "action": "update",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "step_index": 0,
  "status": "active"
}

// 4. When done, handoff to next agent
{
  "action": "handoff",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "from_agent": "Executor",
  "to_agent": "Coordinator",
  "reason": "Phase complete, recommend Reviewer"
}

// 5. Complete your session
{
  "action": "complete",
  "workspace_id": "ws_abc123",
  "plan_id": "plan_xyz789",
  "agent_type": "Executor",
  "summary": "Completed 5 steps, created 3 files",
  "artifacts": ["src/feature.ts", "src/feature.test.ts"]
}
```

---

## Tool Summary

| Tool | Actions | Purpose |
|------|---------|---------|
| `memory_workspace` | register, list, info, reindex | Manage workspace registration and profiles |
| `memory_plan` | list, get, create, update, archive, import, find, add_note, delete, consolidate, set_goals, add_build_script, list_build_scripts, run_build_script, delete_build_script, create_from_template, list_templates, confirm, create_program, add_plan_to_program, upgrade_to_program, list_program_plans | Full plan lifecycle and program management |
| `memory_steps` | add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace | Step-level operations |
| `memory_agent` | init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage | Agent lifecycle and coordination |
| `memory_context` | store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_get, workspace_set, workspace_update, workspace_delete, knowledge_store, knowledge_get, knowledge_list, knowledge_delete | Context, research, and knowledge management |

---

## Detailed Tool References

Each tool has its own dedicated reference file with full action documentation, parameters, and examples:

## memory_workspace

See [mcp-tool-workspace.instructions.md](./mcp-tool-workspace.instructions.md) for full reference.

Actions: `register`, `list`, `info`, `reindex`

## memory_plan

See [mcp-tool-plan.instructions.md](./mcp-tool-plan.instructions.md) for full reference.

Actions: `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `add_note`, `delete`, `consolidate`, `set_goals`, `add_build_script`, `list_build_scripts`, `run_build_script`, `delete_build_script`, `create_from_template`, `list_templates`, `confirm`, `create_program`, `add_plan_to_program`, `upgrade_to_program`, `list_program_plans`

## memory_steps

See [mcp-tool-steps.instructions.md](./mcp-tool-steps.instructions.md) for full reference.

Actions: `add`, `update`, `batch_update`, `insert`, `delete`, `reorder`, `move`, `sort`, `set_order`, `replace`

## memory_agent

See [mcp-tool-agent.instructions.md](./mcp-tool-agent.instructions.md) for full reference.

Actions: `init`, `complete`, `handoff`, `validate`, `list`, `get_instructions`, `deploy`, `get_briefing`, `get_lineage`

## memory_context

See [mcp-tool-context.instructions.md](./mcp-tool-context.instructions.md) for full reference.

Actions: `store`, `get`, `store_initial`, `list`, `list_research`, `append_research`, `generate_instructions`, `batch_store`, `workspace_get`, `workspace_set`, `workspace_update`, `workspace_delete`, `knowledge_store`, `knowledge_get`, `knowledge_list`, `knowledge_delete`

---

## Best Practices, Anti-Patterns & Tips

See [mcp-best-practices.instructions.md](./mcp-best-practices.instructions.md) for best practices, anti-patterns, tips by agent role, and type reference appendix.

See [mcp-workflow-examples.instructions.md](./mcp-workflow-examples.instructions.md) for complete agent workflow examples and common patterns.

---

*This document is the index for the Project Memory MCP system reference. See the linked files above for detailed documentation.*
