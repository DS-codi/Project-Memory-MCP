/**
 * Action Parameter Specs — memory_agent & memory_context
 *
 * Per-action required/optional parameter definitions derived from the Zod
 * schemas in server/src/index.ts.
 */

import type { ActionParamDef } from './action-params-plan.js';

// =============================================================================
// memory_agent
// =============================================================================

export const AGENT_PARAMS: Record<string, ActionParamDef> = {

  init: {
    required: [
      { name: 'agent_type', type: 'string', description: 'Agent type (Coordinator, Executor, etc.)' },
    ],
    optional: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'context', type: 'object', description: 'Session context data' },
      { name: 'compact', type: 'boolean', description: 'Return compact plan state (default true)' },
      { name: 'context_budget', type: 'number', description: 'Byte budget for payload trimming' },
      { name: 'include_workspace_context', type: 'boolean', description: 'Include workspace context summary' },
      { name: 'validation_mode', type: 'string', description: 'Set to "init+validate" for combined init+validate' },
      { name: 'deployment_context', type: 'object', description: 'Deployment context { deployed_by, reason, override_validation? }' },
    ],
  },

  complete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'agent_type', type: 'string', description: 'Agent type' },
      { name: 'summary', type: 'string', description: 'Summary of work completed' },
    ],
    optional: [
      { name: 'artifacts', type: 'string[]', description: 'Files created/modified' },
    ],
  },

  handoff: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'from_agent', type: 'string', description: 'Source agent type' },
      { name: 'to_agent', type: 'string', description: 'Target agent type' },
      { name: 'reason', type: 'string', description: 'Reason for handoff' },
    ],
    optional: [
      { name: 'data', type: 'object', description: 'Handoff data (recommendation, files_modified, etc.)' },
    ],
  },

  validate: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'agent_type', type: 'string', description: 'Agent type to validate' },
    ],
    optional: [],
  },

  list: {
    required: [],
    optional: [],
  },

  get_instructions: {
    required: [
      { name: 'agent_name', type: 'string', description: 'Agent name (e.g. "executor")' },
    ],
    optional: [],
  },

  deploy: {
    required: [
      { name: 'workspace_path', type: 'string', description: 'Workspace path' },
    ],
    optional: [
      { name: 'agents', type: 'string[]', description: 'Specific agents to deploy' },
      { name: 'include_prompts', type: 'boolean', description: 'Include prompt files' },
      { name: 'include_instructions', type: 'boolean', description: 'Include instruction files' },
      { name: 'include_skills', type: 'boolean', description: 'Include skills files' },
    ],
  },

  get_briefing: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  get_lineage: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  categorize: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'categorization_result', type: 'object', description: 'CategoryDecision object' },
    ],
    optional: [],
  },

  deploy_for_task: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'agent_type', type: 'string', description: 'Target agent type' },
    ],
    optional: [
      { name: 'phase_context', type: 'object', description: 'Phase-specific context data' },
      { name: 'context_markers', type: 'object', description: 'Context persistence markers' },
      { name: 'include_research', type: 'boolean', description: 'Include research notes' },
      { name: 'include_architecture', type: 'boolean', description: 'Include architecture context' },
      { name: 'phase_name', type: 'string', description: 'Current phase name' },
      { name: 'step_indices', type: 'number[]', description: 'Step indices to work on' },
    ],
  },
};

// =============================================================================
// memory_context
// =============================================================================

export const CONTEXT_PARAMS: Record<string, ActionParamDef> = {

  store: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'type', type: 'string', description: 'Context type' },
      { name: 'data', type: 'object', description: 'Context data to store' },
    ],
    optional: [],
  },

  get: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'type', type: 'string', description: 'Context type to retrieve' },
    ],
    optional: [],
  },

  store_initial: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'user_request', type: 'string', description: 'Original user request' },
    ],
    optional: [
      { name: 'files_mentioned', type: 'string[]', description: 'Files mentioned by user' },
      { name: 'file_contents', type: 'object', description: 'Contents of mentioned files' },
      { name: 'requirements', type: 'string[]', description: 'Extracted requirements' },
      { name: 'constraints', type: 'string[]', description: 'Constraints or limitations' },
      { name: 'examples', type: 'string[]', description: 'Examples provided by user' },
      { name: 'conversation_context', type: 'string', description: 'Additional conversation context' },
      { name: 'additional_notes', type: 'string', description: 'Other relevant notes' },
    ],
  },

  list: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  list_research: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  append_research: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'filename', type: 'string', description: 'Research file name' },
      { name: 'content', type: 'string', description: 'Content to append' },
    ],
    optional: [],
  },

  generate_instructions: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'target_agent', type: 'string', description: 'Agent type this is for' },
      { name: 'mission', type: 'string', description: 'Mission description' },
    ],
    optional: [
      { name: 'context', type: 'string[]', description: 'Context items for the agent' },
      { name: 'constraints', type: 'string[]', description: 'Constraints the agent must follow' },
      { name: 'deliverables', type: 'string[]', description: 'Expected deliverables' },
      { name: 'files_to_read', type: 'string[]', description: 'Files the agent should read' },
      { name: 'output_path', type: 'string', description: 'Custom output path' },
    ],
  },

  batch_store: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'items', type: 'object[]', description: 'Array of { type, data } objects' },
    ],
    optional: [],
  },

  workspace_get: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },

  workspace_set: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'data', type: 'object', description: 'Replacement workspace context' },
    ],
    optional: [],
  },

  workspace_update: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'data', type: 'object', description: 'Partial updates to merge' },
    ],
    optional: [],
  },

  workspace_delete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [],
  },

  knowledge_store: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'slug', type: 'string', description: 'URL-safe identifier' },
      { name: 'title', type: 'string', description: 'Human-readable title' },
      { name: 'data', type: 'object', description: 'Knowledge content' },
    ],
    optional: [
      { name: 'category', type: 'string', description: 'Category for organization' },
      { name: 'tags', type: 'string[]', description: 'Tags for discovery' },
      { name: 'created_by_agent', type: 'string', description: 'Agent that created this' },
      { name: 'created_by_plan', type: 'string', description: 'Plan that created this' },
    ],
  },

  knowledge_get: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'slug', type: 'string', description: 'Knowledge file slug' },
    ],
    optional: [],
  },

  knowledge_list: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'category', type: 'string', description: 'Filter by category' },
    ],
  },

  knowledge_delete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'slug', type: 'string', description: 'Knowledge file slug' },
    ],
    optional: [],
  },

  search: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Plan ID (required when scope is plan)' },
      { name: 'query', type: 'string', description: 'Query string (defaults to empty for broad search)' },
      { name: 'scope', type: 'string', description: 'Search scope: plan, workspace, program, or all (default: plan)' },
      { name: 'types', type: 'string[]', description: 'Optional source/type filters' },
      { name: 'limit', type: 'number', description: 'Result limit (bounded and defaulted server-side)' },
    ],
  },

  promptanalyst_discover: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'query', type: 'string', description: 'PromptAnalyst discovery query text' },
    ],
    optional: [
      { name: 'limit', type: 'number', description: 'Result limit (bounded and defaulted server-side)' },
    ],
  },

  pull: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Plan ID (required when scope is plan)' },
      { name: 'query', type: 'string', description: 'Optional pre-filter query before selector resolution' },
      { name: 'scope', type: 'string', description: 'Pull scope: plan, workspace, program, or all (default: plan)' },
      { name: 'types', type: 'string[]', description: 'Optional source/type filters' },
      { name: 'selectors', type: 'object[]', description: 'Optional selectors to stage only matching results' },
      { name: 'limit', type: 'number', description: 'Candidate limit before selector application (server-bounded)' },
    ],
  },

  write_prompt: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'prompt_title', type: 'string', description: 'Prompt title' },
      { name: 'prompt_agent', type: 'string', description: 'Target agent' },
    ],
    optional: [
      { name: 'prompt_description', type: 'string', description: 'Prompt description' },
      { name: 'prompt_sections', type: 'object[]', description: 'Body sections [{ title, content }]' },
      { name: 'prompt_variables', type: 'string[]', description: 'Template variables' },
      { name: 'prompt_raw_body', type: 'string', description: 'Raw body (instead of sections)' },
      { name: 'prompt_mode', type: 'string', description: 'Mode: agent, ask, edit' },
      { name: 'prompt_phase', type: 'string', description: 'Plan phase' },
      { name: 'prompt_step_indices', type: 'number[]', description: 'Step indices covered' },
      { name: 'prompt_expires_after', type: 'string', description: 'Expiry policy' },
      { name: 'prompt_version', type: 'string', description: 'Semver version' },
      { name: 'prompt_slug', type: 'string', description: 'Filename slug override' },
    ],
  },

  dump_context: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },
};
