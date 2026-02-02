/**
 * Consolidated Steps Tool - memory_steps
 * 
 * Actions: add, update, batch_update
 * Replaces: append_steps, update_step, batch_update_steps
 */

import type { 
  ToolResponse, 
  PlanStep,
  PlanOperationResult,
  StepStatus
} from '../../types/index.js';
import * as planTools from '../plan.tools.js';

export type StepsAction = 'add' | 'update' | 'batch_update';

export interface MemoryStepsParams {
  action: StepsAction;
  workspace_id: string;
  plan_id: string;
  
  // For 'add' action
  steps?: Omit<PlanStep, 'index'>[];
  
  // For 'update' action
  step_index?: number;
  status?: StepStatus;
  notes?: string;
  agent_type?: string;
  
  // For 'batch_update' action
  updates?: Array<{
    index: number;
    status: StepStatus;
    notes?: string;
  }>;
}

type StepsResult = 
  | { action: 'add'; data: PlanOperationResult }
  | { action: 'update'; data: PlanOperationResult }
  | { action: 'batch_update'; data: PlanOperationResult };

export async function memorySteps(params: MemoryStepsParams): Promise<ToolResponse<StepsResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: add, update, batch_update'
    };
  }

  if (!workspace_id || !plan_id) {
    return {
      success: false,
      error: 'workspace_id and plan_id are required'
    };
  }

  switch (action) {
    case 'add': {
      if (!params.steps || params.steps.length === 0) {
        return {
          success: false,
          error: 'steps array is required for action: add'
        };
      }
      const result = await planTools.appendSteps({
        workspace_id,
        plan_id,
        new_steps: params.steps
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'add', data: result.data! }
      };
    }

    case 'update': {
      if (params.step_index === undefined || !params.status) {
        return {
          success: false,
          error: 'step_index and status are required for action: update'
        };
      }
      const result = await planTools.updateStep({
        workspace_id,
        plan_id,
        step_index: params.step_index,
        status: params.status,
        notes: params.notes
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'update', data: result.data! }
      };
    }

    case 'batch_update': {
      if (!params.updates || params.updates.length === 0) {
        return {
          success: false,
          error: 'updates array is required for action: batch_update'
        };
      }
      // Map 'index' to 'step_index' for the underlying function
      const mappedUpdates = params.updates.map(u => ({
        step_index: u.index,
        status: u.status,
        notes: u.notes
      }));
      const result = await planTools.batchUpdateSteps({
        workspace_id,
        plan_id,
        updates: mappedUpdates
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'batch_update', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: add, update, batch_update`
      };
  }
}
