/**
 * policies.ts
 * Safety guardrail types and defaults for memory_cartographer.
 * See docs/architecture/memory-cartographer/safety-guardrails.md
 */

import * as path from 'path';
import * as fs   from 'fs';

export interface SafetyPolicy {
  /** Max file size in bytes before skipping. Default: 10 MB. */
  maxFileSizeBytes: number;
  /** Number of bytes to read when checking for binary content. Default: 512. */
  binaryProbeBytes: number;
  /** Regex patterns applied to key names for secret masking. */
  secretKeyPatterns: RegExp[];
  /** Replacement string for masked values. */
  secretMaskValue: string;
}

export const DEFAULT_SAFETY_POLICY: SafetyPolicy = {
  maxFileSizeBytes: 10 * 1024 * 1024, // 10 MB
  binaryProbeBytes: 512,
  secretKeyPatterns: [
    /password/i,
    /secret/i,
    /\btoken\b/i,
    /api[_-]?key/i,
    /private[_-]?key/i,
    /credential/i,
    /access[_-]?key/i,
  ],
  secretMaskValue: '[REDACTED]',
};

/**
 * Returns true if `filePath` is safely within `workspaceRoot`.
 * Rejects path traversal sequences and symlinks escaping the root.
 */
export function isPathSafe(filePath: string, workspaceRoot: string): boolean {
  // Reject obvious traversal sequences before resolution
  if (filePath.includes('..')) return false;

  try {
    const resolved  = fs.realpathSync(filePath);
    const rootReal  = fs.realpathSync(workspaceRoot);
    return resolved.startsWith(rootReal + path.sep) || resolved === rootReal;
  } catch {
    // File doesn't exist or permission denied — treat as unsafe
    return false;
  }
}

/**
 * Masks the values of any keys whose name matches a secret pattern.
 * Operates recursively on nested objects.
 */
export function maskSecrets(
  obj: Record<string, unknown>,
  policy: SafetyPolicy = DEFAULT_SAFETY_POLICY,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj)) {
    const isSensitive = policy.secretKeyPatterns.some(re => re.test(key));
    if (isSensitive) {
      result[key] = policy.secretMaskValue;
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      result[key] = maskSecrets(value as Record<string, unknown>, policy);
    } else {
      result[key] = value;
    }
  }
  return result;
}
