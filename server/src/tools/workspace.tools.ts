/**
 * Workspace Tools - MCP tools for workspace management
 *
 * ## DbRef migration status (Phase 11)
 *
 * This module consumes db-store helpers (`store.createWorkspace`,
 * `store.getAllWorkspaces`, `store.getWorkspacePlans`, etc.) that now attach
 * an additive `_ref: DbRef` field to returned objects (Phase 9).
 *
 * All returned data objects are passed through to MCP tool responses as-is,
 * so `_ref` flows transparently to consumers without any explicit handling
 * here.  No synthetic path construction is performed for DB-backed artifacts.
 */

import fs from 'node:fs';
import path from 'node:path';
import type { 
  RegisterWorkspaceParams, 
  GetWorkspacePlansParams,
  ToolResponse,
  WorkspaceMeta,
  WorkspaceProfile,
  WorkspaceContext,
  PlanState,
  WorkspaceOverlapInfo
} from '../types/index.js';
import * as store from '../storage/db-store.js';
import { indexWorkspace, needsIndexing, scanAgentFiles } from '../indexing/workspace-indexer.js';
import type { WorkspaceMigrationReport } from '../storage/db-store.js';
import { buildWorkspaceContextSectionsFromProfile } from '../utils/workspace-context-seed.js';

interface RegisterWorkspaceResult {
  workspace: WorkspaceMeta;
  first_time: boolean;
  indexed: boolean;
  profile?: WorkspaceProfile;
  migration?: WorkspaceMigrationReport;
  overlap_detected?: boolean;
  overlaps?: WorkspaceOverlapInfo[];
  message?: string;
}

/**
 * Register a workspace - creates a folder for the workspace if it doesn't exist
 * On first registration, indexes the codebase to create a workspace profile
 */
export async function registerWorkspace(
  params: RegisterWorkspaceParams
): Promise<ToolResponse<RegisterWorkspaceResult>> {
  try {
    const { workspace_path, force } = params;
    
    if (!workspace_path) {
      return {
        success: false,
        error: 'workspace_path is required'
      };
    }
    
    // Check if this is a new workspace
    const existingId = await store.resolveWorkspaceIdForPath(workspace_path);
    const existing = await store.getWorkspace(existingId);
    const isNewWorkspace = !existing;
    
    let profile: WorkspaceProfile | undefined;
    let shouldIndex = false;
    
    // Index if first time or needs re-indexing
    if (isNewWorkspace) {
      shouldIndex = true;
    } else if (existing && await needsIndexing(workspace_path, existing.profile)) {
      shouldIndex = true;
    }
    
    if (shouldIndex) {
      try {
        profile = await indexWorkspace(workspace_path);
      } catch (indexError) {
        // Continue without indexing if it fails
        console.error('Indexing failed:', indexError);
      }
    }
    
    const result = await store.createWorkspace(workspace_path, profile, force);

    // Handle overlap detection — workspace was NOT created
    if (result.overlap && result.overlap.length > 0) {
      return {
        success: true,
        data: {
          workspace: null as unknown as WorkspaceMeta,
          first_time: false,
          indexed: false,
          overlap_detected: true,
          overlaps: result.overlap,
          message: 'Workspace registration blocked: directory overlaps with existing workspace(s). Use force=true to override.',
        }
      };
    }

    const meta = result.meta;
    const isFirstTime = result.created;

    try {
      await store.writeWorkspaceIdentityFile(workspace_path, meta);
    } catch (identityError) {
      // Expected to fail in container mode — the container can't write to
      // the host workspace directory (e.g. s:\NotionArchive). The workspace
      // meta in the data directory is still the authoritative source.
      console.warn('Could not write workspace identity file (expected in container mode):', 
        identityError instanceof Error ? identityError.message : identityError);
    }

    // Auto-populate workspace context on first registration when we have a profile
    if (isFirstTime && profile) {
      await seedWorkspaceContext(meta.workspace_id, workspace_path, meta.name, profile);
    }

    // Scan and store agent definition files from known agent directories
    try {
      await scanAgentFiles(workspace_path);
    } catch {
      // Non-fatal — agent scanning failure should not block workspace registration
    }

    // Keep workspace-registry.json in sync so the interactive terminal can
    // discover workspace paths at startup without waiting for a TCP push.
    void syncWorkspaceRegistry();
    
    return {
      success: true,
      data: {
        workspace: meta,
        first_time: isFirstTime,
        indexed: !!profile || (existing?.indexed ?? false),
        profile: profile || existing?.profile,
        migration: result.migration
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to register workspace: ${(error as Error).message}`
    };
  }
}

/**
 * List all registered workspaces
 */
export async function listWorkspaces(): Promise<ToolResponse<WorkspaceMeta[]>> {
  try {
    const workspaces = await store.getAllWorkspaces();
    
    return {
      success: true,
      data: workspaces
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to list workspaces: ${(error as Error).message}`
    };
  }
}

/**
 * Write a `workspace-registry.json` companion file to the data root so the
 * interactive terminal can discover registered workspace paths at startup,
 * before the MCP server has had a chance to push them over the TCP socket.
 *
 * The file format matches the legacy flat-file registry that the interactive
 * terminal's `registered_workspace_paths()` function already knows how to read:
 *
 *   {
 *     "schema_version": "1.0.0",
 *     "entries": { "<path>": "<workspace_id>", ... },
 *     "updated_at": "<ISO timestamp>"
 *   }
 *
 * Failures are intentionally non-fatal — the interactive terminal works fine
 * without this file once the server connects and sends a WorkspaceListPush.
 */
export async function syncWorkspaceRegistry(): Promise<void> {
  try {
    const workspaces = await store.getAllWorkspaces();
    const entries: Record<string, string> = {};

    for (const ws of workspaces) {
      const wsPath = ws.workspace_path ?? ws.path ?? '';
      if (wsPath.trim()) {
        // Normalise to forward-slash / lowercase so the interactive terminal's
        // platform normalisation step produces consistent results.
        const normalised = wsPath.replace(/\\/g, '/').toLowerCase().replace(/\/+$/, '');
        entries[normalised] = ws.workspace_id;
      }
    }

    const registry = {
      schema_version: '1.0.0',
      entries,
      updated_at: new Date().toISOString(),
    };

    const dataRoot = store.getDataRoot();
    const registryPath = path.join(dataRoot, 'workspace-registry.json');
    const tmpPath = `${registryPath}.${process.pid}.tmp`;

    fs.mkdirSync(dataRoot, { recursive: true });
    fs.writeFileSync(tmpPath, JSON.stringify(registry, null, 2), 'utf8');
    fs.renameSync(tmpPath, registryPath);
  } catch {
    // Non-fatal — the interactive terminal falls back to the live WorkspaceListPush.
  }
}

/**
 * Get all plans for a workspace
 */
export async function getWorkspacePlans(
  params: GetWorkspacePlansParams
): Promise<ToolResponse<PlanState[]>> {
  try {
    const { workspace_id } = params;
    
    if (!workspace_id) {
      return {
        success: false,
        error: 'workspace_id is required'
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
    
    const plans = await store.getWorkspacePlans(workspace_id);
    
    return {
      success: true,
      data: plans
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to get workspace plans: ${(error as Error).message}`
    };
  }
}

interface ReindexResult {
  workspace_id: string;
  previous_profile?: WorkspaceProfile;
  new_profile: WorkspaceProfile;
  changes: {
    languages_changed: boolean;
    frameworks_changed: boolean;
    files_delta: number;
    lines_delta: number;
  };
}

/**
 * Re-index a workspace to update the codebase profile
 * Use after significant changes to the codebase (new files, dependencies, etc.)
 */
export async function reindexWorkspace(
  params: { workspace_id: string }
): Promise<ToolResponse<ReindexResult>> {
  try {
    const { workspace_id } = params;
    
    if (!workspace_id) {
      return {
        success: false,
        error: 'workspace_id is required'
      };
    }
    
    // Get existing workspace
    const workspace = await store.getWorkspace(workspace_id);
    if (!workspace) {
      return {
        success: false,
        error: `Workspace not found: ${workspace_id}`
      };
    }
    
    const previousProfile = workspace.profile;
    
    // Re-index the workspace
    const newProfile = await indexWorkspace(workspace.path);
    
    // Update workspace with new profile
    workspace.profile = newProfile;
    workspace.indexed = true;
    workspace.last_accessed = store.nowISO();
    await store.saveWorkspace(workspace);
    
    // Scan and store agent definition files from known agent directories
    try {
      await scanAgentFiles(workspace.path);
    } catch {
      // Non-fatal — agent scanning failure should not block reindex
    }

    // Calculate changes
    const changes = {
      languages_changed: JSON.stringify(previousProfile?.languages?.map(l => l.name).sort()) !==
                         JSON.stringify(newProfile.languages.map(l => l.name).sort()),
      frameworks_changed: JSON.stringify(previousProfile?.frameworks?.sort()) !==
                          JSON.stringify(newProfile.frameworks.sort()),
      files_delta: newProfile.total_files - (previousProfile?.total_files ?? 0),
      lines_delta: newProfile.total_lines - (previousProfile?.total_lines ?? 0)
    };

    return {
      success: true,
      data: {
        workspace_id,
        previous_profile: previousProfile,
        new_profile: newProfile,
        changes
      }
    };
  } catch (error) {
    return {
      success: false,
      error: `Failed to reindex workspace: ${(error as Error).message}`
    };
  }
}

/**
 * Auto-seed workspace context in DB with data from the codebase profile.
 * Only called on first-time registration when a profile is available.
 * Does not overwrite existing context.
 */
async function seedWorkspaceContext(
  workspaceId: string,
  workspacePath: string,
  workspaceName: string,
  profile: WorkspaceProfile
): Promise<void> {
  try {
    const existing = await store.getWorkspaceContextFromDb(workspaceId);
    if (existing) {
      // Context already exists — don't overwrite
      return;
    }

    const now = store.nowISO();

    const sections = buildWorkspaceContextSectionsFromProfile(profile, {
      workspaceName,
      workspacePath
    });

    const context: WorkspaceContext = {
      schema_version: '1.0',
      workspace_id: workspaceId,
      workspace_path: workspacePath,
      name: workspaceName,
      created_at: now,
      updated_at: now,
      sections
    };

    await store.saveWorkspaceContextToDb(workspaceId, context);
    const projectItemsCount = sections.project_details?.items?.length ?? 0;
    const dependencyItemsCount = sections.dependencies?.items?.length ?? 0;
    console.log(`Auto-seeded workspace context for ${workspaceId} with ${projectItemsCount} project details and ${dependencyItemsCount} dependencies`);
  } catch (error) {
    // Non-fatal — context seeding is best-effort
    console.warn('Failed to auto-seed workspace context:', 
      error instanceof Error ? error.message : error);
  }
}
