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
import { preflightValidate } from '../preflight/index.js';
import { scanGhostFolders, mergeWorkspace, validateWorkspaceId, migrateWorkspace, ensureIdentityFile } from '../../storage/workspace-identity.js';
import type { GhostFolderInfo, MergeResult, MigrateWorkspaceResult } from '../../storage/workspace-identity.js';
import { linkWorkspaces, unlinkWorkspaces, getWorkspaceHierarchy, checkRegistryForOverlaps } from '../../storage/workspace-hierarchy.js';
import type { WorkspaceHierarchyInfo } from '../../storage/workspace-hierarchy.js';
import { normalizeWorkspacePath } from '../../storage/workspace-utils.js';
import { detectMigrationAdvisories } from '../program/index.js';
import type { MigrationAdvisory } from '../program/index.js';

export type WorkspaceAction = 'register' | 'list' | 'info' | 'reindex' | 'merge' | 'scan_ghosts' | 'migrate' | 'link' | 'set_display_name' | 'export_pending';

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
  display_name?: string;             // for set_display_name
  output_filename?: string;          // for export_pending (custom filename, defaults to 'pending-steps.md')
}

interface WorkspaceInfoResult {
  workspace: WorkspaceMeta;
  plans: PlanState[];
  active_plans: number;
  archived_plans: number;
  hierarchy?: WorkspaceHierarchyInfo;
  migration_advisories?: MigrationAdvisory[];
}

type HierarchicalWorkspaceMeta = WorkspaceMeta & { children?: WorkspaceMeta[] };

type WorkspaceResult = 
  | { action: 'register'; data: { workspace: WorkspaceMeta; first_time: boolean; indexed: boolean; profile?: WorkspaceProfile; overlap_detected?: boolean; overlaps?: WorkspaceOverlapInfo[]; message?: string } }
  | { action: 'list'; data: WorkspaceMeta[] | HierarchicalWorkspaceMeta[]; migration_advisories?: MigrationAdvisory[] }
  | { action: 'info'; data: WorkspaceInfoResult }
  | { action: 'reindex'; data: { workspace_id: string; previous_profile?: WorkspaceProfile; new_profile: WorkspaceProfile; changes: object } }
  | { action: 'merge'; data: MergeResult }
  | { action: 'scan_ghosts'; data: { ghosts: GhostFolderInfo[]; hierarchy_overlaps?: WorkspaceOverlapInfo[] } }
  | { action: 'migrate'; data: MigrateWorkspaceResult }
  | { action: 'link'; data: { mode: 'link' | 'unlink'; parent_id: string; child_id: string; hierarchy: WorkspaceHierarchyInfo } }
  | { action: 'set_display_name'; data: { workspace: WorkspaceMeta } }
  | { action: 'export_pending'; data: { workspace_id: string; file_path: string; plans_included: number; total_pending_steps: number } };

export async function memoryWorkspace(params: MemoryWorkspaceParams): Promise<ToolResponse<WorkspaceResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate, link, set_display_name'
    };
  }

  // Preflight validation — catch missing required fields early
  const preflight = preflightValidate('memory_workspace', action, params as unknown as Record<string, unknown>);
  if (!preflight.valid) {
    return { success: false, error: preflight.message, preflight_failure: preflight } as ToolResponse<WorkspaceResult>;
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

      // Batch-load plans per workspace and detect migration advisories
      const listPlanResults = await Promise.all(
        result.data!.map(ws => workspaceTools.getWorkspacePlans({ workspace_id: ws.workspace_id }))
      );
      const listAllPlans = listPlanResults.flatMap(r => r && r.success && r.data ? r.data : []);
      const listAdvisories = detectMigrationAdvisories(listAllPlans);

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
          data: {
            action: 'list',
            data: hierarchicalList,
            ...(listAdvisories.length > 0 ? { migration_advisories: listAdvisories } : {})
          }
        };
      }

      return {
        success: true,
        data: {
          action: 'list',
          data: result.data!,
          ...(listAdvisories.length > 0 ? { migration_advisories: listAdvisories } : {})
        }
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
      
      const advisories = detectMigrationAdvisories(plans);
      
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
            hierarchy,
            ...(advisories.length > 0 ? { migration_advisories: advisories } : {})
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

    case 'set_display_name': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: set_display_name'
        };
      }

      if (typeof params.display_name !== 'string') {
        return {
          success: false,
          error: 'display_name is required for action: set_display_name'
        };
      }

      const nextDisplayName = params.display_name.trim();
      if (!nextDisplayName) {
        return {
          success: false,
          error: 'display_name must be a non-empty string'
        };
      }

      const validated = await validateAndResolveWorkspaceId(params.workspace_id);
      if (!validated.success) return validated.error_response as ToolResponse<WorkspaceResult>;

      const workspace = await store.getWorkspace(validated.workspace_id);
      if (!workspace) {
        return {
          success: false,
          error: `Workspace not found: ${validated.workspace_id}`
        };
      }

      workspace.display_name = nextDisplayName;
      workspace.name = nextDisplayName;
      workspace.updated_at = new Date().toISOString();
      await store.saveWorkspace(workspace);

      return {
        success: true,
        data: {
          action: 'set_display_name',
          data: { workspace }
        }
      };
    }

    case 'export_pending': {
      if (!params.workspace_id) {
        return {
          success: false,
          error: 'workspace_id is required for action: export_pending'
        };
      }

      const epValidated = await validateAndResolveWorkspaceId(params.workspace_id);
      if (!epValidated.success) return epValidated.error_response as ToolResponse<WorkspaceResult>;
      const epWorkspaceId = epValidated.workspace_id;

      const epWorkspace = await store.getWorkspace(epWorkspaceId);
      if (!epWorkspace) {
        return {
          success: false,
          error: `Workspace not found: ${epWorkspaceId}`
        };
      }

      const epWsPath = epWorkspace.workspace_path || epWorkspace.path;
      if (!epWsPath) {
        return {
          success: false,
          error: `Workspace has no filesystem path: ${epWorkspaceId}`
        };
      }

      // Fetch all plans for this workspace
      const epPlansResult = await workspaceTools.getWorkspacePlans({ workspace_id: epWorkspaceId });
      const epPlans = epPlansResult.success ? epPlansResult.data! : [];

      // Filter to non-archived plans that have unfinished steps
      const plansWithPending: { plan: PlanState; pendingSteps: PlanState['steps'] }[] = [];
      for (const plan of epPlans) {
        if (plan.status === 'archived') continue;
        const pending = plan.steps.filter(s => s.status !== 'done');
        if (pending.length > 0) {
          plansWithPending.push({ plan, pendingSteps: pending });
        }
      }

      // Build markdown content
      const lines: string[] = [];
      const now = new Date().toISOString();
      lines.push(`# Pending Steps — ${epWorkspace.display_name || epWorkspace.name}`);
      lines.push('');
      lines.push(`> Exported on ${now}`);
      lines.push(`> Workspace ID: \`${epWorkspaceId}\``);
      lines.push('');

      if (plansWithPending.length === 0) {
        lines.push('*No plans with unfinished steps found.*');
      } else {
        let totalPending = 0;
        for (const { plan, pendingSteps } of plansWithPending) {
          totalPending += pendingSteps.length;
          lines.push(`## ${plan.title}`);
          lines.push('');
          lines.push(`- **Plan ID:** \`${plan.id}\``);
          lines.push(`- **Category:** ${plan.category}`);
          lines.push(`- **Priority:** ${plan.priority}`);
          lines.push(`- **Status:** ${plan.status}`);
          lines.push(`- **Current Phase:** ${plan.current_phase}`);
          if (plan.description) {
            lines.push(`- **Description:** ${plan.description}`);
          }
          lines.push('');

          // Group pending steps by phase
          const phaseMap = new Map<string, typeof pendingSteps>();
          for (const step of pendingSteps) {
            const phase = step.phase || 'Unphased';
            if (!phaseMap.has(phase)) phaseMap.set(phase, []);
            phaseMap.get(phase)!.push(step);
          }

          for (const [phase, steps] of phaseMap) {
            lines.push(`### ${phase}`);
            lines.push('');
            for (const step of steps) {
              const statusIcon = step.status === 'active' ? '🔄' : step.status === 'blocked' ? '🚫' : '⬜';
              const assignee = step.assignee ? ` *(${step.assignee})*` : '';
              lines.push(`- ${statusIcon} **[${step.status.toUpperCase()}]** ${step.task}${assignee}`);
              if (step.notes) {
                lines.push(`  - Notes: ${step.notes}`);
              }
              if (step.depends_on?.length) {
                lines.push(`  - Depends on steps: ${step.depends_on.join(', ')}`);
              }
            }
            lines.push('');
          }
        }

        // Summary at top
        lines.splice(4, 0, `> **${plansWithPending.length} plan(s)** with **${totalPending} unfinished step(s)**`);
      }

      // Write the file
      const { promises: fsPromises } = await import('fs');
      const { join } = await import('path');
      const filename = params.output_filename || 'pending-steps.md';
      const outputPath = join(epWsPath, filename);
      await fsPromises.writeFile(outputPath, lines.join('\n'), 'utf-8');

      return {
        success: true,
        data: {
          action: 'export_pending',
          data: {
            workspace_id: epWorkspaceId,
            file_path: outputPath,
            plans_included: plansWithPending.length,
            total_pending_steps: plansWithPending.reduce((sum, p) => sum + p.pendingSteps.length, 0)
          }
        }
      };
    }

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate, link, set_display_name, export_pending`
      };
  }
}
