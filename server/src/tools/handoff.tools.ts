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
import type { HandoffStats, StatsValidationResult } from '../types/index.js';
import { promises as fs } from 'fs';
import { AGENT_BOUNDARIES } from '../types/index.js';
import * as store from '../storage/file-store.js';
import { verifyLineageIntegrity, sanitizeJsonData } from '../security/sanitize.js';
import { events } from '../events/event-emitter.js';
import * as contextTools from './context.tools.js';
import { compactifyPlanState, compactifyWithBudget } from '../utils/compact-plan-state.js';
import { initSessionStats, finalizeSessionStats, validateStats } from './session-stats.js';
import { generateIncidentReport } from './incident-report.js';
import { buildWorkspaceContextSummary } from '../utils/workspace-context-summary.js';
import { buildSkillRegistry } from './skill-registry.js';
import { invalidateSkillRegistryCache } from './skill-registry.js';
import { matchSkillsToStep } from './skill-phase-matcher.js';
import {
  recoverStaleRuns,
  acquireActiveRun,
  releaseActiveRun,
  writeActiveRun,
  type ActiveRunLifecycleRecord
} from './orchestration/stale-run-recovery.js';
import { buildToolContracts } from './preflight/index.js';

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
  let acquiredRunId: string | undefined;
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

    // Recover stale active sessions/steps/run lanes before creating a new session.
    await recoverStaleRuns(workspace_id, plan_id, state);
    
    // Sanitize context data and ensure run_id exists for lifecycle tracking
    const rawContext = context ? sanitizeJsonData(context) : {};
    const sessionId = store.generateSessionId();
    const existingRunId = extractRunId(rawContext);
    const runId = existingRunId ?? `run_${sessionId}`;
    const sanitizedContext: Record<string, unknown> = {
      ...(rawContext as Record<string, unknown>),
      run_id: runId
    };

    // Enforce single active subagent lane per plan_id.
    // Coordinator orchestration can remain interactive; worker agents are serialized per plan.
    if (agent_type !== 'Coordinator') {
      const runState: ActiveRunLifecycleRecord = {
        run_id: runId,
        workspace_id,
        plan_id,
        status: 'active',
        started_at: store.nowISO(),
        last_updated_at: store.nowISO(),
        owner_agent: agent_type
      };

      const acquireResult = await acquireActiveRun(workspace_id, plan_id, runState);
      if (!acquireResult.acquired) {
        const activeRun = acquireResult.active_run;
        return {
          success: false,
          error: `Plan ${plan_id} already has an active subagent lane (${activeRun?.owner_agent ?? 'unknown'}) started at ${activeRun?.started_at ?? 'unknown'}. Wait for handoff/complete or stale recovery before starting another subagent for this plan.`,
          data: {
            session: null as unknown as AgentSession,
            plan_state: state,
            workspace_status: {
              registered: true,
              workspace_id,
              workspace_path: workspace.path,
              active_plans: workspace.active_plans,
              message: 'Blocked overlapping subagent run for same plan_id.'
            },
            role_boundaries: AGENT_BOUNDARIES[agent_type]
          }
        };
      }
      acquiredRunId = runId;
    }
    
    // Create new session
    const session: AgentSession = {
      session_id: sessionId,
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

    const runIdFromContext = extractRunId(sanitizedContext);
    if (agent_type !== 'Coordinator' && runIdFromContext) {
      const runState: ActiveRunLifecycleRecord = {
        run_id: runIdFromContext,
        workspace_id,
        plan_id,
        status: 'active',
        started_at: session.started_at,
        last_updated_at: store.nowISO(),
        owner_agent: agent_type
      };
      await writeActiveRun(workspace_id, plan_id, runState);
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Get role boundaries for this agent type
    const role_boundaries = AGENT_BOUNDARIES[agent_type];
    
    // Discover instruction files for this agent in the workspace
    // Score them against current task context and return top 5 most relevant
    let instruction_files: AgentInstructionFile[] | undefined;
    try {
      const discoveryResult = await contextTools.discoverInstructionFiles({
        workspace_id,
        target_agent: agent_type
      });
      if (discoveryResult.success && discoveryResult.data?.instructions.length) {
        const planContext = buildInstructionScoringContext(state);
        instruction_files = scoreAndFilterInstructions(
          discoveryResult.data.instructions,
          planContext,
          5
        );
      }
    } catch {
      // Instruction file discovery failure is non-fatal, just continue without them
    }

    // Initialize session stats tracking with context bundle file list
    try {
      const bundleFiles: string[] = [];
      if (instruction_files) {
        for (const inf of instruction_files) {
          if (inf.files_to_read) bundleFiles.push(...inf.files_to_read);
        }
      }
      // Include any context files the agent was told to read
      const ctxFilesToRead = (sanitizedContext as Record<string, unknown>)?.files_to_read;
      if (Array.isArray(ctxFilesToRead)) {
        bundleFiles.push(...ctxFilesToRead.filter((f): f is string => typeof f === 'string'));
      }
      initSessionStats(session.session_id, bundleFiles);
    } catch {
      // Stats init failure is non-fatal
    }
    
    // Determine plan_state payload: compact (default) or full
    const useCompact = params.compact !== false;
    let plan_state_payload: typeof state | ReturnType<typeof compactifyPlanState> = state;
    if (useCompact) {
      plan_state_payload = params.context_budget
        ? compactifyWithBudget(state, params.context_budget)
        : compactifyPlanState(state);
    }

    // Optionally load workspace context summary
    let workspace_context_summary: import('../types/index.js').WorkspaceContextSummary | undefined;
    if (params.include_workspace_context) {
      try {
        workspace_context_summary = await buildWorkspaceContextSummary(workspace_id);
      } catch {
        // Non-fatal: if context loading fails, just omit the field
      }
    }

    // Discover and match workspace skills against plan/step context (cached registry)
    let matched_skills: import('../types/index.js').MatchedSkillEntry[] | undefined;
    if (params.include_skills !== false) {
      try {
        const registry = await buildSkillRegistry(workspace.path);
        if (registry.entries.length > 0) {
          // Collect keywords from plan title, current phase, and active/pending steps
          const contextParts = [
            state.title,
            state.current_phase,
            ...state.steps
              .filter(s => s.status === 'active' || s.status === 'pending')
              .slice(0, 5)
              .map(s => s.task)
          ];

          // TDDDriver gets boosted testing-related context
          if (agent_type === 'TDDDriver') {
            contextParts.push('testing', 'tdd', 'test-driven development', 'unit test', 'test framework', 'red green refactor');
          }

          // Use matchSkillsToStep with a synthetic step built from aggregated context
          const syntheticStep = { phase: state.current_phase || '', task: contextParts.filter(Boolean).join(' '), index: 0, status: 'active' as const };
          const matches = matchSkillsToStep(registry, syntheticStep);

          if (matches.length > 0) {
            // Determine phase-linked skills from current phase definition
            const currentPhase = state.phases?.find(p => p.name === state.current_phase);
            const phaseLinkedSkills = new Set(currentPhase?.linked_skills ?? []);

            // Build matched_skills with lazy content loading for top 3
            const top = matches.slice(0, 5);
            const entries: import('../types/index.js').MatchedSkillEntry[] = [];
            for (let idx = 0; idx < top.length; idx++) {
              const m = top[idx];
              const isPhaseLinked = phaseLinkedSkills.has(m.skill_name);
              let content: string | undefined;
              if (idx < 3) {
                const entry = registry.entries.find(e => e.name === m.skill_name);
                if (entry?.file_path) {
                  try { content = await fs.readFile(entry.file_path, 'utf-8'); } catch { /* skip */ }
                }
              }
              entries.push({
                skill_name: m.skill_name,
                relevance_score: isPhaseLinked
                  ? Math.round(Math.min(m.relevance_score + 0.2, 1.0) * 1000) / 1000
                  : m.relevance_score,
                matched_keywords: m.matched_keywords,
                content,
                phase_linked: isPhaseLinked || undefined,
              });
            }

            // Re-sort after phase boost to keep highest scores first
            entries.sort((a, b) => b.relevance_score - a.relevance_score);
            matched_skills = entries;
          }
        }
      } catch {
        // Non-fatal: skill matching failure doesn't block init
      }
    }

    // Build per-agent tool contract summaries (non-fatal)
    let tool_contracts: import('../types/preflight.types.js').ToolContractSummary[] | undefined;
    try {
      tool_contracts = buildToolContracts(agent_type);
    } catch (contractErr) {
      console.warn(
        `[preflight] Failed to build tool contracts for ${agent_type}:`,
        (contractErr as Error).message
      );
      // Continue without tool_contracts — non-fatal
    }

    return {
      success: true,
      data: {
        session,
        plan_state: plan_state_payload,
        workspace_status: {
          registered: true,
          workspace_id,
          workspace_path: workspace.path,
          active_plans: workspace.active_plans,
          message: `Agent ${agent_type} initialized. Plan: "${state.title}" | Phase: ${state.current_phase} | Steps: ${state.steps.filter(s => s.status === 'done').length}/${state.steps.length} complete | Handoffs: ${state.lineage.length}`
        },
        role_boundaries,
        instruction_files,
        matched_skills,
        workspace_context_summary,
        tool_contracts,
        context_size_bytes: measurePayloadSize(plan_state_payload, workspace_context_summary, matched_skills)
      }
    };
  } catch (error) {
    if (params.workspace_id && params.plan_id && acquiredRunId) {
      await releaseActiveRun(params.workspace_id, params.plan_id, 'SPAWN_RELEASE_ERROR_PATH', acquiredRunId);
    }
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

    const runIdFromSession = extractRunId(session.context);
    
    // Complete the session
    session.completed_at = store.nowISO();
    session.summary = summary;
    if (artifacts) {
      session.artifacts = artifacts;
    }

    // --- Handoff Stats: finalize MCP-tracked stats & validate ---
    const mcpTracked = finalizeSessionStats(session.session_id, session.started_at);
    if (mcpTracked) {
      session.handoff_stats = mcpTracked;

      // Check for agent-reported stats stored during handoff()
      const agentReported = (session as AgentSession & { agent_reported_stats?: HandoffStats }).agent_reported_stats;
      if (agentReported) {
        const validationResult = validateStats(mcpTracked, agentReported);
        session.stats_validation = validationResult;
        if (!validationResult.matches) {
          console.warn(
            `[handoff-stats] Stats discrepancies for session ${session.session_id} (${session.agent_type}):`,
            validationResult.discrepancies
          );
        }
        // Clean up temporary field
        delete (session as AgentSession & { agent_reported_stats?: HandoffStats }).agent_reported_stats;
      }
    }
    
    // --- Incident Report: auto-generate for Revisionist sessions ---
    if (agent_type === 'Revisionist') {
      try {
        const report = generateIncidentReport(workspace_id, plan_id, session, state);
        await contextTools.storeContext({
          workspace_id,
          plan_id,
          type: 'incident_report',
          data: report as unknown as Record<string, unknown>,
        });
        if (session.artifacts) {
          session.artifacts.push('incident_report');
        } else {
          session.artifacts = ['incident_report'];
        }
      } catch (err) {
        console.warn(
          `[incident-report] Failed to generate incident report for session ${session.session_id}:`,
          (err as Error).message,
        );
      }
    }

    // --- SkillWriter cache invalidation: when a SkillWriter completes with skill artifacts ---
    if (agent_type === 'SkillWriter' && artifacts?.some(a => a.includes('.github/skills/'))) {
      try {
        const ws = await store.getWorkspace(workspace_id);
        if (ws?.path) {
          invalidateSkillRegistryCache(ws.path);
        }
      } catch {
        // Non-fatal: cache invalidation failure shouldn't block completion
      }
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
    await releaseActiveRun(workspace_id, plan_id, 'SPAWN_RELEASE_COMPLETE', runIdFromSession);
    
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
    if (params.workspace_id && params.plan_id) {
      await releaseActiveRun(params.workspace_id, params.plan_id, 'SPAWN_RELEASE_ERROR_PATH');
    }
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
 * 
 * REVIEWER BUILD-MODE HANDOFF DATA TEMPLATE:
 * When from_agent is 'Reviewer' in build-check mode, the data field should conform to BuilderHandoffData:
 *   { recommendation, mode, build_success, scripts_run, build_instructions?,
 *     optimization_suggestions?, dependency_notes?, regression_report? }
 * See types/common.types.ts BuilderHandoffData for the full interface.
 * Coordinator surfaces build_instructions, optimization_suggestions, and
 * dependency_notes to the user.
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

    const runIdFromHandoff = extractRunId(data);
    const releaseReasonCode = extractReleaseReasonCode(data) ?? 'SPAWN_RELEASE_HANDOFF';
    
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

    // Accept agent-reported HandoffStats if provided in data
    if (data && isValidHandoffStats(data.handoff_stats)) {
      const currentSession = [...state.agent_sessions]
        .reverse()
        .find(s => s.agent_type === from_agent && !s.completed_at);
      if (currentSession) {
        // Store on session context so completeAgent can retrieve it for validation
        (currentSession as AgentSession & { agent_reported_stats?: HandoffStats }).agent_reported_stats =
          data.handoff_stats as HandoffStats;
      }
    }
    
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

      // Store failed Reviewer regression results as high-priority context
      // This data survives compact-mode trimming for downstream agents
      if (from_agent === 'Reviewer' && isFailedRegressionCheck(data)) {
        await storeBuilderRegressionFailure(workspace_id, plan_id, data);
      }

      // Flag Worker budget/scope exceeded for Coordinator intervention
      if (from_agent === 'Worker' && isWorkerLimitExceeded(data)) {
        await storeWorkerLimitExceeded(workspace_id, plan_id, data);
      }

      // Store TDD cycle state from TDDDriver handoffs
      if (from_agent === 'TDDDriver' && isTDDCycleData(data)) {
        await storeTDDCycleState(workspace_id, plan_id, data);
      }
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    const fallbackRunId = findActiveSessionRunId(state, from_agent);
    await releaseActiveRun(workspace_id, plan_id, releaseReasonCode, runIdFromHandoff ?? fallbackRunId);
    
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
    if (params.workspace_id && params.plan_id) {
      await releaseActiveRun(params.workspace_id, params.plan_id, 'SPAWN_RELEASE_ERROR_PATH');
    }
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

// =============================================================================
// Instruction File Relevance Scoring
// =============================================================================

/**
 * Build a context string from plan state for instruction file scoring.
 */
function buildInstructionScoringContext(state: PlanState): string {
  const parts: string[] = [
    state.title,
    state.current_phase,
    state.description
  ];

  // Add active & pending step tasks
  for (const s of state.steps) {
    if (s.status === 'active' || s.status === 'pending') {
      parts.push(s.task);
      if (s.phase) parts.push(s.phase);
    }
  }

  return parts.filter(Boolean).join(' ').toLowerCase();
}

/**
 * Score instruction files against plan context and return top N.
 * 
 * Scoring heuristic:
 * - Mission keyword overlap with plan context
 * - Recency (newer files score higher)
 * - File-to-read overlap with active step tasks
 */
function scoreAndFilterInstructions(
  instructions: AgentInstructionFile[],
  planContext: string,
  maxResults: number
): AgentInstructionFile[] {
  if (instructions.length <= maxResults) return instructions;

  const scored = instructions.map(instr => {
    let score = 0;

    // Mission keyword overlap
    const missionWords = (instr.mission || '').toLowerCase().split(/\s+/).filter(w => w.length > 3);
    for (const word of missionWords) {
      if (planContext.includes(word)) score += 2;
    }

    // Context keyword overlap
    for (const ctx of instr.context || []) {
      const ctxWords = ctx.toLowerCase().split(/\s+/).filter(w => w.length > 3);
      for (const word of ctxWords) {
        if (planContext.includes(word)) score += 1;
      }
    }

    // Files-to-read overlap (if any file mentioned in context)
    for (const file of instr.files_to_read || []) {
      const basename = file.split('/').pop()?.toLowerCase() || '';
      if (planContext.includes(basename)) score += 3;
    }

    // Recency bonus: newer instructions score higher
    if (instr.generated_at) {
      const ageMs = Date.now() - new Date(instr.generated_at).getTime();
      const ageHours = ageMs / (1000 * 60 * 60);
      if (ageHours < 1) score += 5;
      else if (ageHours < 24) score += 3;
      else if (ageHours < 168) score += 1;  // Within a week
    }

    return { instruction: instr, score };
  });

  // Sort by score descending, take top N
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, maxResults).map(s => s.instruction);
}

// =============================================================================
// Payload Size Measurement
// =============================================================================

/**
 * Measure total payload size of the major init response components.
 * Used for monitoring and debugging context budget issues.
 */
function measurePayloadSize(
  planState: unknown,
  workspaceContext: unknown,
  matchedSkills: unknown
): number {
  let totalBytes = 0;
  try {
    if (planState) totalBytes += Buffer.byteLength(JSON.stringify(planState), 'utf-8');
    if (workspaceContext) totalBytes += Buffer.byteLength(JSON.stringify(workspaceContext), 'utf-8');
    if (matchedSkills) totalBytes += Buffer.byteLength(JSON.stringify(matchedSkills), 'utf-8');
  } catch {
    // If measurement fails, return 0 rather than blocking init
  }
  return totalBytes;
}

// =============================================================================
// Reviewer Regression Failure Storage
// =============================================================================

/**
 * Check if handoff data represents a failed Reviewer regression check.
 */
function isFailedRegressionCheck(data: Record<string, unknown>): boolean {
  return (
    data.mode === 'regression_check' &&
    data.build_success === false
  );
}

/**
 * Store failed Reviewer regression results as high-priority context.
 * 
 * This context is stored under the 'builder_regression_failure' type and includes:
 * - The failing step index (from regression_report.suspected_step)
 * - Error output (from regression_report.errors)
 * - Suspected breaking change details
 * - A 'priority: high' marker so it survives compact-mode trimming
 */
async function storeBuilderRegressionFailure(
  workspace_id: string,
  plan_id: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const regressionReport = data.regression_report as Record<string, unknown> | undefined;
    const suspectedStep = regressionReport?.suspected_step as Record<string, unknown> | undefined;
    const errors = regressionReport?.errors as Array<Record<string, unknown>> | undefined;

    const failureContext = {
      priority: 'high' as const,
      stored_at: store.nowISO(),
      failing_step_index: suspectedStep?.index ?? null,
      suspected_breaking_change: suspectedStep
        ? {
            step_index: suspectedStep.index,
            phase: suspectedStep.phase,
            task: suspectedStep.task,
            confidence: suspectedStep.confidence,
            reasoning: suspectedStep.reasoning
          }
        : null,
      error_output: errors?.map(e => ({
        file: e.file,
        line: e.line,
        message: e.message
      })) ?? [],
      regression_summary: regressionReport?.regression_summary ?? data.reason ?? 'Build regression detected',
      scripts_run: data.scripts_run ?? []
    };

    const contextPath = store.getContextPath(workspace_id, plan_id, 'builder_regression_failure');
    await store.writeJsonLocked(contextPath, {
      type: 'builder_regression_failure',
      plan_id,
      workspace_id,
      ...failureContext
    });
  } catch {
    // Non-fatal: don't let regression storage failure block the handoff
  }
}

// =============================================================================
// Worker Limit Exceeded Storage
// =============================================================================

/**
 * Check if Worker handoff data indicates budget or scope exceeded.
 */
function isWorkerLimitExceeded(data: Record<string, unknown>): boolean {
  return (
    data.budget_exceeded === true ||
    data.scope_escalation === true
  );
}

/**
 * Store Worker limit-exceeded context for Coordinator intervention.
 * Flags that the Worker ran into scope or budget limits and the hub
 * should reassess the task decomposition.
 */
async function storeWorkerLimitExceeded(
  workspace_id: string,
  plan_id: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const limitContext = {
      priority: 'high' as const,
      stored_at: store.nowISO(),
      budget_exceeded: data.budget_exceeded === true,
      scope_escalation: data.scope_escalation === true,
      files_modified: data.files_modified ?? [],
      files_created: data.files_created ?? [],
      remaining_work: data.remaining_work ?? null,
      reason: data.reason ?? 'Worker limit exceeded'
    };

    const contextPath = store.getContextPath(workspace_id, plan_id, 'worker_limit_exceeded');
    await store.writeJsonLocked(contextPath, {
      type: 'worker_limit_exceeded',
      plan_id,
      workspace_id,
      ...limitContext
    });
  } catch {
    // Non-fatal: don't let limit storage failure block the handoff
  }
}

// =============================================================================
// TDD Cycle State Storage
// =============================================================================

/**
 * Check if handoff data contains TDD cycle state information.
 */
function isTDDCycleData(data: Record<string, unknown>): boolean {
  return (
    data.tdd_cycle_state != null ||
    data.cycles_completed != null ||
    data.current_phase === 'red' || data.current_phase === 'green' || data.current_phase === 'refactor'
  );
}

/**
 * Store TDD cycle state from TDDDriver handoffs.
 * Persists cycle progress so TDDDriver can resume on re-deployment.
 */
async function storeTDDCycleState(
  workspace_id: string,
  plan_id: string,
  data: Record<string, unknown>
): Promise<void> {
  try {
    const cycleState = data.tdd_cycle_state as Record<string, unknown> | undefined;

    const tddContext = {
      stored_at: store.nowISO(),
      cycle_number: cycleState?.cycle_number ?? data.cycles_completed ?? 0,
      current_phase: cycleState?.current_phase ?? data.current_phase ?? 'red',
      test_file: cycleState?.test_file ?? data.test_file ?? null,
      implementation_file: cycleState?.implementation_file ?? data.implementation_file ?? null,
      iterations: cycleState?.iterations ?? [],
      tests_written: data.tests_written ?? 0,
      test_files: data.test_files ?? [],
      implementation_files: data.implementation_files ?? []
    };

    const contextPath = store.getContextPath(workspace_id, plan_id, 'tdd_cycle_state');
    await store.writeJsonLocked(contextPath, {
      type: 'tdd_cycle_state',
      plan_id,
      workspace_id,
      ...tddContext
    });
  } catch {
    // Non-fatal: don't let TDD state storage failure block the handoff
  }
}

function extractRunId(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  if (typeof record.run_id === 'string' && record.run_id.trim()) {
    return record.run_id;
  }

  const spawnConfig = record.spawn_config;
  if (spawnConfig && typeof spawnConfig === 'object') {
    const spawnRecord = spawnConfig as Record<string, unknown>;
    if (typeof spawnRecord.run_id === 'string' && spawnRecord.run_id.trim()) {
      return spawnRecord.run_id;
    }

    const orchestration = spawnRecord.orchestration;
    if (orchestration && typeof orchestration === 'object') {
      const orchestrationRecord = orchestration as Record<string, unknown>;
      if (typeof orchestrationRecord.run_id === 'string' && orchestrationRecord.run_id.trim()) {
        return orchestrationRecord.run_id;
      }
    }
  }

  return undefined;
}

function extractReleaseReasonCode(value: unknown): string | undefined {
  if (!value || typeof value !== 'object') {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  const candidates = [record.spawn_reason_code, record.reason_code, record.release_reason_code];
  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.startsWith('SPAWN_')) {
      return candidate;
    }
  }

  const spawnConfig = record.spawn_config;
  if (spawnConfig && typeof spawnConfig === 'object') {
    const spawnRecord = spawnConfig as Record<string, unknown>;
    const orchestration = spawnRecord.orchestration;
    if (orchestration && typeof orchestration === 'object') {
      const orchestrationRecord = orchestration as Record<string, unknown>;
      if (typeof orchestrationRecord.reason_code === 'string' && orchestrationRecord.reason_code.startsWith('SPAWN_')) {
        return orchestrationRecord.reason_code;
      }
    }
  }

  return undefined;
}

function findActiveSessionRunId(state: PlanState, agentType: string): string | undefined {
  const activeSession = [...state.agent_sessions]
    .reverse()
    .find(session => session.agent_type === agentType && !session.completed_at);

  if (!activeSession) {
    return undefined;
  }

  return extractRunId(activeSession.context);
}

/** Numeric metric keys expected on a valid HandoffStats object */
const HANDOFF_STATS_NUMERIC_KEYS: readonly string[] = [
  'steps_completed', 'steps_attempted', 'files_read', 'files_modified',
  'tool_call_count', 'tool_retries', 'blockers_hit', 'scope_escalations',
  'unsolicited_context_reads',
] as const;

const VALID_DURATION_CATEGORIES = new Set(['quick', 'moderate', 'extended']);

/**
 * Basic structural validation: checks that a value looks like a HandoffStats
 * object (has the right keys with numeric values and a valid duration_category).
 */
function isValidHandoffStats(value: unknown): value is HandoffStats {
  if (!value || typeof value !== 'object') return false;
  const obj = value as Record<string, unknown>;
  for (const key of HANDOFF_STATS_NUMERIC_KEYS) {
    if (typeof obj[key] !== 'number') return false;
  }
  if (!VALID_DURATION_CATEGORIES.has(obj.duration_category as string)) return false;
  return true;
}