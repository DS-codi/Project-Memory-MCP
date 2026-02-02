/**
 * Consolidated Workspace Tool - memory_workspace
 * 
 * Actions: register, list, info, reindex
 * Replaces: register_workspace, list_workspaces, get_workspace_plans, reindex_workspace
 */

import type { ToolResponse, WorkspaceMeta, WorkspaceProfile, PlanState } from '../../types/index.js';
import * as workspaceTools from '../workspace.tools.js';
import * as store from '../../storage/file-store.js';

export type WorkspaceAction = 'register' | 'list' | 'info' | 'reindex';

export interface MemoryWorkspaceParams {
  action: WorkspaceAction;
  workspace_path?: string;  // for register
  workspace_id?: string;    // for info, reindex
}

interface WorkspaceInfoResult {
  workspace: WorkspaceMeta;
  plans: PlanState[];
  active_plans: number;
  archived_plans: number;
}

type WorkspaceResult = 
  | { action: 'register'; data: { workspace: WorkspaceMeta; first_time: boolean; indexed: boolean; profile?: WorkspaceProfile } }
  | { action: 'list'; data: WorkspaceMeta[] }
  | { action: 'info'; data: WorkspaceInfoResult }
  | { action: 'reindex'; data: { workspace_id: string; previous_profile?: WorkspaceProfile; new_profile: WorkspaceProfile; changes: object } };

export async function memoryWorkspace(params: MemoryWorkspaceParams): Promise<ToolResponse<WorkspaceResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: register, list, info, reindex'
    };
  }

  switch (action) {
    case 'register': {
      if (!params.workspace_path) {
        return {
          success: false,
          error: 'workspace_path is required for action: register'
        };
      }
      const result = await workspaceTools.registerWorkspace({ workspace_path: params.workspace_path });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'register', data: result.data! }
      };
    }

    case 'list': {
      const result = await workspaceTools.listWorkspaces();
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'info': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: info'
        };
      }
      
      // Get workspace details
      const workspace = await store.getWorkspace(params.workspace_id);
      if (!workspace) {
        return {
          success: false,
          error: `Workspace not found: ${params.workspace_id}`
        };
      }
      
      // Get plans for this workspace
      const plansResult = await workspaceTools.getWorkspacePlans({ workspace_id: params.workspace_id });
      const plans = plansResult.success ? plansResult.data! : [];
      
      const activePlans = plans.filter(p => p.status !== 'archived');
      const archivedPlans = plans.filter(p => p.status === 'archived');
      
      return {
        success: true,
        data: {
          action: 'info',
          data: {
            workspace,
            plans,
            active_plans: activePlans.length,
            archived_plans: archivedPlans.length
          }
        }
      };
    }

    case 'reindex': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: reindex'
        };
      }
      const result = await workspaceTools.reindexWorkspace({ workspace_id: params.workspace_id });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'reindex', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: register, list, info, reindex`
      };
  }
}
