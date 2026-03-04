/**
 * contract.spec.ts
 * Acceptance tests for memory_cartographer contract compliance.
 * See docs/qa/memory-cartographer-acceptance.md
 */

import { describe, it, expect } from 'vitest';
import { applyScopeFilter, DEFAULT_SCOPE_CONFIG, type ScopeConfig } from '../config/scopeConfig';
import { shouldCancel, DEFAULT_PERF_CONFIG, type PerfMetrics } from '../perf/metrics';
import { isPathSafe, maskSecrets, DEFAULT_SAFETY_POLICY } from '../safety/policies';

// ---------------------------------------------------------------------------
// Contract compliance: scope guardrails
// ---------------------------------------------------------------------------

describe('ScopeConfig — applyScopeFilter', () => {
  it('excludes node_modules by default', () => {
    expect(applyScopeFilter('src/node_modules/lodash/index.js')).toBe(false);
  });

  it('excludes .git directory', () => {
    expect(applyScopeFilter('.git/COMMIT_EDITMSG')).toBe(false);
  });

  it('includes TypeScript source files', () => {
    expect(applyScopeFilter('src/index.ts')).toBe(true);
  });

  it('includes Python source files', () => {
    expect(applyScopeFilter('python-core/main.py')).toBe(true);
  });

  it('respects allowOverrides over deny-list', () => {
    const config: ScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      allowOverrides: ['**/vendor/my-lib/**'],
    };
    expect(applyScopeFilter('vendor/my-lib/utils.ts', config)).toBe(true);
  });

  it('excludes specified languages', () => {
    const config: ScopeConfig = {
      ...DEFAULT_SCOPE_CONFIG,
      excludeLanguages: ['rust'],
    };
    expect(applyScopeFilter('src/engine.rs', config)).toBe(false);
  });

  it('excludes unknown file extensions not in allow-list', () => {
    expect(applyScopeFilter('assets/logo.png')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract compliance: performance guardrails
// ---------------------------------------------------------------------------

describe('PerfConfig — shouldCancel', () => {
  const baseMetrics: PerfMetrics = {
    elapsedMs: 0,
    memoryRssBytes: 0,
    filesProcessed: 0,
    batchesCompleted: 0,
    partial: false,
  };

  it('does not cancel within budget', () => {
    const m: PerfMetrics = { ...baseMetrics, elapsedMs: 10_000, memoryRssBytes: 100 * 1024 * 1024 };
    expect(shouldCancel(m)).toBe(false);
  });

  it('cancels when hard time limit exceeded', () => {
    const m: PerfMetrics = { ...baseMetrics, elapsedMs: 121_000 };
    expect(shouldCancel(m)).toBe(true);
  });

  it('cancels when hard memory limit exceeded', () => {
    const m: PerfMetrics = { ...baseMetrics, memoryRssBytes: 1025 * 1024 * 1024 };
    expect(shouldCancel(m)).toBe(true);
  });

  it('does not cancel at soft time limit', () => {
    const m: PerfMetrics = { ...baseMetrics, elapsedMs: 31_000 };
    expect(shouldCancel(m)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Contract compliance: safety guardrails (path safety + secret masking)
// ---------------------------------------------------------------------------

describe('SafetyPolicy — isPathSafe', () => {
  it('rejects paths with traversal sequences', () => {
    expect(isPathSafe('../../etc/passwd', '/workspace')).toBe(false);
  });

  it('rejects paths containing ".."', () => {
    expect(isPathSafe('/workspace/../outside/secret.txt', '/workspace')).toBe(false);
  });
});

describe('SafetyPolicy — maskSecrets', () => {
  it('masks password fields', () => {
    const result = maskSecrets({ password: 's3cr3t', name: 'test' });
    expect(result.password).toBe('[REDACTED]');
    expect(result.name).toBe('test');
  });

  it('masks api_key fields', () => {
    const result = maskSecrets({ api_key: 'abc123' });
    expect(result.api_key).toBe('[REDACTED]');
  });

  it('masks token fields', () => {
    const result = maskSecrets({ token: 'bearer_xyz' });
    expect(result.token).toBe('[REDACTED]');
  });

  it('masks nested secret fields', () => {
    const result = maskSecrets({ db: { password: 'secret' } });
    expect((result.db as Record<string, unknown>).password).toBe('[REDACTED]');
  });

  it('preserves non-sensitive fields', () => {
    const result = maskSecrets({ username: 'alice', host: 'localhost' });
    expect(result.username).toBe('alice');
    expect(result.host).toBe('localhost');
  });
});

// ---------------------------------------------------------------------------
// Compatibility boundary: CartographyBridgeError mock
// ---------------------------------------------------------------------------

class CartographyBridgeError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'CartographyBridgeError';
  }
}

describe('Compatibility boundary — version mismatch handling', () => {
  it('throws CartographyBridgeError stub on major version mismatch', () => {
    const throwOnMajorMismatch = (clientVersion: string, serverVersion: string) => {
      const [clientMajor] = clientVersion.split('.').map(Number);
      const [serverMajor] = serverVersion.split('.').map(Number);
      if (clientMajor !== serverMajor) {
        throw new CartographyBridgeError(
          'VERSION_MAJOR_MISMATCH',
          `Incompatible schema version: server=${serverVersion}, client=${clientVersion}`,
        );
      }
    };
    expect(() => throwOnMajorMismatch('1.0.0', '2.0.0')).toThrow(CartographyBridgeError);
    expect(() => throwOnMajorMismatch('1.0.0', '1.1.0')).not.toThrow();
  });
});
