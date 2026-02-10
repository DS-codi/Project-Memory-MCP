/**
 * Compact Plan State Utility
 * 
 * Reduces agent init payload by summarizing historical data:
 * - Agent sessions: last N with context trimmed to keys-only
 * - Lineage: last N entries
 * - Steps: only pending/active (completed steps excluded by default)
 * - Plan summary: counts of steps, sessions, handoffs
 */

import type {
  PlanState,
  CompactPlanState,
  CompactPlanSummary,
  CompactAgentSession,
  AgentSession,
  PlanStep
} from '../types/index.js';

export interface CompactifyOptions {
  maxSessions?: number;        // Default: 3
  maxLineage?: number;         // Default: 3
  includeCompletedSteps?: boolean;  // Default: false
}

const DEFAULT_OPTIONS: Required<CompactifyOptions> = {
  maxSessions: 3,
  maxLineage: 3,
  includeCompletedSteps: false
};

/**
 * Transform a full PlanState into a CompactPlanState.
 * Reduces payload by summarizing sessions/lineage and filtering steps.
 */
export function compactifyPlanState(
  state: PlanState,
  options?: CompactifyOptions
): CompactPlanState {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  const planSummary = buildPlanSummary(state);
  const compactSessions = compactifySessions(state.agent_sessions, opts.maxSessions);
  const compactLineage = {
    recent: state.lineage.slice(-opts.maxLineage),
    total_count: state.lineage.length
  };
  const filteredSteps = filterSteps(state.steps, opts.includeCompletedSteps);

  return {
    id: state.id,
    workspace_id: state.workspace_id,
    title: state.title,
    description: state.description,
    priority: state.priority,
    status: state.status,
    category: state.category,
    current_phase: state.current_phase,
    current_agent: state.current_agent,
    recommended_next_agent: state.recommended_next_agent,
    deployment_context: state.deployment_context,
    confirmation_state: state.confirmation_state,
    goals: state.goals,
    success_criteria: state.success_criteria,
    build_scripts: state.build_scripts,
    created_at: state.created_at,
    updated_at: state.updated_at,
    plan_summary: planSummary,
    agent_sessions: compactSessions,
    lineage: compactLineage,
    steps: filteredSteps
  };
}

/**
 * Compact with a byte budget — progressively reduces detail until the
 * serialized output fits within the budget.
 * Returns the compacted state even if it can't fit within the budget.
 */
export function compactifyWithBudget(
  state: PlanState,
  budgetBytes: number
): CompactPlanState {
  let maxSessions = DEFAULT_OPTIONS.maxSessions;
  let maxLineage = DEFAULT_OPTIONS.maxLineage;
  let includeCompletedSteps = false;

  // Start with defaults and progressively trim
  for (let attempt = 0; attempt < 6; attempt++) {
    const result = compactifyPlanState(state, {
      maxSessions,
      maxLineage,
      includeCompletedSteps
    });
    const size = Buffer.byteLength(JSON.stringify(result), 'utf8');
    if (size <= budgetBytes) {
      return result;
    }

    // Progressive reduction strategy
    if (maxSessions > 1) { maxSessions--; continue; }
    if (maxLineage > 1) { maxLineage--; continue; }
    // Already at minimum — return what we have
    break;
  }

  return compactifyPlanState(state, {
    maxSessions: 1,
    maxLineage: 1,
    includeCompletedSteps: false
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildPlanSummary(state: PlanState): CompactPlanSummary {
  const steps = state.steps || [];
  return {
    total_steps: steps.length,
    pending_steps: steps.filter(s => s.status === 'pending').length,
    active_steps: steps.filter(s => s.status === 'active').length,
    done_steps: steps.filter(s => s.status === 'done').length,
    blocked_steps: steps.filter(s => s.status === 'blocked').length,
    total_sessions: state.agent_sessions.length,
    total_handoffs: state.lineage.length
  };
}

function compactifySessions(
  sessions: AgentSession[],
  maxSessions: number
): { recent: CompactAgentSession[]; total_count: number } {
  const recent = sessions.slice(-maxSessions).map(trimSession);
  return { recent, total_count: sessions.length };
}

function trimSession(session: AgentSession): CompactAgentSession {
  return {
    session_id: session.session_id,
    agent_type: session.agent_type,
    started_at: session.started_at,
    completed_at: session.completed_at,
    context_keys: Object.keys(session.context || {}),
    summary: session.summary,
    artifacts: session.artifacts
  };
}

function filterSteps(steps: PlanStep[], includeCompleted: boolean): PlanStep[] {
  if (includeCompleted) return steps;
  return steps.filter(s => s.status === 'pending' || s.status === 'active');
}
