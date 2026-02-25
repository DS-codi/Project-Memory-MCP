/**
 * Plan Goals - Goals, success criteria, plan notes, and plan priority
 *
 * Functions: setGoals, addPlanNote, setPlanPriority
 */

import type {
  ToolResponse,
  PlanState,
  PlanPriority,
} from '../../types/index.js';
import * as store from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// Local Interfaces
// =============================================================================

export interface SetGoalsParams {
  workspace_id: string;
  plan_id: string;
  goals?: string[];
  success_criteria?: string[];
}

export interface SetGoalsResult {
  plan_id: string;
  goals: string[];
  success_criteria: string[];
  message: string;
}

// =============================================================================
// Plan Notes
// =============================================================================

/**
 * Add a note to the plan that will be included in the next agent/tool response
 * Notes are auto-cleared after delivery with an audit log entry
 */
export async function addPlanNote(
  params: { workspace_id: string; plan_id: string; note: string; type?: 'info' | 'warning' | 'instruction' }
): Promise<ToolResponse<{ plan_id: string; notes_count: number }>> {
  try {
    const { workspace_id, plan_id, note, type = 'info' } = params;

    if (!workspace_id || !plan_id || !note) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and note are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    // Initialize pending_notes if it doesn't exist
    if (!state.pending_notes) {
      state.pending_notes = [];
    }

    // Add the note
    state.pending_notes.push({
      note,
      type,
      added_at: store.nowISO(),
      added_by: 'user'
    });

    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit event for audit log
    await events.noteAdded(workspace_id, plan_id, note, type);

    return {
      success: true,
      data: {
        plan_id,
        notes_count: state.pending_notes.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add note: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Goals and Success Criteria
// =============================================================================

/**
 * Set or update goals and success criteria for a plan
 * At least one of goals or success_criteria must be provided
 */
export async function setGoals(
  params: SetGoalsParams
): Promise<ToolResponse<SetGoalsResult>> {
  try {
    const { workspace_id, plan_id, goals, success_criteria } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }

    if (!goals && !success_criteria) {
      return {
        success: false,
        error: 'At least one of goals or success_criteria is required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    // Update goals if provided
    if (goals !== undefined) {
      state.goals = goals;
    }

    // Update success criteria if provided
    if (success_criteria !== undefined) {
      state.success_criteria = success_criteria;
    }

    state.updated_at = store.nowISO();
    await store.savePlanState(state);
    await store.generatePlanMd(state);

    // Emit event for dashboard
    await events.planUpdated(workspace_id, plan_id, { goals_updated: !!goals, success_criteria_updated: !!success_criteria });

    return {
      success: true,
      data: {
        plan_id,
        goals: state.goals || [],
        success_criteria: state.success_criteria || [],
        message: `Updated: ${goals ? 'goals' : ''}${goals && success_criteria ? ' and ' : ''}${success_criteria ? 'success_criteria' : ''}`
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set goals: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Plan Priority
// =============================================================================

const VALID_PRIORITIES: PlanPriority[] = ['low', 'medium', 'high', 'critical'];

export interface SetPlanPriorityParams {
  workspace_id: string;
  plan_id: string;
  priority: PlanPriority;
}

export interface SetPlanPriorityResult {
  plan_id: string;
  previous_priority: PlanPriority;
  priority: PlanPriority;
  message: string;
}

/**
 * Set or update the priority of a plan.
 * Validates the priority value is one of: low, medium, high, critical.
 */
export async function setPlanPriority(
  params: SetPlanPriorityParams
): Promise<ToolResponse<SetPlanPriorityResult>> {
  try {
    const { workspace_id, plan_id, priority } = params;

    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required for set_plan_priority'
      };
    }

    if (!priority || !VALID_PRIORITIES.includes(priority)) {
      return {
        success: false,
        error: `Invalid priority: "${priority}". Must be one of: ${VALID_PRIORITIES.join(', ')}`
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    const previousPriority = state.priority;
    state.priority = priority;
    state.updated_at = store.nowISO();
    await store.savePlanState(state);
    await store.generatePlanMd(state);

    await events.planUpdated(workspace_id, plan_id, { priority_changed: { from: previousPriority, to: priority } });

    return {
      success: true,
      data: {
        plan_id,
        previous_priority: previousPriority,
        priority,
        message: `Plan priority changed from "${previousPriority}" to "${priority}"`
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set plan priority: ${(error as Error).message}`
    };
  }
}
