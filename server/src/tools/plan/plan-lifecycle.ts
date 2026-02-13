/**
 * Plan Lifecycle - CRUD operations for plans
 *
 * Functions: listPlans, findPlan, createPlan, getPlanState, deletePlan, archivePlan, importPlan
 */

import { promises as fs } from 'fs';
import path from 'path';
import type {
  CreatePlanParams,
  GetPlanStateParams,
  ArchivePlanParams,
  ImportPlanParams,
  ImportPlanResult,
  ToolResponse,
  PlanState,
  PlanStep,
  RequestCategory
} from '../../types/index.js';
import * as store from '../../storage/file-store.js';
import { archivePlanPrompts } from '../prompt-storage.js';
import { events } from '../../events/event-emitter.js';
import { appendWorkspaceFileUpdate } from '../../logging/workspace-update-log.js';

// =============================================================================
// Local Interfaces
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

// =============================================================================
// Plan Listing & Lookup
// =============================================================================

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
    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: planPath,
      summary: 'Deleted plan directory',
      action: 'delete_plan'
    });

    // Emit event
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

    // Archive plan-scoped prompts with header
    try {
      await archivePlanPrompts(workspace_id, plan_id, state.title);
    } catch {
      // Non-fatal: prompt archival failure shouldn't block plan archive
    }

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
    const planMdPath = store.getPlanMdPath(workspace_id, plan.id);
    await store.writeText(planMdPath, planContent);

    // Parse the plan content to extract steps if present
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

// =============================================================================
// Export Plan — copy plan artifacts to workspace for git commits
// =============================================================================

export interface ExportPlanResult {
  export_path: string;
  files_exported: string[];
  timestamp: string;
}

/**
 * Export a plan's state, context files, research notes, and prompts
 * to {workspace_path}/.projectmemory/exports/{plan_id}/ for git commits.
 */
export async function exportPlan(params: {
  workspace_id: string;
  plan_id: string;
  workspace_path?: string;
}): Promise<ToolResponse<ExportPlanResult>> {
  try {
    const { workspace_id, plan_id } = params;

    if (!workspace_id || !plan_id) {
      return { success: false, error: 'workspace_id and plan_id are required' };
    }

    // 1. Resolve workspace path from meta if not provided
    let targetWorkspacePath = params.workspace_path;
    if (!targetWorkspacePath) {
      const meta = await store.getWorkspace(workspace_id);
      targetWorkspacePath = meta?.workspace_path || meta?.path;
      if (!targetWorkspacePath) {
        return { success: false, error: 'Could not resolve workspace_path. Provide it explicitly or ensure workspace is registered.' };
      }
    }

    // 2. Load plan state
    const planState = await store.getPlanState(workspace_id, plan_id);
    if (!planState) {
      return { success: false, error: `Plan not found: ${plan_id}` };
    }

    const exportRoot = path.join(targetWorkspacePath, '.projectmemory', 'exports', plan_id);
    await store.ensureDir(exportRoot);

    const filesExported: string[] = [];

    // 3. Write plan.json
    const planJsonPath = path.join(exportRoot, 'plan.json');
    await fs.writeFile(planJsonPath, JSON.stringify(planState, null, 2), 'utf-8');
    filesExported.push('plan.json');

    // 4. Copy context files
    const planDir = store.getPlanPath(workspace_id, plan_id);
    const contextDir = path.join(exportRoot, 'context');
    await store.ensureDir(contextDir);
    try {
      const entries = await fs.readdir(planDir);
      for (const f of entries) {
        if (f.endsWith('.json') && f !== 'state.json') {
          const src = path.join(planDir, f);
          const dest = path.join(contextDir, f);
          await fs.copyFile(src, dest);
          filesExported.push(`context/${f}`);
        }
      }
    } catch { /* no extra context files */ }

    // 5. Copy research notes
    const researchSrc = store.getResearchNotesPath(workspace_id, plan_id);
    const researchDest = path.join(exportRoot, 'research_notes');
    try {
      const rFiles = await fs.readdir(researchSrc);
      if (rFiles.length > 0) {
        await store.ensureDir(researchDest);
        for (const rf of rFiles) {
          await fs.copyFile(path.join(researchSrc, rf), path.join(researchDest, rf));
          filesExported.push(`research_notes/${rf}`);
        }
      }
    } catch { /* no research notes */ }

    // 6. Copy prompts
    const promptsSrc = path.join(planDir, 'prompts');
    const promptsDest = path.join(exportRoot, 'prompts');
    try {
      const pFiles = await fs.readdir(promptsSrc);
      if (pFiles.length > 0) {
        await store.ensureDir(promptsDest);
        for (const pf of pFiles) {
          await fs.copyFile(path.join(promptsSrc, pf), path.join(promptsDest, pf));
          filesExported.push(`prompts/${pf}`);
        }
      }
    } catch { /* no prompts */ }

    // 7. Generate README.md
    const timestamp = store.nowISO();
    const readme = [
      `# Plan Export: ${planState.title || plan_id}`,
      '',
      `**Plan ID:** ${plan_id}`,
      `**Workspace ID:** ${workspace_id}`,
      `**Status:** ${planState.status || 'unknown'}`,
      `**Exported at:** ${timestamp}`,
      '',
      '## Contents',
      '',
      ...filesExported.map(f => `- ${f}`),
      '',
      '---',
      '_Generated by Project Memory MCP_',
      '',
    ].join('\n');
    const readmePath = path.join(exportRoot, 'README.md');
    await fs.writeFile(readmePath, readme, 'utf-8');
    filesExported.push('README.md');

    await appendWorkspaceFileUpdate({
      workspace_id,
      plan_id,
      file_path: exportRoot,
      summary: `Plan exported to workspace: ${filesExported.length} files`,
      action: 'export_plan',
    });

    return {
      success: true,
      data: {
        export_path: exportRoot,
        files_exported: filesExported,
        timestamp,
      },
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to export plan: ${(error as Error).message}`,
    };
  }
}
