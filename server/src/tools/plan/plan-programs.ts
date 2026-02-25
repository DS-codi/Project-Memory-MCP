/**
 * Plan Programs - Integrated Program management
 *
 * Programs are multi-plan containers that group related plans under a
 * single umbrella. A program is stored as a PlanState with is_program=true.
 *
 * Functions: createProgram, addPlanToProgram, linkToProgram, unlinkFromProgram,
 *            upgradeToProgram, listProgramPlans, setPlanDependencies, getPlanDependencies
 */

import type {
  ToolResponse,
  PlanState,
  PlanStep,
  CreateProgramParams,
  AddPlanToProgramParams,
  UpgradeToProgramParams,
  ListProgramPlansParams,
  ProgramPlansResult,
  ProgramChildPlanSummary,
  UnlinkFromProgramParams,
  SetPlanDependenciesParams,
  GetPlanDependenciesParams,
  GetPlanDependenciesResult,
} from '../../types/index.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';
import { computeAggregateProgress } from './plan-utils.js';

// =============================================================================
// Helpers
// =============================================================================

/**
 * Detect circular references in program→plan relationships.
 * Returns true if adding planId to programId would create a cycle.
 */
async function wouldCreateCycle(
  workspaceId: string,
  programId: string,
  planId: string,
  visited: Set<string> = new Set()
): Promise<boolean> {
  if (visited.has(planId)) return true;
  if (planId === programId) return true;
  visited.add(planId);

  const plan = await store.getPlanState(workspaceId, planId);
  if (!plan) return false;

  // If the plan we're trying to add is itself a program, check its children
  if (plan.is_program && plan.child_plan_ids) {
    for (const childId of plan.child_plan_ids) {
      if (childId === programId) return true;
      if (await wouldCreateCycle(workspaceId, programId, childId, visited)) {
        return true;
      }
    }
  }

  // Also check if the plan has a program_id that chains upward
  if (plan.program_id) {
    if (plan.program_id === programId) return true;
    if (await wouldCreateCycle(workspaceId, programId, plan.program_id, visited)) {
      return true;
    }
  }

  return false;
}

/**
 * Validate that a plan depends_on_plans list has no circular deps.
 * Uses DFS with a visited set to detect transitive cycles.
 * Returns the problematic plan ID if a cycle exists, or null if clean.
 */
export async function validatePlanDependencies(
  workspaceId: string,
  planId: string,
  dependsOnPlans: string[]
): Promise<string | null> {
  for (const depId of dependsOnPlans) {
    if (depId === planId) return depId;

    // DFS: check if planId is reachable from depId via depends_on_plans chains
    if (await hasDependencyPath(workspaceId, depId, planId, new Set())) {
      return depId;
    }
  }
  return null;
}

/**
 * DFS helper: returns true if `targetId` is reachable from `currentId`
 * through transitive depends_on_plans relationships.
 */
async function hasDependencyPath(
  workspaceId: string,
  currentId: string,
  targetId: string,
  visited: Set<string>
): Promise<boolean> {
  if (currentId === targetId) return true;
  if (visited.has(currentId)) return false;
  visited.add(currentId);

  const plan = await store.getPlanState(workspaceId, currentId);
  if (!plan?.depends_on_plans) return false;

  for (const depId of plan.depends_on_plans) {
    if (await hasDependencyPath(workspaceId, depId, targetId, visited)) {
      return true;
    }
  }
  return false;
}

// =============================================================================
// createProgram
// =============================================================================

/**
 * Create a new Integrated Program.
 * Programs are stored as PlanState with is_program=true and empty child_plan_ids.
 */
export async function createProgram(
  params: CreateProgramParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, title, description, priority = 'medium' } = params;

    if (!workspace_id || !title || !description) {
      return {
        success: false,
        error: 'workspace_id, title, and description are required',
      };
    }

    // Create the program as a plan with is_program flag
    const programState = await store.createPlan(
      workspace_id,
      title,
      description,
      'feature',
      priority
    );

    // Set program-specific fields
    programState.is_program = true;
    programState.child_plan_ids = [];
    programState.current_phase = 'Program Container';

    await store.savePlanState(programState);

    // Update workspace meta with active_programs
    const workspace = await store.getWorkspace(workspace_id);
    if (workspace) {
      if (!workspace.active_programs) {
        workspace.active_programs = [];
      }
      workspace.active_programs.push(programState.id);
      await store.saveWorkspace(workspace);
    }

    events.planCreated(workspace_id, programState.id, title, 'program');

    return { success: true, data: programState };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// addPlanToProgram
// =============================================================================

/**
 * Link an existing plan to a program.
 * Sets plan.program_id and adds to program.child_plan_ids.
 */
export async function addPlanToProgram(
  params: AddPlanToProgramParams
): Promise<ToolResponse<{ program: PlanState; plan: PlanState }>> {
  try {
    const { workspace_id, program_id, plan_id } = params;

    if (!workspace_id || !program_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id, program_id, and plan_id are required',
      };
    }

    if (program_id === plan_id) {
      return {
        success: false,
        error: 'A program cannot contain itself',
      };
    }

    // Load both
    const program = await store.getPlanState(workspace_id, program_id);
    if (!program) {
      return { success: false, error: `Program not found: ${program_id}` };
    }
    if (!program.is_program) {
      return { success: false, error: `${program_id} is not a program. Use upgrade_to_program first.` };
    }

    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return { success: false, error: `Plan not found: ${plan_id}` };
    }

    // Prevent adding a plan that already belongs to another program
    if (plan.program_id && plan.program_id !== program_id) {
      return {
        success: false,
        error: `Plan ${plan_id} already belongs to program ${plan.program_id}. Remove it first.`,
      };
    }

    // Check for circular references
    if (await wouldCreateCycle(workspace_id, program_id, plan_id)) {
      return {
        success: false,
        error: `Adding plan ${plan_id} to program ${program_id} would create a circular reference`,
      };
    }

    // Already linked? No-op
    if (program.child_plan_ids?.includes(plan_id)) {
      return { success: true, data: { program, plan } };
    }

    // Link plan to program
    plan.program_id = program_id;
    if (!program.child_plan_ids) {
      program.child_plan_ids = [];
    }
    program.child_plan_ids.push(plan_id);

    await store.savePlanState(plan);
    await store.savePlanState(program);

    return { success: true, data: { program, plan } };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add plan to program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// upgradeToProgram
// =============================================================================

/**
 * Convert an existing plan into an Integrated Program.
 * Optionally moves the original steps into a new child plan.
 */
export async function upgradeToProgram(
  params: UpgradeToProgramParams
): Promise<ToolResponse<{ program: PlanState; child_plan?: PlanState }>> {
  try {
    const { workspace_id, plan_id, move_steps_to_child = false, child_plan_title } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required',
      };
    }

    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return { success: false, error: `Plan not found: ${plan_id}` };
    }

    if (plan.is_program) {
      return { success: false, error: `${plan_id} is already a program` };
    }

    // If plan belongs to another program, can't upgrade it
    if (plan.program_id) {
      return {
        success: false,
        error: `Cannot upgrade plan ${plan_id}: it belongs to program ${plan.program_id}`,
      };
    }

    let childPlan: PlanState | undefined;

    if (move_steps_to_child && plan.steps.length > 0) {
      // Create a child plan with the original steps
      const childTitle = child_plan_title || `${plan.title} — Original Steps`;
      childPlan = await store.createPlan(
        workspace_id,
        childTitle,
        `Migrated steps from plan ${plan_id} during program upgrade`,
        plan.category,
        plan.priority
      );

      // Copy steps to child plan
      childPlan.steps = plan.steps.map((step, i) => ({
        ...step,
        index: i,
      }));
      childPlan.program_id = plan_id;
      childPlan.current_phase = plan.current_phase;
      await store.savePlanState(childPlan);

      // Clear steps from the program container
      plan.steps = [];
      plan.child_plan_ids = [childPlan.id];
    } else {
      plan.child_plan_ids = [];
    }

    // Mark as program
    plan.is_program = true;
    plan.current_phase = 'Program Container';
    await store.savePlanState(plan);

    // Update workspace meta
    const workspace = await store.getWorkspace(workspace_id);
    if (workspace) {
      if (!workspace.active_programs) {
        workspace.active_programs = [];
      }
      if (!workspace.active_programs.includes(plan_id)) {
        workspace.active_programs.push(plan_id);
      }
      await store.saveWorkspace(workspace);
    }

    return {
      success: true,
      data: { program: plan, child_plan: childPlan },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to upgrade to program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// listProgramPlans
// =============================================================================

/**
 * List all child plans in a program with aggregate progress.
 */
export async function listProgramPlans(
  params: ListProgramPlansParams
): Promise<ToolResponse<ProgramPlansResult>> {
  try {
    const { workspace_id, program_id } = params;

    if (!workspace_id || !program_id) {
      return {
        success: false,
        error: 'workspace_id and program_id are required',
      };
    }

    const program = await store.getPlanState(workspace_id, program_id);
    if (!program) {
      return { success: false, error: `Program not found: ${program_id}` };
    }
    if (!program.is_program) {
      return { success: false, error: `${program_id} is not a program` };
    }

    const childIds = program.child_plan_ids || [];
    const childPlans: PlanState[] = [];
    const childSummaries: ProgramChildPlanSummary[] = [];

    for (const childId of childIds) {
      const child = await store.getPlanState(workspace_id, childId);
      if (child) {
        childPlans.push(child);
        childSummaries.push({
          plan_id: child.id,
          title: child.title,
          status: child.status,
          priority: child.priority,
          current_phase: child.current_phase,
          steps_total: child.steps.length,
          steps_done: child.steps.filter(s => s.status === 'done').length,
          depends_on_plans: child.depends_on_plans || [],
        });
      }
    }

    const aggregate = computeAggregateProgress(childPlans);

    return {
      success: true,
      data: {
        program_id,
        program_title: program.title,
        program_status: program.status,
        child_plan_ids: childIds,
        child_plans: childSummaries,
        aggregate,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list program plans: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// linkToProgram (wrapper around addPlanToProgram with enhanced error messages)
// =============================================================================

/**
 * Link a plan to a program. Wrapper around addPlanToProgram with
 * enhanced error messages and user-friendly validation.
 */
export async function linkToProgram(
  params: AddPlanToProgramParams
): Promise<ToolResponse<{ program: PlanState; plan: PlanState }>> {
  try {
    const { workspace_id, program_id, plan_id } = params;

    if (!workspace_id || !program_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id, program_id, and plan_id are required for link_to_program',
      };
    }

    // Pre-validate with friendlier error messages
    if (program_id === plan_id) {
      return {
        success: false,
        error: `Cannot link plan "${plan_id}" to itself as a program`,
      };
    }

    const program = await store.getPlanState(workspace_id, program_id);
    if (!program) {
      return {
        success: false,
        error: `Program "${program_id}" not found in workspace "${workspace_id}". Verify the program_id or create a program first with create_program.`,
      };
    }
    if (!program.is_program) {
      return {
        success: false,
        error: `"${program_id}" (${program.title}) is a regular plan, not a program. Use upgrade_to_program to convert it first, or create a new program with create_program.`,
      };
    }

    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return {
        success: false,
        error: `Plan "${plan_id}" not found in workspace "${workspace_id}". Verify the plan_id exists.`,
      };
    }

    if (plan.program_id && plan.program_id !== program_id) {
      const existingProgram = await store.getPlanState(workspace_id, plan.program_id);
      const existingTitle = existingProgram?.title || plan.program_id;
      return {
        success: false,
        error: `Plan "${plan.title}" already belongs to program "${existingTitle}" (${plan.program_id}). Use unlink_from_program to remove it first.`,
      };
    }

    // Delegate to existing implementation
    return await addPlanToProgram(params);
  } catch (error) {
    return {
      success: false,
      error: `Failed to link plan to program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// unlinkFromProgram
// =============================================================================

/**
 * Remove a plan from a program. Clears plan.program_id and removes
 * the plan from program.child_plan_ids. Bidirectional update.
 */
export async function unlinkFromProgram(
  params: UnlinkFromProgramParams
): Promise<ToolResponse<{ program: PlanState; plan: PlanState }>> {
  try {
    const { workspace_id, plan_id } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required for unlink_from_program',
      };
    }

    // Load the plan
    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`,
      };
    }

    // Verify plan is actually in a program
    if (!plan.program_id) {
      return {
        success: false,
        error: `Plan "${plan.title}" (${plan_id}) is not linked to any program`,
      };
    }

    const programId = plan.program_id;

    // Load the program
    const program = await store.getPlanState(workspace_id, programId);
    if (!program) {
      // Program doesn't exist — clean up the orphaned reference on the plan
      plan.program_id = undefined;
      plan.updated_at = store.nowISO();
      await store.savePlanState(plan);
      return {
        success: false,
        error: `Program ${programId} not found. Cleared orphaned program_id from plan.`,
      };
    }

    // Remove plan from program's child_plan_ids
    if (program.child_plan_ids) {
      program.child_plan_ids = program.child_plan_ids.filter(id => id !== plan_id);
    }

    // Clear plan's program_id
    plan.program_id = undefined;

    // Save both atomically (as much as file-based storage allows)
    plan.updated_at = store.nowISO();
    program.updated_at = store.nowISO();
    await store.savePlanState(plan);
    await store.savePlanState(program);

    await store.generatePlanMd(plan);
    await store.generatePlanMd(program);

    await events.planUpdated(workspace_id, plan_id, { unlinked_from_program: programId });

    return {
      success: true,
      data: { program, plan },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to unlink plan from program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// setPlanDependencies
// =============================================================================

/**
 * Set the depends_on_plans array on a plan. Validates that all referenced
 * plans exist and checks for circular dependencies.
 */
export async function setPlanDependencies(
  params: SetPlanDependenciesParams
): Promise<ToolResponse<{ plan_id: string; depends_on_plans: string[]; message: string }>> {
  try {
    const { workspace_id, plan_id, depends_on_plans } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required for set_plan_dependencies',
      };
    }

    if (!Array.isArray(depends_on_plans)) {
      return {
        success: false,
        error: 'depends_on_plans must be an array of plan IDs',
      };
    }

    // Load the plan
    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`,
      };
    }

    // Validate that all referenced plans exist
    const missingPlans: string[] = [];
    for (const depId of depends_on_plans) {
      const dep = await store.getPlanState(workspace_id, depId);
      if (!dep) {
        missingPlans.push(depId);
      }
    }
    if (missingPlans.length > 0) {
      return {
        success: false,
        error: `Referenced plans not found: ${missingPlans.join(', ')}`,
      };
    }

    // Check for circular dependencies
    const cyclePlanId = await validatePlanDependencies(workspace_id, plan_id, depends_on_plans);
    if (cyclePlanId) {
      return {
        success: false,
        error: `Circular dependency detected: adding dependency on "${cyclePlanId}" would create a cycle`,
      };
    }

    // Set dependencies
    plan.depends_on_plans = depends_on_plans;
    plan.updated_at = store.nowISO();
    await store.savePlanState(plan);
    await store.generatePlanMd(plan);

    await events.planUpdated(workspace_id, plan_id, { dependencies_updated: depends_on_plans });

    return {
      success: true,
      data: {
        plan_id,
        depends_on_plans,
        message: depends_on_plans.length > 0
          ? `Set ${depends_on_plans.length} dependencies on plan ${plan_id}`
          : `Cleared all dependencies from plan ${plan_id}`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set plan dependencies: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// getPlanDependencies
// =============================================================================

/**
 * Get the dependencies for a plan and also find dependents (plans that
 * depend on this plan). Performs a reverse lookup across all workspace plans.
 */
export async function getPlanDependencies(
  params: GetPlanDependenciesParams
): Promise<ToolResponse<GetPlanDependenciesResult>> {
  try {
    const { workspace_id, plan_id } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required for get_plan_dependencies',
      };
    }

    // Load the plan
    const plan = await store.getPlanState(workspace_id, plan_id);
    if (!plan) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`,
      };
    }

    const dependsOn = plan.depends_on_plans || [];

    // Reverse lookup: find all plans that depend on this plan
    const allPlans = await store.getWorkspacePlans(workspace_id);
    const dependents = allPlans
      .filter(p => p.id !== plan_id && p.depends_on_plans?.includes(plan_id))
      .map(p => p.id);

    return {
      success: true,
      data: {
        plan_id,
        depends_on_plans: dependsOn,
        dependents,
        message: `Plan has ${dependsOn.length} dependencies and ${dependents.length} dependents`,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get plan dependencies: ${(error as Error).message}`,
    };
  }
}
