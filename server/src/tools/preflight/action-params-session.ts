/**
 * Action Parameter Specs — memory_session, memory_brainstorm, memory_instructions
 *
 * Per-action required/optional parameter definitions derived from the Zod
 * schemas in server/src/index.ts.
 */

import type { ActionParamDef } from './action-params-plan.js';

// =============================================================================
// memory_session
// =============================================================================

export const SESSION_PARAMS: Record<string, ActionParamDef> = {

  prep: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'agent_name', type: 'string', description: 'Target agent name' },
      { name: 'prompt', type: 'string', description: 'Base prompt to enrich' },
    ],
    optional: [
      { name: 'compat_mode', type: 'string', description: 'strict or legacy (default)' },
      { name: 'parent_session_id', type: 'string', description: 'Parent session ID for lineage' },
      { name: 'prep_config', type: 'object', description: 'Prep config with scope boundaries' },
    ],
  },

  deploy_and_prep: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'agent_name', type: 'string', description: 'Target agent name' },
      { name: 'prompt', type: 'string', description: 'Base prompt to enrich' },
    ],
    optional: [
      { name: 'compat_mode', type: 'string', description: 'strict or legacy' },
      { name: 'parent_session_id', type: 'string', description: 'Parent session ID for lineage' },
      { name: 'prep_config', type: 'object', description: 'Prep config with scope boundaries' },
      { name: 'phase_name', type: 'string', description: 'Current phase name' },
      { name: 'step_indices', type: 'number[]', description: 'Step indices to work on' },
      { name: 'include_skills', type: 'boolean', description: 'Include skills in deployment context' },
      { name: 'include_research', type: 'boolean', description: 'Include research notes' },
      { name: 'include_architecture', type: 'boolean', description: 'Include architecture context' },
      { name: 'provisioning_mode', type: 'string', description: 'on_demand or compat' },
      { name: 'allow_legacy_always_on', type: 'boolean', description: 'Allow legacy always-on behavior' },
      { name: 'allow_ambient_instruction_scan', type: 'boolean', description: 'Allow ambient instruction discovery' },
      { name: 'allow_include_skills_all', type: 'boolean', description: 'Allow broad skill discovery' },
    ],
  },

  list_sessions: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [
      { name: 'status_filter', type: 'string', description: 'Filter: active | stopping | completed | all' },
    ],
  },

  get_session: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'session_id', type: 'string', description: 'Session ID to look up' },
    ],
    optional: [],
  },
};

// =============================================================================
// memory_brainstorm
// =============================================================================

export const BRAINSTORM_PARAMS: Record<string, ActionParamDef> = {

  route: {
    required: [
      { name: 'form_request', type: 'object', description: 'FormRequest payload' },
    ],
    optional: [],
  },

  route_with_fallback: {
    required: [
      { name: 'form_request', type: 'object', description: 'FormRequest payload' },
    ],
    optional: [],
  },

  refine: {
    required: [
      { name: 'refinement_request', type: 'object', description: 'FormRefinementRequest payload' },
    ],
    optional: [],
  },
};

// =============================================================================
// memory_instructions (read-only search/get tool)
// =============================================================================

export const INSTRUCTIONS_PARAMS: Record<string, ActionParamDef> = {

  search: {
    required: [
      { name: 'query', type: 'string', description: 'Keyword to search for' },
    ],
    optional: [],
  },

  get: {
    required: [
      { name: 'filename', type: 'string', description: 'Instruction filename' },
    ],
    optional: [],
  },

  get_section: {
    required: [
      { name: 'filename', type: 'string', description: 'Instruction filename' },
      { name: 'heading', type: 'string', description: 'Section heading (partial match)' },
    ],
    optional: [],
  },

  list: {
    required: [],
    optional: [],
  },

  list_workspace: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },
};
