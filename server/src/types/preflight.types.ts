/**
 * Preflight & Tool Contract Type Definitions
 *
 * Types for the tool preflight validation system and per-agent tool contract
 * summaries injected into init responses.
 *
 * Dependency flow: preflight.types.ts → tools/preflight/* → tools/consolidated/*
 */

import type { AgentType } from './agent.types.js';

// =============================================================================
// Parameter Specification
// =============================================================================

/**
 * Describes a single parameter for a tool action.
 */
export interface ParamSpec {
  /** Parameter name (e.g., "workspace_id") */
  name: string;
  /** TypeScript-style type hint (e.g., "string", "number", "string[]", "object") */
  type: string;
  /** Brief description of the parameter's purpose */
  description: string;
}

// =============================================================================
// Tool Action Contract
// =============================================================================

/**
 * Full contract for a single tool+action pair.
 * Specifies which parameters are required and which are optional.
 */
export interface ToolActionContract {
  /** Tool name (e.g., "memory_plan") */
  tool: string;
  /** Action name (e.g., "create") */
  action: string;
  /** Parameters that must be provided */
  required_params: ParamSpec[];
  /** Parameters that may be provided */
  optional_params: ParamSpec[];
}

// =============================================================================
// Agent Tool Profile
// =============================================================================

/**
 * Maps an agent type to its allowed tool action contracts.
 * Used by the contract builder to assemble per-agent tool docs.
 */
export interface AgentToolProfile {
  /** The agent role this profile belongs to */
  agent_type: AgentType;
  /** All tool+action contracts available to this agent */
  contracts: ToolActionContract[];
}

// =============================================================================
// Preflight Result
// =============================================================================

/**
 * Result of preflight validation on a tool call's parameters.
 */
export type PreflightResult =
  | { valid: true }
  | {
      valid: false;
      /** Names of required fields that were missing or null */
      missing_fields: string[];
      /** Human-readable error message listing missing fields */
      message: string;
    };

// =============================================================================
// Tool Contract Summary (compact, for init response)
// =============================================================================

/**
 * Compact contract summary included in the agent init response.
 * Deliberately minimal to keep context budget small.
 */
export interface ToolContractSummary {
  /** Tool name (e.g., "memory_plan") */
  tool: string;
  /** Action name (e.g., "create") */
  action: string;
  /** Required parameter names and types */
  required_params: Pick<ParamSpec, 'name' | 'type'>[];
  /** Optional parameter names and types */
  optional_params: Pick<ParamSpec, 'name' | 'type'>[];
}
