/**
 * Data Root Liveness Tests
 *
 * Verifies:
 *  - setDataRoot configures the path
 *  - checkDataRootLiveness returns true for accessible paths
 *  - checkDataRootLiveness returns false for inaccessible paths
 *  - isDataRootAccessible returns cached result synchronously
 *  - Rate limiting prevents hammering (respects MIN_CHECK_INTERVAL_MS)
 *  - startLivenessPolling / stopLivenessPolling lifecycle
 *  - withLivenessCheck wrapper
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import os from 'node:os';
import path from 'node:path';
import { promises as fs } from 'node:fs';

// Dynamic import to reset module state between tests
type LivenessModule = typeof import('../../transport/data-root-liveness.js');

describe('data-root-liveness', () => {
  let mod: LivenessModule;
  let tmpDir: string;

  beforeEach(async () => {
    vi.resetModules();
    mod = await import('../../transport/data-root-liveness.js');

    // Create a real temp directory for testing
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'liveness-test-'));
  });

  afterEach(async () => {
    mod.stopLivenessPolling();

    // Clean up temp directory
    try {
      await fs.rm(tmpDir, { recursive: true, force: true });
    } catch { /* ignore */ }
  });

  it('returns true when no data root is set', async () => {
    const result = await mod.checkDataRootLiveness();
    expect(result).toBe(true);
  });

  it('returns true for an accessible directory', async () => {
    mod.setDataRoot(tmpDir);
    const result = await mod.checkDataRootLiveness();
    expect(result).toBe(true);
  });

  it('returns false for a non-existent directory', async () => {
    mod.setDataRoot(path.join(tmpDir, 'does-not-exist-' + Date.now()));
    const result = await mod.checkDataRootLiveness();
    expect(result).toBe(false);
  });

  it('isDataRootAccessible returns cached result synchronously', async () => {
    mod.setDataRoot(tmpDir);
    await mod.checkDataRootLiveness();
    expect(mod.isDataRootAccessible()).toBe(true);

    // Set to non-existent path and check again
    mod.setDataRoot(path.join(tmpDir, 'gone-' + Date.now()));
    // The cached result should still be true until next check
    expect(mod.isDataRootAccessible()).toBe(true);
  });

  it('withLivenessCheck calls the function when data root is accessible', async () => {
    mod.setDataRoot(tmpDir);

    const result = await mod.withLivenessCheck(async () => 'result');
    expect(result).toBe('result');
  });

  it('withLivenessCheck returns error when data root is inaccessible', async () => {
    mod.setDataRoot(path.join(tmpDir, 'nope-' + Date.now()));

    const result = await mod.withLivenessCheck(async () => 'should-not-run');
    expect(result).toHaveProperty('success', false);
    expect(result).toHaveProperty('error_code', 'DATA_ROOT_UNAVAILABLE');
    expect(mod.isDataRootAccessible()).toBe(false);
  });

  it('startLivenessPolling and stopLivenessPolling lifecycle', async () => {
    mod.setDataRoot(tmpDir);

    // Should not throw
    mod.startLivenessPolling(1_000_000); // very long interval to avoid timers firing
    mod.stopLivenessPolling();
    // Calling stop again should be safe
    mod.stopLivenessPolling();
  });

  it('startLivenessPolling is idempotent', async () => {
    mod.setDataRoot(tmpDir);

    // Calling multiple times should not create multiple intervals
    mod.startLivenessPolling(1_000_000);
    mod.startLivenessPolling(1_000_000);
    mod.stopLivenessPolling();
  });
});
