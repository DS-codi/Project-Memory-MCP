/**
 * Stats Hooks — Simple helper functions that consolidated handlers
 * call to record tool-call, file, and step metrics.
 *
 * No event emitter needed — direct calls to incrementStat keep things
 * simple and avoids async ordering issues.
 *
 * Kept under 120 lines.
 */

import {
  incrementStat,
  getContextBundleFiles,
} from './session-stats.js';

// ---------------------------------------------------------------------------
// Tool-call tracking
// ---------------------------------------------------------------------------

/**
 * Record that a tool call was processed for the given session.
 *
 * @param sessionId  The _session_id from the tool params (may be undefined)
 * @param toolName   e.g. "memory_filesystem", "memory_steps"
 * @param action     e.g. "read", "update"
 * @param success    Whether the tool call succeeded
 */
export function recordToolCall(
  sessionId: string | undefined,
  _toolName: string,
  _action: string,
  success: boolean
): void {
  if (!sessionId) return;
  incrementStat(sessionId, 'tool_call_count');
  if (!success) {
    incrementStat(sessionId, 'tool_retries');
  }
}

// ---------------------------------------------------------------------------
// File operation tracking
// ---------------------------------------------------------------------------

/**
 * Record a file read or write operation.
 *
 * For reads: if the path was NOT in the initial context bundle,
 * also increments `unsolicited_context_reads`.
 *
 * @param sessionId   The _session_id from the tool params
 * @param opType      'read' or 'write'
 * @param path        The file path (optional, used for unsolicited check)
 */
export function recordFileOp(
  sessionId: string | undefined,
  opType: 'read' | 'write',
  path?: string
): void {
  if (!sessionId) return;

  if (opType === 'read') {
    incrementStat(sessionId, 'files_read');

    // Check if this read is unsolicited (not in the initial bundle)
    if (path) {
      const bundle = getContextBundleFiles(sessionId);
      const normalised = path.replace(/\\/g, '/');
      const isInBundle = bundle.some(
        (bp) => normalised === bp.replace(/\\/g, '/') || normalised.endsWith(bp.replace(/\\/g, '/'))
      );
      if (!isInBundle) {
        incrementStat(sessionId, 'unsolicited_context_reads');
      }
    }
  } else {
    incrementStat(sessionId, 'files_modified');
  }
}

// ---------------------------------------------------------------------------
// Step status change tracking
// ---------------------------------------------------------------------------

/**
 * Record a step status transition.
 *
 * @param sessionId  The _session_id from the tool params
 * @param newStatus  The status the step was changed to
 */
export function recordStepChange(
  sessionId: string | undefined,
  newStatus: 'active' | 'done' | 'blocked'
): void {
  if (!sessionId) return;

  switch (newStatus) {
    case 'active':
      incrementStat(sessionId, 'steps_attempted');
      break;
    case 'done':
      incrementStat(sessionId, 'steps_completed');
      break;
    case 'blocked':
      incrementStat(sessionId, 'blockers_hit');
      break;
  }
}
