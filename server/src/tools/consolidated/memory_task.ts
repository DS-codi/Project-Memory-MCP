/**
 * memory_task — CLI-agent composite tool
 *
 * A single ergonomic tool that replaces 4-5 round-trips for the common
 * "get current step → do work → mark done" loop used by CLI agents
 * (Gemini CLI, Copilot CLI) running inside Interactive Terminal sessions.
 *
 * Actions:
 *   get_current   — idempotent: returns current step + lookahead + goals
 *   mark_done     — mark step done, return next pending step
 *   mark_blocked  — mark step blocked with a reason
 *   get_context   — return research notes for the current phase
 *   summarize_plan — phase-by-phase progress table
 *   log_work      — append findings to research notes
 *
 * Design rules:
 *   - All responses are aggressively trimmed: no lineage, no session history,
 *     no skill injection, no role boundaries.
 *   - get_current is idempotent: marks step active only when status is pending.
 *   - Shared SQLite DB — same data as the main MCP, just fewer fields returned.
 */

import type { PlanStep, PlanState } from '../../types/plan.types.js';
import type { ToolResponse } from '../../types/index.js';
import * as planTools from '../plan/index.js';
import { appendResearch, getContext } from '../context.tools.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate, buildPreflightFailure } from '../preflight/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TaskAction =
  | 'get_current'
  | 'mark_done'
  | 'mark_blocked'
  | 'get_context'
  | 'summarize_plan'
  | 'log_work';

export interface MemoryTaskParams {
  action: TaskAction;

  // Required for all actions
  workspace_id: string;

  // Required for most actions; optional for get_current (uses active plan)
  plan_id?: string;

  // mark_done / mark_blocked / log_work
  step_index?: number;

  // mark_done
  notes?: string;

  // mark_blocked
  reason?: string;

  // get_context
  context_type?: string;

  // log_work
  findings?: string;
}

// Slim step representation — only what a CLI agent needs
interface SlimStep {
  index: number;
  display_number: number;
  phase: string;
  task: string;
  status: string;
}

type TaskResult =
  | { action: 'get_current'; data: GetCurrentResult }
  | { action: 'mark_done'; data: MarkDoneResult }
  | { action: 'mark_blocked'; data: MarkBlockedResult }
  | { action: 'get_context'; data: GetContextResult }
  | { action: 'summarize_plan'; data: SummarizePlanResult }
  | { action: 'log_work'; data: LogWorkResult };

interface GetCurrentResult {
  success: true;
  step: SlimStep | null;
  next_steps: SlimStep[];
  goals: string[];
  success_criteria: string[];
  plan_id: string;
  total_done: number;
  total_steps: number;
  /** Inline instruction: what to call when the current step is finished. */
  next_required_call: string | null;
}

interface MarkDoneResult {
  success: true;
  completed_step: number;
  next_step: SlimStep | null;
}

interface MarkBlockedResult {
  success: true;
  blocked_step: number;
}

interface GetContextResult {
  success: true;
  notes: string | null;
  context_type: string;
}

interface SummarizePlanResult {
  success: true;
  phases: Array<{
    phase: string;
    done: number;
    pending: number;
    active: number;
    blocked: number;
    total: number;
  }>;
  total_done: number;
  total_steps: number;
  goals: string[];
}

interface LogWorkResult {
  success: true;
  appended_to: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toSlimStep(step: PlanStep): SlimStep {
  return {
    index: step.index,
    display_number: step.index + 1,
    phase: step.phase,
    task: step.task,
    status: step.status,
  };
}

/** Resolve plan_id: use provided value, or find the first active plan. */
async function resolvePlanId(
  workspace_id: string,
  plan_id: string | undefined,
): Promise<string | null> {
  if (plan_id?.trim()) return plan_id.trim();

  const listed = await planTools.listPlans({ workspace_id });
  if (!listed.success || !listed.data?.active_plans?.length) return null;

  // Prefer a plan that has an active step, otherwise take the first
  return listed.data.active_plans[0].plan_id;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

async function handleGetCurrent(
  workspace_id: string,
  plan_id: string | undefined,
): Promise<GetCurrentResult | { success: false; error: string }> {
  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found for this workspace.' };
  }

  const planResult = await planTools.getPlanState({ workspace_id, plan_id: resolvedPlanId });
  if (!planResult.success || !planResult.data) {
    return { success: false, error: planResult.error ?? 'Plan not found.' };
  }

  const plan: PlanState = planResult.data;
  const steps: PlanStep[] = plan.steps ?? [];

  // Current step: first pending or active
  const currentStep = steps.find(
    s => s.status === 'active' || s.status === 'pending',
  ) ?? null;

  // Idempotent: only mark active if currently pending
  if (currentStep?.status === 'pending') {
    await planTools.updateStep({
      workspace_id,
      plan_id: resolvedPlanId,
      step_index: currentStep.index,
      status: 'active',
      notes: 'CLI agent started work.',
    });
    currentStep.status = 'active';
  }

  // Up to 3 next pending steps after the current one
  const nextSteps: SlimStep[] = [];
  if (currentStep) {
    const afterCurrent = steps.filter(
      s => s.index > currentStep.index && s.status === 'pending',
    );
    for (const s of afterCurrent.slice(0, 3)) {
      nextSteps.push(toSlimStep(s));
    }
  }

  const doneCnt = steps.filter(s => s.status === 'done').length;

  const slimCurrent = currentStep ? toSlimStep(currentStep) : null;
  const nextRequiredCall = slimCurrent
    ? `memory_task(action: "mark_done", workspace_id: "${workspace_id}", plan_id: "${resolvedPlanId}", step_index: ${slimCurrent.index}) — REQUIRED when step is complete`
    : null;

  return {
    success: true,
    step: slimCurrent,
    next_steps: nextSteps,
    goals: plan.goals ?? [],
    success_criteria: plan.success_criteria ?? [],
    plan_id: resolvedPlanId,
    total_done: doneCnt,
    total_steps: steps.length,
    next_required_call: nextRequiredCall,
  };
}

async function handleMarkDone(
  workspace_id: string,
  plan_id: string | undefined,
  step_index: number | undefined,
  notes: string | undefined,
): Promise<MarkDoneResult | { success: false; error: string }> {
  if (step_index === undefined) {
    return { success: false, error: 'step_index is required for mark_done.' };
  }

  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found.' };
  }

  const result = await planTools.updateStep({
    workspace_id,
    plan_id: resolvedPlanId,
    step_index,
    status: 'done',
    notes: notes ?? 'Marked done by CLI agent.',
  });

  if (!result.success) {
    return { success: false, error: result.error ?? 'Failed to update step.' };
  }

  // Find the next pending step
  const planResult = await planTools.getPlanState({ workspace_id, plan_id: resolvedPlanId });
  const steps: PlanStep[] = planResult.data?.steps ?? [];
  const nextPending = steps.find(s => s.status === 'pending') ?? null;

  return {
    success: true,
    completed_step: step_index,
    next_step: nextPending ? toSlimStep(nextPending) : null,
  };
}

async function handleMarkBlocked(
  workspace_id: string,
  plan_id: string | undefined,
  step_index: number | undefined,
  reason: string | undefined,
): Promise<MarkBlockedResult | { success: false; error: string }> {
  if (step_index === undefined) {
    return { success: false, error: 'step_index is required for mark_blocked.' };
  }

  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found.' };
  }

  const result = await planTools.updateStep({
    workspace_id,
    plan_id: resolvedPlanId,
    step_index,
    status: 'blocked',
    notes: reason ?? 'Blocked by CLI agent.',
  });

  if (!result.success) {
    return { success: false, error: result.error ?? 'Failed to update step.' };
  }

  return { success: true, blocked_step: step_index };
}

async function handleGetContext(
  workspace_id: string,
  plan_id: string | undefined,
  context_type: string | undefined,
): Promise<GetContextResult | { success: false; error: string }> {
  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found.' };
  }

  const type = context_type?.trim() || 'research';

  const result = await getContext({ workspace_id, plan_id: resolvedPlanId, type });

  const notes: string | null =
    result.success && result.data
      ? (typeof result.data === 'string'
        ? result.data
        : JSON.stringify(result.data, null, 2))
      : null;

  return { success: true, notes, context_type: type };
}

async function handleSummarizePlan(
  workspace_id: string,
  plan_id: string | undefined,
): Promise<SummarizePlanResult | { success: false; error: string }> {
  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found.' };
  }

  const planResult = await planTools.getPlanState({ workspace_id, plan_id: resolvedPlanId });
  if (!planResult.success || !planResult.data) {
    return { success: false, error: planResult.error ?? 'Plan not found.' };
  }

  const steps: PlanStep[] = planResult.data.steps ?? [];

  // Group by phase
  const phaseMap = new Map<string, { done: number; pending: number; active: number; blocked: number; total: number }>();
  for (const step of steps) {
    if (!phaseMap.has(step.phase)) {
      phaseMap.set(step.phase, { done: 0, pending: 0, active: 0, blocked: 0, total: 0 });
    }
    const entry = phaseMap.get(step.phase)!;
    entry.total++;
    entry[step.status as 'done' | 'pending' | 'active' | 'blocked']++;
  }

  const phases = Array.from(phaseMap.entries()).map(([phase, counts]) => ({
    phase,
    ...counts,
  }));

  return {
    success: true,
    phases,
    total_done: steps.filter(s => s.status === 'done').length,
    total_steps: steps.length,
    goals: planResult.data.goals ?? [],
  };
}

async function handleLogWork(
  workspace_id: string,
  plan_id: string | undefined,
  findings: string | undefined,
): Promise<LogWorkResult | { success: false; error: string }> {
  if (!findings?.trim()) {
    return { success: false, error: 'findings is required for log_work.' };
  }

  const resolvedPlanId = await resolvePlanId(workspace_id, plan_id);
  if (!resolvedPlanId) {
    return { success: false, error: 'No active plan found.' };
  }

  const filename = 'cli-agent-log.md';
  const timestamp = new Date().toISOString();
  const content = `\n## ${timestamp}\n\n${findings.trim()}\n`;

  const result = await appendResearch({
    workspace_id,
    plan_id: resolvedPlanId,
    filename,
    content,
  });

  if (!result.success) {
    return { success: false, error: result.error ?? 'Failed to append research note.' };
  }

  return { success: true, appended_to: filename };
}

// ---------------------------------------------------------------------------
// Main dispatcher
// ---------------------------------------------------------------------------

export async function memoryTask(params: MemoryTaskParams): Promise<ToolResponse<TaskResult>> {
  if (!params.action) {
    return {
      success: false,
      error: 'action is required. Valid actions: get_current, mark_done, mark_blocked, get_context, summarize_plan, log_work',
    };
  }

  // Preflight validation — checks any registered required-field specs for memory_task
  const preflight = preflightValidate('memory_task', params.action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return buildPreflightFailure('memory_task', params.action, preflight) as ToolResponse<TaskResult>;
  }

  const validated = await validateAndResolveWorkspaceId(params.workspace_id);
  if (!validated.success) return { success: false, error: (validated.error_response as { error?: string }).error ?? 'Invalid workspace_id' };
  const workspace_id = validated.workspace_id;

  switch (params.action) {
    case 'get_current': {
      const data = await handleGetCurrent(workspace_id, params.plan_id);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'get_current', data: data as GetCurrentResult } };
    }
    case 'mark_done': {
      const data = await handleMarkDone(workspace_id, params.plan_id, params.step_index, params.notes);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'mark_done', data: data as MarkDoneResult } };
    }
    case 'mark_blocked': {
      const data = await handleMarkBlocked(workspace_id, params.plan_id, params.step_index, params.reason);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'mark_blocked', data: data as MarkBlockedResult } };
    }
    case 'get_context': {
      const data = await handleGetContext(workspace_id, params.plan_id, params.context_type);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'get_context', data: data as GetContextResult } };
    }
    case 'summarize_plan': {
      const data = await handleSummarizePlan(workspace_id, params.plan_id);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'summarize_plan', data: data as SummarizePlanResult } };
    }
    case 'log_work': {
      const data = await handleLogWork(workspace_id, params.plan_id, params.findings);
      if ('error' in data && !data.success) return { success: false, error: data.error };
      return { success: true, data: { action: 'log_work', data: data as LogWorkResult } };
    }
    default:
      return {
        success: false,
        error: `Unknown action: ${(params as { action: string }).action}. Valid actions: get_current, mark_done, mark_blocked, get_context, summarize_plan, log_work`,
      };
  }
}
