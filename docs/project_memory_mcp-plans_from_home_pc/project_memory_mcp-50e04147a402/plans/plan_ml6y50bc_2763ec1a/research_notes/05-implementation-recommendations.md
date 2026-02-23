---
plan_id: plan_ml6y50bc_2763ec1a
created_at: 2026-02-03T18:46:57.101Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Implementation Recommendations Summary

## Overview

Based on research of the codebase, here are the key files to modify and the recommended approach:

## Files to Modify

### 1. Types: `server/src/types/index.ts`
- Add `StepType` type
- Update `PlanStep` interface with new optional fields
- Add any new action types

### 2. Tool Schema: `server/src/index.ts`
- Add `type` field to step Zod schema
- Add new actions to `memory_steps` enum: `'insert'`, `'delete'`
- Add new action to `memory_plan` enum: `'delete'`
- Add step order validation response types

### 3. Step Actions: `server/src/tools/consolidated/memory_steps.ts`
- Add `'insert'` action handler
- Add `'delete'` action handler

### 4. Plan Tools: `server/src/tools/plan.tools.ts`
- Add `insertStep()` function with re-indexing
- Add `deleteStep()` function with re-indexing
- Add `deletePlan()` function
- Add order validation logic to `updateStep()` and `batchUpdateSteps()`

### 5. Plan Markdown: `server/src/storage/file-store.ts`
- Update `generatePlanMd()` to show step types

## New Actions Summary

### memory_steps new actions:
| Action | Parameters | Description |
|--------|-----------|-------------|
| `insert` | workspace_id, plan_id, step_index, step | Insert step at index, shift subsequent |
| `delete` | workspace_id, plan_id, step_index | Delete step, re-index remaining |

### memory_plan new actions:
| Action | Parameters | Description |
|--------|-----------|-------------|
| `delete` | workspace_id, plan_id | Permanently delete plan (not archive) |

## Step Type System Design

### Proposed Type List (from user request, refined):
```typescript
type StepType = 
  | 'standard'     // Default, normal step
  | 'analysis'     // Research/analysis task
  | 'validation'   // Requires plan validation
  | 'user-validation'  // Requires user confirmation
  | 'complex'      // Complex multi-part task
  | 'critical'     // Must not fail, requires attention
  | 'immediate'    // Requires immediate action
  | 'fix'          // Bug fix or correction
  | 'build'        // Build/compile/test step
  | 'refactor'     // Code refactoring
  | 'archive'      // Documentation/archival
  | 'confirmation'; // Final confirmation step
```

### Order Validation Response Format:
```typescript
interface StepUpdateResult {
  // ... existing fields ...
  order_warning?: {
    step_completed: number;
    prior_pending_steps: number[];
    message: string;
  };
}
```

## Backwards Compatibility Strategy

1. All new fields are **optional** with sensible defaults
2. Use nullish coalescing when reading: `step.type ?? 'standard'`
3. No schema migration needed - old plans work unchanged
4. New features only activate when new fields are present

## Testing Considerations

1. Test creating plans without step types (backwards compat)
2. Test insert/delete with re-indexing
3. Test order validation warnings
4. Test plan delete vs archive
