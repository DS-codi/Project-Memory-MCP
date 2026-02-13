/**
 * Workspace Tools - MCP tools for workspace management
 */

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
import * as store from '../storage/file-store.js';
import { indexWorkspace, needsIndexing } from '../indexing/workspace-indexer.js';
import type { WorkspaceMigrationReport } from '../storage/file-store.js';

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

/**
 * Auto-seed workspace.context.json with data from the codebase profile.
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
    const contextPath = store.getWorkspaceContextPath(workspaceId);
    const existing = await store.readJson<WorkspaceContext>(contextPath);
    if (existing) {
      // Context already exists — don't overwrite
      return;
    }

    const now = store.nowISO();

    // Build project_details from detected languages & frameworks
    const langNames = profile.languages.map(l => l.name);
    const stackParts = [...langNames, ...profile.frameworks].filter(Boolean);
    const projectSummary = stackParts.length > 0
      ? `Detected stack: ${stackParts.join(', ')}.`
      : 'Codebase indexed but no specific stack detected.';

    const projectItems = profile.languages.map(l => ({
      title: l.name,
      description: `${l.percentage}% of codebase (${l.file_count} files)`
    }));
    if (profile.build_system) {
      projectItems.push({
        title: `Build: ${profile.build_system.type}`,
        description: profile.build_system.config_file
      });
    }
    if (profile.test_framework) {
      projectItems.push({
        title: `Tests: ${profile.test_framework.name}`,
        description: profile.test_framework.config_file ?? 'auto-detected'
      });
    }
    if (profile.package_manager) {
      projectItems.push({
        title: `Package Manager: ${profile.package_manager}`,
        description: ''
      });
    }

    // Build dependencies section from frameworks
    const depItems = profile.frameworks.map(fw => ({
      title: fw,
      description: 'Detected framework/library'
    }));

    const context: WorkspaceContext = {
      schema_version: '1.0',
      workspace_id: workspaceId,
      workspace_path: workspacePath,
      name: workspaceName,
      created_at: now,
      updated_at: now,
      sections: {
        project_details: {
          summary: projectSummary,
          items: projectItems
        },
        ...(depItems.length > 0 ? {
          dependencies: {
            summary: `${depItems.length} framework(s)/library(s) detected.`,
            items: depItems
          }
        } : {})
      }
    };

    await store.writeJsonLocked(contextPath, context);
    console.log(`Auto-seeded workspace context for ${workspaceId} with ${projectItems.length} project details and ${depItems.length} dependencies`);
  } catch (error) {
    // Non-fatal — context seeding is best-effort
    console.warn('Failed to auto-seed workspace context:', 
      error instanceof Error ? error.message : error);
  }
}
