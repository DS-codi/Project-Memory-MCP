---
plan_id: plan_ml6y50bc_2763ec1a
created_at: 2026-02-03T18:46:12.382Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Index Management & Step Order Research

## How Steps Are Ordered

1. **Array Position = Execution Order**: Steps are stored in an array in `state.steps[]`
2. **`index` Field = Display Reference**: Used for referencing steps in updates
3. **No Order Validation**: Currently NO validation that steps are completed in order

## Current Step Update Flow

```typescript
// In updateStep():
const step = state.steps.find(s => s.index === step_index);
// Direct lookup by index - no order checking
```

## Phase Detection Logic

Phases are detected from step data dynamically:
```typescript
// Get unique phases in order
const phases = [...new Set(state.steps.map(s => s.phase))];

// Check if all steps in current phase are done
const currentPhaseSteps = state.steps.filter(s => s.phase === step.phase);
const allDone = currentPhaseSteps.every(s => s.status === 'done');

// Advance to next phase if current is complete
if (allDone) {
  const currentPhaseIndex = phases.indexOf(step.phase);
  if (currentPhaseIndex < phases.length - 1) {
    state.current_phase = phases[currentPhaseIndex + 1];
  } else {
    state.current_phase = 'complete';
  }
}
```

## Out-of-Order Completion (Current Behavior)

Currently, any step can be marked done regardless of:
- Previous steps' status
- Phase order
- Dependencies

**User Observation** (from original request):
> "Steps like #5, #6, #7 done but #41 pending" - agents completing steps out of order

## Required: Step Order Validation

The request asks for:
1. **Warning** (not blocking) when steps are done out of order
2. **Some steps may legitimately be out of order** - so warning only

### Proposed Implementation Location:

In `planTools.updateStep()` and `planTools.batchUpdateSteps()`:
```typescript
// Pseudo-code for order validation
if (status === 'done') {
  const priorPending = state.steps.filter(s => s.index < step_index && s.status !== 'done');
  if (priorPending.length > 0) {
    // Return warning in response, but still complete the step
    warnings.push(`Step ${step_index} completed before ${priorPending.length} prior steps`);
  }
}
```

## Re-indexing Requirements for Insert/Delete

### Insert at Position N:
1. Shift all steps with `index >= N` up by 1
2. Insert new step at position N
3. Update array to maintain order

### Delete at Position N:
1. Remove step at index N
2. Shift all steps with `index > N` down by 1
3. Update array to maintain order

### Consideration: 
- Completed steps referencing old indices in notes/logs may become confusing
- May want to track "original_index" vs "current_index"
