/**
 * Consolidated Agent Tool - memory_agent
 * 
 * Actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage
 * Replaces: initialise_agent, complete_agent, handoff, validate_*, list_agents, 
 *           get_agent_instructions, deploy_agents_to_workspace, get_mission_briefing, get_lineage
 */

import type { 
  ToolResponse, 
  AgentType,
  AgentSession,
  LineageEntry,
  MissionBriefing,
  InitialiseAgentResult
} from '../../types/index.js';
import * as handoffTools from '../handoff.tools.js';
import * as agentTools from '../agent.tools.js';
import * as validationTools from '../agent-validation.tools.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';

export type AgentAction = 
  | 'init' 
  | 'complete' 
  | 'handoff' 
  | 'validate' 
  | 'list' 
  | 'get_instructions' 
  | 'deploy'
  | 'get_briefing'
  | 'get_lineage';

export interface MemoryAgentParams {
  action: AgentAction;
  
  // For init, complete, handoff, validate, get_briefing, get_lineage
  workspace_id?: string;
  plan_id?: string;
  agent_type?: AgentType;
  
  // For init
  context?: Record<string, unknown>;
  compact?: boolean;  // Default true - return compact plan state
  context_budget?: number;  // Optional byte budget for plan_state payload
  include_workspace_context?: boolean;  // If true, include workspace context summary in init response
  validate?: boolean;
  validation_mode?: 'init+validate';
  deployment_context?: {
    deployed_by: string;           // Who is deploying (Coordinator, Analyst, Runner, User)
    reason: string;                // Why this agent was chosen
    override_validation?: boolean; // Default true - validation respects this
  };
  
  // For complete
  summary?: string;
  artifacts?: string[];
  
  // For handoff
  from_agent?: AgentType;
  to_agent?: AgentType;
  reason?: string;
  data?: Record<string, unknown>;
  
  // For get_instructions
  agent_name?: string;
  
  // For deploy
  workspace_path?: string;
  agents?: string[];
  include_prompts?: boolean;
  include_instructions?: boolean;
  include_skills?: boolean;
}

type AgentResult = 
  | { action: 'init'; data: InitialiseAgentResult }
  | { action: 'complete'; data: AgentSession & { coordinator_next_action?: string } }
  | { action: 'handoff'; data: LineageEntry & { verification?: { valid: boolean; issues: string[] }; coordinator_instruction: string } }
  | { action: 'validate'; data: validationTools.AgentValidationResult }
  | { action: 'list'; data: string[] }
  | { action: 'get_instructions'; data: { filename: string; content: string } }
  | { action: 'deploy'; data: { deployed: string[]; prompts_deployed: string[]; instructions_deployed: string[]; skills_deployed: string[]; target_path: string } }
  | { action: 'get_briefing'; data: MissionBriefing }
  | { action: 'get_lineage'; data: LineageEntry[] };

export async function memoryAgent(params: MemoryAgentParams): Promise<ToolResponse<AgentResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage'
    };
  }

  // Validate and resolve workspace_id if provided (handles legacy ID redirect)
  if (params.workspace_id) {
    const validated = await validateAndResolveWorkspaceId(params.workspace_id);
    if (!validated.success) return validated.error_response as ToolResponse<AgentResult>;
    params.workspace_id = validated.workspace_id;
  }

  switch (action) {
    case 'init': {
      if (!params.agent_type) {
        return {
          success: false,
          error: 'agent_type is required for action: init'
        };
      }
      const result = await handoffTools.initialiseAgent({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        agent_type: params.agent_type,
        context: params.context || {},
        compact: params.compact,
        context_budget: params.context_budget,
        include_workspace_context: params.include_workspace_context,
        deployment_context: params.deployment_context ? {
          deployed_by: params.deployment_context.deployed_by as any,
          reason: params.deployment_context.reason,
          override_validation: params.deployment_context.override_validation
        } : undefined
      });
      // Note: initialiseAgent can return success=false but still have useful data
      if (!result.success && !result.data) {
        return { success: false, error: result.error };
      }

      const initData = result.data!;
      const wantsValidation = params.validate === true || params.validation_mode === 'init+validate';

      if (wantsValidation && params.workspace_id && params.plan_id) {
        const validateFn = getValidationFunction(params.agent_type);
        if (!validateFn) {
          initData.validation = {
            success: false,
            error: `No validation function for agent type: ${params.agent_type}`
          };
          return {
            success: false,
            error: initData.validation.error,
            data: { action: 'init', data: initData }
          };
        }

        const validationResult = await validateFn({
          workspace_id: params.workspace_id,
          plan_id: params.plan_id
        });

        initData.validation = {
          success: validationResult.success,
          result: validationResult.data,
          error: validationResult.error
        };

        if (!validationResult.success) {
          return {
            success: false,
            error: validationResult.error,
            data: { action: 'init', data: initData }
          };
        }
      }

      return {
        success: result.success,
        error: result.error,
        data: { action: 'init', data: initData }
      };
    }

    case 'complete': {
      if (!params.workspace_id || !params.plan_id || !params.agent_type || !params.summary) {
        return {
          success: false,
          error: 'workspace_id, plan_id, agent_type, and summary are required for action: complete'
        };
      }
      const result = await handoffTools.completeAgent({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        agent_type: params.agent_type,
        summary: params.summary,
        artifacts: params.artifacts
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'complete', data: result.data! }
      };
    }

    case 'handoff': {
      if (!params.workspace_id || !params.plan_id || !params.from_agent || !params.to_agent || !params.reason) {
        return {
          success: false,
          error: 'workspace_id, plan_id, from_agent, to_agent, and reason are required for action: handoff'
        };
      }
      const result = await handoffTools.handoff({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id,
        from_agent: params.from_agent,
        to_agent: params.to_agent,
        reason: params.reason,
        data: params.data
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'handoff', data: result.data! }
      };
    }

    case 'validate': {
      if (!params.workspace_id || !params.plan_id || !params.agent_type) {
        return {
          success: false,
          error: 'workspace_id, plan_id, and agent_type are required for action: validate'
        };
      }
      // Call the appropriate validation tool based on agent type
      const validateFn = getValidationFunction(params.agent_type);
      if (!validateFn) {
        return {
          success: false,
          error: `No validation function for agent type: ${params.agent_type}`
        };
      }
      const result = await validateFn({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'validate', data: result.data! }
      };
    }

    case 'list': {
      const result = await agentTools.listAgents();
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'get_instructions': {
      if (!params.agent_name) {
        return {
          success: false,
          error: 'agent_name is required for action: get_instructions'
        };
      }
      const result = await agentTools.getAgentInstructions({
        agent_name: params.agent_name
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get_instructions', data: result.data! }
      };
    }

    case 'deploy': {
      if (!params.workspace_path) {
        return {
          success: false,
          error: 'workspace_path is required for action: deploy'
        };
      }
      const result = await agentTools.deployAgentsToWorkspace({
        workspace_path: params.workspace_path,
        agents: params.agents,
        include_prompts: params.include_prompts,
        include_instructions: params.include_instructions,
        include_skills: params.include_skills
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'deploy', data: result.data! }
      };
    }

    case 'get_briefing': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get_briefing'
        };
      }
      const result = await handoffTools.getMissionBriefing({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get_briefing', data: result.data! }
      };
    }

    case 'get_lineage': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: get_lineage'
        };
      }
      const result = await handoffTools.getLineage({
        workspace_id: params.workspace_id,
        plan_id: params.plan_id
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'get_lineage', data: result.data! }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage`
      };
  }
}

/**
 * Get the validation function for a specific agent type
 */
function getValidationFunction(agentType: AgentType): ((params: validationTools.ValidateAgentParams) => Promise<ToolResponse<validationTools.AgentValidationResult>>) | null {
  switch (agentType) {
    case 'Coordinator':
      return validationTools.validateCoordinator;
    case 'Researcher':
      return validationTools.validateResearcher;
    case 'Architect':
      return validationTools.validateArchitect;
    case 'Executor':
      return validationTools.validateExecutor;
    case 'Builder':
      return validationTools.validateBuilder;
    case 'Reviewer':
      return validationTools.validateReviewer;
    case 'Tester':
      return validationTools.validateTester;
    case 'Revisionist':
      return validationTools.validateRevisionist;
    case 'Archivist':
      return validationTools.validateArchivist;
    case 'Analyst':
      return validationTools.validateAnalyst;
    case 'Brainstorm':
      return validationTools.validateBrainstorm;
    case 'Runner':
      return validationTools.validateRunner;
    case 'SkillWriter':
      return validationTools.validateSkillWriter;
    case 'Worker':
      return validationTools.validateWorker;
    case 'TDDDriver':
      return validationTools.validateTDDDriver;
    default:
      return null;
  }
}
