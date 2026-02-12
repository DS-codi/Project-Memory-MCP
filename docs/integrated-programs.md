# Integrated Programs

## Overview

Integrated Programs are multi-plan containers that group related plans together under a single umbrella. They enable tracking complex, multi-workstream projects where individual plans represent independent deliverables that share a common goal.

## When to Use Programs

| Scenario | Single Plan | Program |
|----------|-------------|---------|
| Task has < 50 steps | ✅ | ❌ |
| Task has 100+ steps | ❌ | ✅ Auto-upgrade suggested |
| Work has independent deliverables | ❌ | ✅ |
| Multiple unrelated features in one request | ❌ | ✅ |
| Phases could ship independently | ❌ | ✅ |

## Program Lifecycle

### 1. Create a Program

Create a program directly when you know upfront that work requires multiple plans:

```json
{
  "action": "create_program",
  "workspace_id": "my-project-abc123",
  "title": "Authentication System Overhaul",
  "description": "JWT migration, OAuth2 integration, and session management refactor",
  "category": "feature",
  "priority": "high"
}
```

The result is a `PlanState` with `is_program: true`. Programs don't have steps themselves — they contain child plans.

### 2. Add Child Plans

Link existing plans to a program:

```json
{
  "action": "add_plan_to_program",
  "workspace_id": "my-project-abc123",
  "program_id": "plan_program_001",
  "plan_id": "plan_jwt_migration_002"
}
```

The child plan's state is updated with `parent_program_id` pointing to the program.

### 3. Upgrade Existing Plans

When a plan grows beyond its original scope, upgrade it to a program:

```json
{
  "action": "upgrade_to_program",
  "workspace_id": "my-project-abc123",
  "plan_id": "plan_large_feature_003"
}
```

This creates a new program and moves the original plan as its first child. All references to the original plan continue to work.

### 4. List Program Plans

View all child plans within a program:

```json
{
  "action": "list_program_plans",
  "workspace_id": "my-project-abc123",
  "program_id": "plan_program_001"
}
```

Returns an array of child plan summaries with progress metrics.

## Auto-Upgrade Detection

When a plan reaches 100+ steps, the system automatically adds an advisory note to the plan state suggesting an upgrade to an Integrated Program. The Coordinator should evaluate this recommendation.

**Triggers:**
- Step count exceeds 100
- 3+ phases with independent deliverables
- Plan keeps growing across orchestration sessions

## Cross-Plan Dependencies

Child plans within a program can declare ordering dependencies:

```typescript
{
  depends_on_plans: ["plan_jwt_migration_002"]  // This plan waits for JWT migration
}
```

The Coordinator checks `depends_on_plans` before deploying agents for a child plan. If dependencies aren't met, the Coordinator warns the user or blocks execution. Circular dependencies are detected and rejected.

## Program State

Programs are stored as `PlanState` objects with additional fields:

| Field | Type | Description |
|-------|------|-------------|
| `is_program` | `boolean` | Marks this plan as a program container |
| `child_plan_ids` | `string[]` | Array of child plan IDs |
| `parent_program_id` | `string` | (On child plans) Points to the parent program |
| `depends_on_plans` | `string[]` | (On child plans) Cross-plan dependency ordering |

## Dashboard Integration

The dashboard displays programs with:
- **Program tree view** — Expandable hierarchy showing program → child plans
- **Aggregate progress** — Roll-up metrics across all child plans
- **Dependency visualization** — Shows which plans block others

## Coordinator Program Awareness

The Coordinator agent includes scope-creep detection logic:

1. **Monitors step count** — Flags plans approaching 100 steps
2. **Evaluates phase independence** — Detects when phases could ship independently
3. **Suggests upgrades** — Recommends `upgrade_to_program` when appropriate
4. **Manages child plan ordering** — Respects `depends_on_plans` when scheduling work

## MCP Actions Summary

| Action | Tool | Parameters | Description |
|--------|------|------------|-------------|
| `create_program` | `memory_plan` | `workspace_id`, `title`, `description` | Create a new program |
| `add_plan_to_program` | `memory_plan` | `workspace_id`, `program_id`, `plan_id` | Add a child plan |
| `upgrade_to_program` | `memory_plan` | `workspace_id`, `plan_id` | Upgrade plan to program |
| `list_program_plans` | `memory_plan` | `workspace_id`, `program_id` | List child plans |
