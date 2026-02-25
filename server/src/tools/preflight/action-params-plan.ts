/**
 * Action Parameter Specs — memory_plan & memory_steps
 *
 * Per-action required/optional parameter definitions derived from the Zod
 * schemas in server/src/index.ts. Used by the contract builder to produce
 * compact per-agent tool contracts.
 */

import type { ParamSpec } from '../../types/preflight.types.js';

/** Param spec shape for one action. */
export interface ActionParamDef {
  required: ParamSpec[];
  optional: ParamSpec[];
}

// =============================================================================
// memory_plan
// =============================================================================

export const PLAN_PARAMS: Record<string, ActionParamDef> = {

  list: {
    required: [],
    optional: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'workspace_path', type: 'string', description: 'Workspace path (alternative to workspace_id)' },
      { name: 'include_archived', type: 'boolean', description: 'Include archived plans' },
    ],
  },

  get: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  create: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'title', type: 'string', description: 'Plan title' },
      { name: 'description', type: 'string', description: 'Plan description' },
      { name: 'category', type: 'string', description: 'Request category' },
    ],
    optional: [
      { name: 'priority', type: 'string', description: 'Priority (low|medium|high|critical)' },
      { name: 'goals', type: 'string[]', description: 'Plan goals' },
      { name: 'success_criteria', type: 'string[]', description: 'Success criteria' },
    ],
  },

  update: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'steps', type: 'PlanStep[]', description: 'Array of steps to replace existing steps' },
    ],
    optional: [],
  },

  archive: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  import: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_file_path', type: 'string', description: 'Path to plan markdown file' },
      { name: 'category', type: 'string', description: 'Category for imported plan' },
    ],
    optional: [
      { name: 'title', type: 'string', description: 'Override title from file' },
      { name: 'priority', type: 'string', description: 'Priority level' },
    ],
  },

  find: {
    required: [
      { name: 'plan_id', type: 'string', description: 'Plan ID to find' },
    ],
    optional: [],
  },

  add_note: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'note', type: 'string', description: 'Note content' },
    ],
    optional: [
      { name: 'note_type', type: 'string', description: 'Note type (info|warning|instruction)' },
    ],
  },

  delete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'confirm', type: 'boolean', description: 'Must be true to confirm deletion' },
    ],
    optional: [],
  },

  consolidate: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'step_indices', type: 'number[]', description: 'Step indices to consolidate' },
      { name: 'consolidated_task', type: 'string', description: 'New task description for merged step' },
    ],
    optional: [],
  },

  set_goals: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [
      { name: 'goals', type: 'string[]', description: 'High-level goals' },
      { name: 'success_criteria', type: 'string[]', description: 'Measurable success criteria' },
    ],
  },

  add_build_script: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'script_name', type: 'string', description: 'Script name' },
      { name: 'script_command', type: 'string', description: 'Command to run' },
      { name: 'script_directory', type: 'string', description: 'Working directory' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Associate with plan' },
      { name: 'script_description', type: 'string', description: 'Script description' },
      { name: 'script_mcp_handle', type: 'string', description: 'MCP handle identifier' },
    ],
  },

  list_build_scripts: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Filter to specific plan' },
    ],
  },

  run_build_script: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'script_id', type: 'string', description: 'Script ID to resolve' },
    ],
    optional: [],
  },

  delete_build_script: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'script_id', type: 'string', description: 'Script ID to delete' },
    ],
    optional: [
      { name: 'plan_id', type: 'string', description: 'Plan ID scope' },
    ],
  },

  create_from_template: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'title', type: 'string', description: 'Plan title' },
      { name: 'template', type: 'string', description: 'Template name' },
      { name: 'category', type: 'string', description: 'Request category' },
    ],
    optional: [
      { name: 'description', type: 'string', description: 'Plan description' },
      { name: 'priority', type: 'string', description: 'Priority level' },
    ],
  },

  list_templates: {
    required: [],
    optional: [],
  },

  confirm: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'confirmation_scope', type: 'string', description: 'Scope: phase or step' },
    ],
    optional: [
      { name: 'confirm_phase', type: 'string', description: 'Phase name (when scope=phase)' },
      { name: 'confirm_step_index', type: 'number', description: 'Step index (when scope=step)' },
      { name: 'confirmed_by', type: 'string', description: 'Who confirmed' },
    ],
  },

  create_program: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'title', type: 'string', description: 'Program title' },
      { name: 'description', type: 'string', description: 'Program description' },
    ],
    optional: [
      { name: 'category', type: 'string', description: 'Category' },
      { name: 'priority', type: 'string', description: 'Priority' },
    ],
  },

  add_plan_to_program: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'program_id', type: 'string', description: 'Program plan ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to add' },
    ],
    optional: [],
  },

  upgrade_to_program: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to upgrade' },
    ],
    optional: [
      { name: 'move_steps_to_child', type: 'boolean', description: 'Move steps to child plan' },
      { name: 'child_plan_title', type: 'string', description: 'Title for child plan' },
    ],
  },

  list_program_plans: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'program_id', type: 'string', description: 'Program plan ID' },
    ],
    optional: [],
  },

  export_plan: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  link_to_program: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to link' },
      { name: 'program_id', type: 'string', description: 'Program ID to link to' },
    ],
    optional: [],
  },

  unlink_from_program: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to unlink' },
    ],
    optional: [],
  },

  set_plan_dependencies: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'depends_on_plans', type: 'string[]', description: 'Plan IDs this plan depends on' },
    ],
    optional: [],
  },

  get_plan_dependencies: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [],
  },

  set_plan_priority: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'priority', type: 'string', description: 'New priority (low|medium|high|critical)' },
    ],
    optional: [],
  },

  clone_plan: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to clone' },
    ],
    optional: [
      { name: 'new_title', type: 'string', description: 'Title for cloned plan' },
      { name: 'reset_steps', type: 'boolean', description: 'Reset step statuses to pending' },
      { name: 'link_to_same_program', type: 'boolean', description: 'Link clone to same program' },
    ],
  },

  merge_plans: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'target_plan_id', type: 'string', description: 'Target plan to merge into' },
      { name: 'source_plan_ids', type: 'string[]', description: 'Source plans to merge from' },
    ],
    optional: [
      { name: 'archive_sources', type: 'boolean', description: 'Archive source plans after merge' },
    ],
  },
};

// =============================================================================
// memory_steps
// =============================================================================

export const STEPS_PARAMS: Record<string, ActionParamDef> = {

  add: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'steps', type: 'PlanStep[]', description: 'Steps to append' },
    ],
    optional: [],
  },

  update: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'step_index', type: 'number', description: 'Step index (0-based)' },
      { name: 'status', type: 'string', description: 'New status (pending|active|done|blocked)' },
    ],
    optional: [
      { name: 'notes', type: 'string', description: 'Notes about the update' },
      { name: 'agent_type', type: 'string', description: 'Agent making the update' },
    ],
  },

  batch_update: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'updates', type: 'object[]', description: 'Array of { index, status, notes? }' },
    ],
    optional: [],
  },

  insert: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'at_index', type: 'number', description: 'Index to insert at' },
      { name: 'step', type: 'object', description: 'Step object { phase, task, type?, assignee? }' },
    ],
    optional: [],
  },

  delete: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'step_index', type: 'number', description: 'Index of step to delete' },
    ],
    optional: [],
  },

  reorder: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'step_index', type: 'number', description: 'Index of step to move' },
      { name: 'direction', type: 'string', description: 'Direction: up or down' },
    ],
    optional: [],
  },

  move: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'from_index', type: 'number', description: 'Source step index' },
      { name: 'to_index', type: 'number', description: 'Target step index' },
    ],
    optional: [],
  },

  sort: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
    ],
    optional: [
      { name: 'phase_order', type: 'string[]', description: 'Custom phase order' },
    ],
  },

  set_order: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'new_order', type: 'number[]', description: 'Array of current indices in desired order' },
    ],
    optional: [],
  },

  replace: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'replacement_steps', type: 'PlanStep[]', description: 'Full replacement step array' },
    ],
    optional: [],
  },

  next: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID' },
      { name: 'step_index', type: 'number', description: 'Index of the step to mark done (0-based)' },
    ],
    optional: [
      { name: 'notes', type: 'string', description: 'Completion notes for the step' },
      { name: 'agent_type', type: 'string', description: 'Agent completing the step' },
    ],
  },
};
