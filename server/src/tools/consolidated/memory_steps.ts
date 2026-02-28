/**
 * Consolidated Steps Tool - memory_steps
 * 
 * Actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order
 * Replaces: append_steps, update_step, batch_update_steps
 */

import type { 
  ToolResponse, 
  PlanStep,
  PlanOperationResult,
  StepStatus
} from '../../types/index.js';
import * as planTools from '../plan/index.js';
import { recordStepChange } from '../stats-hooks.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate } from '../preflight/index.js';
import { updateSessionRegistry } from '../../db/workspace-session-registry-db.js';
import { serverSessionIdForPrepId } from '../session-live-store.js';

/**
 * Enrich step objects with display_number (1-based) for agent/UI consumption.
 * This does NOT mutate the original data — it returns a new object.
 */
function enrichStepsWithDisplayNumber(result: PlanOperationResult): PlanOperationResult {
  return {
    ...result,
    plan_state: {
      ...result.plan_state,
      steps: result.plan_state.steps.map(step => ({
        ...step,
        display_number: step.index + 1
      }))
    }
  };
}

function syncRegistryFromPlanState(
  prepSessionId: string | undefined,
  planResult: PlanOperationResult,
): void {
  if (!prepSessionId) return;
  const serverSessionId = serverSessionIdForPrepId(prepSessionId);
  if (!serverSessionId) return;

  const activeStepIndices = planResult.plan_state.steps
    .filter(step => step.status === 'active')
    .map(step => step.index);

  updateSessionRegistry(serverSessionId, {
    currentPhase: planResult.plan_state.current_phase ?? null,
    stepIndicesClaimed: activeStepIndices,
    status: 'active',
  });
}

export type StepsAction = 'add' | 'update' | 'batch_update' | 'insert' | 'delete' | 'reorder' | 'move' | 'sort' | 'set_order' | 'replace' | 'next';

export interface MemoryStepsParams {
  action: StepsAction;
  workspace_id: string;
  plan_id: string;
  /** Session ID for instrumentation tracking */
  _session_id?: string;
  
  // For 'add' action
  steps?: Omit<PlanStep, 'index'>[];
  
  // For 'insert' action
  at_index?: number;
  step?: Omit<PlanStep, 'index'>;
  
  // For 'update' action
  step_index?: number;
  status?: StepStatus;
  notes?: string;
  agent_type?: string;
  
  // For 'batch_update' action
  updates?: Array<{
    index: number;
    status: StepStatus;
    notes?: string;
  }>;
  
  // For 'reorder' action - swap step with adjacent step
  direction?: 'up' | 'down';
  
  // For 'move' action - move step to specific index
  from_index?: number;
  to_index?: number;
  
  // For 'sort' action - sort steps by phase
  phase_order?: string[];  // Custom phase order, e.g. ["Research", "Design", "Implement", "Test"]
  
  // For 'set_order' action - set completely new order
  new_order?: number[];  // Array of current indices in desired new order
  
  // For 'replace' action - replace all steps with new array
  replacement_steps?: Omit<PlanStep, 'index'>[];

  // For 'next' action - mark current step done and return next pending
  // (reuses step_index, notes, agent_type from existing fields)
}

type StepsResult = 
  | { action: 'add'; data: PlanOperationResult }
  | { action: 'update'; data: PlanOperationResult }
  | { action: 'batch_update'; data: PlanOperationResult }
  | { action: 'insert'; data: PlanOperationResult }
  | { action: 'delete'; data: PlanOperationResult }
  | { action: 'reorder'; data: PlanOperationResult }
  | { action: 'move'; data: PlanOperationResult }
  | { action: 'sort'; data: PlanOperationResult }
  | { action: 'set_order'; data: PlanOperationResult }
  | { action: 'replace'; data: PlanOperationResult }
  | { action: 'next'; data: PlanOperationResult & { next_step: (PlanStep & { display_number: number }) | null } };

export async function memorySteps(params: MemoryStepsParams): Promise<ToolResponse<StepsResult>> {
  const { action, workspace_id, plan_id } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace, next'
    };
  }

  if (!workspace_id || !plan_id) {
    return {
      success: false,
      error: 'workspace_id and plan_id are required'
    };
  }

  // Validate and resolve workspace_id (handles legacy ID redirect)
  const validated = await validateAndResolveWorkspaceId(workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<StepsResult>;
  const resolvedWorkspaceId = validated.workspace_id;

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_steps', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return { success: false, error: preflight.message, preflight_failure: preflight } as ToolResponse<StepsResult>;
  }

  switch (action) {
    case 'add': {
      if (!params.steps || params.steps.length === 0) {
        return {
          success: false,
          error: 'steps array is required for action: add'
        };
      }
      const result = await planTools.appendSteps({
        workspace_id,
        plan_id,
        new_steps: params.steps
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'add', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'update': {
      if (params.step_index === undefined || !params.status) {
        return {
          success: false,
          error: 'step_index and status are required for action: update'
        };
      }
      const result = await planTools.updateStep({
        workspace_id,
        plan_id,
        step_index: params.step_index,
        status: params.status,
        notes: params.notes
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      syncRegistryFromPlanState(params._session_id, result.data!);
      // Track step status change for session instrumentation
      if (params.status === 'active' || params.status === 'done' || params.status === 'blocked') {
        recordStepChange(params._session_id, params.status);
      }
      return {
        success: true,
        data: { action: 'update', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'batch_update': {
      if (!params.updates || params.updates.length === 0) {
        return {
          success: false,
          error: 'updates array is required for action: batch_update'
        };
      }
      // Map 'index' to 'step_index' for the underlying function
      const mappedUpdates = params.updates.map(u => ({
        step_index: u.index,
        status: u.status,
        notes: u.notes
      }));
      const result = await planTools.batchUpdateSteps({
        workspace_id,
        plan_id,
        updates: mappedUpdates
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      syncRegistryFromPlanState(params._session_id, result.data!);
      // Track step status changes for session instrumentation
      for (const u of params.updates!) {
        if (u.status === 'active' || u.status === 'done' || u.status === 'blocked') {
          recordStepChange(params._session_id, u.status);
        }
      }
      return {
        success: true,
        data: { action: 'batch_update', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'insert': {
      if (params.at_index === undefined || !params.step) {
        return {
          success: false,
          error: 'at_index and step are required for action: insert'
        };
      }
      const result = await planTools.insertStep({
        workspace_id,
        plan_id,
        at_index: params.at_index,
        step: params.step
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'insert', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'delete': {
      if (params.step_index === undefined) {
        return {
          success: false,
          error: 'step_index is required for action: delete'
        };
      }
      const result = await planTools.deleteStep({
        workspace_id,
        plan_id,
        step_index: params.step_index
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'delete', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'reorder': {
      if (params.step_index === undefined || !params.direction) {
        return {
          success: false,
          error: 'step_index and direction (up/down) are required for action: reorder'
        };
      }
      const result = await planTools.reorderStep({
        workspace_id,
        plan_id,
        step_index: params.step_index,
        direction: params.direction
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'reorder', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'move': {
      if (params.from_index === undefined || params.to_index === undefined) {
        return {
          success: false,
          error: 'from_index and to_index are required for action: move'
        };
      }
      const result = await planTools.moveStep({
        workspace_id,
        plan_id,
        from_index: params.from_index,
        to_index: params.to_index
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'move', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'sort': {
      // Sort steps by phase (optionally with custom phase order)
      const result = await planTools.sortStepsByPhase({
        workspace_id,
        plan_id,
        phase_order: params.phase_order
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'sort', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'set_order': {
      if (!params.new_order || params.new_order.length === 0) {
        return {
          success: false,
          error: 'new_order array is required for action: set_order (array of current indices in desired order)'
        };
      }
      const result = await planTools.setStepOrder({
        workspace_id,
        plan_id,
        new_order: params.new_order
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'set_order', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'replace': {
      if (!params.replacement_steps || params.replacement_steps.length === 0) {
        return {
          success: false,
          error: 'replacement_steps array is required for action: replace'
        };
      }
      const result = await planTools.modifyPlan({
        workspace_id,
        plan_id,
        new_steps: params.replacement_steps
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'replace', data: enrichStepsWithDisplayNumber(result.data!) }
      };
    }

    case 'next': {
      // Atomically mark the current step as done and return the next pending step.
      if (params.step_index === undefined) {
        return {
          success: false,
          error: 'step_index is required for action: next'
        };
      }
      const result = await planTools.updateStep({
        workspace_id,
        plan_id,
        step_index: params.step_index,
        status: 'done',
        notes: params.notes
      });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      syncRegistryFromPlanState(params._session_id, result.data!);
      recordStepChange(params._session_id, 'done');
      const enriched = enrichStepsWithDisplayNumber(result.data!);
      const rawNext = enriched.plan_state.steps.find(s => s.status === 'pending');
      const nextStep = rawNext
        ? { ...rawNext, display_number: rawNext.index + 1 }
        : null;
      return {
        success: true,
        data: {
          action: 'next' as const,
          data: { ...enriched, next_step: nextStep }
        }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: add, update, batch_update, insert, delete, reorder, move, sort, set_order, replace, next`
      };
  }
}
