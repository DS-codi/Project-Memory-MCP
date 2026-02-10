/**
 * Handoff Tools - MCP tools for agent lifecycle and handoff management
 * 
 * ARCHITECTURE: Hub-and-Spoke Model
 * =================================
 * - The Coordinator is the central hub that runs all other agents as subagents
 * - Control ALWAYS returns to Coordinator after any subagent completes
 * - Handoff is a RECOMMENDATION that tells the Coordinator which agent to deploy next
 * - Subagents don't transfer control directly to each other
 * 
 * These tools manage the agent session tracking:
 * - initialise_agent: Records agent activation with full context
 * - handoff: Records recommended next agent for Coordinator to deploy
 * - complete_agent: Marks an agent session as complete
 * - get_mission_briefing: Retrieves context for newly activated agent
 * - get_lineage: Returns full handoff history
 */

import type {
  InitialiseAgentParams,
  InitialiseAgentResult,
  HandoffParams,
  CompleteAgentParams,
  GetMissionBriefingParams,
  GetLineageParams,
  ToolResponse,
  PlanState,
  AgentSession,
  LineageEntry,
  MissionBriefing,
  AgentRoleBoundaries,
  AgentInstructionFile
} from '../types/index.js';
import { AGENT_BOUNDARIES } from '../types/index.js';
import * as store from '../storage/file-store.js';
import { verifyLineageIntegrity, sanitizeJsonData } from '../security/sanitize.js';
import { events } from '../events/event-emitter.js';
import * as contextTools from './context.tools.js';

/**
 * Initialize an agent session - MUST be called first by every agent
 * Records the full context of why the agent was invoked.
 * Context data is sanitized before storage.
 * 
 * Also acts as a get_state tool - returns full plan state and workspace status.
 * If workspace_id or plan_id are not provided, returns status info to help agent proceed.
 */
export async function initialiseAgent(
  params: InitialiseAgentParams
): Promise<ToolResponse<InitialiseAgentResult>> {
  try {
    const { workspace_id, plan_id, agent_type, context } = params;
    
    if (!agent_type) {
      return {
        success: false,
        error: 'agent_type is required'
      };
    }
    
    // If no workspace_id provided, check all workspaces and return status
    if (!workspace_id) {
      const allWorkspaces = await store.getAllWorkspaces();
      
      return {
        success: false,
        error: 'workspace_id is required. Use register_workspace first.',
        data: {
          session: null as unknown as AgentSession,
          plan_state: null as unknown as PlanState,
          workspace_status: {
            registered: false,
            active_plans: [],
            message: allWorkspaces.length > 0 
              ? `Found ${allWorkspaces.length} registered workspace(s): ${allWorkspaces.map(w => w.name).join(', ')}. Provide workspace_id or register a new workspace.`
              : 'No workspaces registered. Call register_workspace first with the workspace path.'
          },
          role_boundaries: AGENT_BOUNDARIES[agent_type]
        }
      };
    }
    
    // Check if workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`,
        data: {
          session: null as unknown as AgentSession,
          plan_state: null as unknown as PlanState,
          workspace_status: {
            registered: false,
            workspace_id,
            active_plans: [],
            message: `Workspace '${workspace_id}' is not registered. Call register_workspace first.`
          },
          role_boundaries: AGENT_BOUNDARIES[agent_type]
        }
      };
    }
    
    // If no plan_id provided, return workspace status with available plans
    if (!plan_id) {
      const plans = await store.getWorkspacePlans(workspace_id);
      const activePlans = plans.filter(p => p.status === 'active');
      
      return {
        success: false,
        error: 'plan_id is required. Create a plan or use an existing one.',
        data: {
          session: null as unknown as AgentSession,
          plan_state: null as unknown as PlanState,
          workspace_status: {
            registered: true,
            workspace_id,
            workspace_path: workspace.path,
            active_plans: activePlans.map(p => `${p.id}: ${p.title} (${p.status}, phase: ${p.current_phase})`),
            message: activePlans.length > 0 
              ? `Found ${activePlans.length} active plan(s). Provide plan_id to continue work, or create_plan/import_plan for new work.`
              : 'No active plans. Call create_plan or import_plan to start.'
          },
          role_boundaries: AGENT_BOUNDARIES[agent_type]
        }
      };
    }
    
    // Get plan state
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      const plans = await store.getWorkspacePlans(workspace_id);
      const activePlans = plans.filter(p => p.status === 'active');
      
      return {
        success: false,
        error: `Plan not found: ${plan_id}`,
        data: {
          session: null as unknown as AgentSession,
          plan_state: null as unknown as PlanState,
          workspace_status: {
            registered: true,
            workspace_id,
            workspace_path: workspace.path,
            active_plans: activePlans.map(p => `${p.id}: ${p.title}`),
            message: `Plan '${plan_id}' not found. Available plans: ${activePlans.map(p => p.id).join(', ') || 'none'}`
          },
          role_boundaries: AGENT_BOUNDARIES[agent_type]
        }
      };
    }
    
    // Sanitize context data
    const sanitizedContext = context ? sanitizeJsonData(context) : {};
    
    // Create new session
    const session: AgentSession = {
      session_id: store.generateSessionId(),
      agent_type,
      started_at: store.nowISO(),
      context: sanitizedContext
    };
    
    // Add session to state
    state.agent_sessions.push(session);
    
    // Set current_agent - this is the agent being deployed by Coordinator
    // Clear the recommendation since it's now being acted upon
    state.current_agent = agent_type;
    if (state.recommended_next_agent === agent_type) {
      state.recommended_next_agent = undefined;
    }
    
    // Store deployment context if provided by orchestrator
    // This tells validation to respect the orchestrator's explicit choice
    if (params.deployment_context) {
      state.deployment_context = {
        deployed_agent: agent_type,
        deployed_by: params.deployment_context.deployed_by as any,
        reason: params.deployment_context.reason,
        override_validation: params.deployment_context.override_validation !== false, // default true
        deployed_at: store.nowISO()
      };
    } else {
      // Even without explicit context, record that this agent was deployed
      // This prevents validation from overriding the deployment
      state.deployment_context = {
        deployed_agent: agent_type,
        deployed_by: state.current_agent || 'User' as any,
        reason: 'Agent initialized via init action',
        override_validation: true,
        deployed_at: store.nowISO()
      };
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Get role boundaries for this agent type
    const role_boundaries = AGENT_BOUNDARIES[agent_type];
    
    // Discover instruction files for this agent in the workspace
    let instruction_files: AgentInstructionFile[] | undefined;
    try {
      const discoveryResult = await contextTools.discoverInstructionFiles({
        workspace_id,
        target_agent: agent_type
      });
      if (discoveryResult.success && discoveryResult.data?.instructions.length) {
        instruction_files = discoveryResult.data.instructions;
      }
    } catch {
      // Instruction file discovery failure is non-fatal, just continue without them
    }
    
    return {
      success: true,
      data: {
        session,
        plan_state: state,
        workspace_status: {
          registered: true,
          workspace_id,
          workspace_path: workspace.path,
          active_plans: workspace.active_plans,
          message: `Agent ${agent_type} initialized. Plan: "${state.title}" | Phase: ${state.current_phase} | Steps: ${state.steps.filter(s => s.status === 'done').length}/${state.steps.length} complete | Handoffs: ${state.lineage.length}`
        },
        role_boundaries,
        instruction_files
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to initialise agent: ${(error as Error).message}`
    };
  }
}

/**
 * Complete an agent session - records summary and artifacts
 * 
 * HUB-AND-SPOKE MODEL:
 * - After completion, control returns to Coordinator
 * - The recommended_next_agent field tells Coordinator what to do next
 * - Non-Archivist agents MUST have called handoff before completing
 */
export async function completeAgent(
  params: CompleteAgentParams
): Promise<ToolResponse<AgentSession & { coordinator_next_action?: string }>> {
  try {
    const { workspace_id, plan_id, agent_type, summary, artifacts } = params;
    
    if (!workspace_id || !plan_id || !agent_type || !summary) {
      return {
        success: false,
        error: 'workspace_id, plan_id, agent_type, and summary are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // CRITICAL: Enforce handoff requirement for non-Archivist agents
    const boundaries = AGENT_BOUNDARIES[agent_type];
    if (!boundaries.can_finalize) {
      // Check if this agent has made a handoff in this session
      const agentHandoffs = state.lineage.filter(l => l.from_agent === agent_type);
      
      // Find the most recent session for this agent
      const currentSession = [...state.agent_sessions]
        .reverse()
        .find(s => s.agent_type === agent_type && !s.completed_at);
      
      if (currentSession) {
        // Check if any handoff occurred AFTER this session started
        const sessionStart = new Date(currentSession.started_at);
        const handoffAfterSession = agentHandoffs.some(h => 
          new Date(h.timestamp) >= sessionStart
        );
        
        if (!handoffAfterSession) {
          return {
            success: false,
            error: `BLOCKED: ${agent_type} must call handoff before complete_agent. ` +
              `You are required to recommend one of: ${boundaries.must_handoff_to.join(', ')}. ` +
              `This recommendation tells Coordinator which agent to deploy next.`
          };
        }
      }
    }
    
    // Find the most recent session for this agent type that isn't completed
    const session = [...state.agent_sessions]
      .reverse()
      .find(s => s.agent_type === agent_type && !s.completed_at);
    
    if (!session) {
      return {
        success: false,
        error: `No active session found for agent: ${agent_type}`
      };
    }
    
    // Complete the session
    session.completed_at = store.nowISO();
    session.summary = summary;
    if (artifacts) {
      session.artifacts = artifacts;
    }
    
    // Control returns to Coordinator - set current_agent back to Coordinator
    // unless this is the Archivist finalizing the plan
    if (agent_type !== 'Archivist') {
      state.current_agent = 'Coordinator';
    } else {
      state.current_agent = null;  // Plan finalized
    }
    
    // Clear deployment_context since this agent is done
    // Next agent will get fresh context from whoever deploys them
    state.deployment_context = undefined;
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Generate coordinator instruction
    const coordinatorNextAction = state.recommended_next_agent
      ? `Deploy ${state.recommended_next_agent} agent as recommended.`
      : agent_type === 'Archivist'
        ? 'Plan finalized.'
        : 'Review lineage for next agent recommendation.';
    
    return {
      success: true,
      data: {
        ...session,
        coordinator_next_action: coordinatorNextAction
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to complete agent: ${(error as Error).message}`
    };
  }
}

/**
 * Record a handoff recommendation for the Coordinator
 * 
 * IMPORTANT: This does NOT transfer control directly between agents.
 * Subagents use this to recommend which agent the Coordinator should deploy next.
 * Control always returns to Coordinator after a subagent completes.
 * 
 * The from_agent is recorded for lineage tracking, but no validation is performed
 * since subagents don't directly control each other.
 */
export async function handoff(
  params: HandoffParams
): Promise<ToolResponse<LineageEntry & { 
  verification?: { valid: boolean; issues: string[] };
  coordinator_instruction: string;
}>> {
  try {
    const { workspace_id, plan_id, from_agent, to_agent, reason, data } = params;
    
    if (!workspace_id || !plan_id || !from_agent || !to_agent || !reason) {
      return {
        success: false,
        error: 'workspace_id, plan_id, from_agent, to_agent, and reason are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Create lineage entry (recommendation record)
    const entry: LineageEntry = {
      timestamp: store.nowISO(),
      from_agent,
      to_agent,
      reason
    };
    
    // Add to lineage
    state.lineage.push(entry);
    
    // Store the recommended next agent for Coordinator to read
    // Note: We don't change current_agent here - that happens when Coordinator deploys
    state.recommended_next_agent = to_agent;
    
    // Verify lineage integrity
    const verification = verifyLineageIntegrity(state.lineage);
    
    // If data provided, store it as handoff context (sanitized)
    if (data) {
      const sanitizedData = sanitizeJsonData(data);
      const contextPath = store.getContextPath(workspace_id, plan_id, `handoff_${from_agent.toLowerCase()}_to_${to_agent.toLowerCase()}`);
      await store.writeJsonLocked(contextPath, {
        ...entry,
        data: sanitizedData
      });
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit event for dashboard
    await events.handoff(workspace_id, plan_id, from_agent, to_agent, reason);
    
    // Generate instruction for Coordinator
    const coordinatorInstruction = to_agent === 'Coordinator' 
      ? `Handoff recorded. Control returning to Coordinator for next decision.`
      : `Handoff recommendation recorded. Coordinator should deploy ${to_agent} agent next. Reason: ${reason}`;
    
    return {
      success: true,
      data: { 
        ...entry, 
        verification,
        coordinator_instruction: coordinatorInstruction
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to handoff: ${(error as Error).message}`
    };
  }
}

/**
 * Get mission briefing for a newly activated agent
 */
export async function getMissionBriefing(
  params: GetMissionBriefingParams
): Promise<ToolResponse<MissionBriefing>> {
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
    
    // Get last lineage entry for deployment info
    const lastLineage = state.lineage[state.lineage.length - 1];
    
    const briefing: MissionBriefing = {
      plan_id: state.id,
      plan_title: state.title,
      current_phase: state.current_phase,
      deployed_by: lastLineage?.from_agent || 'User',
      deployment_reason: lastLineage?.reason || 'Initial deployment',
      previous_sessions: state.agent_sessions,
      current_steps: state.steps,
      pending_steps_count: state.steps.filter(s => s.status === 'pending').length
    };
    
    return {
      success: true,
      data: briefing
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get mission briefing: ${(error as Error).message}`
    };
  }
}

/**
 * Get full lineage history for a plan
 */
export async function getLineage(
  params: GetLineageParams
): Promise<ToolResponse<LineageEntry[]>> {
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
      data: state.lineage
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get lineage: ${(error as Error).message}`
    };
  }
}
