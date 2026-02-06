/**
 * Plan Tools - MCP tools for plan lifecycle management
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  CreatePlanParams,
  GetPlanStateParams,
  UpdateStepParams,
  BatchUpdateStepsParams,
  ModifyPlanParams,
  ArchivePlanParams,
  ImportPlanParams,
  ImportPlanResult,
  ToolResponse,
  PlanState,
  PlanStep,
  RequestCategory,
  PlanOperationResult,
  AgentType,
  OrderValidationWarning
} from '../types/index.js';
import { AGENT_BOUNDARIES, STEP_TYPE_BEHAVIORS } from '../types/index.js';
import * as store from '../storage/file-store.js';
import { events } from '../events/event-emitter.js';

// =============================================================================
// Plan Lookup
// =============================================================================

export interface PlanSummary {
  plan_id: string;
  title: string;
  status: string;
  current_phase: string;
  current_agent: string | null;
  progress: string;
  steps_done: number;
  steps_total: number;
  last_updated: string;
}

export interface ListPlansResult {
  workspace_id: string;
  workspace_name: string;
  workspace_path: string;
  active_plans: PlanSummary[];
  archived_plans: string[];
  message: string;
}

export interface FindPlanResult {
  workspace_id: string;
  plan_state: PlanState;
  workspace_path: string;
  resume_instruction: string;
}

/**
 * List all plans for a workspace - shows active plans with progress summary
 */
export async function listPlans(
  params: { workspace_id?: string; workspace_path?: string }
): Promise<ToolResponse<ListPlansResult>> {
  try {
    let { workspace_id, workspace_path } = params;
    
    // If workspace_path provided, find the workspace_id
    if (!workspace_id && workspace_path) {
      const workspaces = await store.getAllWorkspaces();
      const match = workspaces.find(w => 
        w.path.toLowerCase() === workspace_path!.toLowerCase() ||
        w.path.toLowerCase().replace(/\\/g, '/') === workspace_path!.toLowerCase().replace(/\\/g, '/')
      );
      if (match) {
        workspace_id = match.workspace_id;
      }
    }
    
    // If still no workspace_id, list all workspaces
    if (!workspace_id) {
      const workspaces = await store.getAllWorkspaces();
      return {
        success: false,
        error: `workspace_id or workspace_path required. Registered workspaces: ${workspaces.map(w => `${w.workspace_id} (${w.name})`).join(', ') || 'none'}`
      };
    }
    
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    // Get details for each active plan
    const activePlans: PlanSummary[] = [];
    
    for (const planId of workspace.active_plans) {
      const planState = await store.getPlanState(workspace_id, planId);
      if (planState) {
        const doneSteps = planState.steps.filter(s => s.status === 'done').length;
        const totalSteps = planState.steps.length;
        
        activePlans.push({
          plan_id: planState.id,
          title: planState.title,
          status: planState.status,
          current_phase: planState.current_phase,
          current_agent: planState.current_agent,
          progress: `${doneSteps}/${totalSteps} steps`,
          steps_done: doneSteps,
          steps_total: totalSteps,
          last_updated: planState.updated_at
        });
      }
    }
    
    return {
      success: true,
      data: {
        workspace_id,
        workspace_name: workspace.name,
        workspace_path: workspace.path,
        active_plans: activePlans,
        archived_plans: workspace.archived_plans,
        message: activePlans.length > 0 
          ? `Found ${activePlans.length} active plan(s). Use find_plan or initialise_agent with plan_id to resume.`
          : 'No active plans. Use create_plan or import_plan to start.'
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list plans: ${(error as Error).message}`
    };
  }
}

/**
 * Find a plan by just its ID (hash) - searches across all workspaces
 * Returns the workspace_id and full plan state for resuming work
 */
export async function findPlan(
  params: { plan_id: string }
): Promise<ToolResponse<FindPlanResult>> {
  try {
    const { plan_id } = params;
    
    if (!plan_id) {
      return {
        success: false,
        error: 'plan_id is required'
      };
    }
    
    const result = await store.findPlanById(plan_id);
    
    if (!result) {
      // List all available plans to help user
      const workspaces = await store.getAllWorkspaces();
      const allPlans: string[] = [];
      
      for (const ws of workspaces) {
        for (const planId of ws.active_plans) {
          allPlans.push(`${planId} (${ws.name})`);
        }
      }
      
      return {
        success: false,
        error: `Plan not found: ${plan_id}. Available plans: ${allPlans.join(', ') || 'none'}`
      };
    }
    
    const workspace = await store.getWorkspace(result.workspace_id);
    const plan = result.plan;
    
    // Determine which agent should continue
    const currentAgent = plan.current_agent || 'Coordinator';
    const pendingSteps = plan.steps.filter(s => s.status === 'pending').length;
    const doneSteps = plan.steps.filter(s => s.status === 'done').length;
    
    return {
      success: true,
      data: {
        workspace_id: result.workspace_id,
        plan_state: plan,
        workspace_path: workspace?.path || 'unknown',
        resume_instruction: `Plan "${plan.title}" found. ` +
          `Status: ${plan.status}, Phase: ${plan.current_phase}, ` +
          `Progress: ${doneSteps}/${plan.steps.length} steps complete. ` +
          `Current agent: ${currentAgent}. ` +
          `To resume, call initialise_agent with workspace_id="${result.workspace_id}" and plan_id="${plan_id}".`
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to find plan: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Plan Creation
// =============================================================================

/**
 * Create a new plan within a workspace
 */
export async function createPlan(
  params: CreatePlanParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, title, description, category, priority, categorization, goals, success_criteria } = params;
    
    if (!workspace_id || !title || !description || !category) {
      return {
        success: false,
        error: 'workspace_id, title, description, and category are required'
      };
    }
    
    // Verify workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }

    if (category === 'investigation') {
      const hasGoals = Array.isArray(goals) && goals.length > 0;
      const hasCriteria = Array.isArray(success_criteria) && success_criteria.length > 0;
      if (!hasGoals || !hasCriteria) {
        return {
          success: false,
          error: 'Investigation plans require at least 1 goal and 1 success criteria'
        };
      }
    }
    
    const plan = await store.createPlan(workspace_id, title, description, category, priority, categorization, goals, success_criteria);
    
    // Emit event for dashboard
    await events.planCreated(workspace_id, plan.id, title, category);
    
    return {
      success: true,
      data: plan
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create plan: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Plan Templates
// =============================================================================

export type PlanTemplate = 'feature' | 'bugfix' | 'refactor' | 'documentation' | 'analysis' | 'investigation';

export interface PlanTemplateSteps {
  template: PlanTemplate;
  steps: Omit<PlanStep, 'index'>[];
  goals?: string[];
  success_criteria?: string[];
}

const PLAN_TEMPLATES: Record<PlanTemplate, PlanTemplateSteps> = {
  feature: {
    template: 'feature',
    goals: ['Implement the requested feature', 'Ensure code quality and test coverage'],
    success_criteria: ['Feature works as specified', 'Tests pass', 'No regressions'],
    steps: [
      { phase: 'Research', task: 'Analyze requirements and gather context', status: 'pending', type: 'research' },
      { phase: 'Research', task: 'Investigate existing codebase patterns', status: 'pending', type: 'research' },
      { phase: 'Architecture', task: 'Design implementation approach', status: 'pending', type: 'planning' },
      { phase: 'Architecture', task: 'Identify files to create/modify', status: 'pending', type: 'planning' },
      { phase: 'Implementation', task: 'Implement core functionality', status: 'pending', type: 'code' },
      { phase: 'Implementation', task: 'Add error handling', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Write unit tests', status: 'pending', type: 'test' },
      { phase: 'Testing', task: 'Run test suite', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Code review and validation', status: 'pending', type: 'validation', requires_validation: true },
      { phase: 'Documentation', task: 'Update documentation', status: 'pending', type: 'documentation' }
    ]
  },
  bugfix: {
    template: 'bugfix',
    goals: ['Identify and fix the bug', 'Add regression test'],
    success_criteria: ['Bug is fixed', 'Regression test added', 'No new bugs introduced'],
    steps: [
      { phase: 'Investigation', task: 'Reproduce the bug', status: 'pending', type: 'research' },
      { phase: 'Investigation', task: 'Identify root cause', status: 'pending', type: 'research' },
      { phase: 'Fix', task: 'Implement the fix', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Write regression test', status: 'pending', type: 'test' },
      { phase: 'Testing', task: 'Run test suite', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Verify fix and test coverage', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  refactor: {
    template: 'refactor',
    goals: ['Improve code quality without changing behavior', 'Maintain test coverage'],
    success_criteria: ['Code is cleaner/more maintainable', 'All tests still pass', 'No behavioral changes'],
    steps: [
      { phase: 'Analysis', task: 'Identify code smells and improvement areas', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Document current behavior', status: 'pending', type: 'research' },
      { phase: 'Planning', task: 'Plan refactoring steps', status: 'pending', type: 'planning' },
      { phase: 'Implementation', task: 'Apply refactoring changes', status: 'pending', type: 'code' },
      { phase: 'Testing', task: 'Verify tests still pass', status: 'pending', type: 'test', requires_validation: true },
      { phase: 'Review', task: 'Review changes for quality', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  documentation: {
    template: 'documentation',
    goals: ['Create or update documentation', 'Ensure accuracy and clarity'],
    success_criteria: ['Documentation is complete', 'Examples are working', 'Easy to understand'],
    steps: [
      { phase: 'Research', task: 'Gather information from code and existing docs', status: 'pending', type: 'research' },
      { phase: 'Planning', task: 'Outline documentation structure', status: 'pending', type: 'planning' },
      { phase: 'Writing', task: 'Write documentation content', status: 'pending', type: 'documentation' },
      { phase: 'Writing', task: 'Add code examples', status: 'pending', type: 'documentation' },
      { phase: 'Review', task: 'Review for accuracy and clarity', status: 'pending', type: 'validation', requires_validation: true }
    ]
  },
  analysis: {
    template: 'analysis',
    goals: ['Analyze and understand the system/problem', 'Provide recommendations'],
    success_criteria: ['Analysis is comprehensive', 'Findings are documented', 'Recommendations are actionable'],
    steps: [
      { phase: 'Discovery', task: 'Gather context and requirements', status: 'pending', type: 'research' },
      { phase: 'Discovery', task: 'Explore codebase and documentation', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Analyze patterns and architecture', status: 'pending', type: 'research' },
      { phase: 'Analysis', task: 'Identify issues and opportunities', status: 'pending', type: 'research' },
      { phase: 'Reporting', task: 'Document findings', status: 'pending', type: 'documentation' },
      { phase: 'Reporting', task: 'Provide recommendations', status: 'pending', type: 'documentation' }
    ]
  },
  investigation: {
    template: 'investigation',
    goals: ['Resolve the identified problem', 'Produce a validated explanation or fix path'],
    success_criteria: ['Root cause is identified', 'Evidence supports conclusions', 'Resolution path is clear'],
    steps: [
      { phase: 'Intake', task: 'Capture symptoms, scope, and constraints', status: 'pending', type: 'analysis' },
      { phase: 'Recon', task: 'Survey relevant code, data, and logs', status: 'pending', type: 'analysis' },
      { phase: 'Structure Discovery', task: 'Map structure and dependencies', status: 'pending', type: 'analysis' },
      { phase: 'Content Decoding', task: 'Decode formats or runtime behavior', status: 'pending', type: 'analysis' },
      { phase: 'Hypothesis', task: 'Form and prioritize hypotheses', status: 'pending', type: 'analysis' },
      { phase: 'Experiment', task: 'Validate hypotheses with targeted experiments', status: 'pending', type: 'analysis' },
      { phase: 'Validation', task: 'Confirm findings against evidence', status: 'pending', type: 'analysis' },
      { phase: 'Resolution', task: 'Define the resolution plan and risks', status: 'pending', type: 'analysis' },
      { phase: 'Handoff', task: 'Handoff findings and next steps', status: 'pending', type: 'analysis' }
    ]
  }
};

/**
 * Create a plan from a predefined template
 */
export async function createPlanFromTemplate(
  params: { 
    workspace_id: string; 
    template: PlanTemplate;
    title: string;
    description: string;
    priority?: 'low' | 'medium' | 'high' | 'critical';
  }
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, template, title, description, priority } = params;
    
    if (!workspace_id || !template || !title || !description) {
      return {
        success: false,
        error: 'workspace_id, template, title, and description are required'
      };
    }
    
    const templateData = PLAN_TEMPLATES[template];
    if (!templateData) {
      return {
        success: false,
        error: `Unknown template: ${template}. Valid templates: ${Object.keys(PLAN_TEMPLATES).join(', ')}`
      };
    }
    
    // Verify workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    // Map template to category
    const categoryMap: Record<PlanTemplate, RequestCategory> = {
      feature: 'feature',
      bugfix: 'bug',
      refactor: 'refactor',
      documentation: 'documentation',
      analysis: 'analysis',
      investigation: 'investigation'
    };
    
    const plan = await store.createPlan(
      workspace_id, 
      title, 
      description, 
      categoryMap[template], 
      priority || 'medium',
      undefined,
      templateData.goals,
      templateData.success_criteria
    );
    
    // Add template steps with proper indexing
    const indexedSteps: PlanStep[] = templateData.steps.map((step, index) => ({
      ...step,
      index,
      status: step.status || 'pending'
    }));
    
    plan.steps = indexedSteps;
    plan.current_phase = indexedSteps[0]?.phase || '';
    
    await store.savePlanState(plan);
    await store.generatePlanMd(plan);
    
    // Emit event for dashboard
    await events.planCreated(workspace_id, plan.id, title, categoryMap[template]);
    
    return {
      success: true,
      data: plan
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create plan from template: ${(error as Error).message}`
    };
  }
}

/**
 * Get available plan templates
 */
export function getTemplates(): PlanTemplateSteps[] {
  return Object.values(PLAN_TEMPLATES);
}

/**
 * Get the current state of a plan
 */
export async function getPlanState(
  params: GetPlanStateParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get plan state: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Order Validation Helper
// =============================================================================

/**
 * Validate step completion order
 * Returns warning if prior steps are not completed yet
 * This is a non-blocking warning, not an error
 */
function validateStepOrder(steps: PlanStep[], completedIndex: number): OrderValidationWarning | null {
  // Find all prior steps (lower index) that are not done
  const priorPending = steps
    .filter(s => s.index < completedIndex && s.status !== 'done')
    .map(s => s.index);
  
  if (priorPending.length === 0) {
    return null;  // No warnings
  }
  
  return {
    step_completed: completedIndex,
    prior_pending: priorPending,
    message: `Step ${completedIndex} completed before prior steps: ${priorPending.join(', ')}. This may indicate out-of-order execution.`
  };
}

/**
 * Update the status of a specific step
 * Returns role_boundaries to remind agent of their constraints
 */
export async function updateStep(
  params: UpdateStepParams
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index, status, notes } = params;
    
    if (!workspace_id || !plan_id || step_index === undefined || !status) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_index, and status are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Find the step
    const step = state.steps.find(s => s.index === step_index);
    if (!step) {
      return {
        success: false,
        error: `Step not found: ${step_index}`
      };
    }
    
    // Update step
    step.status = status;
    if (notes) {
      step.notes = notes;
    }
    if (status === 'done') {
      step.completed_at = store.nowISO();
    }
    
    // Validate step order when marking a step as 'done'
    let orderWarning: OrderValidationWarning | null = null;
    if (status === 'done') {
      orderWarning = validateStepOrder(state.steps, step_index);
      
      // Type-aware validation: warn if user_validation/confirmation step auto-completed
      const stepType = step.type ?? 'standard';
      const behavior = STEP_TYPE_BEHAVIORS[stepType];
      if (!behavior.auto_completable) {
        // Add additional warning for non-auto-completable steps
        const typeWarning = `⚠️ Step ${step_index} is type '${stepType}' which requires explicit user confirmation. Ensure this was intentionally marked done.`;
        if (orderWarning) {
          orderWarning.message += `\n${typeWarning}`;
        } else {
          orderWarning = {
            step_completed: step_index,
            prior_pending: [],
            message: typeWarning
          };
        }
      }
    }
    
    // Update phase if needed
    const phases = [...new Set(state.steps.map(s => s.phase))];
    const currentPhaseSteps = state.steps.filter(s => s.phase === step.phase);
    const allDone = currentPhaseSteps.every(s => s.status === 'done');
    
    if (allDone) {
      const currentPhaseIndex = phases.indexOf(step.phase);
      if (currentPhaseIndex < phases.length - 1) {
        state.current_phase = phases[currentPhaseIndex + 1];
      } else {
        state.current_phase = 'complete';
      }
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit step updated event for WebSocket listeners
    await events.stepUpdated(workspace_id, plan_id, step_index, status);
    
    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
    
    const result: PlanOperationResult = {
      plan_state: state,
      role_boundaries: boundaries,
      next_action: {
        should_handoff: shouldHandoff && pendingSteps === 0,
        handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
        message: pendingSteps > 0 
          ? `${pendingSteps} steps remaining. Continue with your work.`
          : shouldHandoff
            ? `⚠️ All your steps are complete. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} before calling complete_agent.`
            : 'All steps complete. You may archive the plan.'
      }
    };
    
    // Include order warning if present
    if (orderWarning) {
      result.order_warning = orderWarning;
    }
    
    return {
      success: true,
      data: result
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update step: ${(error as Error).message}`
    };
  }
}

/**
 * Batch update multiple steps at once
 * Useful for marking multiple steps done/pending in a single call
 */
export async function batchUpdateSteps(
  params: BatchUpdateStepsParams
): Promise<ToolResponse<PlanOperationResult & { updated_count: number }>> {
  try {
    const { workspace_id, plan_id, updates } = params;
    
    if (!workspace_id || !plan_id || !updates || !Array.isArray(updates)) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and updates array are required'
      };
    }
    
    if (updates.length === 0) {
      return {
        success: false,
        error: 'updates array cannot be empty'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    let updatedCount = 0;
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Apply each update
    for (const update of updates) {
      const step = state.steps.find(s => s.index === update.step_index);
      if (!step) {
        errors.push(`Step ${update.step_index} not found`);
        continue;
      }
      
      step.status = update.status;
      if (update.notes) {
        step.notes = update.notes;
      }
      if (update.status === 'done') {
        step.completed_at = store.nowISO();
        
        // Collect order validation warnings for each completed step
        const orderWarning = validateStepOrder(state.steps, update.step_index);
        if (orderWarning) {
          warnings.push(orderWarning.message);
        }
        
        // Type-aware validation
        const stepType = step.type ?? 'standard';
        const behavior = STEP_TYPE_BEHAVIORS[stepType];
        if (!behavior.auto_completable) {
          warnings.push(`⚠️ Step ${update.step_index} is type '${stepType}' which requires explicit user confirmation.`);
        }
      }
      updatedCount++;
    }
    
    // Update phase if needed
    const phases = [...new Set(state.steps.map(s => s.phase))];
    for (const phase of phases) {
      const phaseSteps = state.steps.filter(s => s.phase === phase);
      const allDone = phaseSteps.every(s => s.status === 'done');
      if (allDone) {
        const currentPhaseIndex = phases.indexOf(state.current_phase);
        const thisPhaseIndex = phases.indexOf(phase);
        if (thisPhaseIndex >= currentPhaseIndex) {
          if (thisPhaseIndex < phases.length - 1) {
            state.current_phase = phases[thisPhaseIndex + 1];
          } else {
            state.current_phase = 'complete';
          }
        }
      }
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit step updated events for all successfully updated steps
    for (const update of updates) {
      const step = state.steps.find(s => s.index === update.step_index);
      if (step) {
        await events.stepUpdated(workspace_id, plan_id, update.step_index, update.status);
      }
    }
    
    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
    const doneSteps = state.steps.filter(s => s.status === 'done').length;
    
    // Build message including errors and warnings
    let message = '';
    if (errors.length > 0) {
      message = `Updated ${updatedCount} steps with ${errors.length} errors: ${errors.join(', ')}`;
    } else if (pendingSteps > 0) {
      message = `Updated ${updatedCount} steps. ${pendingSteps} pending, ${doneSteps} done.`;
    } else if (shouldHandoff) {
      message = `⚠️ All steps complete. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} before calling complete_agent.`;
    } else {
      message = 'All steps complete. You may archive the plan.';
    }
    
    // Append warnings if present
    if (warnings.length > 0) {
      message += `\n⚠️ Warnings: ${warnings.join('; ')}`;
    }
    
    return {
      success: true,
      data: {
        updated_count: updatedCount,
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: shouldHandoff && pendingSteps === 0,
          handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
          message
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to batch update steps: ${(error as Error).message}`
    };
  }
}

/**
 * Modify the plan's steps (used by Revisionist/Architect)
 * Returns role_boundaries to remind agent of their constraints
 */
export async function modifyPlan(
  params: ModifyPlanParams
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_steps } = params;
    
    if (!workspace_id || !plan_id || !new_steps) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and new_steps are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Get current agent's boundaries
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // SAFEGUARD: Prevent accidental mass deletion of steps
    const existingStepCount = state.steps.length;
    const newStepCount = new_steps.length;
    const completedSteps = state.steps.filter(s => s.status === 'done').length;
    
    // If plan has significant work done and new steps would lose >50% of them, require confirmation
    if (existingStepCount > 20 && newStepCount < existingStepCount * 0.5) {
      return {
        success: false,
        error: `SAFEGUARD: Refusing to replace ${existingStepCount} steps (${completedSteps} done) with only ${newStepCount} steps. ` +
          `This would lose ${existingStepCount - newStepCount} steps. ` +
          `If you intend to ADD steps to a specific phase, use batch_update_steps instead. ` +
          `If you truly need to replace all steps, first call archive_plan to preserve current state.`
      };
    }
    
    // If there are completed steps that would be lost, warn strongly
    if (completedSteps > 0 && newStepCount < existingStepCount) {
      const wouldLose = existingStepCount - newStepCount;
      console.warn(`[modify_plan] WARNING: Replacing ${existingStepCount} steps with ${newStepCount}. ${completedSteps} completed steps exist.`);
    }
    
    // Add index to each step
    const indexedSteps: PlanStep[] = new_steps.map((step, index) => ({
      ...step,
      index,
      status: step.status || 'pending'
    }));
    
    state.steps = indexedSteps;
    
    // Set current phase to first phase if available
    if (indexedSteps.length > 0) {
      state.current_phase = indexedSteps[0].phase;
    }
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Determine next action - after modifying plan, usually need to handoff to implementer
    const shouldHandoff = !boundaries.can_implement;
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: shouldHandoff,
          handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
          message: shouldHandoff
            ? `⚠️ Plan created/modified. You are ${currentAgent} and CANNOT implement code. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} now.`
            : `Plan modified. ${indexedSteps.length} steps defined. You may proceed with implementation.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to modify plan: ${(error as Error).message}`
    };
  }
}

/**
 * Insert a step at a specific index with re-indexing
 * All steps at or after the insertion point have their indices shifted up by 1
 */
export async function insertStep(
  params: { workspace_id: string; plan_id: string; at_index: number; step: Omit<PlanStep, 'index'> }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, at_index, step } = params;
    
    if (!workspace_id || !plan_id || at_index === undefined || !step) {
      return {
        success: false,
        error: 'workspace_id, plan_id, at_index, and step are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Validate at_index
    if (at_index < 0 || at_index > state.steps.length) {
      return {
        success: false,
        error: `Invalid at_index: ${at_index}. Must be between 0 and ${state.steps.length}`
      };
    }
    
    // Shift indices >= at_index up by 1
    const updatedSteps = state.steps.map(s => {
      if (s.index >= at_index) {
        return { ...s, index: s.index + 1 };
      }
      return s;
    });
    
    // Insert new step with the target index
    const newStep: PlanStep = {
      ...step,
      index: at_index,
      status: step.status || 'pending'
    };
    
    // Combine and sort by index
    state.steps = [...updatedSteps, newStep].sort((a, b) => a.index - b.index);
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for step insertion
    await events.planUpdated(workspace_id, plan_id, { 
      step_inserted: at_index, 
      total_steps: state.steps.length 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Inserted step at index ${at_index}. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to insert step: ${(error as Error).message}`
    };
  }
}

/**
 * Delete a step at a specific index with re-indexing
 * All steps after the deletion point have their indices shifted down by 1
 */
export async function deleteStep(
  params: { workspace_id: string; plan_id: string; step_index: number }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index } = params;
    
    if (!workspace_id || !plan_id || step_index === undefined) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and step_index are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Validate step_index exists
    const stepToDelete = state.steps.find(s => s.index === step_index);
    if (!stepToDelete) {
      return {
        success: false,
        error: `Step with index ${step_index} not found`
      };
    }
    
    // Remove the step
    const remainingSteps = state.steps.filter(s => s.index !== step_index);
    
    // Shift indices > step_index down by 1
    state.steps = remainingSteps.map(s => {
      if (s.index > step_index) {
        return { ...s, index: s.index - 1 };
      }
      return s;
    }).sort((a, b) => a.index - b.index);
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for step deletion
    await events.planUpdated(workspace_id, plan_id, { 
      step_deleted: step_index, 
      total_steps: state.steps.length 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Deleted step at index ${step_index}. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete step: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Step Reordering
// =============================================================================

/**
 * Reorder a step by swapping it with an adjacent step (up or down)
 * 'up' swaps with the step at index-1, 'down' swaps with step at index+1
 */
export async function reorderStep(
  params: { workspace_id: string; plan_id: string; step_index: number; direction: 'up' | 'down' }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_index, direction } = params;
    
    if (!workspace_id || !plan_id || step_index === undefined || !direction) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_index, and direction are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Find the step to move
    const stepToMove = state.steps.find(s => s.index === step_index);
    if (!stepToMove) {
      return {
        success: false,
        error: `Step with index ${step_index} not found`
      };
    }
    
    // Calculate target index
    const targetIndex = direction === 'up' ? step_index - 1 : step_index + 1;
    
    // Validate boundaries
    if (targetIndex < 0) {
      return {
        success: false,
        error: `Cannot move step up: step ${step_index} is already at the top`
      };
    }
    if (targetIndex >= state.steps.length) {
      return {
        success: false,
        error: `Cannot move step down: step ${step_index} is already at the bottom`
      };
    }
    
    // Find the adjacent step to swap with
    const adjacentStep = state.steps.find(s => s.index === targetIndex);
    if (!adjacentStep) {
      return {
        success: false,
        error: `Adjacent step at index ${targetIndex} not found`
      };
    }
    
    // Swap indices
    stepToMove.index = targetIndex;
    adjacentStep.index = step_index;
    
    // Sort by index
    state.steps.sort((a, b) => a.index - b.index);
    state.updated_at = store.nowISO();
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for step reorder
    await events.planUpdated(workspace_id, plan_id, { 
      step_reordered: { from: step_index, to: targetIndex, direction } 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Moved step ${direction} from index ${step_index} to index ${targetIndex}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to reorder step: ${(error as Error).message}`
    };
  }
}

/**
 * Move a step from one index to another, re-indexing all affected steps
 */
export async function moveStep(
  params: { workspace_id: string; plan_id: string; from_index: number; to_index: number }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, from_index, to_index } = params;
    
    if (!workspace_id || !plan_id || from_index === undefined || to_index === undefined) {
      return {
        success: false,
        error: 'workspace_id, plan_id, from_index, and to_index are required'
      };
    }
    
    if (from_index === to_index) {
      return {
        success: false,
        error: 'from_index and to_index cannot be the same'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Validate indices
    if (from_index < 0 || from_index >= state.steps.length) {
      return {
        success: false,
        error: `Invalid from_index: ${from_index}. Must be between 0 and ${state.steps.length - 1}`
      };
    }
    if (to_index < 0 || to_index >= state.steps.length) {
      return {
        success: false,
        error: `Invalid to_index: ${to_index}. Must be between 0 and ${state.steps.length - 1}`
      };
    }
    
    // Find and remove the step to move
    const stepToMove = state.steps.find(s => s.index === from_index);
    if (!stepToMove) {
      return {
        success: false,
        error: `Step with index ${from_index} not found`
      };
    }
    
    // Remove the step from its current position
    const stepsWithoutMoved = state.steps.filter(s => s.index !== from_index);
    
    // Adjust indices based on movement direction
    if (from_index < to_index) {
      // Moving down: shift steps between from and to up by 1
      stepsWithoutMoved.forEach(s => {
        if (s.index > from_index && s.index <= to_index) {
          s.index--;
        }
      });
    } else {
      // Moving up: shift steps between to and from down by 1
      stepsWithoutMoved.forEach(s => {
        if (s.index >= to_index && s.index < from_index) {
          s.index++;
        }
      });
    }
    
    // Set the moved step's new index
    stepToMove.index = to_index;
    
    // Rebuild the steps array
    state.steps = [...stepsWithoutMoved, stepToMove].sort((a, b) => a.index - b.index);
    state.updated_at = store.nowISO();
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for step move
    await events.planUpdated(workspace_id, plan_id, { 
      step_moved: { from: from_index, to: to_index } 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Moved step from index ${from_index} to index ${to_index}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to move step: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Bulk Step Reordering
// =============================================================================

/**
 * Sort all steps by phase name
 * Optionally accepts a custom phase_order array for custom sorting
 */
export async function sortStepsByPhase(
  params: { 
    workspace_id: string; 
    plan_id: string; 
    phase_order?: string[];  // Custom phase order, e.g. ["Research", "Design", "Implement", "Test"]
  }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, phase_order } = params;
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    if (!state.steps || state.steps.length === 0) {
      return {
        success: false,
        error: 'Plan has no steps to sort'
      };
    }
    
    // Create a sorting function
    const getPhaseIndex = (phase: string): number => {
      if (phase_order && phase_order.length > 0) {
        const idx = phase_order.findIndex(p => 
          p.toLowerCase() === phase.toLowerCase()
        );
        return idx >= 0 ? idx : phase_order.length; // Unknown phases go to end
      }
      return 0; // If no custom order, all phases have same priority (alphabetic)
    };
    
    // Sort steps: first by phase order (or alphabetically), then by original index within phase
    const sortedSteps = [...state.steps].sort((a, b) => {
      const phaseCompare = phase_order && phase_order.length > 0
        ? getPhaseIndex(a.phase) - getPhaseIndex(b.phase)
        : a.phase.localeCompare(b.phase);
      
      if (phaseCompare !== 0) return phaseCompare;
      // Within same phase, preserve original order
      return a.index - b.index;
    });
    
    // Re-index the sorted steps
    sortedSteps.forEach((step, idx) => {
      step.index = idx;
    });
    
    state.steps = sortedSteps;
    state.updated_at = store.nowISO();
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for sort
    await events.planUpdated(workspace_id, plan_id, { 
      steps_sorted: { by: 'phase', custom_order: !!phase_order } 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Sorted ${state.steps.length} steps by phase${phase_order ? ' using custom order' : ' alphabetically'}`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to sort steps: ${(error as Error).message}`
    };
  }
}

/**
 * Set a completely new order for all steps
 * Accepts an array of current indices in the desired new order
 * e.g., [2, 0, 1, 3] means: current step 2 becomes first, current step 0 becomes second, etc.
 */
export async function setStepOrder(
  params: { 
    workspace_id: string; 
    plan_id: string; 
    new_order: number[];  // Array of current indices in desired order
  }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_order } = params;
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    if (!state.steps || state.steps.length === 0) {
      return {
        success: false,
        error: 'Plan has no steps to reorder'
      };
    }
    
    // Validate new_order array
    if (!new_order || new_order.length !== state.steps.length) {
      return {
        success: false,
        error: `new_order must contain exactly ${state.steps.length} indices (current step count)`
      };
    }
    
    // Check for duplicates
    const uniqueIndices = new Set(new_order);
    if (uniqueIndices.size !== new_order.length) {
      return {
        success: false,
        error: 'new_order contains duplicate indices'
      };
    }
    
    // Check all indices are valid
    for (const idx of new_order) {
      if (idx < 0 || idx >= state.steps.length) {
        return {
          success: false,
          error: `Invalid index ${idx} in new_order. Valid range: 0 to ${state.steps.length - 1}`
        };
      }
    }
    
    // Create a map from old index to step
    const stepMap = new Map(state.steps.map((s: PlanStep) => [s.index, s]));
    
    // Build the new steps array
    const reorderedSteps = new_order.map((oldIndex, newIndex) => {
      const step = stepMap.get(oldIndex);
      if (!step) {
        throw new Error(`Step with index ${oldIndex} not found`);
      }
      return { ...step, index: newIndex };
    });
    
    state.steps = reorderedSteps;
    state.updated_at = store.nowISO();
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit plan updated event for step order change
    await events.planUpdated(workspace_id, plan_id, { 
      steps_reordered: { new_order: new_order } 
    });
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Reordered ${state.steps.length} steps according to new order`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set step order: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Plan Deletion
// =============================================================================

/**
 * Delete an entire plan with safety confirmation
 * Requires confirm=true to prevent accidental deletion
 */
export async function deletePlan(
  params: { workspace_id: string; plan_id: string; confirm?: boolean }
): Promise<ToolResponse<{ deleted: boolean; plan_id: string }>> {
  try {
    const { workspace_id, plan_id, confirm } = params;
    
    // Safety check: require explicit confirmation
    if (confirm !== true) {
      return {
        success: false,
        error: 'Plan deletion requires confirm=true for safety. This action cannot be undone.'
      };
    }
    
    // Get workspace and verify plan exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    if (!workspace.active_plans.includes(plan_id)) {
      return {
        success: false,
        error: `Plan ${plan_id} not found in workspace ${workspace_id}`
      };
    }
    
    // Remove from workspace active_plans
    workspace.active_plans = workspace.active_plans.filter(p => p !== plan_id);
    await store.saveWorkspace(workspace);
    
    // Delete plan directory
    const planPath = store.getPlanPath(workspace_id, plan_id);
    await fs.rm(planPath, { recursive: true, force: true });
    
    // Emit event - using planUpdated since there's no planDeleted event type
    await events.planUpdated(workspace_id, plan_id, { deleted: true });
    
    return {
      success: true,
      data: {
        deleted: true,
        plan_id
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to delete plan: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Step Consolidation
// =============================================================================

/**
 * Consolidate multiple steps into a single step
 * Merges notes and re-indexes remaining steps
 */
export async function consolidateSteps(
  params: { workspace_id: string; plan_id: string; step_indices: number[]; consolidated_task: string }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, step_indices, consolidated_task } = params;
    
    if (!workspace_id || !plan_id || !step_indices || !consolidated_task) {
      return {
        success: false,
        error: 'workspace_id, plan_id, step_indices, and consolidated_task are required'
      };
    }
    
    if (step_indices.length < 2) {
      return {
        success: false,
        error: 'At least 2 steps are required for consolidation'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Validate all indices exist
    const sortedIndices = [...step_indices].sort((a, b) => a - b);
    const stepsToMerge = sortedIndices.map(idx => {
      const step = state.steps.find(s => s.index === idx);
      if (!step) {
        throw new Error(`Step ${idx} not found`);
      }
      return step;
    });
    
    // Validate indices are consecutive
    for (let i = 1; i < sortedIndices.length; i++) {
      if (sortedIndices[i] !== sortedIndices[i - 1] + 1) {
        return {
          success: false,
          error: `Step indices must be consecutive. Found gap between ${sortedIndices[i - 1]} and ${sortedIndices[i]}`
        };
      }
    }
    
    // Get first step's phase and metadata
    const firstStep = stepsToMerge[0];
    const phase = firstStep.phase;
    
    // Merge all notes
    const mergedNotes = stepsToMerge
      .map(s => s.notes)
      .filter(n => n && n.trim().length > 0)
      .join('; ');
    
    // Create consolidated step
    const consolidatedStep: PlanStep = {
      index: sortedIndices[0],
      phase,
      task: consolidated_task,
      status: 'pending',
      notes: mergedNotes || undefined,
      type: firstStep.type,
      requires_validation: firstStep.requires_validation,
      assignee: firstStep.assignee
    };
    
    // Remove merged steps and add consolidated step
    const remainingSteps = state.steps.filter(s => !sortedIndices.includes(s.index));
    const newSteps = [consolidatedStep, ...remainingSteps];
    
    // Re-index all steps
    newSteps.sort((a, b) => a.index - b.index);
    const reindexedSteps = newSteps.map((s, newIndex) => ({
      ...s,
      index: newIndex
    }));
    
    state.steps = reindexedSteps;
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: false,
          message: `Consolidated ${sortedIndices.length} steps into 1. Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to consolidate steps: ${(error as Error).message}`
    };
  }
}

/**
 * Append steps to an existing plan (safer than modify_plan for adding phases)
 * Preserves all existing steps and adds new ones at the end
 */
export async function appendSteps(
  params: { workspace_id: string; plan_id: string; new_steps: Omit<PlanStep, 'index'>[] }
): Promise<ToolResponse<PlanOperationResult>> {
  try {
    const { workspace_id, plan_id, new_steps } = params;
    
    if (!workspace_id || !plan_id || !new_steps || new_steps.length === 0) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and new_steps are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    const currentAgent = state.current_agent || 'Coordinator';
    const boundaries = AGENT_BOUNDARIES[currentAgent];
    
    // Get the next index
    const startIndex = state.steps.length;
    
    // Add new steps with proper indexing
    const indexedNewSteps: PlanStep[] = new_steps.map((step, i) => ({
      ...step,
      index: startIndex + i,
      status: step.status || 'pending'
    }));
    
    // Append to existing steps
    state.steps = [...state.steps, ...indexedNewSteps];
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    return {
      success: true,
      data: {
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: !boundaries.can_implement,
          message: `Appended ${indexedNewSteps.length} steps (indices ${startIndex}-${startIndex + indexedNewSteps.length - 1}). Plan now has ${state.steps.length} total steps.`
        }
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to append steps: ${(error as Error).message}`
    };
  }
}

/**
 * Archive a completed plan
 */
export async function archivePlan(
  params: ArchivePlanParams
): Promise<ToolResponse<PlanState>> {
  try {
    const { workspace_id, plan_id } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Update plan status
    state.status = 'archived';
    state.current_agent = null;
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Update workspace metadata
    const workspace = await store.getWorkspace(workspace_id);
    if (workspace) {
      workspace.active_plans = workspace.active_plans.filter(id => id !== plan_id);
      if (!workspace.archived_plans.includes(plan_id)) {
        workspace.archived_plans.push(plan_id);
      }
      await store.saveWorkspace(workspace);
    }
    
    return {
      success: true,
      data: state
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to archive plan: ${(error as Error).message}`
    };
  }
}

/**
 * Add a note to the plan that will be included in the next agent/tool response
 * Notes are auto-cleared after delivery with an audit log entry
 */
export async function addPlanNote(
  params: { workspace_id: string; plan_id: string; note: string; type?: 'info' | 'warning' | 'instruction' }
): Promise<ToolResponse<{ plan_id: string; notes_count: number }>> {
  try {
    const { workspace_id, plan_id, note, type = 'info' } = params;
    
    if (!workspace_id || !plan_id || !note) {
      return {
        success: false,
        error: 'workspace_id, plan_id, and note are required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Initialize pending_notes if it doesn't exist
    if (!state.pending_notes) {
      state.pending_notes = [];
    }
    
    // Add the note
    state.pending_notes.push({
      note,
      type,
      added_at: store.nowISO(),
      added_by: 'user'
    });
    
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit event for audit log
    await events.noteAdded(workspace_id, plan_id, note, type);
    
    return {
      success: true,
      data: {
        plan_id,
        notes_count: state.pending_notes.length
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to add note: ${(error as Error).message}`
    };
  }
}

// =============================================================================
// Goals and Success Criteria
// =============================================================================

export interface SetGoalsParams {
  workspace_id: string;
  plan_id: string;
  goals?: string[];
  success_criteria?: string[];
}

export interface SetGoalsResult {
  plan_id: string;
  goals: string[];
  success_criteria: string[];
  message: string;
}

/**
 * Set or update goals and success criteria for a plan
 * At least one of goals or success_criteria must be provided
 */
export async function setGoals(
  params: SetGoalsParams
): Promise<ToolResponse<SetGoalsResult>> {
  try {
    const { workspace_id, plan_id, goals, success_criteria } = params;
    
    if (!workspace_id || !plan_id) {
      return {
        success: false,
        error: 'workspace_id and plan_id are required'
      };
    }
    
    if (!goals && !success_criteria) {
      return {
        success: false,
        error: 'At least one of goals or success_criteria is required'
      };
    }
    
    const state = await store.getPlanState(workspace_id, plan_id);
    if (!state) {
      return {
        success: false,
        error: `Plan not found: ${plan_id}`
      };
    }
    
    // Update goals if provided
    if (goals !== undefined) {
      state.goals = goals;
    }
    
    // Update success criteria if provided
    if (success_criteria !== undefined) {
      state.success_criteria = success_criteria;
    }
    
    state.updated_at = store.nowISO();
    await store.savePlanState(state);
    await store.generatePlanMd(state);
    
    // Emit event for dashboard
    await events.planUpdated(workspace_id, plan_id, { goals_updated: !!goals, success_criteria_updated: !!success_criteria });
    
    return {
      success: true,
      data: {
        plan_id,
        goals: state.goals || [],
        success_criteria: state.success_criteria || [],
        message: `Updated: ${goals ? 'goals' : ''}${goals && success_criteria ? ' and ' : ''}${success_criteria ? 'success_criteria' : ''}`
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to set goals: ${(error as Error).message}`
    };
  }
}

/**
 * Import an existing plan file from the workspace into the MCP server's data directory.
 * The original plan file is moved to an /archive folder in the workspace.
 */
export async function importPlan(
  params: ImportPlanParams
): Promise<ToolResponse<ImportPlanResult>> {
  try {
    const { workspace_id, plan_file_path, title, category, priority, categorization } = params;
    
    if (!workspace_id || !plan_file_path || !category) {
      return {
        success: false,
        error: 'workspace_id, plan_file_path, and category are required'
      };
    }
    
    // Verify workspace exists
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    // Read the original plan file
    const planContent = await store.readText(plan_file_path);
    if (!planContent) {
      return {
        success: false,
        error: `Plan file not found or unreadable: ${plan_file_path}`
      };
    }
    
    // Extract title from the plan content if not provided
    // Look for first # heading or use filename
    let planTitle = title;
    if (!planTitle) {
      const titleMatch = planContent.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        planTitle = titleMatch[1].trim();
      } else {
        planTitle = path.basename(plan_file_path, path.extname(plan_file_path));
      }
    }
    
    // Create the plan in MCP server's data directory
    const plan = await store.createPlan(
      workspace_id,
      planTitle,
      `Imported from: ${plan_file_path}`,
      category,
      priority || 'medium',
      categorization
    );
    
    // Copy the original plan content to the plan directory as the plan.md
    // (overwriting the auto-generated one with the original content)
    const planMdPath = store.getPlanMdPath(workspace_id, plan.id);
    await store.writeText(planMdPath, planContent);
    
    // Parse the plan content to extract steps if present
    // Look for checkbox patterns like - [ ] or - [x]
    const steps: PlanStep[] = [];
    const checkboxRegex = /^-\s*\[([ xX])\]\s*(?:\*\*([^:*]+)\*\*:?\s*)?(.+)$/gm;
    let match;
    let index = 0;
    
    while ((match = checkboxRegex.exec(planContent)) !== null) {
      const isChecked = match[1].toLowerCase() === 'x';
      const phase = match[2]?.trim() || 'imported';
      const task = match[3].trim();
      
      steps.push({
        index: index++,
        phase,
        task,
        status: isChecked ? 'done' : 'pending',
        completed_at: isChecked ? store.nowISO() : undefined
      });
    }
    
    // If we found steps, update the plan state
    if (steps.length > 0) {
      plan.steps = steps;
      plan.current_phase = steps.find(s => s.status !== 'done')?.phase || 'complete';
      await store.savePlanState(plan);
    }
    
    // Create the archive folder in the workspace if it doesn't exist
    const workspacePath = workspace.path;
    const archiveDir = path.join(workspacePath, 'archive');
    await store.ensureDir(archiveDir);
    
    // Generate archived filename with timestamp to avoid collisions
    const originalFilename = path.basename(plan_file_path);
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const archivedFilename = `${path.basename(originalFilename, path.extname(originalFilename))}_${timestamp}${path.extname(originalFilename)}`;
    const archivedPath = path.join(archiveDir, archivedFilename);
    
    // Move the original file to archive (copy then delete)
    await fs.copyFile(plan_file_path, archivedPath);
    await fs.unlink(plan_file_path);
    
    return {
      success: true,
      data: {
        plan_state: plan,
        original_path: plan_file_path,
        archived_path: archivedPath,
        imported_content: planContent
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to import plan: ${(error as Error).message}`
    };
  }
}
