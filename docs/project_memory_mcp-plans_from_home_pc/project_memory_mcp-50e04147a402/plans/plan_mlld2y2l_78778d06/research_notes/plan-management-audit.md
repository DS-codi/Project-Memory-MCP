---
plan_id: plan_mlld2y2l_78778d06
created_at: 2026-02-13T23:38:10.023Z
sanitized: false
injection_attempts: 0
warnings: 0
---

# Plan Management Audit — Research Findings

## 1. All Existing `memory_plan` Actions (22 total)

The `PlanAction` type in `server/src/tools/consolidated/memory_plan.ts` defines these actions:

```typescript
export type PlanAction = 
  | 'list' | 'get' | 'create' | 'update' | 'archive' 
  | 'import' | 'find' | 'add_note' | 'delete' | 'consolidate' 
  | 'set_goals' | 'add_build_script' | 'list_build_scripts' 
  | 'run_build_script' | 'delete_build_script' 
  | 'create_from_template' | 'list_templates' | 'confirm' 
  | 'create_program' | 'add_plan_to_program' | 'upgrade_to_program' 
  | 'list_program_plans' | 'export_plan';
```

### Grouped by category:

**Plan CRUD (8):** `list`, `get`, `create`, `update`, `archive`, `import`, `find`, `delete`  
**Plan metadata (4):** `add_note`, `set_goals`, `consolidate`, `confirm`  
**Build scripts (4):** `add_build_script`, `list_build_scripts`, `run_build_script`, `delete_build_script`  
**Templates (2):** `create_from_template`, `list_templates`  
**Programs (4):** `create_program`, `add_plan_to_program`, `upgrade_to_program`, `list_program_plans`  
**Export (1):** `export_plan`

## 2. `add_plan_to_program` Implementation Details

**File:** `server/src/tools/plan/plan-programs.ts` (lines 173–253)  
**Function signature:** `addPlanToProgram(params: AddPlanToProgramParams): Promise<ToolResponse<{ program: PlanState; plan: PlanState }>>`

### Validation chain:
1. Requires `workspace_id`, `program_id`, `plan_id`
2. Checks `program_id !== plan_id` (self-reference prevention)
3. Loads program → validates `is_program === true` (error: "use upgrade_to_program first")
4. Loads plan → validates it exists
5. Checks if plan already belongs to another program (`plan.program_id && plan.program_id !== program_id`) → error
6. Calls `wouldCreateCycle()` for circular reference detection
7. No-op if already linked (`program.child_plan_ids?.includes(plan_id)`)

### Linking logic:
```typescript
plan.program_id = program_id;             // Sets child → parent reference
program.child_plan_ids.push(plan_id);     // Sets parent → child reference
await store.savePlanState(plan);          // Saves plan
await store.savePlanState(program);       // Saves program
```

**Key observation:** Linking is **bidirectional** — both `plan.program_id` (child → parent) and `program.child_plan_ids` (parent → children) are set.

### Field names on PlanState:
- `program_id?: string` — Links plan to parent program (NOT `parent_program_id`)
- `is_program?: boolean` — True if this plan is a program container
- `child_plan_ids?: string[]` — IDs of child plans (only for programs)
- `depends_on_plans?: string[]` — Cross-program dependency tracking for child plans

## 3. Circular Reference Detection

**File:** `server/src/tools/plan/plan-programs.ts` (lines 33–64)

### `wouldCreateCycle()` — Program hierarchy cycle detection
```typescript
async function wouldCreateCycle(
  workspaceId: string,
  programId: string,
  planId: string,
  visited: Set<string> = new Set()
): Promise<boolean>
```

Algorithm:
1. If `planId` already in `visited` → cycle
2. If `planId === programId` → cycle
3. Adds `planId` to visited set
4. Loads the plan state
5. If the plan is itself a program, recursively checks all `child_plan_ids`
6. Also checks upward through `plan.program_id` chains
7. Returns true if any path leads back to programId

### `validatePlanDependencies()` — Dependency cycle detection (EXPORTED)
```typescript
export async function validatePlanDependencies(
  workspaceId: string,
  planId: string,
  dependsOnPlans: string[]
): Promise<string | null>
```

Algorithm:
1. For each dep in `dependsOnPlans`:
   - Direct self-check: `depId === planId` → return depId
   - DFS via `hasDependencyPath()` to see if `planId` is reachable from depId
2. Returns the problematic plan ID or null if clean

### `hasDependencyPath()` — DFS helper (lines 91–110)
- Private function (not exported)
- Traverses `depends_on_plans` chains
- Uses visited set to prevent infinite loops
- Returns true if `targetId` is reachable from `currentId`

**Existing tests:** `server/src/__tests__/tools/plan-dependencies.test.ts` (200 lines)
- Tests self-dependency, direct 2-node cycles, transitive cycles (A→B→C→A), long chains (A→B→C→D→A)
- Tests valid chains, multiple independent deps, missing plans
- Uses `vi.mock` for file-store, controlled `mockResolvedValueOnce` chains

## 4. `upgrade_to_program` Logic

**File:** `server/src/tools/plan/plan-programs.ts` (lines 259–337)

Converts a plan into a program container:
1. Validates `workspace_id`, `plan_id`
2. Checks plan exists, is not already a program
3. Checks plan doesn't already belong to another program
4. Optional: `move_steps_to_child=true` creates a new child plan with original steps
   - Creates child plan via `store.createPlan()`
   - Copies steps to child
   - Sets `childPlan.program_id = plan_id`
   - Clears steps on parent
5. Sets `is_program = true`, `current_phase = 'Program Container'`
6. Updates workspace meta `active_programs` array

## 5. Gaps Identified for New Actions

### 5.1 `link_to_program` (alias/wrapper for `add_plan_to_program`)
- **Gap:** `add_plan_to_program` already exists. The new action should be an alias or offer improved error messages. 
- **Decision:** Could rename/alias, or enhance with better UX. Likely just need to add it to the PlanAction union and delegate.

### 5.2 `unlink_from_program`
- **Gap:** No way to REMOVE a plan from a program. Need to:
  1. Clear `plan.program_id`
  2. Remove `plan_id` from `program.child_plan_ids`
  3. Save both
- **Implementation pattern:** Follow same bidirectional update as `addPlanToProgram`
- **Add to:** `plan-programs.ts`

### 5.3 `set_plan_dependencies`
- **Gap:** `depends_on_plans` field exists on PlanState but NO action exposes it. The `validatePlanDependencies()` function exists but is never called from any action.
- **Implementation:** 
  1. Accept `workspace_id`, `plan_id`, `depends_on_plans: string[]`
  2. Call `validatePlanDependencies()` to check for cycles
  3. Set `plan.depends_on_plans = depends_on_plans`
  4. Save plan state
- **Add to:** `plan-programs.ts` (since dependency logic is already there)

### 5.4 `get_plan_dependencies`
- **Gap:** No way to query a plan's dependencies OR find plans that depend on it (reverse lookup).
- **Implementation:**
  1. Accept `workspace_id`, `plan_id`
  2. Return `depends_on_plans` from the plan
  3. Also scan all plans in workspace to find "dependents" (plans that list this plan in their `depends_on_plans`)
- **Add to:** `plan-programs.ts`

### 5.5 `set_plan_priority`
- **Gap:** Priority can only be set at creation or through full plan update. No dedicated action.
- **Implementation:** Simple: load plan, validate priority enum, set `plan.priority`, save.
- **Add to:** `plan-goals.ts` (similar to setGoals pattern)

### 5.6 `clone_plan`
- **Gap:** No way to duplicate a plan.
- **Implementation:**
  1. Load source plan
  2. Deep copy with new ID via `store.createPlan()`
  3. Copy steps, goals, success_criteria
  4. Optionally reset all step statuses to 'pending'
  5. Optionally link to same program
- **Add to:** `plan-lifecycle.ts` (extends CRUD)

### 5.7 `merge_plans`
- **Gap:** No way to combine steps from multiple plans into one.
- **Implementation:**
  1. Accept `workspace_id`, `target_plan_id`, `source_plan_ids: string[]`
  2. Load target and source plans
  3. Append source steps to target (re-indexing)
  4. Optionally archive source plans
  5. Handle program membership conflicts
- **Add to:** `plan-lifecycle.ts`

## 6. Code Patterns & Conventions for the Executor

### 6.1 File organization
- **Domain modules** in `server/src/tools/plan/`: Each file handles a specific domain (lifecycle, programs, goals, etc.)
- **Consolidated handler** in `server/src/tools/consolidated/memory_plan.ts`: Switch statement dispatches to domain functions
- **Types** in `server/src/types/`: Separate files per domain (`plan.types.ts`, `program.types.ts`)
- **Barrel exports** via `index.ts` files

### 6.2 Function pattern
Every exported function follows this pattern:
```typescript
export async function actionName(
  params: ActionParams
): Promise<ToolResponse<ResultType>> {
  try {
    // 1. Destructure and validate required params
    const { workspace_id, plan_id, ... } = params;
    if (!workspace_id || !plan_id) {
      return { success: false, error: 'workspace_id and plan_id are required' };
    }

    // 2. Load plan state
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return { success: false, error: `Plan not found: ${plan_id}` };
    }

    // 3. Business logic / validation

    // 4. Mutate state
    state.updated_at = store.nowISO();
    await store.savePlanState(state);

    // 5. Optional: regenerate plan.md, emit events
    await store.generatePlanMd(state);
    await events.planUpdated(workspace_id, plan_id, { ... });

    // 6. Return success
    return { success: true, data: { ... } };
  } catch (error) {
    return {
      success: false,
      error: `Failed to ...: ${(error as Error).message}`
    };
  }
}
```

### 6.3 Consolidated handler pattern
In `memory_plan.ts`, each action case:
```typescript
case 'new_action': {
  // Validate required params
  if (!params.workspace_id || !params.plan_id) {
    return { success: false, error: '...' };
  }
  // Call domain function
  const result = await planTools.newAction({ ... });
  if (!result.success) {
    return { success: false, error: result.error };
  }
  // Wrap in action envelope
  return { success: true, data: { action: 'new_action', data: result.data! } };
}
```

### 6.4 Registering a new action
1. Add to `PlanAction` type union in `memory_plan.ts`
2. Add to `PlanResult` type union (return type)
3. Add case in the switch statement
4. Add any new params to `MemoryPlanParams` interface
5. Update the `z.enum()` array in `server/src/index.ts` (line ~211)
6. Update the tool description string in `server/src/index.ts` (line ~208)
7. Update the error message string listing valid actions (line ~163 and default case ~720)
8. Add relevant Zod schema params to the server.tool() schema definition

### 6.5 Types to define
For new actions, create interfaces in `server/src/types/program.types.ts`:
```typescript
export interface UnlinkFromProgramParams { workspace_id: string; plan_id: string; }
export interface SetPlanDependenciesParams { workspace_id: string; plan_id: string; depends_on_plans: string[]; }
export interface GetPlanDependenciesParams { workspace_id: string; plan_id: string; }
// etc.
```
Export them from `types/index.ts` via the barrel.

### 6.6 Events
Use `events` from `../../events/event-emitter.js`. Common events:
- `events.planCreated(workspaceId, planId, title, category)`
- `events.planUpdated(workspaceId, planId, changes)`

### 6.7 Testing pattern
Tests are in `server/src/__tests__/tools/`. Structure:
- `vi.mock('../../storage/file-store.js')` for mocking storage
- `vi.mock('../../events/event-emitter.js')` for mocking events
- `makePlan()` helper function for fixture creation
- Tests grouped by `describe()` blocks per function
- Each test validates params, success case, error cases
- Use `vi.mocked(store.getPlanState).mockResolvedValue(...)` pattern

### 6.8 Store operations used
- `store.getPlanState(workspaceId, planId)` — load plan
- `store.savePlanState(state)` — save plan (auto-sets `updated_at`)
- `store.createPlan(workspaceId, title, description, category, priority, ...)` — create with new ID
- `store.getWorkspace(workspaceId)` — load workspace meta
- `store.saveWorkspace(workspace)` — save workspace meta
- `store.generatePlanMd(state)` — regenerate human-readable plan.md
- `store.nowISO()` — current ISO timestamp
- `store.getWorkspacePlans(workspaceId)` — list all plans (for reverse lookups)
