/**
 * Difficulty Profile Generation
 *
 * Aggregates session stats across a plan's lifecycle and generates
 * a DifficultyProfile for archival. Used by the Archivist when
 * archiving a plan to build institutional knowledge about plan complexity.
 */

import type {
  AgentSession,
  HandoffStats,
  DifficultyProfile,
  PlanState,
} from '../types/index.js';

// =============================================================================
// Constants
// =============================================================================

/** Weight multipliers for complexity score formula */
const WEIGHT_BLOCKERS = 3;
const WEIGHT_SCOPE_ESCALATIONS = 2;
const WEIGHT_TOOL_RETRIES = 1;

/** Thresholds for skill gap detection */
const HIGH_UNSOLICITED_READS_THRESHOLD = 5;
const REPEATED_BLOCKER_THRESHOLD = 2;

// =============================================================================
// Stats Aggregation
// =============================================================================

/**
 * Create a zeroed HandoffStats object for use as an accumulator.
 */
function createEmptyStats(): HandoffStats {
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

/**
 * Determine the overall duration category from individual session categories.
 * Uses the "worst" (longest) category across all sessions.
 */
function aggregateDurationCategory(
  sessions: AgentSession[]
): HandoffStats['duration_category'] {
  const order: HandoffStats['duration_category'][] = ['quick', 'moderate', 'extended'];
  let maxIndex = 0;

  for (const session of sessions) {
    if (!session.handoff_stats) continue;
    const idx = order.indexOf(session.handoff_stats.duration_category);
    if (idx > maxIndex) maxIndex = idx;
  }

  return order[maxIndex];
}

/**
 * Sum all handoff_stats fields across sessions that have stats.
 * Sessions without handoff_stats are skipped.
 *
 * @returns Aggregated HandoffStats with summed numeric fields
 *          and worst-case duration_category.
 */
export function aggregateSessionStats(
  sessions: AgentSession[]
): HandoffStats {
  const totals = createEmptyStats();
  let hasAnyStats = false;

  for (const session of sessions) {
    if (!session.handoff_stats) continue;
    hasAnyStats = true;

    const s = session.handoff_stats;
    totals.steps_completed += s.steps_completed;
    totals.steps_attempted += s.steps_attempted;
    totals.files_read += s.files_read;
    totals.files_modified += s.files_modified;
    totals.tool_call_count += s.tool_call_count;
    totals.tool_retries += s.tool_retries;
    totals.blockers_hit += s.blockers_hit;
    totals.scope_escalations += s.scope_escalations;
    totals.unsolicited_context_reads += s.unsolicited_context_reads;
  }

  if (hasAnyStats) {
    totals.duration_category = aggregateDurationCategory(sessions);
  }

  return totals;
}

// =============================================================================
// Blocker & Skill Gap Analysis
// =============================================================================

/**
 * Extract unique blocker patterns from steps with status 'blocked'.
 * Pulls from step.notes to identify what went wrong.
 */
function extractCommonBlockers(planState: PlanState): string[] {
  const blockerNotes: string[] = [];

  for (const step of planState.steps) {
    if (step.status === 'blocked' && step.notes) {
      // Normalize and deduplicate blocker descriptions
      const normalized = step.notes.trim();
      if (normalized && !blockerNotes.includes(normalized)) {
        blockerNotes.push(normalized);
      }
    }
  }

  return blockerNotes;
}

/**
 * Identify skill gaps based on session metrics patterns.
 *
 * Indicators:
 * - High unsolicited_context_reads → agent needed info not provided upfront
 * - Repeated blocker patterns → recurring issues in the domain
 * - High tool_retries → tooling or approach struggles
 */
function identifySkillGaps(
  aggregatedStats: HandoffStats,
  commonBlockers: string[],
  sessionCount: number
): string[] {
  const gaps: string[] = [];

  // High unsolicited context reads per session
  if (sessionCount > 0) {
    const avgUnsolicited = aggregatedStats.unsolicited_context_reads / sessionCount;
    if (avgUnsolicited > HIGH_UNSOLICITED_READS_THRESHOLD) {
      gaps.push(
        `High unsolicited context reads (avg ${avgUnsolicited.toFixed(1)}/session) — ` +
        `initial context bundles may be insufficient`
      );
    }
  }

  // Repeated blocker patterns
  if (commonBlockers.length >= REPEATED_BLOCKER_THRESHOLD) {
    gaps.push(
      `${commonBlockers.length} distinct blocker patterns encountered — ` +
      `domain knowledge or tooling gaps likely`
    );
  }

  // High tool retries relative to total calls
  if (aggregatedStats.tool_call_count > 0) {
    const retryRate = aggregatedStats.tool_retries / aggregatedStats.tool_call_count;
    if (retryRate > 0.1) {
      gaps.push(
        `Tool retry rate ${(retryRate * 100).toFixed(1)}% — ` +
        `agents may need better error handling patterns`
      );
    }
  }

  // Scope escalations indicate underestimation
  if (aggregatedStats.scope_escalations > 0) {
    gaps.push(
      `${aggregatedStats.scope_escalations} scope escalation(s) — ` +
      `task decomposition may need refinement`
    );
  }

  return gaps;
}

// =============================================================================
// Profile Generation
// =============================================================================

/**
 * Generate a DifficultyProfile for a plan by aggregating session stats,
 * computing a complexity score, and identifying patterns.
 *
 * Complexity score formula:
 *   (blockers_hit * 3 + scope_escalations * 2 + tool_retries * 1) / session_count
 *
 * @returns A complete DifficultyProfile ready for knowledge storage.
 */
export function generateDifficultyProfile(
  workspaceId: string,
  planId: string,
  planState: PlanState
): DifficultyProfile {
  const sessions = planState.agent_sessions;
  const sessionCount = sessions.length;

  // Aggregate stats across all sessions
  const aggregatedStats = aggregateSessionStats(sessions);

  // Compute complexity score (normalized by session count)
  const rawScore =
    aggregatedStats.blockers_hit * WEIGHT_BLOCKERS +
    aggregatedStats.scope_escalations * WEIGHT_SCOPE_ESCALATIONS +
    aggregatedStats.tool_retries * WEIGHT_TOOL_RETRIES;

  const complexityScore = sessionCount > 0
    ? Math.round((rawScore / sessionCount) * 100) / 100
    : 0;

  // Extract blocker patterns and skill gaps
  const commonBlockers = extractCommonBlockers(planState);
  const skillGaps = identifySkillGaps(aggregatedStats, commonBlockers, sessionCount);

  return {
    plan_id: planId,
    total_sessions: sessionCount,
    aggregated_stats: aggregatedStats,
    complexity_score: complexityScore,
    common_blockers: commonBlockers,
    skill_gaps_identified: skillGaps,
    created_at: new Date().toISOString(),
  };
}
