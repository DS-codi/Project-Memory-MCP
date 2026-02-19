/**
 * Data Root Liveness — data-root-liveness.ts
 *
 * Lightweight liveness check for container mode. Verifies that the
 * data root volume (/data mount) is accessible before tool execution.
 *
 * Two strategies are available:
 *
 *   Strategy A (preferred): Tool-call hook — wrap tool execution with
 *   an fs.access() check. Zero CPU when idle, ~0.1ms overhead per call.
 *
 *   Strategy B (fallback): Background polling — setInterval checks every
 *   N seconds and sets a global flag. Tool calls check the flag.
 *
 * Both strategies expose the same interface: `isDataRootAccessible()`.
 */

import { promises as fs } from 'node:fs';

// ---------------------------------------------------------------------------
// Liveness state
// ---------------------------------------------------------------------------

let _lastCheckResult = true;
let _lastCheckTime = 0;
let _dataRoot: string | null = null;

/** Minimum interval between fs.access checks (ms). Prevents hammering. */
const MIN_CHECK_INTERVAL_MS = 2_000;

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Set the data root path to check liveness against.
 * Must be called before using any liveness functions.
 */
export function setDataRoot(dataRoot: string): void {
  _dataRoot = dataRoot;
}

// ---------------------------------------------------------------------------
// Strategy A: Tool-call hook (preferred)
// ---------------------------------------------------------------------------

/**
 * Check whether the data root is currently accessible.
 *
 * Performs an actual `fs.access()` call, but rate-limits to avoid
 * hammering the filesystem on rapid successive tool calls. If the
 * last check was within `MIN_CHECK_INTERVAL_MS`, returns the cached
 * result.
 *
 * @returns true if accessible (or no data root configured), false otherwise
 */
export async function checkDataRootLiveness(): Promise<boolean> {
  if (!_dataRoot) return true; // no data root set — skip check

  const now = Date.now();
  if (now - _lastCheckTime < MIN_CHECK_INTERVAL_MS) {
    return _lastCheckResult;
  }

  try {
    await fs.access(_dataRoot, fs.constants.R_OK | fs.constants.W_OK);
    _lastCheckResult = true;
  } catch {
    _lastCheckResult = false;
  }

  _lastCheckTime = now;
  return _lastCheckResult;
}

/**
 * Returns the cached result of the last liveness check.
 * Does not perform an I/O operation — safe to call synchronously.
 */
export function isDataRootAccessible(): boolean {
  return _lastCheckResult;
}

// ---------------------------------------------------------------------------
// Strategy B: Background polling (fallback)
// ---------------------------------------------------------------------------

let _pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Start background polling of the data root.
 *
 * @param intervalMs - How often to check (default: 60000ms = 1 minute)
 */
export function startLivenessPolling(intervalMs = 60_000): void {
  if (_pollInterval) return; // already polling

  // Immediate first check
  void checkDataRootLiveness();

  _pollInterval = setInterval(() => {
    void checkDataRootLiveness();
  }, intervalMs);

  // Ensure the interval doesn't prevent Node from exiting
  if (_pollInterval.unref) {
    _pollInterval.unref();
  }

  console.error(
    `[liveness] Background polling started (every ${intervalMs}ms) for data root: ${_dataRoot}`
  );
}

/**
 * Stop background polling.
 */
export function stopLivenessPolling(): void {
  if (_pollInterval) {
    clearInterval(_pollInterval);
    _pollInterval = null;
  }
}

// ---------------------------------------------------------------------------
// Tool-call middleware helper
// ---------------------------------------------------------------------------

export interface LivenessError {
  success: false;
  error: string;
  error_code: 'DATA_ROOT_UNAVAILABLE';
}

/**
 * Wraps a tool execution function with a data-root liveness check.
 * If the data root is inaccessible, returns a structured error without
 * executing the tool.
 */
export async function withLivenessCheck<T>(
  toolFn: () => Promise<T>
): Promise<T | LivenessError> {
  const accessible = await checkDataRootLiveness();
  if (!accessible) {
    return {
      success: false,
      error: `Data root is not accessible: ${_dataRoot}. ` +
        `The volume mount may be disconnected or the filesystem is unresponsive. ` +
        `Check that the /data volume is correctly mounted.`,
      error_code: 'DATA_ROOT_UNAVAILABLE',
    };
  }
  return toolFn();
}
