/**
 * Preflight Validator
 *
 * Validates that required parameters are present before a tool action
 * reaches its handler. Returns a clear error listing missing fields
 * when validation fails, preventing cryptic errors deep in handlers.
 *
 * @module tools/preflight/preflight-validator
 */

import type { PreflightResult, PreflightFailureResponse } from '../../types/preflight.types.js';
import { getActionParamSpecs } from './action-param-registry.js';

// =============================================================================
// String Similarity (simple Levenshtein-like heuristic)
// =============================================================================

/**
 * Compute the edit distance between two strings (case-insensitive).
 * Uses a lightweight O(n*m) DP approach — fine for short field names.
 */
function editDistance(a: string, b: string): number {
  const la = a.toLowerCase();
  const lb = b.toLowerCase();
  const m = la.length;
  const n = lb.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0) as number[]);
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = la[i - 1] === lb[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

/**
 * Find the closest known field name to an unknown field.
 * Returns the suggestion only if edit distance ≤ 3 (to avoid nonsense suggestions).
 */
function findClosestField(unknown: string, knownFields: string[]): string | undefined {
  let best: string | undefined;
  let bestDist = 4; // threshold: only suggest if distance ≤ 3
  for (const known of knownFields) {
    const dist = editDistance(unknown, known);
    if (dist < bestDist) {
      bestDist = dist;
      best = known;
    }
  }
  return best;
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Validate that all required parameters for a tool+action pair are present
 * and non-null/non-undefined.
 *
 * If the tool or action is not found in the registry, validation passes
 * silently (unknown actions should fail in the handler, not here).
 *
 * @param tool   - The MCP tool name (e.g., "memory_plan")
 * @param action - The action being invoked (e.g., "create")
 * @param params - The raw parameters object from the tool call
 * @returns PreflightResult — { valid: true } or { valid: false, missing_fields, message }
 */
export function preflightValidate(
  tool: string,
  action: string,
  params: Record<string, unknown>,
): PreflightResult {
  const spec = getActionParamSpecs(tool, action);

  // No spec registered for this tool+action — pass through
  if (!spec) {
    return { valid: true };
  }

  const missing: string[] = [];

  for (const param of spec.required) {
    const value = params[param.name];
    if (value === undefined || value === null) {
      missing.push(param.name);
    }
  }

  if (missing.length === 0) {
    return { valid: true };
  }

  // Build enhanced error message
  const requiredNames = spec.required.map(p => p.name);
  const providedKeys = Object.keys(params).filter(k => k !== 'action' && k !== '_session_id');
  const optionalNames = spec.optional.map(p => p.name);

  const lines: string[] = [
    `${tool}(action: "${action}") — missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
    `  Required fields: [${requiredNames.join(', ')}]`,
    `  Provided fields: [${providedKeys.join(', ') || '(none)'}]`,
  ];

  if (optionalNames.length > 0) {
    lines.push(`  Optional fields: [${optionalNames.join(', ')}]`);
  }

  return {
    valid: false,
    missing_fields: missing,
    message: lines.join('\n'),
  };
}

/**
 * Build a standardized preflight failure response from a failed PreflightResult.
 *
 * All consolidated handlers should use this to ensure a uniform error shape:
 *   { success: false, error, preflight_failure: true, tool_name, action, missing_fields? }
 *
 * @param tool     - The MCP tool name (e.g., "memory_plan")
 * @param action   - The action that failed validation
 * @param preflight - The failed PreflightResult (must have valid === false)
 */
export function buildPreflightFailure(
  tool: string,
  action: string,
  preflight: Extract<PreflightResult, { valid: false }>,
): PreflightFailureResponse {
  return {
    success: false,
    error: preflight.message,
    preflight_failure: true,
    tool_name: tool,
    action,
    missing_fields: preflight.missing_fields,
  };
}

/**
 * Detect unknown fields in a tool call and build suggestions.
 *
 * Returns undefined if no unknown fields are found, or a list of
 * unknown field names with optional "did you mean?" suggestions.
 * Does not reject the call — this is informational only.
 *
 * @param tool   - The MCP tool name
 * @param action - The action being invoked
 * @param params - The raw parameters object from the tool call
 * @returns Array of { field, suggestion? } or undefined if all fields are known
 */
export function detectUnknownFields(
  tool: string,
  action: string,
  params: Record<string, unknown>,
): Array<{ field: string; suggestion?: string }> | undefined {
  const spec = getActionParamSpecs(tool, action);
  if (!spec) return undefined;

  const knownFields = new Set([
    ...spec.required.map(p => p.name),
    ...spec.optional.map(p => p.name),
    'action',       // always present in consolidated tools
    '_session_id',  // instrumentation field present in all schemas
  ]);

  const allKnownNames = [...spec.required.map(p => p.name), ...spec.optional.map(p => p.name)];
  const unknowns: Array<{ field: string; suggestion?: string }> = [];

  for (const key of Object.keys(params)) {
    if (!knownFields.has(key)) {
      const suggestion = findClosestField(key, allKnownNames);
      unknowns.push({ field: key, suggestion });
    }
  }

  return unknowns.length > 0 ? unknowns : undefined;
}
