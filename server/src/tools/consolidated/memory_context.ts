/**
 * Consolidated Context Tool - memory_context
 * 
 * Actions: store, get, store_initial, list, list_research, append_research, generate_instructions,
 *          batch_store, workspace_*, knowledge_*, search, promptanalyst_discover, pull, write_prompt
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
import * as knowledgeTools from '../knowledge.tools.js';
import * as promptWriter from '../prompt-writer.js';
import * as promptStorage from '../prompt-storage.js';
import { searchContext, promptAnalystDiscoverLinkedMemory } from '../context-search.tools.js';
import { pullContext } from '../context-pull.tools.js';
import { recordFileOp } from '../stats-hooks.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate } from '../preflight/index.js';

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
  | 'workspace_delete'
  | 'knowledge_store'
  | 'knowledge_get'
  | 'knowledge_list'
  | 'knowledge_delete'
  | 'search'
  | 'promptanalyst_discover'
  | 'pull'
  | 'write_prompt'
  | 'dump_context';

export interface MemoryContextParams {
  action: ContextAction;
  workspace_id: string;
  plan_id?: string;
  /** Session ID for instrumentation tracking */
  _session_id?: string;
  
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

  // For search, pull
  query?: string;
  scope?: 'plan' | 'workspace' | 'program' | 'all';
  types?: string[];
  selectors?: Array<Record<string, unknown>>;
  limit?: number;
  
  // For knowledge_store, knowledge_get, knowledge_delete
  slug?: string;
  title?: string;
  category?: string;
  tags?: string[];
  created_by_agent?: string;
  created_by_plan?: string;

  // For write_prompt
  prompt_title?: string;
  prompt_agent?: string;
  prompt_description?: string;
  prompt_sections?: Array<{ title: string; content: string }>;
  prompt_variables?: string[];
  prompt_raw_body?: string;
  prompt_mode?: string;
  prompt_phase?: string;
  prompt_step_indices?: number[];
  prompt_expires_after?: string;
  prompt_version?: string;
  prompt_slug?: string;
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
  | { action: 'workspace_delete'; data: { deleted: boolean; path: string } }
  | { action: 'knowledge_store'; data: { knowledge_file: knowledgeTools.KnowledgeFile; created: boolean } }
  | { action: 'knowledge_get'; data: { knowledge_file: knowledgeTools.KnowledgeFile } }
  | { action: 'knowledge_list'; data: { files: knowledgeTools.KnowledgeFileMeta[]; total: number } }
  | { action: 'knowledge_delete'; data: { deleted: boolean; slug: string } }
  | { action: 'search'; data: { scope: 'plan' | 'workspace' | 'program' | 'all'; query: string; types: string[]; limit: number; total: number; truncated: boolean; truncation: { requested_limit: number; applied_limit: number; returned: number; total_before_limit: number }; results: Array<Record<string, unknown>> } }
  | { action: 'promptanalyst_discover'; data: { query: string; limit: number; total: number; truncated: boolean; linked_workspace_ids: string[]; related_plan_ids: string[]; results: Array<Record<string, unknown>> } }
  | { action: 'pull'; data: { scope: 'plan' | 'workspace' | 'program' | 'all'; selectors: Array<Record<string, unknown>>; total: number; staged: Array<Record<string, unknown>> } }
  | { action: 'write_prompt'; data: { filePath: string; slug: string; version: string } }
  | { action: 'dump_context'; data: contextTools.DumpContextResult };

export async function memoryContext(params: MemoryContextParams): Promise<ToolResponse<ContextResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, search, promptanalyst_discover, pull, dump_context'
    };
  }

  if (!workspace_id) {
    return {
      success: false,
      error: 'workspace_id is required'
    };
  }

  // Validate and resolve workspace_id (handles legacy ID redirect)
  const validated = await validateAndResolveWorkspaceId(workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<ContextResult>;
  const resolvedWorkspaceId = validated.workspace_id;

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_context', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return { success: false, error: preflight.message, preflight_failure: preflight } as ToolResponse<ContextResult>;
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
      recordFileOp(params._session_id, 'write');
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
      recordFileOp(params._session_id, 'read', params.type);
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
      recordFileOp(params._session_id, 'write');
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

    case 'knowledge_store': {
      if (!params.slug) {
        return { success: false, error: 'slug is required for action: knowledge_store' };
      }
      if (!params.title) {
        return { success: false, error: 'title is required for action: knowledge_store' };
      }
      const result = await knowledgeTools.storeKnowledgeFile({
        workspace_id: resolvedWorkspaceId,
        slug: params.slug,
        title: params.title,
        content: params.content || '',
        category: params.category as knowledgeTools.KnowledgeFileCategory,
        tags: params.tags,
        created_by_agent: params.created_by_agent,
        created_by_plan: params.created_by_plan,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'knowledge_store' as const, data: result.data! }
      };
    }

    case 'knowledge_get': {
      if (!params.slug) {
        return { success: false, error: 'slug is required for action: knowledge_get' };
      }
      const result = await knowledgeTools.getKnowledgeFile(resolvedWorkspaceId, params.slug);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'knowledge_get' as const, data: result.data! }
      };
    }

    case 'knowledge_list': {
      const result = await knowledgeTools.listKnowledgeFiles(
        resolvedWorkspaceId,
        params.category
      );
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'knowledge_list' as const, data: result.data! }
      };
    }

    case 'knowledge_delete': {
      if (!params.slug) {
        return { success: false, error: 'slug is required for action: knowledge_delete' };
      }
      const result = await knowledgeTools.deleteKnowledgeFile(resolvedWorkspaceId, params.slug);
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'knowledge_delete' as const, data: result.data! }
      };
    }

    case 'search': {
      const result = await searchContext({
        workspace_id: resolvedWorkspaceId,
        plan_id,
        query: params.query,
        scope: params.scope,
        types: params.types,
        limit: params.limit,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      recordFileOp(params._session_id, 'read', 'search');
      return {
        success: true,
        data: {
          action: 'search' as const,
          data: result.data!
        }
      };
    }

    case 'promptanalyst_discover': {
      const result = await promptAnalystDiscoverLinkedMemory({
        workspace_id: resolvedWorkspaceId,
        query: params.query ?? '',
        limit: params.limit,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      recordFileOp(params._session_id, 'read', 'promptanalyst_discover');
      return {
        success: true,
        data: {
          action: 'promptanalyst_discover' as const,
          data: result.data!,
        }
      };
    }

    case 'pull': {
      const result = await pullContext({
        workspace_id: resolvedWorkspaceId,
        plan_id,
        scope: params.scope,
        query: params.query,
        types: params.types,
        selectors: params.selectors,
        limit: params.limit,
        session_id: params._session_id,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      recordFileOp(params._session_id, 'write', 'pull');
      return {
        success: true,
        data: {
          action: 'pull' as const,
          data: result.data!
        }
      };
    }

    case 'write_prompt': {
      if (!plan_id) {
        return { success: false, error: 'plan_id is required for action: write_prompt' };
      }
      if (!params.prompt_title || !params.prompt_agent || !params.prompt_description) {
        return {
          success: false,
          error: 'prompt_title, prompt_agent, and prompt_description are required for action: write_prompt'
        };
      }

      // Resolve slug and auto-increment version if prompt already exists
      const promptSlug = params.prompt_slug || promptWriter.slugify(params.prompt_title);
      const resolvedVersion = await promptStorage.resolveNextVersion(
        resolvedWorkspaceId,
        plan_id,
        promptSlug,
        params.prompt_version,
      );

      const promptData: promptWriter.PromptData = {
        title: params.prompt_title,
        frontmatter: {
          agent: params.prompt_agent,
          description: params.prompt_description,
          mode: params.prompt_mode || 'agent',
          version: resolvedVersion,
          created_by: params.created_by_agent,
          plan_id: plan_id,
          phase: params.prompt_phase,
          step_indices: params.prompt_step_indices,
          expires_after: params.prompt_expires_after || 'plan_completion',
          tags: params.tags,
          plan_updated_at: new Date().toISOString(),
        },
        sections: params.prompt_sections,
        variables: params.prompt_variables,
        rawBody: params.prompt_raw_body,
      };

      const outputDir = promptStorage.getPlanPromptsPath(resolvedWorkspaceId, plan_id);
      const writeResult = await promptWriter.generatePromptFile(
        promptData,
        outputDir,
        promptSlug,
      );

      return {
        success: true,
        data: {
          action: 'write_prompt' as const,
          data: {
            filePath: writeResult.filePath,
            slug: writeResult.slug,
            version: writeResult.version,
          }
        }
      };
    }

    case 'dump_context': {
      if (!plan_id) {
        return { success: false, error: 'plan_id is required for action: dump_context' };
      }
      const result = await contextTools.handleDumpContext({
        workspace_id: resolvedWorkspaceId,
        plan_id,
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'dump_context' as const, data: result.data! },
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: store, get, store_initial, list, list_research, append_research, generate_instructions, batch_store, workspace_*, knowledge_*, search, promptanalyst_discover, pull, write_prompt, dump_context`
      };
  }
}
