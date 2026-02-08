/**
 * Workspace Tools - MCP tools for workspace management
 */

import type { 
  RegisterWorkspaceParams, 
  GetWorkspacePlansParams,
  ToolResponse,
  WorkspaceMeta,
  WorkspaceProfile,
  PlanState
} from '../types/index.js';
import * as store from '../storage/file-store.js';
import { indexWorkspace, needsIndexing } from '../indexing/workspace-indexer.js';
import type { WorkspaceMigrationReport } from '../storage/file-store.js';

interface RegisterWorkspaceResult {
  workspace: WorkspaceMeta;
  first_time: boolean;
  indexed: boolean;
  profile?: WorkspaceProfile;
  migration?: WorkspaceMigrationReport;
}

/**
 * Register a workspace - creates a folder for the workspace if it doesn't exist
 * On first registration, indexes the codebase to create a workspace profile
 */
export async function registerWorkspace(
  params: RegisterWorkspaceParams
): Promise<ToolResponse<RegisterWorkspaceResult>> {
  try {
    const { workspace_path } = params;
    
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
    
    const result = await store.createWorkspace(workspace_path, profile);
    const meta = result.meta;
    const isFirstTime = result.created;

    try {
      await store.writeWorkspaceIdentityFile(workspace_path, meta);
    } catch (identityError) {
      console.error('Failed to write workspace identity file:', identityError);
    }
    
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
