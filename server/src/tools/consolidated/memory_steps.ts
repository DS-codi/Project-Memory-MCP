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

export type StepsAction = 'add' | 'update' | 'batch_update' | 'insert' | 'delete' | 'reorder' | 'move';

export interface MemoryStepsParams {
  action: StepsAction;
  workspace_id: string;
  plan_id: string;
  
  // For 'add' action
  steps?: Omit<PlanStep, 'index'>[];
  
  // For 'insert' action
  at_index?: number;
  step?: Omit<PlanStep, 'index'>;
  
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
  
  // For 'reorder' action - swap step with adjacent step
  direction?: 'up' | 'down';
  
  // For 'move' action - move step to specific index
  from_index?: number;
  to_index?: number;
}

type StepsResult = 
  | { action: 'add'; data: PlanOperationResult }
  | { action: 'update'; data: PlanOperationResult }
  | { action: 'batch_update'; data: PlanOperationResult }
  | { action: 'insert'; data: PlanOperationResult }
  | { action: 'delete'; data: PlanOperationResult }
  | { action: 'reorder'; data: PlanOperationResult }
  | { action: 'move'; data: PlanOperationResult };

export async function memorySteps(params: MemoryStepsParams): Promise<ToolResponse<StepsResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: add, update, batch_update, insert, delete'
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

    case 'insert': {
      if (params.at_index === undefined || !params.step) {
        return {
          success: false,
          error: 'at_index and step are required for action: insert'
        };
      }
      const result = await planTools.insertStep({
        workspace_id,
        plan_id,
        at_index: params.at_index,
        step: params.step
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'insert', data: result.data! }
      };
    }

    case 'delete': {
      if (params.step_index === undefined) {
        return {
          success: false,
          error: 'step_index is required for action: delete'
        };
      }
      const result = await planTools.deleteStep({
        workspace_id,
        plan_id,
        step_index: params.step_index
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'delete', data: result.data! }
      };
    }

    case 'reorder': {
      if (params.step_index === undefined || !params.direction) {
        return {
          success: false,
          error: 'step_index and direction (up/down) are required for action: reorder'
        };
      }
      const result = await planTools.reorderStep({
        workspace_id,
        plan_id,
        step_index: params.step_index,
        direction: params.direction
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'reorder', data: result.data! }
      };
    }

    case 'move': {
      if (params.from_index === undefined || params.to_index === undefined) {
        return {
          success: false,
          error: 'from_index and to_index are required for action: move'
        };
      }
      const result = await planTools.moveStep({
        workspace_id,
        plan_id,
        from_index: params.from_index,
        to_index: params.to_index
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'move', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: add, update, batch_update, insert, delete, reorder, move`
      };
  }
}
