````instructions
---
applyTo: "**/*"
---

# memory_steps — Tool Reference

> Extracted from [project-memory-system.instructions.md](./project-memory-system.instructions.md)

Step-level operations for managing individual tasks within a plan.

### Actions

#### `add`
Append new steps to the end of a plan.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"add"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `steps` | PlanStep[] | ✅ | Array of steps to append |

**Example:**
```json
{
  "action": "add",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "steps": [
    { "phase": "Phase 3: Deployment", "task": "Deploy to staging", "assignee": "Reviewer" },
    { "phase": "Phase 3: Deployment", "task": "Run smoke tests", "assignee": "Tester" }
  ]
}
```

**Used by:** Architect, Revisionist.

---

#### `update`
Update a single step's status and notes.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The 0-based index of the step |
| `status` | string | ✅ | One of: `pending`, `active`, `done`, `blocked` |
| `notes` | string | ❌ | Notes about the step completion/status |
| `agent_type` | string | ❌ | The agent making the update |

**Example:**
```json
{
  "action": "update",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 3,
  "status": "done",
  "notes": "Implemented login endpoint, tests passing"
}
```

**Used by:** All agents (to track their progress).

---

#### `batch_update`
Update multiple steps at once.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"batch_update"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `updates` | object[] | ✅ | Array of update objects |

**Update object structure:**
```typescript
{
  index: number;      // Step index
  status: string;     // New status
  notes?: string;     // Optional notes
}
```

**Example:**
```json
{
  "action": "batch_update",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "updates": [
    { "index": 0, "status": "done", "notes": "Setup complete" },
    { "index": 1, "status": "done", "notes": "Schema created" },
    { "index": 2, "status": "active" }
  ]
}
```

**Used by:** Executor (when completing multiple steps), Reviewer (when validating work).

---

#### `insert`
Insert a new step at a specific index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"insert"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `at_index` | number | ✅ | The index where the step should be inserted |
| `step` | PlanStep | ✅ | The step to insert |

**Example:**
```json
{
  "action": "insert",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "at_index": 2,
  "step": {
    "phase": "Phase 1: Setup",
    "task": "Add missing database migration",
    "assignee": "Executor"
  }
}
```

**Used by:** Revisionist (to add missing steps), Architect (to refine plans).

---

#### `delete`
Delete a step by index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"delete"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The index of the step to delete |

**Example:**
```json
{
  "action": "delete",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 5
}
```

**Used by:** Revisionist (to remove obsolete steps), Architect.

---

#### `reorder`
Swap a step with an adjacent step (move up or down).

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"reorder"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `step_index` | number | ✅ | The index of the step to move |
| `direction` | string | ✅ | `"up"` or `"down"` |

**Example:**
```json
{
  "action": "reorder",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "step_index": 3,
  "direction": "up"
}
```

**Notes:**
- Moving "up" swaps with the step at index - 1
- Moving "down" swaps with the step at index + 1
- Cannot move first step up or last step down

**Used by:** Architect, Revisionist (to fix step ordering).

---

#### `move`
Move a step to a specific index.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"move"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `from_index` | number | ✅ | The current index of the step |
| `to_index` | number | ✅ | The target index |

**Example:**
```json
{
  "action": "move",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "from_index": 7,
  "to_index": 2
}
```

**Notes:**
- All steps between from_index and to_index are re-indexed
- Step indices are automatically recalculated

**Used by:** Architect, Revisionist (for major plan restructuring).

---

#### `sort`
Sort all steps by phase. Optionally provide a custom phase order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"sort"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `phase_order` | string[] | ❌ | Custom phase order (e.g., `["Research", "Design", "Implement", "Test"]`) |

**Example (alphabetic sort):**
```json
{
  "action": "sort",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456"
}
```

**Example (custom phase order):**
```json
{
  "action": "sort",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "phase_order": ["Research", "Architecture", "Implementation", "Testing", "Documentation"]
}
```

**Notes:**
- Without `phase_order`, steps are sorted alphabetically by phase
- With `phase_order`, steps are sorted according to the provided order
- Steps within the same phase maintain their relative order

**Used by:** Architect (for organizing plans by phase).

---

#### `set_order`
Completely reorder all steps according to a new order.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"set_order"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `new_order` | number[] | ✅ | Array of current indices in desired new order |

**Example:**
```json
{
  "action": "set_order",
  "workspace_id": "my-project-652c624f8f59",
  "plan_id": "plan_abc123_def456",
  "new_order": [2, 0, 1, 3, 5, 4]
}
```

This means:
- Current step 2 becomes index 0
- Current step 0 becomes index 1
- Current step 1 becomes index 2
- Current step 3 stays at index 3
- Current step 5 becomes index 4
- Current step 4 becomes index 5

**Notes:**
- `new_order` must contain exactly as many indices as there are steps
- Each current step index must appear exactly once
- This is the most flexible reordering option

**Used by:** Architect, Revisionist (for complete plan reorganization).

---

#### `replace`
Replace all steps with a new array.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `action` | string | ✅ | `"replace"` |
| `workspace_id` | string | ✅ | The workspace ID |
| `plan_id` | string | ✅ | The plan ID |
| `replacement_steps` | PlanStep[] | ✅ | Full replacement step array |

**Notes:**
- Existing steps are replaced entirely
- Preserve completed steps only if you include them in `replacement_steps`

**Used by:** Architect, Revisionist (for full plan rewrites).

````
