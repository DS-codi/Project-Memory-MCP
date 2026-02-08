/**
 * Consolidated Context Tool - memory_context
 * 
 * Actions: store, get, store_initial, list, list_research, append_research, generate_instructions
 * Replaces: store_context, get_context, store_initial_context, list_context, 
 *           list_research_notes, append_research, generate_plan_instructions
 */

import type { 
  ToolResponse, 
  RequestCategory,
  AgentType,
  AgentInstructionFile,
  WorkspaceContext
} from '../../types/index.js';
import * as contextTools from '../context.tools.js';
import * as workspaceContextTools from '../workspace-context.tools.js';

export type ContextAction = 
  | 'store' 
  | 'get' 
  | 'store_initial' 
  | 'list' 
  | 'list_research' 
  | 'append_research'
  | 'generate_instructions'
  | 'batch_store'
  | 'workspace_get'
  | 'workspace_set'
  | 'workspace_update'
  | 'workspace_delete';

export interface MemoryContextParams {
  action: ContextAction;
  workspace_id: string;
  plan_id?: string;
  
  // For store, get
  type?: string;
  data?: Record<string, unknown>;
  
  // For store_initial
  user_request?: string;
  files_mentioned?: string[];
  file_contents?: Record<string, string>;
  requirements?: string[];
  constraints?: string[];
  examples?: string[];
  conversation_context?: string;
  additional_notes?: string;
  
  // For append_research
  filename?: string;
  content?: string;
  
  // For generate_instructions (agent mission instructions)
  target_agent?: AgentType;
  mission?: string;
  context?: string[];
  deliverables?: string[];
  files_to_read?: string[];
  output_path?: string;
  
  // For batch_store - store multiple context items at once
  items?: Array<{ type: string; data: Record<string, unknown> }>;
}

type ContextResult = 
  | { action: 'store'; data: { path: string; security_warnings?: string[] } }
  | { action: 'get'; data: Record<string, unknown> }
  | { action: 'store_initial'; data: { path: string; context_summary: string } }
  | { action: 'list'; data: string[] }
  | { action: 'list_research'; data: string[] }
  | { action: 'append_research'; data: { path: string; sanitized: boolean; injection_attempts: string[]; warnings: string[] } }
  | { action: 'generate_instructions'; data: { instruction_file: AgentInstructionFile; content: string; written_to: string } }
  | { action: 'batch_store'; data: { stored: Array<{ type: string; path: string }>; failed: Array<{ type: string; error: string }> } }
  | { action: 'workspace_get'; data: { context: WorkspaceContext; path: string } }
  | { action: 'workspace_set'; data: { context: WorkspaceContext; path: string } }
  | { action: 'workspace_update'; data: { context: WorkspaceContext; path: string } }
  | { action: 'workspace_delete'; data: { deleted: boolean; path: string } };

export async function memoryContext(params: MemoryContextParams): Promise<ToolResponse<ContextResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store'
    };
  }

  if (!workspace_id) {
    return {
      success: false,
      error: 'workspace_id is required'
    };
  }

  switch (action) {
    case 'store': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: store'
        };
      }
      if (!params.type || !params.data) {
        return {
          success: false,
          error: 'type and data are required for action: store'
        };
      }
      const result = await contextTools.storeContext({
        workspace_id,
        plan_id,
        type: params.type,
        data: params.data
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'store', data: result.data! }
      };
    }

    case 'get': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: get'
        };
      }
      if (!params.type) {
        return {
          success: false,
          error: 'type is required for action: get'
        };
      }
      const result = await contextTools.getContext({
        workspace_id,
        plan_id,
        type: params.type
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get', data: result.data! }
      };
    }

    case 'store_initial': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: store_initial'
        };
      }
      if (!params.user_request) {
        return {
          success: false,
          error: 'user_request is required for action: store_initial'
        };
      }
      const result = await contextTools.storeInitialContext({
        workspace_id,
        plan_id,
        user_request: params.user_request,
        files_mentioned: params.files_mentioned,
        file_contents: params.file_contents,
        requirements: params.requirements,
        constraints: params.constraints,
        examples: params.examples,
        conversation_context: params.conversation_context,
        additional_notes: params.additional_notes
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'store_initial', data: result.data! }
      };
    }

    case 'list': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: list'
        };
      }
      const result = await contextTools.listContext({
        workspace_id,
        plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'list_research': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: list_research'
        };
      }
      const result = await contextTools.listResearchNotes({
        workspace_id,
        plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list_research', data: result.data! }
      };
    }

    case 'append_research': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: append_research'
        };
      }
      if (!params.filename || !params.content) {
        return {
          success: false,
          error: 'filename and content are required for action: append_research'
        };
      }
      const result = await contextTools.appendResearch({
        workspace_id,
        plan_id,
        filename: params.filename,
        content: params.content
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'append_research', data: result.data! }
      };
    }

    case 'generate_instructions': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: generate_instructions'
        };
      }
      if (!params.target_agent || !params.mission) {
        return {
          success: false,
          error: 'target_agent and mission are required for action: generate_instructions'
        };
      }
      const result = await contextTools.generateAgentInstructions({
        workspace_id,
        plan_id,
        target_agent: params.target_agent,
        mission: params.mission,
        context: params.context,
        constraints: params.constraints,
        deliverables: params.deliverables,
        files_to_read: params.files_to_read,
        output_path: params.output_path
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'generate_instructions', data: result.data! }
      };
    }

    case 'batch_store': {
      if (!plan_id) {
        return {
          success: false,
          error: 'plan_id is required for action: batch_store'
        };
      }
      if (!params.items || params.items.length === 0) {
        return {
          success: false,
          error: 'items array is required for action: batch_store'
        };
      }
      
      const stored: Array<{ type: string; path: string }> = [];
      const failed: Array<{ type: string; error: string }> = [];
      
      for (const item of params.items) {
        const result = await contextTools.storeContext({
          workspace_id,
          plan_id,
          type: item.type,
          data: item.data
        });
        if (result.success && result.data) {
          stored.push({ type: item.type, path: result.data.path });
        } else {
          failed.push({ type: item.type, error: result.error || 'Unknown error' });
        }
      }
      
      return {
        success: true,
        data: { action: 'batch_store', data: { stored, failed } }
      };
    }

    case 'workspace_get': {
      const result = await workspaceContextTools.getWorkspaceContext({
        workspace_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'workspace_get', data: result.data! }
      };
    }

    case 'workspace_set': {
      if (!params.data) {
        return {
          success: false,
          error: 'data is required for action: workspace_set'
        };
      }
      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id,
        data: params.data
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'workspace_set', data: result.data! }
      };
    }

    case 'workspace_update': {
      if (!params.data) {
        return {
          success: false,
          error: 'data is required for action: workspace_update'
        };
      }
      const result = await workspaceContextTools.updateWorkspaceContext({
        workspace_id,
        data: params.data
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'workspace_update', data: result.data! }
      };
    }

    case 'workspace_delete': {
      const result = await workspaceContextTools.deleteWorkspaceContext({
        workspace_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'workspace_delete', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_get, workspace_set, workspace_update, workspace_delete`
      };
  }
}
