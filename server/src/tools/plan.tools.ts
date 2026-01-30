/**
 * Plan Tools - MCP tools for plan lifecycle management
 */

import type {
  CreatePlanParams,
  GetPlanStateParams,
  UpdateStepParams,
  ModifyPlanParams,
  ArchivePlanParams,
  ToolResponse,
  PlanState,
  PlanStep,
  RequestCategory
} from '../types/index.js';
import * as store from '../storage/file-store.js';

/**
 * Create a new plan within a workspace
 */
export async function createPlan(
  params: CreatePlanParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, title, description, category, priority, categorization } = params;
    
    if (!workspace_id || !title || !description || !category) {
      return {
        success: false,
        error: 'workspace_id, title, description, and category are required'
      };
    }
    
    // Verify workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    const plan = await store.createPlan(workspace_id, title, description, category, priority, categorization);
    
    return {
      success: true,
      data: plan
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create plan: ${(error as Error).message}`
    };
  }
}

/**
 * Get the current state of a plan
 */
export async function getPlanState(
  params: GetPlanStateParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get plan state: ${(error as Error).message}`
    };
  }
}

/**
 * Update the status of a specific step
 */
export async function updateStep(
  params: UpdateStepParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id, step_index, status, notes } = params;
    
    if (!workspace_id || !plan_id || step_index === undefined || !status) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_index, and status are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Find the step
    const step = state.steps.find(s => s.index === step_index);
    if (!step) {
      return {
        success: false,
        error: `Step not found: ${step_index}`
      };
    }
    
    // Update step
    step.status = status;
    if (notes) {
      step.notes = notes;
    }
    if (status === 'done') {
      step.completed_at = store.nowISO();
    }
    
    // Update phase if needed
    const phases = [...new Set(state.steps.map(s => s.phase))];
    const currentPhaseSteps = state.steps.filter(s => s.phase === step.phase);
    const allDone = currentPhaseSteps.every(s => s.status === 'done');
    
    if (allDone) {
      const currentPhaseIndex = phases.indexOf(step.phase);
      if (currentPhaseIndex < phases.length - 1) {
        state.current_phase = phases[currentPhaseIndex + 1];
      } else {
        state.current_phase = 'complete';
      }
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update step: ${(error as Error).message}`
    };
  }
}

/**
 * Modify the plan's steps (used by Revisionist/Architect)
 */
export async function modifyPlan(
  params: ModifyPlanParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id, new_steps } = params;
    
    if (!workspace_id || !plan_id || !new_steps) {
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
    
    // Add index to each step
    const indexedSteps: PlanStep[] = new_steps.map((step, index) => ({
      ...step,
      index,
      status: step.status || 'pending'
    }));
    
    state.steps = indexedSteps;
    
    // Set current phase to first phase if available
    if (indexedSteps.length > 0) {
      state.current_phase = indexedSteps[0].phase;
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to modify plan: ${(error as Error).message}`
    };
  }
}

/**
 * Archive a completed plan
 */
export async function archivePlan(
  params: ArchivePlanParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Update plan status
    state.status = 'archived';
    state.current_agent = null;
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Update workspace metadata
    const workspace = await store.getWorkspace(workspace_id);
    if (workspace) {
      workspace.active_plans = workspace.active_plans.filter(id => id !== plan_id);
      if (!workspace.archived_plans.includes(plan_id)) {
        workspace.archived_plans.push(plan_id);
      }
      await store.saveWorkspace(workspace);
    }
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to archive plan: ${(error as Error).message}`
    };
  }
}
