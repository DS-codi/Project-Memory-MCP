/**
 * metrics.ts
 * Performance guardrail types and defaults for memory_cartographer.
 * See docs/architecture/memory-cartographer/performance-guardrails.md
 */

export interface PerfMetrics {
  /** Wall-clock elapsed time in milliseconds. */
  elapsedMs: number;
  /** Approximate process RSS in bytes (if available). */
  memoryRssBytes: number;
  /** Number of files processed so far. */
  filesProcessed: number;
  /** Number of batches completed. */
  batchesCompleted: number;
  /** Whether degraded / partial mode was triggered. */
  partial: boolean;
  /** Reason for partial mode, if triggered. */
  partialReason?: 'timeout' | 'memory' | 'file_cap';
}

export interface PerfConfig {
  /** Soft time limit in milliseconds. Emits warning. Default: 30_000. */
  softTimeLimitMs: number;
  /** Hard time limit in milliseconds. Cancels scan. Default: 120_000. */
  hardTimeLimitMs: number;
  /** RSS in bytes at which to emit a memory warning. Default: 512 MB. */
  softMemoryLimitBytes: number;
  /** RSS in bytes at which to hard-stop. Default: 1 GB. */
  hardMemoryLimitBytes: number;
  /** Number of files per processing batch. Default: 500. */
  batchSize: number;
  /** Progressive sampling: enable above this file count. Default: 5_000. */
  progressiveSamplingThreshold: number;
  /** Fraction retained when progressive sampling is active. Default: 0.2. */
  progressiveSamplingFraction: number;
}

export const DEFAULT_PERF_CONFIG: PerfConfig = {
  softTimeLimitMs:              30_000,
  hardTimeLimitMs:             120_000,
  softMemoryLimitBytes:        512 * 1024 * 1024,   // 512 MB
  hardMemoryLimitBytes:       1024 * 1024 * 1024,   // 1 GB
  batchSize:                      500,
  progressiveSamplingThreshold: 5_000,
  progressiveSamplingFraction:    0.2,
};

/**
 * Returns true if the given metrics indicate the scan should be cancelled.
 */
export function shouldCancel(metrics: PerfMetrics, config: PerfConfig = DEFAULT_PERF_CONFIG): boolean {
  return (
    metrics.elapsedMs >= config.hardTimeLimitMs ||
    metrics.memoryRssBytes >= config.hardMemoryLimitBytes
  );
}

/**
 * Returns the current RSS in bytes, or 0 if unavailable.
 */
export function currentRssBytes(): number {
  try {
    return process.memoryUsage().rss;
  } catch {
    return 0;
  }
}
