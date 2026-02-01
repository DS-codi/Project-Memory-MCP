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
  AgentType
} from '../types/index.js';
import { AGENT_BOUNDARIES } from '../types/index.js';
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
    const { workspace_id, title, description, category, priority, categorization } = params;
    
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
    
    const plan = await store.createPlan(workspace_id, title, description, category, priority, categorization);
    
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
    
    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
    
    return {
      success: true,
      data: {
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
      }
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
    
    // Determine next action based on boundaries
    const shouldHandoff = !boundaries.can_finalize;
    const pendingSteps = state.steps.filter(s => s.status === 'pending').length;
    const doneSteps = state.steps.filter(s => s.status === 'done').length;
    
    return {
      success: true,
      data: {
        updated_count: updatedCount,
        plan_state: state,
        role_boundaries: boundaries,
        next_action: {
          should_handoff: shouldHandoff && pendingSteps === 0,
          handoff_to: boundaries.must_handoff_to.length > 0 ? boundaries.must_handoff_to : undefined,
          message: errors.length > 0
            ? `Updated ${updatedCount} steps with ${errors.length} errors: ${errors.join(', ')}`
            : pendingSteps > 0 
              ? `Updated ${updatedCount} steps. ${pendingSteps} pending, ${doneSteps} done.`
              : shouldHandoff
                ? `⚠️ All steps complete. You MUST handoff to ${boundaries.must_handoff_to.join(' or ')} before calling complete_agent.`
                : 'All steps complete. You may archive the plan.'
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
