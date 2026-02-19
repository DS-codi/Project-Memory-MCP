/**
 * Preflight Validator
 *
 * Validates that required parameters are present before a tool action
 * reaches its handler. Returns a clear error listing missing fields
 * when validation fails, preventing cryptic errors deep in handlers.
 *
 * @module tools/preflight/preflight-validator
 */

import type { PreflightResult } from '../../types/preflight.types.js';
import { getActionParamSpecs } from './action-param-registry.js';

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

  return {
    valid: false,
    missing_fields: missing,
    message: `${tool}(action: "${action}") is missing required field${missing.length > 1 ? 's' : ''}: ${missing.join(', ')}`,
  };
}
