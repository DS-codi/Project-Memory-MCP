# Dynamic Prompt System

> **Status:** Upcoming — This document describes the planned design for dynamic prompt creation by hub agents.

## Overview

The Dynamic Prompt System extends the existing static prompt templates (`.prompt.md` files in `.github/prompts/`) by allowing hub agents to programmatically create, version, and deploy prompt files during plan execution. This enables complex, multi-step workflows that go beyond predefined templates.

## Current Prompt System

Today, prompt templates are **static** files authored by developers:

```
.github/prompts/
├── add-tests.prompt.md
├── code-review.prompt.md
├── document.prompt.md
├── fix-bug.prompt.md
├── new-feature.prompt.md
└── refactor.prompt.md
```

Each prompt file uses YAML frontmatter and Markdown body with `{{variable}}` placeholders:

```markdown
---
agent: "coordinator"
description: "Start a new feature implementation"
---

# New Feature Request

@coordinator I need to implement: {{featureDescription}}
```

Users invoke these via `#prompt-name` in the chat interface.

## Dynamic Prompt Design

The Dynamic Prompt System adds the ability for hub agents (Coordinator, Analyst, Runner) to **create prompts at runtime** during plan execution, store them alongside plan data, and deploy them to the workspace.

### Prompt File Format

Dynamic prompts follow the same `.prompt.md` format with additional frontmatter fields:

```markdown
---
agent: "executor"
description: "Implement auth middleware with JWT validation"
mode: "agent"
version: 1
created_by: "Coordinator"
plan_id: "plan_abc123"
phase: "Phase 2: Implementation"
step_indices: [5, 6, 7]
expires_after: "plan_completion"
---

# Auth Middleware Implementation

@executor Implement JWT middleware for the auth module.

## Context

The Architect designed the following interfaces:

{{architectureContext}}

## Files to Modify

{{affectedFiles}}

## Constraints

- Must validate JWT tokens using the `jsonwebtoken` library
- Must support token refresh via `X-Refresh-Token` header
- All errors must use the `ApiError` class from `src/errors.ts`

## Scope Boundaries

- You MAY modify: {{scopeFiles}}
- You MAY create files in: {{scopeDirs}}
- You MAY NOT modify files outside the listed scope
```

### Extended Frontmatter Fields

| Field | Type | Description |
|-------|------|-------------|
| `agent` | string | Target agent type |
| `description` | string | Human-readable description |
| `mode` | string | `agent`, `ask`, or `edit` |
| `version` | number | Incremented on each update |
| `created_by` | string | Hub agent that created the prompt |
| `plan_id` | string | Associated plan ID |
| `phase` | string | Plan phase this prompt belongs to |
| `step_indices` | number[] | Plan steps covered by this prompt |
| `expires_after` | string | `plan_completion`, `phase_completion`, or ISO date |
| `archived` | boolean | Whether the prompt has been archived |

## Storage Layout

Dynamic prompts are stored in the plan's data directory:

```
data/{workspace_id}/plans/{plan_id}/
├── state.json
├── context/
│   ├── architecture.json
│   └── execution_log.json
└── prompts/
    ├── auth-middleware-v1.prompt.md
    ├── auth-middleware-v2.prompt.md      ← Version 2 after revision
    └── database-migration-v1.prompt.md
```

When deployed to a workspace, prompts are copied to `.github/prompts/`:

```
.github/prompts/
├── new-feature.prompt.md              ← Static (predefined)
├── fix-bug.prompt.md                  ← Static (predefined)
└── plan-abc123-auth-middleware.prompt.md  ← Dynamic (from plan)
```

## Prompt Lifecycle

### 1. Creation

A hub agent creates a prompt when a task requires detailed, structured instructions:

```javascript
// Hub agent creates a dynamic prompt
memory_context(action: "store", type: "dynamic_prompt", data: {
  prompt_id: "auth-middleware",
  version: 1,
  target_agent: "Executor",
  content: "... full .prompt.md content ...",
  phase: "Phase 2",
  step_indices: [5, 6, 7]
});
```

### 2. Deployment

The prompt is written to the workspace so the target agent can reference it:

```javascript
// Deploy to workspace .github/prompts/
deploy_prompt({
  prompt_id: "auth-middleware",
  plan_id: "plan_abc123",
  workspace_path: "/path/to/workspace"
});
```

### 3. Versioning

When a Revisionist updates a plan or a hub agent needs to modify instructions:

```javascript
// Create version 2
memory_context(action: "store", type: "dynamic_prompt", data: {
  prompt_id: "auth-middleware",
  version: 2,
  changes: "Added error handling requirements from Reviewer feedback",
  content: "... updated content ..."
});
```

### 4. Archival

After a plan completes, dynamic prompts are archived with a marker:

```markdown
---
agent: "executor"
archived: true
archived_at: "2025-01-15T10:30:00Z"
---

### ARCHIVED PROMPT: Used for plan "Auth Module Redesign", Related Steps "5, 6, 7"

[Original prompt content follows...]
```

## Hub Agent Guidelines

### When to Create Dynamic Prompts

| Create a Dynamic Prompt | Use Inline Instructions |
|------------------------|------------------------|
| Task spans multiple steps | Single-step task |
| Complex scope boundaries needed | Simple file modifications |
| Task may need revision/retry | One-shot execution |
| Multiple agents reference same context | Context is agent-specific |
| Detailed architecture/constraints | Straightforward implementation |

### Prompt Writing Best Practices

1. **Be specific about scope** — List exact files and directories the agent may modify
2. **Include context inline** — Don't rely on the agent reading many files; embed key decisions
3. **Define success criteria** — What must be true when the task is complete
4. **Version, don't overwrite** — Create new versions instead of modifying existing files
5. **Set expiration** — Use `expires_after` to prevent stale prompts from accumulating

### Staleness Detection

Prompts become stale when:

- The associated plan is archived
- The phase they belong to is complete
- Their `expires_after` date has passed
- The plan has been revised and the prompt's `step_indices` no longer exist

Hub agents should check for stale prompts during plan initialization and archive them.

## Integration with Existing Systems

### VS Code Extension

The extension's `CopilotFileWatcher` already watches for `.prompt.md` files:

```typescript
this.startWatcher('prompt', this.config.promptsRoot, '*.prompt.md');
```

Dynamic prompts deployed to `.github/prompts/` are automatically detected and available in the chat interface.

### Dashboard

The dashboard's prompts API (`/api/prompts`) lists all prompt files, including dynamic ones. The frontmatter fields (`created_by`, `plan_id`, `version`) allow the dashboard to distinguish static templates from plan-specific dynamic prompts.

### Deploy System

The existing deploy commands in the extension and dashboard support deploying prompts to target workspaces. Dynamic prompts follow the same deployment flow as static templates.

## Example Workflow

```
1. User: "Implement OAuth2 with Google and GitHub providers"

2. Coordinator → creates plan with 3 phases

3. Coordinator → creates dynamic prompt for Phase 1:
   "oauth-setup-v1.prompt.md"
   - Target: Executor
   - Scope: src/auth/providers/
   - Steps: 1-4

4. Coordinator → spawns Executor with reference to prompt

5. Executor reads prompt, implements Phase 1

6. Reviewer finds issues → Coordinator creates:
   "oauth-setup-v2.prompt.md"
   - Updated constraints from review feedback

7. Revisionist updates plan → Executor re-runs with v2

8. Plan completes → all dynamic prompts archived
```

## Related Documentation

- [Skills System](skills-system.md) — Skills can inform prompt content
- [Worker Agent](worker-agent.md) — Workers receive focused prompts from hubs
- [TDDDriver Agent](tdd-driver.md) — TDDDriver uses dynamic prompts for TDD cycles
