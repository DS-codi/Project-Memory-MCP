/**
 * Plan Step Mutations - Insert, delete, consolidate, and append steps
 *
 * Functions: insertStep, deleteStep, consolidateSteps, appendSteps
 */

import type {
  ToolResponse,
  PlanState,
  PlanStep,
  PlanOperationResult,
  PlanNote,
} from '../../types/index.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// Step Insert & Delete
// =============================================================================

/**
 * Insert a step at a specific index with re-indexing
 * All steps at or after the insertion point have their indices shifted up by 1
 */
export async function insertStep(
  params: { workspace_id: string; plan_id: string; at_index: number; step: Omit<PlanStep, 'index'> }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, at_index, step } = params;

    if (!workspace_id || !plan_id || at_index === undefined || !step) {
      return {
        success: false,
        error: 'workspace_id, plan_id, at_index, and step are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    // mapDependsOn handles both legacy numeric-index strings (e.g. "2") and
    // new string step IDs. Numeric strings are remapped via indexMap; opaque
    // string IDs are passed through unchanged.
    const mapDependsOn = (
      dependsOn: string[] | undefined,
      indexMap: Map<number, number>
    ): string[] | undefined => {
      if (!dependsOn || dependsOn.length === 0) return dependsOn;
      return dependsOn.map(dep => {
        const n = Number(dep);
        if (Number.isInteger(n) && String(n) === dep) {
          return String(indexMap.has(n) ? indexMap.get(n)! : n);
        }
        return dep;  // step ID — pass through
      });
    };

    const shiftDep = (dep: string, threshold: number, delta: number): string => {
      const n = Number(dep);
      if (Number.isInteger(n) && String(n) === dep) {
        return String(n >= threshold ? n + delta : n);
      }
      return dep;  // step ID — pass through
    };

    // Normalize steps by index order and reindex sequentially
    const sortedSteps = [...state.steps].sort((a, b) => a.index - b.index);
    const indexMap = new Map<number, number>();
    sortedSteps.forEach((s, i) => {
      if (!indexMap.has(s.index)) {
        indexMap.set(s.index, i);
      }
    });
    const normalizedSteps = sortedSteps.map((s, i) => ({
      ...s,
      index: i,
      depends_on: mapDependsOn(s.depends_on, indexMap)
    }));

    // Validate at_index
    if (at_index < 0 || at_index > normalizedSteps.length) {
      return {
        success: false,
        error: `Invalid at_index: ${at_index}. Must be between 0 and ${normalizedSteps.length}`
      };
    }

    // Shift indices >= at_index up by 1
    const updatedSteps = normalizedSteps.map(s => {
      const shiftedIndex = s.index >= at_index ? s.index + 1 : s.index;
      const shiftedDepends = s.depends_on
        ? s.depends_on.map(dep => shiftDep(dep, at_index, 1))
        : s.depends_on;
      return { ...s, index: shiftedIndex, depends_on: shiftedDepends };
    });

    const normalizedNewDepends = mapDependsOn(step.depends_on, indexMap);
    const shiftedNewDepends = normalizedNewDepends
      ? normalizedNewDepends.map(dep => shiftDep(dep, at_index, 1))
      : normalizedNewDepends;

    // Insert new step with the target index
    const newStep: PlanStep = {
      ...step,
      index: at_index,
      status: step.status || 'pending',
      depends_on: shiftedNewDepends
    };

    // Combine and sort by index
    state.steps = [...updatedSteps, newStep].sort((a, b) => a.index - b.index);
    state.updated_at = store.nowISO();

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for step insertion
    await events.planUpdated(workspace_id, plan_id, {
      step_inserted: at_index,
      total_steps: state.steps.length
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Inserted step at index ${at_index}. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to insert step: ${(error as Error).message}`
    };
  }
}

/**
 * Delete a step at a specific index with re-indexing
 * All steps after the deletion point have their indices shifted down by 1
 */
export async function deleteStep(
  params: { workspace_id: string; plan_id: string; step_index: number }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index } = params;

    if (!workspace_id || !plan_id || step_index === undefined) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and step_index are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    // Validate step_index exists
    const stepToDelete = state.steps.find(s => s.index === step_index);
    if (!stepToDelete) {
      return {
        success: false,
        error: `Step with index ${step_index} not found`
      };
    }

    // Remove the step
    const remainingSteps = state.steps.filter(s => s.index !== step_index);

    // Shift indices > step_index down by 1
    state.steps = remainingSteps.map(s => {
      if (s.index > step_index) {
        return { ...s, index: s.index - 1 };
      }
      return s;
    }).sort((a, b) => a.index - b.index);

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for step deletion
    await events.planUpdated(workspace_id, plan_id, {
      step_deleted: step_index,
      total_steps: state.steps.length
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Deleted step at index ${step_index}. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete step: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Step Consolidation & Append
// =============================================================================

/**
 * Consolidate multiple steps into a single step
 * Merges notes and re-indexes remaining steps
 */
export async function consolidateSteps(
  params: { workspace_id: string; plan_id: string; step_indices: number[]; consolidated_task: string }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_indices, consolidated_task } = params;

    if (!workspace_id || !plan_id || !step_indices || !consolidated_task) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_indices, and consolidated_task are required'
      };
    }

    if (step_indices.length < 2) {
      return {
        success: false,
        error: 'At least 2 steps are required for consolidation'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    // Validate all indices exist
    const sortedIndices = [...step_indices].sort((a, b) => a - b);
    const stepsToMerge = sortedIndices.map(idx => {
      const step = state.steps.find(s => s.index === idx);
      if (!step) {
        throw new Error(`Step ${idx} not found`);
      }
      return step;
    });

    // Validate indices are consecutive
    for (let i = 1; i < sortedIndices.length; i++) {
      if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
        return {
          success: false,
          error: `Step indices must be consecutive. Found gap between ${sortedIndices[i - 1]} and ${sortedIndices[i]}`
        };
      }
    }

    // Get first step's phase and metadata
    const firstStep = stepsToMerge[0];
    const phase = firstStep.phase;

    // Merge all notes
    const mergedNotes = stepsToMerge
      .map(s => s.notes)
      .filter(n => n && n.trim().length > 0)
      .join('; ');

    // Create consolidated step
    const consolidatedStep: PlanStep = {
      index: sortedIndices[0],
      phase,
      task: consolidated_task,
      status: 'pending',
      notes: mergedNotes || undefined,
      type: firstStep.type,
      requires_validation: firstStep.requires_validation,
      requires_confirmation: firstStep.requires_confirmation,
      requires_user_confirmation: firstStep.requires_user_confirmation,
      assignee: firstStep.assignee
    };

    // Remove merged steps and add consolidated step
    const remainingSteps = state.steps.filter(s => !sortedIndices.includes(s.index));
    const newSteps = [consolidatedStep, ...remainingSteps];

    // Re-index all steps
    newSteps.sort((a, b) => a.index - b.index);
    const reindexedSteps = newSteps.map((s, newIndex) => ({
      ...s,
      index: newIndex
    }));

    state.steps = reindexedSteps;
    await store.savePlanState(state);
    await store.generatePlanMd(state);

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Consolidated ${sortedIndices.length} steps into 1. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to consolidate steps: ${(error as Error).message}`
    };
  }
}

/**
 * Append steps to an existing plan (safer than modify_plan for adding phases)
 * Preserves all existing steps and adds new ones at the end
 */
export async function appendSteps(
  params: { workspace_id: string; plan_id: string; new_steps: Omit<PlanStep, 'index'>[] }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_steps } = params;

    if (!workspace_id || !plan_id || !new_steps || new_steps.length === 0) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and new_steps are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

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

    // Auto-upgrade detection: suggest program upgrade for large plans
    await checkProgramUpgradeSuggestion(state);

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Appended ${indexedNewSteps.length} steps (indices ${startIndex}-${startIndex + indexedNewSteps.length - 1}). Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to append steps: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Auto-Upgrade Detection
// =============================================================================

const PROGRAM_UPGRADE_THRESHOLD = 100;

/**
 * Check if a plan has grown large enough to suggest upgrading to an Integrated Program.
 * Adds a pending note when step count exceeds the threshold and the plan is not
 * already a program and no such note has been added before.
 */
export async function checkProgramUpgradeSuggestion(state: PlanState): Promise<void> {
  // Skip if already a program or below threshold
  if (state.is_program || state.steps.length < PROGRAM_UPGRADE_THRESHOLD) {
    return;
  }

  // Skip if already suggested
  const existingNotes = state.pending_notes || [];
  const alreadySuggested = existingNotes.some(
    (n: PlanNote) => n.note.includes('Integrated Program')
  );
  if (alreadySuggested) return;

  if (!state.pending_notes) {
    state.pending_notes = [];
  }

  state.pending_notes.push({
    note: `This plan has ${state.steps.length} steps (threshold: ${PROGRAM_UPGRADE_THRESHOLD}). ` +
      `Consider upgrading to an Integrated Program using memory_plan(action: upgrade_to_program) ` +
      `to split work into manageable child plans with independent tracking.`,
    type: 'warning',
    added_at: store.nowISO(),
    added_by: 'agent',
  });
}
