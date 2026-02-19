/**
 * Program Lifecycle — CRUD operations for the v2 Programs system.
 *
 * Functions: createProgram, getProgram, updateProgram, archiveProgram, listPrograms
 *
 * Programs are stored in data/{workspace_id}/programs/{program_id}/ using
 * the dedicated program-store helpers (not as PlanState objects).
 */

import crypto from 'crypto';
import type {
  ProgramState,
  CreateProgramV2Params,
  UpdateProgramV2Params,
  ArchiveProgramV2Params,
  ProgramManifest,
} from '../../types/program-v2.types.js';
import type { ToolResponse } from '../../types/index.js';
import {
  createProgramDir,
  readProgramState,
  saveProgramState,
  saveManifest,
  saveDependencies,
  saveRisks,
  listPrograms as listProgramDirs,
} from '../../storage/program-store.js';
import { events } from '../../events/event-emitter.js';

// =============================================================================
// ID Generation
// =============================================================================

/**
 * Generate a unique program ID following the same pattern as generatePlanId.
 * Format: prog_{base36-timestamp}_{8-hex-random}
 */
export function generateProgramId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `prog_${timestamp}_${random}`;
}

/**
 * Get the current ISO timestamp.
 */
function nowISO(): string {
  return new Date().toISOString();
}

// =============================================================================
// createProgram
// =============================================================================

/**
 * Create a new program with dedicated storage.
 *
 * Initialises:
 * - program.json  (ProgramState metadata)
 * - manifest.json (empty child plan list)
 * - dependencies.json (empty array)
 * - risks.json (empty array)
 */
export async function createProgram(
  params: CreateProgramV2Params,
): Promise<ToolResponse<ProgramState>> {
  try {
    const { workspace_id, title, description, priority = 'medium', category = 'feature' } = params;

    if (!workspace_id || !title || !description) {
      return {
        success: false,
        error: 'workspace_id, title, and description are required',
      };
    }

    const programId = generateProgramId();
    const now = nowISO();

    const state: ProgramState = {
      id: programId,
      workspace_id,
      title,
      description,
      priority,
      category,
      status: 'active',
      created_at: now,
      updated_at: now,
    };

    // Create directory structure and write initial files
    await createProgramDir(workspace_id, programId);
    await saveProgramState(workspace_id, programId, state);

    // Initialise empty manifest
    const manifest: ProgramManifest = {
      program_id: programId,
      plan_ids: [],
      updated_at: now,
    };
    await saveManifest(workspace_id, programId, manifest);

    // Initialise empty dependencies and risks
    await saveDependencies(workspace_id, programId, []);
    await saveRisks(workspace_id, programId, []);

    // Emit event
    await events.programCreated(workspace_id, programId, title, category);

    return { success: true, data: state };
  } catch (error) {
    return {
      success: false,
      error: `Failed to create program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// getProgram
// =============================================================================

/**
 * Read and return the ProgramState for a given program.
 */
export async function getProgram(
  workspaceId: string,
  programId: string,
): Promise<ToolResponse<ProgramState>> {
  try {
    if (!workspaceId || !programId) {
      return { success: false, error: 'workspace_id and program_id are required' };
    }

    const state = await readProgramState(workspaceId, programId);
    if (!state) {
      return { success: false, error: `Program not found: ${programId}` };
    }

    return { success: true, data: state };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// updateProgram
// =============================================================================

/**
 * Update mutable fields on a ProgramState (title, description, priority, category).
 * Does not allow changing status — use archiveProgram for that.
 */
export async function updateProgram(
  params: UpdateProgramV2Params,
): Promise<ToolResponse<ProgramState>> {
  try {
    const { workspace_id, program_id, ...updates } = params;

    if (!workspace_id || !program_id) {
      return { success: false, error: 'workspace_id and program_id are required' };
    }

    const state = await readProgramState(workspace_id, program_id);
    if (!state) {
      return { success: false, error: `Program not found: ${program_id}` };
    }

    if (state.status === 'archived') {
      return { success: false, error: 'Cannot update an archived program' };
    }

    // Apply only the fields that were provided
    const changes: Record<string, unknown> = {};
    if (updates.title !== undefined) {
      state.title = updates.title;
      changes.title = updates.title;
    }
    if (updates.description !== undefined) {
      state.description = updates.description;
      changes.description = updates.description;
    }
    if (updates.priority !== undefined) {
      state.priority = updates.priority;
      changes.priority = updates.priority;
    }
    if (updates.category !== undefined) {
      state.category = updates.category;
      changes.category = updates.category;
    }

    state.updated_at = nowISO();
    await saveProgramState(workspace_id, program_id, state);

    if (Object.keys(changes).length > 0) {
      await events.programUpdated(workspace_id, program_id, changes);
    }

    return { success: true, data: state };
  } catch (error) {
    return {
      success: false,
      error: `Failed to update program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// archiveProgram
// =============================================================================

/**
 * Archive a program by setting status='archived' and archived_at timestamp.
 */
export async function archiveProgram(
  params: ArchiveProgramV2Params,
): Promise<ToolResponse<ProgramState>> {
  try {
    const { workspace_id, program_id } = params;

    if (!workspace_id || !program_id) {
      return { success: false, error: 'workspace_id and program_id are required' };
    }

    const state = await readProgramState(workspace_id, program_id);
    if (!state) {
      return { success: false, error: `Program not found: ${program_id}` };
    }

    if (state.status === 'archived') {
      return { success: false, error: `Program ${program_id} is already archived` };
    }

    state.status = 'archived';
    state.archived_at = nowISO();
    state.updated_at = state.archived_at;

    await saveProgramState(workspace_id, program_id, state);
    await events.programArchived(workspace_id, program_id);

    return { success: true, data: state };
  } catch (error) {
    return {
      success: false,
      error: `Failed to archive program: ${(error as Error).message}`,
    };
  }
}

// =============================================================================
// listPrograms
// =============================================================================

/**
 * List all programs in a workspace, returning their ProgramState objects.
 * Optionally filter by status.
 */
export async function listPrograms(
  workspaceId: string,
  includeArchived = false,
): Promise<ToolResponse<ProgramState[]>> {
  try {
    if (!workspaceId) {
      return { success: false, error: 'workspace_id is required' };
    }

    const programIds = await listProgramDirs(workspaceId);
    const programs: ProgramState[] = [];

    for (const id of programIds) {
      const state = await readProgramState(workspaceId, id);
      if (state) {
        if (!includeArchived && state.status === 'archived') continue;
        programs.push(state);
      }
    }

    return { success: true, data: programs };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list programs: ${(error as Error).message}`,
    };
  }
}
