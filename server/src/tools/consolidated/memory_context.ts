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
  AgentInstructionFile
} from '../../types/index.js';
import * as contextTools from '../context.tools.js';

export type ContextAction = 
  | 'store' 
  | 'get' 
  | 'store_initial' 
  | 'list' 
  | 'list_research' 
  | 'append_research'
  | 'generate_instructions';

export interface MemoryContextParams {
  action: ContextAction;
  workspace_id: string;
  plan_id: string;
  
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
}

type ContextResult = 
  | { action: 'store'; data: { path: string; security_warnings?: string[] } }
  | { action: 'get'; data: Record<string, unknown> }
  | { action: 'store_initial'; data: { path: string; context_summary: string } }
  | { action: 'list'; data: string[] }
  | { action: 'list_research'; data: string[] }
  | { action: 'append_research'; data: { path: string; sanitized: boolean; injection_attempts: string[]; warnings: string[] } }
  | { action: 'generate_instructions'; data: { instruction_file: AgentInstructionFile; content: string; written_to: string } };

export async function memoryContext(params: MemoryContextParams): Promise<ToolResponse<ContextResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions'
    };
  }

  if (!workspace_id || !plan_id) {
    return {
      success: false,
      error: 'workspace_id and plan_id are required'
    };
  }

  switch (action) {
    case 'store': {
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

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions`
      };
  }
}
