/**
 * Preflight Module — Barrel Exports
 *
 * Re-exports all public functions and types from the preflight subsystem.
 * Consumers should import from './preflight/index.js' rather than reaching
 * into individual files.
 */

// ── Tool-Action Mappings ────────────────────────────────────────────────────
export {
  AGENT_TOOL_MAPPINGS,
  getAgentToolMappings,
} from './tool-action-mappings.js';
export type {
  ToolActionMapping,
  AgentToolMappingRegistry,
} from './tool-action-mappings.js';

// ── Action Param Registry ───────────────────────────────────────────────────
export {
  ACTION_PARAM_SPECS,
  getActionParamSpecs,
} from './action-param-registry.js';
export type { ActionParamDef } from './action-param-registry.js';

// ── Preflight Validator ─────────────────────────────────────────────────────
export { preflightValidate } from './preflight-validator.js';

// ── Contract Builder ────────────────────────────────────────────────────────
export { buildToolContracts } from './contract-builder.js';
