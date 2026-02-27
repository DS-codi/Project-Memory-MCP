/**
 * Consolidated Agent Tool - memory_agent
 * 
 * Actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage, categorize, deploy_for_task, deploy_agent_to_workspace
 * Replaces: initialise_agent, complete_agent, handoff, validate_*, list_agents, 
 *           get_agent_instructions, deploy_agents_to_workspace, get_mission_briefing, get_lineage
 *
 * deploy_agent_to_workspace — new action (Phase 0 / Phase 3 of the Dynamic Hub Agent Model).
 * Materialises a session-scoped agent file to
 *   .github/agents/sessions/{session_id}/{agent_type}.agent.md
 * and registers the session in workspace_session_registry so peers are visible.
 */

import type { 
  ToolResponse, 
  AgentType,
  AgentSession,
  LineageEntry,
  MissionBriefing,
  InitialiseAgentResult,
  RequestCategorization,
  DeployForTaskResult
} from '../../types/index.js';
import type { CategoryDecision } from '../../types/categorization.types.js';
import type { ContextPersistence } from '../../types/plan.types.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import * as handoffTools from '../handoff.tools.js';
import * as agentTools from '../agent.tools.js';
import * as validationTools from '../agent-validation.tools.js';
import { deployForTask, cleanupAgent } from '../agent-deploy.js';
import { materialiseAgent } from '../agent-materialise.js';
import {
  completeRegistrySession,
  getRegistryRow,
  getActivePeerSessions,
} from '../../db/workspace-session-registry-db.js';
import {
  resolveHubAliasRouting,
  type CanonicalHubMode,
  type LegacyHubLabel,
} from '../orchestration/hub-alias-routing.js';
import {
  hasHubPolicyContext,
  validateHubPolicy,
} from '../orchestration/hub-policy-enforcement.js';
import {
  resolveHubRolloutDecision,
  restoreLegacyStaticAgentsFromBackup,
} from '../orchestration/hub-rollout-controls.js';
import {
  buildHubTelemetrySnapshot,
  evaluateHubPromotionGates,
} from '../orchestration/hub-telemetry-dashboard.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { getPlanState, getWorkspace } from '../../storage/db-store.js';
import {
  getAgentDeployDir,
  getContextBundlePath,
  getInitContextPath,
  getManifestPath,
} from '../../storage/db-store.js';
import { preflightValidate } from '../preflight/index.js';
import { incrementStat } from '../session-stats.js';
import { events } from '../../events/event-emitter.js';
import { registerLiveSession, clearLiveSession, serverSessionIdForPrepId } from '../session-live-store.js';

export type AgentAction = 
  | 'init' 
  | 'complete' 
  | 'handoff' 
  | 'validate' 
  | 'list' 
  | 'get_instructions' 
  | 'deploy'
  | 'get_briefing'
  | 'get_lineage'
  | 'categorize'
  | 'deploy_for_task'
  | 'deploy_agent_to_workspace';

export interface MemoryAgentParams {
  action: AgentAction;
  /** Session ID for instrumentation tracking */
  _session_id?: string;
  
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
  
  // For categorize
  categorization_result?: CategoryDecision;

  // For deploy_agent_to_workspace
  /** The minted session ID to scope the materialised file under */
  session_id?: string;
  /** Free-form context payload built from Prompt Analyst enrichment */
  context_payload?: Record<string, unknown>;
  /** Per-call overrides for allowed/blocked tool surfaces */
  tool_overrides?: { allowedTools?: string[]; blockedTools?: string[] };
  /** Files this session is claiming (for peer-session conflict avoidance) */
  files_in_scope?: string[];
  /** Current phase string for the registry row */
  current_phase?: string;
  requested_hub_label?: LegacyHubLabel | 'Hub';
  current_hub_mode?: CanonicalHubMode;
  previous_hub_mode?: CanonicalHubMode;
  requested_hub_mode?: CanonicalHubMode;
  transition_event?: string;
  transition_reason_code?: string;
  prompt_analyst_enrichment_applied?: boolean;
  bypass_prompt_analyst_policy?: boolean;
  rollout_feature_flag_enabled?: boolean;
  rollout_canary_percent?: number;
  force_legacy_fallback?: boolean;
  deprecation_window_active?: boolean;
  rollback_backup_dir?: string;
  include_hub_telemetry_snapshot?: boolean;
  include_hub_promotion_gates?: boolean;
  scenario_parity_passed?: boolean;
  promotion_gate_baseline?: {
    blocked_step_rate_percent: number;
    average_handoffs_per_plan: number;
  };
  promotion_gate_thresholds?: {
    min_prompt_analyst_hit_rate_percent?: number;
    max_cross_session_conflict_rate_percent?: number;
  };

  // For deploy_for_task
  phase_context?: Record<string, unknown>;
  context_markers?: Record<string, ContextPersistence>;
  phase_name?: string;
  step_indices?: number[];
  include_research?: boolean;
  include_architecture?: boolean;
}

type AgentResult = 
  | { action: 'init'; data: InitialiseAgentResult }
  | { action: 'complete'; data: AgentSession & { coordinator_next_action?: string } }
  | { action: 'handoff'; data: LineageEntry & { verification?: { valid: boolean; issues: string[] }; coordinator_instruction: string } }
  | { action: 'validate'; data: validationTools.AgentValidationResult & { deprecation_notice?: string } }
  | { action: 'list'; data: string[] }
  | { action: 'get_instructions'; data: { filename: string; content: string } }
  | { action: 'deploy'; data: { deployed: string[]; prompts_deployed: string[]; instructions_deployed: string[]; skills_deployed: string[]; target_path: string } }
  | { action: 'get_briefing'; data: MissionBriefing & { deprecation_notice?: string } }
  | { action: 'get_lineage'; data: LineageEntry[] }
  | { action: 'categorize'; data: { categorization: RequestCategorization; category_decision: CategoryDecision; routing_resolved: boolean } }
  | { action: 'deploy_for_task'; data: DeployForTaskResult & { deprecation_notice?: string } }
  | { action: 'deploy_agent_to_workspace'; data: {
      file_path: string;
      session_id: string;
      peer_sessions_count: number;
      agent_type: string;
      workspace_id: string;
      plan_id: string;
      warnings: string[];
      policy_enforcement?: {
        requested_hub_label: LegacyHubLabel | 'Hub' | null;
        resolved_mode: CanonicalHubMode | null;
        alias_resolution_applied: boolean;
        deprecation_phase: string;
        transition_event?: string;
        transition_reason_code?: string;
        prompt_analyst_enrichment_applied: boolean;
      };
      session_registry?: {
        id: string;
        status: string;
        current_phase: string | null;
        step_indices_claimed: number[];
        files_in_scope: string[];
        materialised_path: string | null;
      };
      active_peer_sessions?: Array<{
        session_id: string;
        agent_type: string;
        plan_id: string | null;
        current_phase: string | null;
        status: string;
      }>;
      rollback_controls?: {
        routing: 'dynamic_session_scoped' | 'legacy_static_fallback';
        reason_code:
          | 'dynamic_enabled'
          | 'feature_flag_disabled'
          | 'forced_legacy_fallback'
          | 'deprecation_window_canary_holdback';
        feature_flag_enabled: boolean;
        canary_percent: number;
        canary_bucket: number;
        deprecation_window_active: boolean;
        backup_directory: string;
        restored_static_agents: string[];
      };
      hub_telemetry_snapshot?: import('../orchestration/hub-telemetry-dashboard.js').HubTelemetrySnapshot;
      hub_promotion_gates?: import('../orchestration/hub-telemetry-dashboard.js').HubPromotionGatesReport;
    } };

export async function memoryAgent(params: MemoryAgentParams): Promise<ToolResponse<AgentResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage, categorize, deploy_for_task, deploy_agent_to_workspace'
    };
  }

  // Validate and resolve workspace_id if provided (handles legacy ID redirect)
  if (params.workspace_id) {
    const validated = await validateAndResolveWorkspaceId(params.workspace_id);
    if (!validated.success) return validated.error_response as ToolResponse<AgentResult>;
    params.workspace_id = validated.workspace_id;
  }

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_agent', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return { success: false, error: preflight.message, preflight_failure: preflight } as ToolResponse<AgentResult>;
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
        include_skills: params.include_skills,
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
      
      // If extension provided session_id in context, include it in event for audit trail
      if (params.context?.session_id && params.workspace_id && params.plan_id && initData.session) {
        try {
          await events.agentSessionStarted(
            params.workspace_id,
            params.plan_id,
            params.agent_type,
            initData.session.session_id,
            { extension_session_id: params.context.session_id }
          );
        } catch {
          // Event emission failure is non-fatal
        }
      }

      // Register in live store so every subsequent tool call can update metrics
      if (initData.session) {
        registerLiveSession(
          initData.session.session_id,
          params._session_id,
          {
            agentType: params.agent_type,
            planId: params.plan_id,
            workspaceId: params.workspace_id
          }
        );
      }

      const wantsValidation = params.validate === true || params.validation_mode === 'init+validate';
      let validationError: string | undefined;

      if (wantsValidation && params.workspace_id && params.plan_id) {
        const validateFn = getValidationFunction(params.agent_type);
        if (!validateFn) {
          validationError = `No validation function for agent type: ${params.agent_type}`;
          initData.validation = {
            success: false,
            error: validationError
          };
        } else {
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
            validationError = validationResult.error;
          }
        }
      }

      // Slim init payload by offloading bulky context to init-context.json
      const offload = await offloadInitContextAndBuildPointers(params, initData);
      if (offload.context_file_paths) {
        const slimPlanState = buildSlimPlanStateSummary(params.plan_id, initData.plan_state);
        const slimWorkspaceStatus = {
          ...initData.workspace_status,
          active_plan_count: initData.workspace_status.active_plans.length,
          active_plans: []
        };

        const slimInitData = {
          session: initData.session,
          plan_state: slimPlanState,
          workspace_status: slimWorkspaceStatus,
          role_boundaries: initData.role_boundaries,
          validation: initData.validation,
          context_size_bytes: safeJsonSize({
            session: initData.session,
            plan_state: slimPlanState,
            workspace_status: slimWorkspaceStatus,
            role_boundaries: initData.role_boundaries,
            validation: initData.validation,
            context_file_paths: offload.context_file_paths
          }),
          context_file_paths: offload.context_file_paths,
          fallback_notice: offload.fallback_notice
        } as InitialiseAgentResult & { context_file_path?: string };

        slimInitData.context_file_path = offload.context_file_paths.init_context_path;

        return {
          success: validationError ? false : result.success,
          error: validationError ?? result.error,
          data: { action: 'init', data: slimInitData }
        };
      }

      initData.fallback_notice = offload.fallback_notice ??
        'init response could not be slimmed; returning inline context fields.';

      return {
        success: validationError ? false : result.success,
        error: validationError ?? result.error,
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

      // Clear from live store — session is done
      if (params._session_id) {
        const serverSid = serverSessionIdForPrepId(params._session_id);
        if (serverSid) {
          clearLiveSession(serverSid);
          try {
            completeRegistrySession(serverSid);
          } catch {
            // non-fatal: registry cleanup best effort
          }
        }
      }

      // Cleanup deployed agent files (non-fatal)
      try {
        const { getWorkspace } = await import('../../storage/db-store.js');
        const wsMeta = await getWorkspace(params.workspace_id);
        if (wsMeta) {
          const wsPath = wsMeta.workspace_path || wsMeta.path;
          await cleanupAgent(wsPath, params.agent_type, params.plan_id);
        }
      } catch (err) {
        console.warn('[memory_agent/complete] cleanupAgent failed (non-fatal):', err);
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

      // Track scope escalation events
      const sessionId = params._session_id;
      if (sessionId && params.data) {
        const d = params.data as Record<string, unknown>;
        if (d.scope_escalation === true || d.scope_exceeded === true) {
          incrementStat(sessionId, 'scope_escalations');
        }
        if (d.scope_conflict === true && params.workspace_id && params.plan_id) {
          await events.sessionScopeConflict(params.workspace_id, params.plan_id, {
            session_id: sessionId,
            from_agent: params.from_agent,
            to_agent: params.to_agent,
            reason: params.reason,
            conflict_files: Array.isArray(d.conflict_files) ? d.conflict_files : [],
          });
        }
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

      // Cleanup deployed agent files (non-fatal)
      try {
        const { getWorkspace } = await import('../../storage/db-store.js');
        const wsMeta = await getWorkspace(params.workspace_id);
        if (wsMeta) {
          const wsPath = wsMeta.workspace_path || wsMeta.path;
          await cleanupAgent(wsPath, params.from_agent, params.plan_id);
        }
      } catch (err) {
        console.warn('[memory_agent/handoff] cleanupAgent failed (non-fatal):', err);
      }

      // Mark workspace session registry row completed (best effort)
      if (params._session_id) {
        const serverSid = serverSessionIdForPrepId(params._session_id);
        if (serverSid) {
          try {
            completeRegistrySession(serverSid);
          } catch {
            // non-fatal: registry cleanup best effort
          }
        }
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
      const deprecation_notice = 'Deprecated path: memory_agent(action: "validate") remains supported for compatibility. Prefer memory_agent(action: "init", validation_mode: "init+validate") to combine initialization and validation in a single call.';
      return {
        success: true,
        data: {
          action: 'validate',
          data: { ...result.data!, deprecation_notice }
        }
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
      const deprecation_notice = 'Deprecated path: memory_agent(action: "get_briefing") remains supported for compatibility. Prefer memory_agent(action: "init") and read the returned plan_state summary + context file pointers.';
      return {
        success: true,
        data: {
          action: 'get_briefing',
          data: { ...result.data!, deprecation_notice }
        }
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

    case 'categorize': {
      if (!params.workspace_id || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id and plan_id are required for action: categorize'
        };
      }
      if (!params.categorization_result) {
        return {
          success: false,
          error: 'categorization_result is required for action: categorize'
        };
      }

      const { CATEGORY_ROUTING } = await import('../../types/category-routing.js');
      const { getPlanState, savePlanState } = await import('../../storage/db-store.js');

      // Resolve routing from the category decision
      const category = params.categorization_result.intent?.category;
      const routing = category ? CATEGORY_ROUTING[category] : undefined;

      // Build the categorization record to store on the plan
      const categorization: RequestCategorization = {
        category: category || 'feature',
        confidence: params.categorization_result.intent?.confidence || 0,
        reasoning: params.categorization_result.intent?.reasoning || '',
        suggested_workflow: routing?.workflow_path || [],
        skip_agents: routing?.skip_agents || [],
        routing_workflow: routing
      };

      // Load and update plan state
      const plan = await getPlanState(params.workspace_id, params.plan_id);
      if (!plan) {
        return { success: false, error: `Plan not found: ${params.plan_id}` };
      }
      plan.categorization = categorization;
      await savePlanState(plan);

      return {
        success: true,
        data: {
          action: 'categorize' as const,
          data: {
            categorization,
            category_decision: params.categorization_result,
            routing_resolved: !!routing
          }
        }
      };
    }

    case 'deploy_for_task': {
      if (!params.workspace_id || !params.agent_type || !params.plan_id) {
        return {
          success: false,
          error: 'workspace_id, agent_type, and plan_id are required for action: deploy_for_task'
        };
      }
      const { getWorkspace } = await import('../../storage/db-store.js');
      const wsMeta = await getWorkspace(params.workspace_id);
      if (!wsMeta) {
        return { success: false, error: `Workspace not found: ${params.workspace_id}` };
      }
      const workspacePath = wsMeta.workspace_path || wsMeta.path;
      const result = await deployForTask({
        workspace_id: params.workspace_id,
        workspace_path: workspacePath,
        agent_name: params.agent_type,
        plan_id: params.plan_id,
        phase_name: params.phase_name,
        step_indices: params.step_indices,
        include_skills: params.include_skills,
        include_research: params.include_research,
        include_architecture: params.include_architecture,
      });
      const deprecation_notice = 'Deprecated path: memory_agent(action: "deploy_for_task") remains supported for compatibility. Prefer memory_session(action: "deploy_and_prep") to combine deployment and prep in one call.';
      return {
        success: true,
        data: {
          action: 'deploy_for_task',
          data: { ...result, deprecation_notice }
        }
      };
    }

    case 'deploy_agent_to_workspace': {
      if (!params.workspace_id || !params.agent_type || !params.plan_id || !params.session_id) {
        return {
          success: false,
          error: 'workspace_id, agent_type, plan_id, and session_id are required for action: deploy_agent_to_workspace'
        };
      }

      const aliasRouting = resolveHubAliasRouting(
        params.requested_hub_label ?? 'Hub',
        params.requested_hub_mode
      );

      if (hasHubPolicyContext({
        target_agent_type: params.agent_type,
        current_hub_mode: params.current_hub_mode,
        previous_hub_mode: params.previous_hub_mode,
        requested_hub_mode: params.requested_hub_mode,
        requested_hub_label: params.requested_hub_label,
        transition_event: params.transition_event,
        transition_reason_code: params.transition_reason_code,
        prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied,
        bypass_prompt_analyst_policy: params.bypass_prompt_analyst_policy,
      })) {
        const policy = validateHubPolicy(
          {
            target_agent_type: params.agent_type,
            current_hub_mode: params.current_hub_mode,
            previous_hub_mode: params.previous_hub_mode,
            requested_hub_mode: params.requested_hub_mode,
            requested_hub_label: params.requested_hub_label,
            transition_event: params.transition_event,
            transition_reason_code: params.transition_reason_code,
            prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied,
            bypass_prompt_analyst_policy: params.bypass_prompt_analyst_policy,
          },
          aliasRouting,
        );

        if (!policy.valid) {
          await events.hubPolicyBlocked(params.workspace_id, params.plan_id, {
            code: policy.code,
            reason: policy.reason,
            details: policy.details,
            requested_hub_label: aliasRouting.requested_hub_label,
            resolved_mode: aliasRouting.resolved_mode,
            deprecation_phase: aliasRouting.deprecation_phase,
          });
          return {
            success: false,
            error: `${policy.code}: ${policy.reason}`,
          };
        }
      }

      const wsMeta = await getWorkspace(params.workspace_id);
      if (!wsMeta) {
        return { success: false, error: `Workspace not found: ${params.workspace_id}` };
      }
      const workspacePath = wsMeta.workspace_path || wsMeta.path;
      if (!workspacePath) {
        return { success: false, error: `Workspace path could not be resolved for workspace: ${params.workspace_id}` };
      }
      try {
        const rollout = resolveHubRolloutDecision(workspacePath, {
          session_id: params.session_id,
          feature_flag_enabled: params.rollout_feature_flag_enabled,
          canary_percent: params.rollout_canary_percent,
          force_legacy_fallback: params.force_legacy_fallback,
          deprecation_window_active: params.deprecation_window_active,
          backup_directory_override: params.rollback_backup_dir,
        });

        await events.hubRoutingDecision(params.workspace_id, params.plan_id, {
          session_id: params.session_id,
          target_agent_type: params.agent_type,
          requested_hub_label: aliasRouting.requested_hub_label,
          resolved_mode: aliasRouting.resolved_mode,
          alias_resolution_applied: aliasRouting.alias_resolution_applied,
          deprecation_phase: aliasRouting.deprecation_phase,
          transition_event: params.transition_event,
          transition_reason_code: params.transition_reason_code,
          prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied === true,
          routing: rollout.routing,
          routing_reason_code: rollout.reason_code,
          feature_flag_enabled: rollout.feature_flag_enabled,
          canary_percent: rollout.canary_percent,
          canary_bucket: rollout.canary_bucket,
          deprecation_window_active: rollout.deprecation_window_active,
        });

        const shouldIncludeTelemetry =
          params.include_hub_telemetry_snapshot || params.include_hub_promotion_gates;

        const telemetrySnapshot = shouldIncludeTelemetry
          ? await buildHubTelemetrySnapshot(params.workspace_id)
          : undefined;

        const promotionGates = params.include_hub_promotion_gates && telemetrySnapshot
          ? evaluateHubPromotionGates(telemetrySnapshot, {
            baseline: params.promotion_gate_baseline,
            thresholds: params.promotion_gate_thresholds,
            scenario_parity_passed: params.scenario_parity_passed,
          })
          : undefined;

        if (rollout.routing === 'legacy_static_fallback') {
          const restoreResult = await restoreLegacyStaticAgentsFromBackup(
            workspacePath,
            params.agent_type,
            rollout.backup_directory,
          );
          const peerSessions = getActivePeerSessions(params.workspace_id, params.session_id);
          const requestedSlug = params.agent_type.toLowerCase().replace(/\s+/g, '-');
          const fallbackPath =
            restoreResult.target_agent_path ??
            path.join(workspacePath, '.github', 'agents', `${requestedSlug}.agent.md`);

          return {
            success: true,
            data: {
              action: 'deploy_agent_to_workspace',
              data: {
                file_path: fallbackPath,
                session_id: params.session_id,
                peer_sessions_count: peerSessions.length,
                agent_type: params.agent_type,
                workspace_id: params.workspace_id,
                plan_id: params.plan_id,
                warnings: restoreResult.warnings,
                policy_enforcement: {
                  requested_hub_label: aliasRouting.requested_hub_label,
                  resolved_mode: aliasRouting.resolved_mode,
                  alias_resolution_applied: aliasRouting.alias_resolution_applied,
                  deprecation_phase: aliasRouting.deprecation_phase,
                  transition_event: params.transition_event,
                  transition_reason_code: params.transition_reason_code,
                  prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied === true,
                },
                active_peer_sessions: peerSessions.map((peer) => ({
                  session_id: peer.sessionId,
                  agent_type: peer.agentType,
                  plan_id: peer.planId,
                  current_phase: peer.currentPhase,
                  status: peer.status,
                })),
                rollback_controls: {
                  routing: rollout.routing,
                  reason_code: rollout.reason_code,
                  feature_flag_enabled: rollout.feature_flag_enabled,
                  canary_percent: rollout.canary_percent,
                  canary_bucket: rollout.canary_bucket,
                  deprecation_window_active: rollout.deprecation_window_active,
                  backup_directory: rollout.backup_directory,
                  restored_static_agents: restoreResult.restored_files,
                },
                hub_telemetry_snapshot: telemetrySnapshot,
                hub_promotion_gates: promotionGates,
              },
            },
          };
        }

        const result = await materialiseAgent({
          workspaceId:    params.workspace_id,
          workspacePath,
          planId:         params.plan_id,
          agentType:      params.agent_type,
          sessionId:      params.session_id,
          phaseName:      params.phase_name,
          stepIndices:    params.step_indices,
          contextPayload: params.context_payload,
          toolOverrides:  params.tool_overrides,
          filesInScope:   params.files_in_scope,
          currentPhase:   params.current_phase ?? params.phase_name,
        });

        const registryRow = getRegistryRow(result.sessionId);
        const peerSessions = getActivePeerSessions(params.workspace_id, result.sessionId);

        return {
          success: true,
          data: {
            action: 'deploy_agent_to_workspace',
            data: {
              file_path:           result.filePath,
              session_id:          result.sessionId,
              peer_sessions_count: result.peerSessionsCount,
              agent_type:          params.agent_type,
              workspace_id:        params.workspace_id,
              plan_id:             params.plan_id,
              warnings:            result.warnings,
              policy_enforcement: {
                requested_hub_label: aliasRouting.requested_hub_label,
                resolved_mode: aliasRouting.resolved_mode,
                alias_resolution_applied: aliasRouting.alias_resolution_applied,
                deprecation_phase: aliasRouting.deprecation_phase,
                transition_event: params.transition_event,
                transition_reason_code: params.transition_reason_code,
                prompt_analyst_enrichment_applied: params.prompt_analyst_enrichment_applied === true,
              },
              session_registry: registryRow ? {
                id: registryRow.id,
                status: registryRow.status,
                current_phase: registryRow.current_phase,
                step_indices_claimed: safeParseJsonArray<number>(registryRow.step_indices_claimed),
                files_in_scope: safeParseJsonArray<string>(registryRow.files_in_scope),
                materialised_path: registryRow.materialised_path,
              } : undefined,
              active_peer_sessions: peerSessions.map((peer) => ({
                session_id: peer.sessionId,
                agent_type: peer.agentType,
                plan_id: peer.planId,
                current_phase: peer.currentPhase,
                status: peer.status,
              })),
              rollback_controls: {
                routing: rollout.routing,
                reason_code: rollout.reason_code,
                feature_flag_enabled: rollout.feature_flag_enabled,
                canary_percent: rollout.canary_percent,
                canary_bucket: rollout.canary_bucket,
                deprecation_window_active: rollout.deprecation_window_active,
                backup_directory: rollout.backup_directory,
                restored_static_agents: [],
              },
              hub_telemetry_snapshot: telemetrySnapshot,
              hub_promotion_gates: promotionGates,
            },
          },
        };
      } catch (err) {
        return {
          success: false,
          error: `deploy_agent_to_workspace failed: ${(err as Error).message}`,
        };
      }
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: init, complete, handoff, validate, list, get_instructions, deploy, get_briefing, get_lineage, categorize, deploy_for_task, deploy_agent_to_workspace`
      };
  }
}

function safeJsonSize(value: unknown): number {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf-8');
  } catch {
    return 0;
  }
}

function safeParseJsonArray<T>(value: string | null | undefined): T[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function buildSlimPlanStateSummary(planId: string | undefined, planState: unknown): unknown {
  if (!planState || typeof planState !== 'object') {
    return { plan_id: planId };
  }

  const state = planState as Record<string, unknown>;
  const steps = Array.isArray(state.steps) ? state.steps as Array<Record<string, unknown>> : [];

  const countByStatus = (status: string): number =>
    steps.filter(step => step?.status === status).length;

  const pendingStepSummaries = steps
    .filter(step => step?.status === 'pending' || step?.status === 'active')
    .slice(0, 10)
    .map(step => ({
      index: step.index,
      phase: step.phase,
      task: step.task,
      status: step.status
    }));

  return {
    plan_id: (state.id as string | undefined) ?? planId,
    title: state.title,
    current_phase: state.current_phase,
    step_counts: {
      total: steps.length,
      pending: countByStatus('pending'),
      active: countByStatus('active'),
      done: countByStatus('done'),
      blocked: countByStatus('blocked')
    },
    pending_steps: pendingStepSummaries
  };
}

async function offloadInitContextAndBuildPointers(
  params: MemoryAgentParams,
  initData: InitialiseAgentResult
): Promise<{
  context_file_paths: InitialiseAgentResult['context_file_paths'];
  fallback_notice?: string;
}> {
  if (!params.workspace_id || !params.plan_id || !params.agent_type) {
    return {
      context_file_paths: null,
      fallback_notice: 'init offload unavailable: missing workspace_id, plan_id, or agent_type.'
    };
  }

  const workspace = await getWorkspace(params.workspace_id);
  if (!workspace) {
    return {
      context_file_paths: null,
      fallback_notice: `init offload unavailable: workspace not found (${params.workspace_id}).`
    };
  }

  const workspacePath = workspace.workspace_path || workspace.path;
  if (!workspacePath) {
    return {
      context_file_paths: null,
      fallback_notice: 'init offload unavailable: workspace path is missing.'
    };
  }

  const agentName = params.agent_type.toLowerCase();
  const agentDir = getAgentDeployDir(workspacePath, agentName);
  const initContextPath = getInitContextPath(workspacePath, agentName);
  const contextBundlePath = getContextBundlePath(workspacePath, agentName);
  const manifestPath = getManifestPath(workspacePath, agentName);
  const skillsDirPath = path.join(workspacePath, '.github', 'skills');

  let contextBundlePathFromManifest = contextBundlePath;
  try {
    const manifestRaw = await fs.readFile(manifestPath, 'utf-8');
    const manifest = JSON.parse(manifestRaw) as { context_bundle_path?: string };
    if (manifest.context_bundle_path) {
      contextBundlePathFromManifest = manifest.context_bundle_path;
    }
  } catch {
    // Non-fatal: manifest may not exist when init is called directly
  }

  const fullPlanState = await getPlanState(params.workspace_id, params.plan_id);

  const offloadedPayload = {
    schema_version: '1.1',
    written_at: new Date().toISOString(),
    workspace_id: params.workspace_id,
    plan_id: params.plan_id,
    agent_type: params.agent_type,
    session_id: initData.session?.session_id,
    full_plan_state: fullPlanState,
    role_boundaries: initData.role_boundaries,
    instruction_files: initData.instruction_files,
    matched_skills: initData.matched_skills,
    workspace_context_summary: initData.workspace_context_summary,
    tool_contracts: initData.tool_contracts
  };

  try {
    await fs.mkdir(agentDir, { recursive: true });
    await fs.writeFile(initContextPath, JSON.stringify(offloadedPayload, null, 2), 'utf-8');
  } catch {
    return {
      context_file_paths: null,
      fallback_notice: 'init offload unavailable: failed to write init-context.json; returning inline context fields.'
    };
  }

  let skillsDir: string | null = null;
  try {
    const stat = await fs.stat(skillsDirPath);
    if (stat.isDirectory()) {
      skillsDir = skillsDirPath;
    }
  } catch {
    skillsDir = null;
  }

  const instructionPaths = (initData.instruction_files ?? [])
    .map(file => file.full_path)
    .filter((v): v is string => typeof v === 'string' && v.length > 0);

  return {
    context_file_paths: {
      agent_dir: agentDir,
      instruction_file_paths: instructionPaths,
      context_bundle_path: contextBundlePathFromManifest,
      skills_dir: skillsDir,
      init_context_path: initContextPath
    }
  };
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
    case 'Cognition':
      return validationTools.validateCognition;
    default:
      return null;
  }
}
