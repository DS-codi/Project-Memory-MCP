/**
 * Plan Confirmation - Phase and step confirmation tracking
 *
 * Functions: confirmPhase, confirmStep
 */

import type {
  ToolResponse,
  PlanState,
  ConfirmationState
} from '../../types/index.js';
import * as store from '../../storage/file-store.js';
import { ensureConfirmationState } from './plan-utils.js';

// =============================================================================
// Confirmation Tracking
// =============================================================================

export async function confirmPhase(
  params: { workspace_id: string; plan_id: string; phase: string; confirmed_by?: string }
): Promise<ToolResponse<{ plan_state: PlanState; confirmation: ConfirmationState['phases'][string] }>> {
  try {
    const { workspace_id, plan_id, phase, confirmed_by } = params;

    if (!workspace_id || !plan_id || !phase) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and phase are required'
      };
    }

    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }

    ensureConfirmationState(state);
    const confirmation = {
      confirmed: true,
      confirmed_by: confirmed_by || 'user',
      confirmed_at: store.nowISO()
    };

    state.confirmation_state!.phases[phase] = confirmation;
    await store.savePlanState(state);
    await store.generatePlanMd(state);

    return {
      success: true,
      data: {
        plan_state: state,
        confirmation
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to confirm phase: ${(error as Error).message}`
    };
  }
}

export async function confirmStep(
  params: { workspace_id: string; plan_id: string; step_index: number; confirmed_by?: string }
): Promise<ToolResponse<{ plan_state: PlanState; confirmation: ConfirmationState['steps'][number] }>> {
  try {
    const { workspace_id, plan_id, step_index, confirmed_by } = params;

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

    const step = state.steps.find(s => s.index === step_index);
    if (!step) {
      return {
        success: false,
        error: `Step not found: ${step_index}`
      };
    }

    ensureConfirmationState(state);
    const confirmation = {
      confirmed: true,
      confirmed_by: confirmed_by || 'user',
      confirmed_at: store.nowISO()
    };

    state.confirmation_state!.steps[step_index] = confirmation;
    await store.savePlanState(state);
    await store.generatePlanMd(state);

    return {
      success: true,
      data: {
        plan_state: state,
        confirmation
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to confirm step: ${(error as Error).message}`
    };
  }
}
