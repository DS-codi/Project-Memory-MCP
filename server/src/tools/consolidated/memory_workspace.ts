/**
 * Consolidated Workspace Tool - memory_workspace
 * 
 * Actions: register, list, info, reindex, merge, scan_ghosts
 * Replaces: register_workspace, list_workspaces, get_workspace_plans, reindex_workspace
 */

import type { ToolResponse, WorkspaceMeta, WorkspaceProfile, PlanState, WorkspaceOverlapInfo } from '../../types/index.js';
import * as workspaceTools from '../workspace.tools.js';
import * as store from '../../storage/file-store.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { scanGhostFolders, mergeWorkspace, validateWorkspaceId, migrateWorkspace, ensureIdentityFile } from '../../storage/workspace-identity.js';
import type { GhostFolderInfo, MergeResult, MigrateWorkspaceResult } from '../../storage/workspace-identity.js';
import { linkWorkspaces, unlinkWorkspaces, getWorkspaceHierarchy, checkRegistryForOverlaps } from '../../storage/workspace-hierarchy.js';
import type { WorkspaceHierarchyInfo } from '../../storage/workspace-hierarchy.js';
import { normalizeWorkspacePath } from '../../storage/workspace-utils.js';

export type WorkspaceAction = 'register' | 'list' | 'info' | 'reindex' | 'merge' | 'scan_ghosts' | 'migrate' | 'link';

export interface MemoryWorkspaceParams {
  action: WorkspaceAction;
  workspace_path?: string;           // for register
  workspace_id?: string;             // for info, reindex
  source_workspace_id?: string;      // for merge
  target_workspace_id?: string;      // for merge
  dry_run?: boolean;                 // for merge (defaults to true)
  force?: boolean;                   // for register (bypass overlap guard)
  child_workspace_id?: string;       // for link
  mode?: 'link' | 'unlink';          // for link
  hierarchical?: boolean;            // for list (hierarchical grouping)
}

interface WorkspaceInfoResult {
  workspace: WorkspaceMeta;
  plans: PlanState[];
  active_plans: number;
  archived_plans: number;
  hierarchy?: WorkspaceHierarchyInfo;
}

type HierarchicalWorkspaceMeta = WorkspaceMeta & { children?: WorkspaceMeta[] };

type WorkspaceResult = 
  | { action: 'register'; data: { workspace: WorkspaceMeta; first_time: boolean; indexed: boolean; profile?: WorkspaceProfile; overlap_detected?: boolean; overlaps?: WorkspaceOverlapInfo[]; message?: string } }
  | { action: 'list'; data: WorkspaceMeta[] | HierarchicalWorkspaceMeta[] }
  | { action: 'info'; data: WorkspaceInfoResult }
  | { action: 'reindex'; data: { workspace_id: string; previous_profile?: WorkspaceProfile; new_profile: WorkspaceProfile; changes: object } }
  | { action: 'merge'; data: MergeResult }
  | { action: 'scan_ghosts'; data: { ghosts: GhostFolderInfo[]; hierarchy_overlaps?: WorkspaceOverlapInfo[] } }
  | { action: 'migrate'; data: MigrateWorkspaceResult }
  | { action: 'link'; data: { mode: 'link' | 'unlink'; parent_id: string; child_id: string; hierarchy: WorkspaceHierarchyInfo } };

export async function memoryWorkspace(params: MemoryWorkspaceParams): Promise<ToolResponse<WorkspaceResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate'
    };
  }

  switch (action) {
    case 'register': {
      if (!params.workspace_path) {
        return {
          success: false,
          error: 'workspace_path is required for action: register'
        };
      }
      const result = await workspaceTools.registerWorkspace({ workspace_path: params.workspace_path, force: params.force });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      return {
        success: true,
        data: { action: 'register', data: result.data! }
      };
    }

    case 'list': {
      const result = await workspaceTools.listWorkspaces();
      if (!result.success) {
        return { success: false, error: result.error };
      }
      // Ensure identity.json exists for each workspace that has a path
      for (const ws of result.data!) {
        const wsPath = ws.workspace_path || ws.path;
        if (wsPath) {
          await ensureIdentityFile(wsPath, ws.workspace_id, ws.data_root);
        }
      }

      // Hierarchical grouping: nest children under their parents
      if (params.hierarchical) {
        const allWorkspaces = result.data!;
        const childIds = new Set<string>();

        // Collect all IDs that are children of another workspace
        for (const ws of allWorkspaces) {
          if (ws.child_workspace_ids?.length) {
            for (const cid of ws.child_workspace_ids) {
              childIds.add(cid);
            }
          }
        }

        // Build the hierarchical list: top-level only (parents + standalones)
        const wsMap = new Map(allWorkspaces.map(ws => [ws.workspace_id, ws]));
        const hierarchicalList: HierarchicalWorkspaceMeta[] = [];

        for (const ws of allWorkspaces) {
          // Skip workspaces that are children of another workspace
          if (childIds.has(ws.workspace_id)) continue;

          const entry: HierarchicalWorkspaceMeta = { ...ws };
          if (ws.child_workspace_ids?.length) {
            entry.children = ws.child_workspace_ids
              .map(cid => wsMap.get(cid))
              .filter((c): c is WorkspaceMeta => c !== undefined);
          }
          hierarchicalList.push(entry);
        }

        return {
          success: true,
          data: { action: 'list', data: hierarchicalList }
        };
      }

      return {
        success: true,
        data: { action: 'list', data: result.data! }
      };
    }

    case 'info': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: info'
        };
      }

      // Validate and resolve workspace_id (handles legacy ID redirect)
      const infoValidated = await validateAndResolveWorkspaceId(params.workspace_id);
      if (!infoValidated.success) return infoValidated.error_response as ToolResponse<WorkspaceResult>;
      const infoWorkspaceId = infoValidated.workspace_id;
      
      // Get workspace details
      const workspace = await store.getWorkspace(infoWorkspaceId);
      if (!workspace) {
        return {
          success: false,
          error: `Workspace not found: ${infoWorkspaceId}`
        };
      }
      
      // Get plans for this workspace
      const plansResult = await workspaceTools.getWorkspacePlans({ workspace_id: infoWorkspaceId });
      const plans = plansResult.success ? plansResult.data! : [];
      
      const activePlans = plans.filter(p => p.status !== 'archived');
      const archivedPlans = plans.filter(p => p.status === 'archived');
      
      // Ensure identity.json exists in the workspace directory
      const infoWsPath = workspace.workspace_path || workspace.path;
      if (infoWsPath) {
        await ensureIdentityFile(infoWsPath, workspace.workspace_id, workspace.data_root);
      }

      // Get hierarchy data (parent + children)
      const hierarchy = await getWorkspaceHierarchy(infoWorkspaceId);

      return {
        success: true,
        data: {
          action: 'info',
          data: {
            workspace,
            plans,
            active_plans: activePlans.length,
            archived_plans: archivedPlans.length,
            hierarchy
          }
        }
      };
    }

    case 'reindex': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: reindex'
        };
      }
      // Validate and resolve workspace_id
      const reindexValidated = await validateAndResolveWorkspaceId(params.workspace_id);
      if (!reindexValidated.success) return reindexValidated.error_response as ToolResponse<WorkspaceResult>;
      const result = await workspaceTools.reindexWorkspace({ workspace_id: reindexValidated.workspace_id });
      if (!result.success) {
        return { success: false, error: result.error };
      }
      // Ensure identity.json exists after reindex
      const reindexWs = await store.getWorkspace(reindexValidated.workspace_id);
      if (reindexWs) {
        const reindexPath = reindexWs.workspace_path || reindexWs.path;
        if (reindexPath) {
          await ensureIdentityFile(reindexPath, reindexWs.workspace_id, reindexWs.data_root);
        }
      }
      return {
        success: true,
        data: { action: 'reindex', data: result.data! }
      };
    }

    case 'scan_ghosts': {
      try {
        const ghosts = await scanGhostFolders();

        // Detect unlinked parent-child overlaps among registered workspaces
        const allWorkspaces = await store.getAllWorkspaces();
        const registry: Record<string, string> = {};
        for (const ws of allWorkspaces) {
          const wsPath = ws.workspace_path || ws.path;
          if (wsPath) {
            registry[normalizeWorkspacePath(wsPath)] = ws.workspace_id;
          }
        }

        // Build set of already-linked workspace IDs
        const linkedIds = new Set<string>();
        for (const ws of allWorkspaces) {
          if (ws.parent_workspace_id) linkedIds.add(ws.workspace_id);
          if (ws.child_workspace_ids?.length) {
            for (const cid of ws.child_workspace_ids) {
              linkedIds.add(cid);
            }
          }
        }

        // Check each workspace for overlaps, filtering out already-linked pairs
        const seenPairs = new Set<string>();
        const hierarchyOverlaps: WorkspaceOverlapInfo[] = [];
        for (const ws of allWorkspaces) {
          const wsPath = ws.workspace_path || ws.path;
          if (!wsPath) continue;
          const overlaps = checkRegistryForOverlaps(wsPath, registry);
          for (const overlap of overlaps) {
            // Skip if either workspace in this pair is already linked
            if (linkedIds.has(ws.workspace_id) && linkedIds.has(overlap.existing_workspace_id)) continue;

            // Deduplicate: only report each pair once
            const pairKey = [ws.workspace_id, overlap.existing_workspace_id].sort().join(':');
            if (seenPairs.has(pairKey)) continue;
            seenPairs.add(pairKey);

            hierarchyOverlaps.push(overlap);
          }
        }

        return {
          success: true,
          data: {
            action: 'scan_ghosts',
            data: {
              ghosts,
              ...(hierarchyOverlaps.length > 0 ? { hierarchy_overlaps: hierarchyOverlaps } : {})
            }
          }
        };
      } catch (err) {
        return {
          success: false,
          error: `Failed to scan for ghost folders: ${(err as Error).message}`
        };
      }
    }

    case 'merge': {
      if (!params.source_workspace_id) {
        return {
          success: false,
          error: 'source_workspace_id is required for action: merge'
        };
      }
      if (!params.target_workspace_id) {
        return {
          success: false,
          error: 'target_workspace_id is required for action: merge'
        };
      }

      // Validate that target is a registered workspace
      const targetValid = await validateWorkspaceId(params.target_workspace_id);
      if (!targetValid) {
        return {
          success: false,
          error: `Target workspace '${params.target_workspace_id}' is not registered (no workspace.meta.json). Refusing to merge into an unregistered workspace.`
        };
      }

      // Default to dry_run=true for safety
      const isDryRun = params.dry_run !== false;

      try {
        const mergeResult = await mergeWorkspace(
          params.source_workspace_id,
          params.target_workspace_id,
          isDryRun
        );

        // Check for errors in the result notes
        const hasError = mergeResult.notes.some(n => n.startsWith('ERROR:'));
        if (hasError) {
          return {
            success: false,
            error: mergeResult.notes.filter(n => n.startsWith('ERROR:')).join('; '),
            data: { action: 'merge', data: mergeResult }
          } as ToolResponse<WorkspaceResult>;
        }

        // Ensure identity.json exists for the target workspace
        const targetWs = await store.getWorkspace(params.target_workspace_id);
        if (targetWs) {
          const targetPath = targetWs.workspace_path || targetWs.path;
          if (targetPath) {
            await ensureIdentityFile(targetPath, targetWs.workspace_id, targetWs.data_root);
          }
        }

        return {
          success: true,
          data: { action: 'merge', data: mergeResult }
        };
      } catch (err) {
        return {
          success: false,
          error: `Merge failed: ${(err as Error).message}`
        };
      }
    }

    case 'migrate': {
      if (!params.workspace_path) {
        return {
          success: false,
          error: 'workspace_path is required for action: migrate. Provide the absolute filesystem path to the workspace directory.'
        };
      }

      try {
        const migrationResult = await migrateWorkspace(params.workspace_path);
        return {
          success: true,
          data: { action: 'migrate', data: migrationResult }
        };
      } catch (err) {
        return {
          success: false,
          error: `Migration failed: ${(err as Error).message}`
        };
      }
    }

    case 'link': {
      if (!params.workspace_id) {
        return { success: false, error: 'workspace_id (parent) is required for action: link' };
      }
      if (!params.child_workspace_id) {
        return { success: false, error: 'child_workspace_id is required for action: link' };
      }
      const linkMode = params.mode || 'link';

      // Validate both workspace IDs
      const parentValidated = await validateAndResolveWorkspaceId(params.workspace_id);
      if (!parentValidated.success) return parentValidated.error_response as ToolResponse<WorkspaceResult>;
      const childValidated = await validateAndResolveWorkspaceId(params.child_workspace_id);
      if (!childValidated.success) return childValidated.error_response as ToolResponse<WorkspaceResult>;

      const parentWsId = parentValidated.workspace_id;
      const childWsId = childValidated.workspace_id;

      try {
        if (linkMode === 'unlink') {
          await unlinkWorkspaces(parentWsId, childWsId);
        } else {
          await linkWorkspaces(parentWsId, childWsId);
        }
        const hierarchy = await getWorkspaceHierarchy(parentWsId);
        return {
          success: true,
          data: {
            action: 'link',
            data: { mode: linkMode, parent_id: parentWsId, child_id: childWsId, hierarchy },
          },
        };
      } catch (err) {
        return {
          success: false,
          error: `Workspace ${linkMode} failed: ${(err as Error).message}`,
        };
      }
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate, link`
      };
  }
}
