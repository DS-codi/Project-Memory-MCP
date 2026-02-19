/**
 * Incident Report Generator
 *
 * Generates structured incident reports when a Revisionist session completes.
 * Reports capture what went wrong, root causes, and recommendations to
 * prevent recurrence based on session stats patterns.
 */

import type {
  AgentSession,
  PlanState,
} from '../types/index.js';
import type {
  HandoffStats,
  IncidentReport,
} from '../types/index.js';

// =============================================================================
// Recommendation thresholds
// =============================================================================

const THRESHOLDS = {
  TOOL_RETRIES: 5,
  UNSOLICITED_READS: 3,
  BLOCKERS_HIT: 2,
  SCOPE_ESCALATIONS: 0,
} as const;

// =============================================================================
// Public API
// =============================================================================

/**
 * Build an IncidentReport from a completed agent session and current plan state.
 *
 * @param workspaceId  - Workspace the plan belongs to
 * @param planId       - Plan ID
 * @param session      - The just-completed agent session (must have handoff_stats)
 * @param planState    - Current plan state (used to find blocked steps)
 * @returns A fully populated IncidentReport
 */
export function generateIncidentReport(
  _workspaceId: string,
  planId: string,
  session: AgentSession,
  planState: PlanState,
): IncidentReport {
  const triggerReason = buildTriggerReason(session);
  const blockedSteps = collectBlockedSteps(planState);
  const statsSnapshot = session.handoff_stats ?? emptyStats();
  const rootCause = extractRootCause(blockedSteps, session);
  const resolutionActions = extractResolutionActions(session);
  const recommendations = buildRecommendations(statsSnapshot);

  return {
    plan_id: planId,
    session_id: session.session_id,
    agent_type: session.agent_type,
    timestamp: new Date().toISOString(),
    trigger_reason: triggerReason,
    root_cause_analysis: rootCause,
    blocked_steps: blockedSteps,
    resolution_actions: resolutionActions,
    stats_snapshot: statsSnapshot,
    recommendations,
  };
}

// =============================================================================
// Internal helpers
// =============================================================================

/** Derive the trigger reason from session context. */
function buildTriggerReason(session: AgentSession): string {
  const ctx = session.context ?? {};
  const reason = ctx.reason as string | undefined;
  const deployedBy = ctx.deployed_by as string | undefined;
  const blockers = ctx.blockers_to_avoid as string[] | undefined;

  const parts: string[] = [];
  if (deployedBy) parts.push(`Deployed by ${deployedBy}`);
  if (reason) parts.push(reason);
  if (blockers && blockers.length > 0) {
    parts.push(`Blockers to avoid: ${blockers.join('; ')}`);
  }
  return parts.length > 0 ? parts.join(' — ') : 'Unknown trigger';
}

/** Collect human-readable descriptions of blocked steps. */
function collectBlockedSteps(planState: PlanState): string[] {
  return planState.steps
    .filter((s) => s.status === 'blocked')
    .map((s) => {
      const notes = s.notes ? ` — ${s.notes}` : '';
      return `Step ${s.index}: ${s.task}${notes}`;
    });
}

/** Extract a root cause analysis from blocked step notes + session context. */
function extractRootCause(
  blockedSteps: string[],
  session: AgentSession,
): string {
  const ctx = session.context ?? {};
  const blockers = ctx.blockers_to_avoid as string[] | undefined;

  const clues: string[] = [];

  if (blockedSteps.length > 0) {
    clues.push(
      `${blockedSteps.length} step(s) blocked: ${blockedSteps.join('; ')}`,
    );
  }

  if (blockers && blockers.length > 0) {
    clues.push(`Known blockers: ${blockers.join('; ')}`);
  }

  const reason = ctx.reason as string | undefined;
  if (reason) {
    clues.push(`Session reason: ${reason}`);
  }

  return clues.length > 0
    ? clues.join('. ')
    : 'No specific root cause identified from available data.';
}

/** Pull resolution actions from the session summary. */
function extractResolutionActions(session: AgentSession): string[] {
  if (!session.summary) return ['No resolution actions recorded.'];
  // Split summary into sentences and return as individual actions
  return session.summary
    .split(/\.\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
}

/** Build actionable recommendations from stats patterns. */
function buildRecommendations(stats: HandoffStats): string[] {
  const recs: string[] = [];

  if (stats.tool_retries > THRESHOLDS.TOOL_RETRIES) {
    recs.push(
      'Tool instruction gap — review tool documentation for common failure patterns',
    );
  }

  if (stats.unsolicited_context_reads > THRESHOLDS.UNSOLICITED_READS) {
    recs.push(
      'Context packaging improvement needed — expand instruction file bundle',
    );
  }

  if (stats.blockers_hit > THRESHOLDS.BLOCKERS_HIT) {
    recs.push(
      'Step decomposition needed — break complex steps into smaller units',
    );
  }

  if (stats.scope_escalations > THRESHOLDS.SCOPE_ESCALATIONS) {
    recs.push(
      'Scope boundary review — adjust allowed files/directories',
    );
  }

  if (recs.length === 0) {
    recs.push('No specific improvement recommendations at this time.');
  }

  return recs;
}

/** Return a zeroed-out HandoffStats for sessions without stats. */
function emptyStats(): HandoffStats {
  return {
    steps_completed: 0,
    steps_attempted: 0,
    files_read: 0,
    files_modified: 0,
    tool_call_count: 0,
    tool_retries: 0,
    blockers_hit: 0,
    scope_escalations: 0,
    unsolicited_context_reads: 0,
    duration_category: 'quick',
  };
}
