/**
 * Handoff Tools - MCP tools for agent lifecycle and handoff management
 * 
 * These tools manage the critical agent session tracking, including:
 * - initialise_agent: Records agent activation with full context
 * - handoff: Transfers control between agents
 * - complete_agent: Marks an agent session as complete
 * - get_mission_briefing: Retrieves context for newly activated agent
 * - get_lineage: Returns full handoff history
 * 
 * Security: Includes lineage verification to prevent invalid transitions.
 */

import type {
  InitialiseAgentParams,
  HandoffParams,
  CompleteAgentParams,
  GetMissionBriefingParams,
  GetLineageParams,
  ToolResponse,
  PlanState,
  AgentSession,
  LineageEntry,
  MissionBriefing
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { verifyLineageIntegrity, sanitizeJsonData } from '../security/sanitize.js';

/**
 * Initialize an agent session - MUST be called first by every agent
 * Records the full context of why the agent was invoked.
 * Context data is sanitized before storage.
 */
export async function initialiseAgent(
  params: InitialiseAgentParams
): Promise<ToolResponse<AgentSession>> {
  try {
    const { workspace_id, plan_id, agent_type, context } = params;
    
    if (!workspace_id || !plan_id || !agent_type) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and agent_type are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
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
    state.current_agent = agent_type;
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: session
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
 */
export async function completeAgent(
  params: CompleteAgentParams
): Promise<ToolResponse<AgentSession>> {
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
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: session
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to complete agent: ${(error as Error).message}`
    };
  }
}

/**
 * Handoff control from one agent to another
 * Includes verification of valid agent transitions.
 */
export async function handoff(
  params: HandoffParams
): Promise<ToolResponse<LineageEntry & { verification?: { valid: boolean; issues: string[] } }>> {
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
    
    // Verify the handoff is from the current agent
    if (state.current_agent && state.current_agent !== from_agent) {
      return {
        success: false,
        error: `Invalid handoff: current agent is ${state.current_agent}, not ${from_agent}`
      };
    }
    
    // Create lineage entry
    const entry: LineageEntry = {
      timestamp: store.nowISO(),
      from_agent,
      to_agent,
      reason
    };
    
    // Add to lineage
    state.lineage.push(entry);
    state.current_agent = to_agent;
    
    // Verify lineage integrity
    const verification = verifyLineageIntegrity(state.lineage);
    
    // If data provided, store it as handoff context (sanitized)
    if (data) {
      const sanitizedData = sanitizeJsonData(data);
      const contextPath = store.getContextPath(workspace_id, plan_id, `handoff_${from_agent.toLowerCase()}_to_${to_agent.toLowerCase()}`);
      await store.writeJson(contextPath, {
        ...entry,
        data: sanitizedData
      });
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: { ...entry, verification }
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
