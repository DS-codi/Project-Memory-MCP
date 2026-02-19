/**
 * Contract Builder
 *
 * Assembles per-agent tool contract summaries by combining role-action
 * mappings with action param specs. The resulting ToolContractSummary[]
 * is injected into the init response so each agent only sees the
 * tool actions and parameters relevant to their role.
 *
 * Dependency: tool-action-mappings.ts, action-param-registry.ts → this file
 */

import type { AgentType } from '../../types/agent.types.js';
import type { ToolContractSummary, ParamSpec } from '../../types/preflight.types.js';
import { getAgentToolMappings } from './tool-action-mappings.js';
import { getActionParamSpecs } from './action-param-registry.js';

// =============================================================================
// Helpers
// =============================================================================

/** Pick only name + type from a full ParamSpec. */
function compactParam(param: ParamSpec): Pick<ParamSpec, 'name' | 'type'> {
  return { name: param.name, type: param.type };
}

// =============================================================================
// Public API
// =============================================================================

/**
 * Build compact tool contract summaries for a given agent type.
 *
 * 1. Gets agent's allowed tool+action pairs from getAgentToolMappings().
 * 2. For each allowed pair, looks up param specs from getActionParamSpecs().
 * 3. Builds a ToolContractSummary with compact required/optional fields.
 *
 * Actions without a param-spec entry are still included (with empty params)
 * so the agent knows the action exists even if no strict validation is defined.
 *
 * @param agentType — The agent role (e.g., "Executor", "Coordinator").
 * @returns Array of ToolContractSummary, one per allowed tool+action pair.
 */
export function buildToolContracts(agentType: AgentType): ToolContractSummary[] {
  const mappings = getAgentToolMappings(agentType);
  const contracts: ToolContractSummary[] = [];

  for (const mapping of mappings) {
    for (const action of mapping.actions) {
      const specs = getActionParamSpecs(mapping.tool, action);

      contracts.push({
        tool: mapping.tool,
        action,
        required_params: specs ? specs.required.map(compactParam) : [],
        optional_params: specs ? specs.optional.map(compactParam) : [],
      });
    }
  }

  return contracts;
}
