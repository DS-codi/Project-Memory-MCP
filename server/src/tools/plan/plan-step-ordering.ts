/**
 * Plan Step Ordering - Reorder, move, sort, and set order of steps
 *
 * Functions: reorderStep, moveStep, sortStepsByPhase, setStepOrder
 */

import type {
  ToolResponse,
  PlanStep,
  PlanOperationResult
} from '../../types/index.js';
import { AGENT_BOUNDARIES } from '../../types/index.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// Step Reordering
// =============================================================================

/**
 * Reorder a step by swapping it with an adjacent step (up or down)
 * 'up' swaps with the step at index-1, 'down' swaps with step at index+1
 */
export async function reorderStep(
  params: { workspace_id: string; plan_id: string; step_index: number; direction: 'up' | 'down' }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index, direction } = params;

    if (!workspace_id || !plan_id || step_index === undefined || !direction) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_index, and direction are required'
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

    // Find the step to move
    const stepToMove = state.steps.find(s => s.index === step_index);
    if (!stepToMove) {
      return {
        success: false,
        error: `Step with index ${step_index} not found`
      };
    }

    // Calculate target index
    const targetIndex = direction === 'up' ? step_index - 1 : step_index + 1;

    // Validate boundaries
    if (targetIndex < 0) {
      return {
        success: false,
        error: `Cannot move step up: step ${step_index} is already at the top`
      };
    }
    if (targetIndex >= state.steps.length) {
      return {
        success: false,
        error: `Cannot move step down: step ${step_index} is already at the bottom`
      };
    }

    // Find the adjacent step to swap with
    const adjacentStep = state.steps.find(s => s.index === targetIndex);
    if (!adjacentStep) {
      return {
        success: false,
        error: `Adjacent step at index ${targetIndex} not found`
      };
    }

    // Swap indices
    stepToMove.index = targetIndex;
    adjacentStep.index = step_index;

    // Sort by index
    state.steps.sort((a, b) => a.index - b.index);
    state.updated_at = store.nowISO();

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for step reorder
    await events.planUpdated(workspace_id, plan_id, {
      step_reordered: { from: step_index, to: targetIndex, direction }
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Moved step ${direction} from index ${step_index} to index ${targetIndex}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to reorder step: ${(error as Error).message}`
    };
  }
}

/**
 * Move a step from one index to another, re-indexing all affected steps
 */
export async function moveStep(
  params: { workspace_id: string; plan_id: string; from_index: number; to_index: number }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, from_index, to_index } = params;

    if (!workspace_id || !plan_id || from_index === undefined || to_index === undefined) {
      return {
        success: false,
        error: 'workspace_id, plan_id, from_index, and to_index are required'
      };
    }

    if (from_index === to_index) {
      return {
        success: false,
        error: 'from_index and to_index cannot be the same'
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

    // Validate indices
    if (from_index < 0 || from_index >= state.steps.length) {
      return {
        success: false,
        error: `Invalid from_index: ${from_index}. Must be between 0 and ${state.steps.length - 1}`
      };
    }
    if (to_index < 0 || to_index >= state.steps.length) {
      return {
        success: false,
        error: `Invalid to_index: ${to_index}. Must be between 0 and ${state.steps.length - 1}`
      };
    }

    // Find and remove the step to move
    const stepToMove = state.steps.find(s => s.index === from_index);
    if (!stepToMove) {
      return {
        success: false,
        error: `Step with index ${from_index} not found`
      };
    }

    // Remove the step from its current position
    const stepsWithoutMoved = state.steps.filter(s => s.index !== from_index);

    // Adjust indices based on movement direction
    if (from_index < to_index) {
      // Moving down: shift steps between from and to up by 1
      stepsWithoutMoved.forEach(s => {
        if (s.index > from_index && s.index <= to_index) {
          s.index--;
        }
      });
    } else {
      // Moving up: shift steps between to and from down by 1
      stepsWithoutMoved.forEach(s => {
        if (s.index >= to_index && s.index < from_index) {
          s.index++;
        }
      });
    }

    // Set the moved step's new index
    stepToMove.index = to_index;

    // Rebuild the steps array
    state.steps = [...stepsWithoutMoved, stepToMove].sort((a, b) => a.index - b.index);
    state.updated_at = store.nowISO();

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for step move
    await events.planUpdated(workspace_id, plan_id, {
      step_moved: { from: from_index, to: to_index }
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Moved step from index ${from_index} to index ${to_index}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to move step: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Bulk Step Reordering
// =============================================================================

/**
 * Sort all steps by phase name
 * Optionally accepts a custom phase_order array for custom sorting
 */
export async function sortStepsByPhase(
  params: {
    workspace_id: string;
    plan_id: string;
    phase_order?: string[];  // Custom phase order, e.g. ["Research", "Design", "Implement", "Test"]
  }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, phase_order } = params;

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    if (!state.steps || state.steps.length === 0) {
      return {
        success: false,
        error: 'Plan has no steps to sort'
      };
    }

    // Create a sorting function
    const getPhaseIndex = (phase: string): number => {
      if (phase_order && phase_order.length > 0) {
        const idx = phase_order.findIndex(p =>
          p.toLowerCase() === phase.toLowerCase()
        );
        return idx >= 0 ? idx : phase_order.length; // Unknown phases go to end
      }
      return 0; // If no custom order, all phases have same priority (alphabetic)
    };

    // Sort steps: first by phase order (or alphabetically), then by original index within phase
    const sortedSteps = [...state.steps].sort((a, b) => {
      const phaseCompare = phase_order && phase_order.length > 0
        ? getPhaseIndex(a.phase) - getPhaseIndex(b.phase)
        : a.phase.localeCompare(b.phase);

      if (phaseCompare !== 0) return phaseCompare;
      // Within same phase, preserve original order
      return a.index - b.index;
    });

    // Re-index the sorted steps
    sortedSteps.forEach((step, idx) => {
      step.index = idx;
    });

    state.steps = sortedSteps;
    state.updated_at = store.nowISO();

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for sort
    await events.planUpdated(workspace_id, plan_id, {
      steps_sorted: { by: 'phase', custom_order: !!phase_order }
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Sorted ${state.steps.length} steps by phase${phase_order ? ' using custom order' : ' alphabetically'}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to sort steps: ${(error as Error).message}`
    };
  }
}

/**
 * Set a completely new order for all steps
 * Accepts an array of current indices in the desired new order
 * e.g., [2, 0, 1, 3] means: current step 2 becomes first, current step 0 becomes second, etc.
 */
export async function setStepOrder(
  params: {
    workspace_id: string;
    plan_id: string;
    new_order: number[];  // Array of current indices in desired order
  }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_order } = params;

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];

    if (!state.steps || state.steps.length === 0) {
      return {
        success: false,
        error: 'Plan has no steps to reorder'
      };
    }

    // Validate new_order array
    if (!new_order || new_order.length !== state.steps.length) {
      return {
        success: false,
        error: `new_order must contain exactly ${state.steps.length} indices (current step count)`
      };
    }

    // Check for duplicates
    const uniqueIndices = new Set(new_order);
    if (uniqueIndices.size !== new_order.length) {
      return {
        success: false,
        error: 'new_order contains duplicate indices'
      };
    }

    // Check all indices are valid
    for (const idx of new_order) {
      if (idx < 0 || idx >= state.steps.length) {
        return {
          success: false,
          error: `Invalid index ${idx} in new_order. Valid range: 0 to ${state.steps.length - 1}`
        };
      }
    }

    // Create a map from old index to step
    const stepMap = new Map(state.steps.map((s: PlanStep) => [s.index, s]));

    // Build the new steps array
    const reorderedSteps = new_order.map((oldIndex, newIndex) => {
      const step = stepMap.get(oldIndex);
      if (!step) {
        throw new Error(`Step with index ${oldIndex} not found`);
      }
      return { ...step, index: newIndex };
    });

    state.steps = reorderedSteps;
    state.updated_at = store.nowISO();

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit plan updated event for step order change
    await events.planUpdated(workspace_id, plan_id, {
      steps_reordered: { new_order: new_order }
    });

    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Reordered ${state.steps.length} steps according to new order`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set step order: ${(error as Error).message}`
    };
  }
}
