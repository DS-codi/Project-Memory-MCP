/**
 * Consolidated Plan Tool - memory_plan
 * 
 * Actions: list, get, create, update, archive, import, find, add_note
 * Replaces: list_plans, get_workspace_plans, get_plan_state, create_plan, 
 *           modify_plan, archive_plan, import_plan, find_plan, add_plan_note
 */

import type { 
  ToolResponse, 
  PlanState, 
  PlanStep,
  RequestCategory,
  PlanOperationResult,
  ImportPlanResult,
  RequestCategorization,
  AgentType
} from '../../types/index.js';
import * as planTools from '../plan.tools.js';

export type PlanAction = 'list' | 'get' | 'create' | 'update' | 'archive' | 'import' | 'find' | 'add_note' | 'delete' | 'consolidate';

export interface MemoryPlanParams {
  action: PlanAction;
  workspace_id?: string;
  workspace_path?: string;
  plan_id?: string;
  title?: string;
  description?: string;
  category?: RequestCategory;
  priority?: 'low' | 'medium' | 'high' | 'critical';
  steps?: Omit<PlanStep, 'index'>[];
  include_archived?: boolean;
  plan_file_path?: string;
  note?: string;
  note_type?: 'info' | 'warning' | 'instruction';
  categorization?: RequestCategorization;
  confirm?: boolean;  // For delete action
  step_indices?: number[];  // For consolidate action
  consolidated_task?: string;  // For consolidate action
}

type PlanResult = 
  | { action: 'list'; data: planTools.ListPlansResult }
  | { action: 'get'; data: PlanState }
  | { action: 'create'; data: PlanState }
  | { action: 'update'; data: PlanOperationResult }
  | { action: 'archive'; data: PlanState }
  | { action: 'import'; data: ImportPlanResult }
  | { action: 'find'; data: planTools.FindPlanResult }
  | { action: 'add_note'; data: { plan_id: string; notes_count: number } }
  | { action: 'delete'; data: { deleted: boolean; plan_id: string } }
  | { action: 'consolidate'; data: PlanOperationResult };

export async function memoryPlan(params: MemoryPlanParams): Promise<ToolResponse<PlanResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: list, get, create, update, archive, import, find, add_note'
    };
  }

  switch (action) {
    case 'list': {
      if (!params.workspace_id && !params.workspace_path) {
        return {
          success: false,
          error: 'workspace_id or workspace_path is required for action: list'
        };
      }
      const result = await planTools.listPlans({
        workspace_id: params.workspace_id,
        workspace_path: params.workspace_path
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'get': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get'
        };
      }
      const result = await planTools.getPlanState({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get', data: result.data! }
      };
    }

    case 'create': {
      if (!params.workspace_id || !params.title || !params.description || !params.category) {
        return {
          success: false,
          error: 'workspace_id, title, description, and category are required for action: create'
        };
      }
      const result = await planTools.createPlan({
        workspace_id: params.workspace_id,
        title: params.title,
        description: params.description,
        category: params.category,
        priority: params.priority,
        categorization: params.categorization
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'create', data: result.data! }
      };
    }

    case 'update': {
      if (!params.workspace_id || !params.plan_id || !params.steps) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and steps are required for action: update'
        };
      }
      const result = await planTools.modifyPlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        new_steps: params.steps
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'update', data: result.data! }
      };
    }

    case 'archive': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: archive'
        };
      }
      const result = await planTools.archivePlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'archive', data: result.data! }
      };
    }

    case 'import': {
      if (!params.workspace_id || !params.plan_file_path || !params.category) {
        return {
          success: false,
          error: 'workspace_id, plan_file_path, and category are required for action: import'
        };
      }
      const result = await planTools.importPlan({
        workspace_id: params.workspace_id,
        plan_file_path: params.plan_file_path,
        title: params.title,
        category: params.category,
        priority: params.priority,
        categorization: params.categorization
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'import', data: result.data! }
      };
    }

    case 'find': {
      if (!params.plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: find'
        };
      }
      const result = await planTools.findPlan({ plan_id: params.plan_id });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'find', data: result.data! }
      };
    }

    case 'add_note': {
      if (!params.workspace_id || !params.plan_id || !params.note) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and note are required for action: add_note'
        };
      }
      const result = await planTools.addPlanNote({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        note: params.note,
        type: params.note_type
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'add_note', data: result.data! }
      };
    }

    case 'delete': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: delete'
        };
      }
      if (params.confirm !== true) {
        return {
          success: false,
          error: 'confirm=true is required for plan deletion. This action cannot be undone.'
        };
      }
      const result = await planTools.deletePlan({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        confirm: params.confirm
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'delete', data: result.data! }
      };
    }

    case 'consolidate': {
      if (!params.workspace_id || !params.plan_id || !params.step_indices || !params.consolidated_task) {
        return {
          success: false,
          error: 'workspace_id, plan_id, step_indices, and consolidated_task are required for action: consolidate'
        };
      }
      const result = await planTools.consolidateSteps({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        step_indices: params.step_indices,
        consolidated_task: params.consolidated_task
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'consolidate', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: list, get, create, update, archive, import, find, add_note`
      };
  }
}
