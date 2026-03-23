/**
 * Consolidated Sprint Tool - memory_sprint
 *
 * Actions: list, get, create, update, archive, delete,
 *          set_goals, add_goal, complete_goal, remove_goal,
 *          attach_plan, detach_plan
 */

import type { ToolResponse } from '../../types/index.js';
import type { Sprint, SprintStatus } from '../../types/sprint.types.js';
import * as sprintDb from '../../db/sprint-db.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate, buildPreflightFailure } from '../preflight/index.js';

// =============================================================================
// Types
// =============================================================================

export type SprintAction =
  | 'list'
  | 'get'
  | 'create'
  | 'update'
  | 'archive'
  | 'delete'
  | 'set_goals'
  | 'add_goal'
  | 'complete_goal'
  | 'remove_goal'
  | 'attach_plan'
  | 'detach_plan';

export interface MemorySprintParams {
  action: SprintAction;
  workspace_id?: string;
  sprint_id?: string;
  title?: string;
  status?: SprintStatus;
  plan_id?: string;
  goals?: string[];
  goal_description?: string;
  goal_id?: string;
  include_archived?: boolean;
  confirm?: boolean;
}

type SprintResult =
  | { action: 'list'; data: { sprints: Sprint[]; count: number } }
  | { action: 'get'; data: Sprint }
  | { action: 'create'; data: Sprint }
  | { action: 'update'; data: Sprint }
  | { action: 'archive'; data: Sprint }
  | { action: 'delete'; data: { deleted: boolean; sprint_id: string } }
  | { action: 'set_goals'; data: { sprint_id: string; goals_count: number } }
  | { action: 'add_goal'; data: { sprint_id: string; goal_id: string; description: string } }
  | { action: 'complete_goal'; data: { goal_id: string; completed: boolean } }
  | { action: 'remove_goal'; data: { goal_id: string; removed: boolean } }
  | { action: 'attach_plan'; data: { sprint_id: string; plan_id: string } }
  | { action: 'detach_plan'; data: { sprint_id: string; detached: boolean } };

// =============================================================================
// Main Entry Point
// =============================================================================

export async function memorySprint(params: MemorySprintParams): Promise<ToolResponse<SprintResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: list, get, create, update, archive, delete, set_goals, add_goal, complete_goal, remove_goal, attach_plan, detach_plan',
    };
  }

  // Validate and resolve workspace_id (handles legacy ID redirect)
  if (params.workspace_id) {
    const validated = await validateAndResolveWorkspaceId(params.workspace_id);
    if (!validated.success) return validated.error_response as ToolResponse<SprintResult>;
    params.workspace_id = validated.workspace_id;
  }

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_sprint', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return buildPreflightFailure('memory_sprint', action, preflight) as ToolResponse<SprintResult>;
  }

  switch (action) {
    case 'list': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: list',
        };
      }

      const statusFilter = params.include_archived ? undefined : 'active' as SprintStatus;
      const opts: sprintDb.ListSprintsOptions = {};
      if (statusFilter) {
        opts.status = statusFilter;
      }

      const sprints = sprintDb.listSprintsWithGoals(params.workspace_id, opts);
      return {
        success: true,
        data: {
          action: 'list',
          data: { sprints, count: sprints.length },
        },
      };
    }

    case 'get': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: get',
        };
      }

      const sprint = sprintDb.getSprintWithGoals(params.sprint_id);
      if (!sprint) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      return {
        success: true,
        data: { action: 'get', data: sprint },
      };
    }

    case 'create': {
      if (!params.workspace_id || !params.title) {
        return {
          success: false,
          error: 'workspace_id and title are required for action: create',
        };
      }

      const sprintRow = sprintDb.createSprint({
        workspace_id: params.workspace_id,
        title: params.title,
        status: params.status ?? 'active',
        attached_plan_id: params.plan_id ?? null,
      });

      const sprint = sprintDb.getSprintWithGoals(sprintRow.sprint_id);
      if (!sprint) {
        return {
          success: false,
          error: 'Failed to retrieve created sprint',
        };
      }

      return {
        success: true,
        data: { action: 'create', data: sprint },
      };
    }

    case 'update': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: update',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      const updateData: sprintDb.UpdateSprintData = {};
      if (params.title !== undefined) {
        updateData.title = params.title;
      }
      if (params.status !== undefined) {
        updateData.status = params.status;
      }

      sprintDb.updateSprint(params.sprint_id, updateData);

      const sprint = sprintDb.getSprintWithGoals(params.sprint_id);
      if (!sprint) {
        return {
          success: false,
          error: 'Failed to retrieve updated sprint',
        };
      }

      return {
        success: true,
        data: { action: 'update', data: sprint },
      };
    }

    case 'archive': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: archive',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      sprintDb.archiveSprint(params.sprint_id);

      const sprint = sprintDb.getSprintWithGoals(params.sprint_id);
      if (!sprint) {
        return {
          success: false,
          error: 'Failed to retrieve archived sprint',
        };
      }

      return {
        success: true,
        data: { action: 'archive', data: sprint },
      };
    }

    case 'delete': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: delete',
        };
      }

      if (!params.confirm) {
        return {
          success: false,
          error: 'confirm: true is required for destructive delete action',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      sprintDb.deleteSprint(params.sprint_id);

      return {
        success: true,
        data: {
          action: 'delete',
          data: { deleted: true, sprint_id: params.sprint_id },
        },
      };
    }

    case 'set_goals': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: set_goals',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      const goals = params.goals ?? [];
      sprintDb.setGoals(params.sprint_id, goals);

      return {
        success: true,
        data: {
          action: 'set_goals',
          data: { sprint_id: params.sprint_id, goals_count: goals.length },
        },
      };
    }

    case 'add_goal': {
      if (!params.sprint_id || !params.goal_description) {
        return {
          success: false,
          error: 'sprint_id and goal_description are required for action: add_goal',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      const goal = sprintDb.addGoal(params.sprint_id, params.goal_description);

      return {
        success: true,
        data: {
          action: 'add_goal',
          data: {
            sprint_id: params.sprint_id,
            goal_id: goal.goal_id,
            description: goal.description,
          },
        },
      };
    }

    case 'complete_goal': {
      if (!params.goal_id) {
        return {
          success: false,
          error: 'goal_id is required for action: complete_goal',
        };
      }

      const goal = sprintDb.getGoal(params.goal_id);
      if (!goal) {
        return {
          success: false,
          error: `Goal not found: ${params.goal_id}`,
        };
      }

      sprintDb.completeGoal(params.goal_id);

      return {
        success: true,
        data: {
          action: 'complete_goal',
          data: { goal_id: params.goal_id, completed: true },
        },
      };
    }

    case 'remove_goal': {
      if (!params.goal_id) {
        return {
          success: false,
          error: 'goal_id is required for action: remove_goal',
        };
      }

      const goal = sprintDb.getGoal(params.goal_id);
      if (!goal) {
        return {
          success: false,
          error: `Goal not found: ${params.goal_id}`,
        };
      }

      sprintDb.removeGoal(params.goal_id);

      return {
        success: true,
        data: {
          action: 'remove_goal',
          data: { goal_id: params.goal_id, removed: true },
        },
      };
    }

    case 'attach_plan': {
      if (!params.sprint_id || !params.plan_id) {
        return {
          success: false,
          error: 'sprint_id and plan_id are required for action: attach_plan',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      sprintDb.attachPlan(params.sprint_id, params.plan_id);

      return {
        success: true,
        data: {
          action: 'attach_plan',
          data: { sprint_id: params.sprint_id, plan_id: params.plan_id },
        },
      };
    }

    case 'detach_plan': {
      if (!params.sprint_id) {
        return {
          success: false,
          error: 'sprint_id is required for action: detach_plan',
        };
      }

      const existing = sprintDb.getSprint(params.sprint_id);
      if (!existing) {
        return {
          success: false,
          error: `Sprint not found: ${params.sprint_id}`,
        };
      }

      sprintDb.detachPlan(params.sprint_id);

      return {
        success: true,
        data: {
          action: 'detach_plan',
          data: { sprint_id: params.sprint_id, detached: true },
        },
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: list, get, create, update, archive, delete, set_goals, add_goal, complete_goal, remove_goal, attach_plan, detach_plan`,
      };
  }
}
