---
plan_id: plan_ml6y50bc_2763ec1a
created_at: 2026-02-03T18:45:55.355Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Current Plan & Step Actions Research

## memory_plan Tool Actions

| Action | Description | Key Params | Underlying Function |
|--------|-------------|------------|---------------------|
| `list` | List all plans for workspace | workspace_id or workspace_path | `planTools.listPlans()` |
| `get` | Get plan state | workspace_id, plan_id | `planTools.getPlanState()` |
| `create` | Create new plan | workspace_id, title, description, category | `planTools.createPlan()` |
| `update` | Replace all steps | workspace_id, plan_id, steps | `planTools.modifyPlan()` |
| `archive` | Archive completed plan | workspace_id, plan_id | `planTools.archivePlan()` |
| `import` | Import from markdown file | workspace_id, plan_file_path, category | `planTools.importPlan()` |
| `find` | Find plan by ID across workspaces | plan_id | `planTools.findPlan()` |
| `add_note` | Add note for next agent | workspace_id, plan_id, note, note_type | `planTools.addPlanNote()` |

## memory_steps Tool Actions

| Action | Description | Key Params | Underlying Function |
|--------|-------------|------------|---------------------|
| `add` | Append steps to plan | workspace_id, plan_id, steps[] | `planTools.appendSteps()` |
| `update` | Update single step status | workspace_id, plan_id, step_index, status, notes? | `planTools.updateStep()` |
| `batch_update` | Update multiple steps | workspace_id, plan_id, updates[] | `planTools.batchUpdateSteps()` |

## Missing Actions (Requested Features)

### For memory_steps:
- **`insert`**: Insert step at specific index, shift subsequent indices
- **`delete`**: Remove step at specific index, re-index remaining steps

### For memory_plan:
- **`delete`**: Permanently remove a plan (not just archive)
- **`consolidate`**: Merge steps or plans together

## Current Step Index Handling

### In `appendSteps()`:
```typescript
// Get the next index
const startIndex = state.steps.length;

// Add new steps with proper indexing
const indexedNewSteps: PlanStep[] = new_steps.map((step, i) => ({
  ...step,
  index: startIndex + i,
  status: step.status || 'pending'
}));

// Append to existing steps
state.steps = [...state.steps, ...indexedNewSteps];
```

### In `modifyPlan()`:
```typescript
// Add index to each step (replaces all steps)
const indexedSteps: PlanStep[] = new_steps.map((step, index) => ({
  ...step,
  index,
  status: step.status || 'pending'
}));

state.steps = indexedSteps;
```

### Key Insight
- **No insert/delete with re-indexing** - steps can only be appended or replaced wholesale
- Steps are identified by their `index` field, but the array position matters for phase detection
- The safeguard in `modifyPlan()` prevents accidental mass deletion if >50% of steps would be lost
