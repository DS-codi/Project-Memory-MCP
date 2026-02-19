/**
 * Action Parameter Registry — Barrel & Accessor
 *
 * Merges per-tool param specs from split files into a single
 * ACTION_PARAM_SPECS registry and provides the getActionParamSpecs()
 * accessor used by the contract builder.
 *
 * Split files:
 *   action-params-plan.ts   → memory_plan, memory_steps
 *   action-params-agent.ts  → memory_agent, memory_context
 *   action-params-other.ts  → memory_workspace, memory_terminal, memory_filesystem
 */

import type { ParamSpec } from '../../types/preflight.types.js';
import type { ActionParamDef } from './action-params-plan.js';

// Re-export the per-tool registries for direct access if needed
export { PLAN_PARAMS, STEPS_PARAMS } from './action-params-plan.js';
export { AGENT_PARAMS, CONTEXT_PARAMS } from './action-params-agent.js';
export { WORKSPACE_PARAMS, TERMINAL_PARAMS, FILESYSTEM_PARAMS } from './action-params-other.js';
export type { ActionParamDef } from './action-params-plan.js';

// Import for assembly
import { PLAN_PARAMS, STEPS_PARAMS } from './action-params-plan.js';
import { AGENT_PARAMS, CONTEXT_PARAMS } from './action-params-agent.js';
import { WORKSPACE_PARAMS, TERMINAL_PARAMS, FILESYSTEM_PARAMS } from './action-params-other.js';

// =============================================================================
// Unified Registry
// =============================================================================

/**
 * ACTION_PARAM_SPECS — the unified source of truth for all tool+action param
 * requirements. Keys: tool name → action name → { required, optional }.
 */
export const ACTION_PARAM_SPECS: Record<string, Record<string, ActionParamDef>> = {
  memory_plan: PLAN_PARAMS,
  memory_steps: STEPS_PARAMS,
  memory_agent: AGENT_PARAMS,
  memory_context: CONTEXT_PARAMS,
  memory_workspace: WORKSPACE_PARAMS,
  memory_terminal: TERMINAL_PARAMS,
  memory_filesystem: FILESYSTEM_PARAMS,
};

// =============================================================================
// Accessor
// =============================================================================

/**
 * Look up the parameter specification for a specific tool + action pair.
 *
 * @returns The param spec if found, otherwise `undefined`.
 */
export function getActionParamSpecs(
  tool: string,
  action: string,
): { required: ParamSpec[]; optional: ParamSpec[] } | undefined {
  return ACTION_PARAM_SPECS[tool]?.[action];
}
