/**
 * Session Stats Tracker — In-memory per-session instrumentation counters.
 *
 * Tracks running totals for each agent session so that handoff/complete
 * can finalize them into a HandoffStats snapshot.
 *
 * Kept intentionally small (< 150 lines).
 */

import type { HandoffStats, StatsDiscrepancy, StatsValidationResult } from '../types/handoff-stats.types.js';

// ---------------------------------------------------------------------------
// Internal running-stats shape (mutable counters kept while session is live)
// ---------------------------------------------------------------------------

export interface RunningStats {
  steps_completed: number;
  steps_attempted: number;
  files_read: number;
  files_modified: number;
  tool_call_count: number;
  tool_retries: number;
  blockers_hit: number;
  scope_escalations: number;
  unsolicited_context_reads: number;
  /** File paths provided at init time (instruction files + context bundle) */
  context_bundle_files: string[];
  /** ISO timestamp recorded at init so we can compute duration later */
  started_at: string;
}

/** Metric keys that can be incremented */
export type IncrementableMetric = Exclude<keyof RunningStats, 'context_bundle_files' | 'started_at'>;

// ---------------------------------------------------------------------------
// In-memory store
// ---------------------------------------------------------------------------

const tracker = new Map<string, RunningStats>();

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Create zeroed counters for a new session.
 * Call this right after the session object is created in `initialiseAgent`.
 */
export function initSessionStats(
  sessionId: string,
  contextBundleFiles?: string[]
): void {
  tracker.set(sessionId, {
    steps_completed: 0,
    steps_attempted: 0,
    files_read: 0,
    files_modified: 0,
    tool_call_count: 0,
    tool_retries: 0,
    blockers_hit: 0,
    scope_escalations: 0,
    unsolicited_context_reads: 0,
    context_bundle_files: contextBundleFiles ?? [],
    started_at: new Date().toISOString(),
  });
}

/**
 * Increment a numeric counter for the given session.
 * No-op if the session hasn't been initialised.
 */
export function incrementStat(
  sessionId: string,
  metric: IncrementableMetric,
  count = 1
): void {
  const stats = tracker.get(sessionId);
  if (!stats) return;
  (stats[metric] as number) += count;
}

/**
 * Read the current running stats (snapshot) without removing them.
 * Returns `undefined` if the session is not tracked.
 */
export function getSessionStats(sessionId: string): RunningStats | undefined {
  return tracker.get(sessionId);
}

/**
 * Return the context bundle file list for a session (used by hooks
 * to decide whether a read is "unsolicited").
 */
export function getContextBundleFiles(sessionId: string): string[] {
  return tracker.get(sessionId)?.context_bundle_files ?? [];
}

/**
 * Finalize the session's running stats into a HandoffStats object,
 * compute `duration_category`, and remove the entry from the map.
 *
 * @param sessionId   The session to finalize
 * @param sessionStartedAt  ISO timestamp from the AgentSession record
 *                          (preferred over the local `started_at` copy)
 */
export function finalizeSessionStats(
  sessionId: string,
  sessionStartedAt: string
): HandoffStats | undefined {
  const stats = tracker.get(sessionId);
  if (!stats) return undefined;

  const elapsedMs = Date.now() - new Date(sessionStartedAt).getTime();
  const TWO_MIN = 2 * 60 * 1000;
  const TEN_MIN = 10 * 60 * 1000;

  let duration_category: HandoffStats['duration_category'];
  if (elapsedMs < TWO_MIN) {
    duration_category = 'quick';
  } else if (elapsedMs < TEN_MIN) {
    duration_category = 'moderate';
  } else {
    duration_category = 'extended';
  }

  const result: HandoffStats = {
    steps_completed: stats.steps_completed,
    steps_attempted: stats.steps_attempted,
    files_read: stats.files_read,
    files_modified: stats.files_modified,
    tool_call_count: stats.tool_call_count,
    tool_retries: stats.tool_retries,
    blockers_hit: stats.blockers_hit,
    scope_escalations: stats.scope_escalations,
    unsolicited_context_reads: stats.unsolicited_context_reads,
    duration_category,
  };

  tracker.delete(sessionId);
  return result;
}

/**
 * Remove a session from the tracker without producing stats.
 * Use for cleanup on error paths.
 */
export function clearSessionStats(sessionId: string): void {
  tracker.delete(sessionId);
}

// ---------------------------------------------------------------------------
// Stats Validation — Compare agent-reported vs MCP-tracked stats
// ---------------------------------------------------------------------------

/** Numeric metric keys compared during validation */
const COMPARABLE_METRICS: readonly (keyof HandoffStats)[] = [
  'steps_completed', 'steps_attempted', 'files_read', 'files_modified',
  'tool_call_count', 'tool_retries', 'blockers_hit', 'scope_escalations',
  'unsolicited_context_reads',
] as const;

/**
 * Compare MCP-tracked stats against agent-reported stats.
 * Flags exact-match discrepancies for each numeric metric.
 */
export function validateStats(
  mcpTracked: HandoffStats,
  agentReported: HandoffStats
): StatsValidationResult {
  const discrepancies: StatsDiscrepancy[] = [];

  for (const metric of COMPARABLE_METRICS) {
    const expected = mcpTracked[metric] as number;
    const actual = agentReported[metric] as number;
    if (expected !== actual) {
      discrepancies.push({ metric, expected, actual });
    }
  }

  return {
    matches: discrepancies.length === 0,
    discrepancies,
    mcp_tracked: mcpTracked,
    agent_reported: agentReported,
  };
}
