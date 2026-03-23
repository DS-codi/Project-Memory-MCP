/**
 * Action Parameter Specs — memory_sprint
 *
 * Per-action required/optional parameter definitions for sprint management.
 */

import type { ActionParamDef } from './action-params-plan.js';

// =============================================================================
// memory_sprint
// =============================================================================

export const SPRINT_PARAMS: Record<string, ActionParamDef> = {
  list: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
    ],
    optional: [
      { name: 'include_archived', type: 'boolean', description: 'Include archived sprints' },
    ],
  },

  get: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
    ],
    optional: [],
  },

  create: {
    required: [
      { name: 'workspace_id', type: 'string', description: 'Workspace ID' },
      { name: 'title', type: 'string', description: 'Sprint title' },
    ],
    optional: [
      { name: 'status', type: 'string', description: 'Sprint status (active, completed, archived)' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to attach' },
    ],
  },

  update: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
    ],
    optional: [
      { name: 'title', type: 'string', description: 'New sprint title' },
      { name: 'status', type: 'string', description: 'New sprint status' },
    ],
  },

  archive: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
    ],
    optional: [],
  },

  delete: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
      { name: 'confirm', type: 'boolean', description: 'Confirmation required for delete' },
    ],
    optional: [],
  },

  set_goals: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
    ],
    optional: [
      { name: 'goals', type: 'string[]', description: 'Array of goal descriptions' },
    ],
  },

  add_goal: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
      { name: 'goal_description', type: 'string', description: 'Goal description' },
    ],
    optional: [],
  },

  complete_goal: {
    required: [
      { name: 'goal_id', type: 'string', description: 'Goal ID' },
    ],
    optional: [],
  },

  remove_goal: {
    required: [
      { name: 'goal_id', type: 'string', description: 'Goal ID' },
    ],
    optional: [],
  },

  attach_plan: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
      { name: 'plan_id', type: 'string', description: 'Plan ID to attach' },
    ],
    optional: [],
  },

  detach_plan: {
    required: [
      { name: 'sprint_id', type: 'string', description: 'Sprint ID' },
    ],
    optional: [],
  },
};
