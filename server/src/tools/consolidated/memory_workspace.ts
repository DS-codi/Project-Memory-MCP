/**
 * Consolidated Workspace Tool - memory_workspace
 * 
 * Actions: register, list, info, reindex, merge, scan_ghosts
 * Replaces: register_workspace, list_workspaces, get_workspace_plans, reindex_workspace
 */

import type { ToolResponse, WorkspaceMeta, WorkspaceProfile, PlanState, WorkspaceOverlapInfo } from '../../types/index.js';
import * as workspaceTools from '../workspace.tools.js';
import * as store from '../../storage/db-store.js';
import { validateAndResolveWorkspaceId } from './workspace-validation.js';
import { preflightValidate, buildPreflightFailure } from '../preflight/index.js';
import { scanGhostFolders, mergeWorkspace, validateWorkspaceId, migrateWorkspace, ensureIdentityFile } from '../../storage/db-store.js';
import type { GhostFolderInfo, MergeResult, MigrateWorkspaceResult } from '../../storage/db-store.js';
import { linkWorkspaces, unlinkWorkspaces, getWorkspaceHierarchy, checkRegistryForOverlaps } from '../../storage/db-store.js';
import type { WorkspaceHierarchyInfo } from '../../storage/db-store.js';
import { normalizeWorkspacePath } from '../../storage/db-store.js';
import { detectMigrationAdvisories } from '../program/index.js';
import type { MigrationAdvisory } from '../program/index.js';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { storeAgent } from '../../db/agent-definition-db.js';
import { storeInstruction } from '../../db/instruction-db.js';
import { checkWorkspaceContextHealth, type WorkspaceContextHealth } from '../workspace-context-manifest.js';
import {
  checkWorkspaceDbSync,
  inspectWorkspaceSyncFile,
  normalizeWorkspaceSyncRelativePath,
  type WorkspaceContextSyncEntry,
  type WorkspaceContextSyncReport,
} from '../workspace-db-sync.js';
import { getFocusedWorkspacesDir, getFocusedWorkspacePath } from '../../storage/db-store.js';
import { events } from '../../events/event-emitter.js';

export type WorkspaceAction = 'register' | 'list' | 'info' | 'reindex' | 'merge' | 'scan_ghosts' | 'migrate' | 'link' | 'set_display_name' | 'export_pending' | 'generate_focused_workspace' | 'list_focused_workspaces' | 'check_context_sync' | 'import_context_file' | 'inject_cli_mcp';

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
  output_filename?: string;          // for export_pending (custom filename, defaults to 'pending-steps.md'); also for generate_focused_workspace
  plan_id?: string;                  // for generate_focused_workspace, list_focused_workspaces
  files_allowed?: string[];          // for generate_focused_workspace (explicit file scope)
  directories_allowed?: string[];    // for generate_focused_workspace (explicit directory scope)
  base_workspace_path?: string;      // for generate_focused_workspace (base .code-workspace to merge into)
  session_id?: string;               // for generate_focused_workspace (optional registry update)
  relative_path?: string;            // for import_context_file (.github-relative path)
  confirm?: boolean;                 // for import_context_file (explicit write gate)
  expected_kind?: 'agent' | 'instruction'; // for import_context_file safety check
  all_workspaces?: boolean;          // for inject_cli_mcp: inject into all registered workspaces
  cli_mcp_port?: number;             // for inject_cli_mcp: port override (default: PM_CLI_MCP_PORT or 3466)
}

interface ImportContextFileResult {
  workspace_id: string;
  relative_path: string;
  kind: 'agent' | 'instruction';
  imported: boolean;
  previous_status: WorkspaceContextSyncEntry['status'];
  current_status: WorkspaceContextSyncEntry['status'];
  preview: WorkspaceContextSyncEntry;
  message: string;
}

interface PlanInfoSummary {
  plan_id: string;
  title: string;
  status: string;
  current_phase: string;
  steps_done: number;
  steps_total: number;
  last_updated: string;
}

interface WorkspaceInfoResult {
  workspace: WorkspaceMeta;
  plans: PlanInfoSummary[];
  active_plans: number;
  archived_plans: number;
  hierarchy?: WorkspaceHierarchyInfo;
  migration_advisories?: MigrationAdvisory[];
}

type HierarchicalWorkspaceMeta = WorkspaceMeta & { children?: WorkspaceMeta[] };

type WorkspaceResult = 
  | { action: 'register'; data: { workspace: WorkspaceMeta; first_time: boolean; indexed: boolean; profile?: WorkspaceProfile; overlap_detected?: boolean; overlaps?: WorkspaceOverlapInfo[]; message?: string; context_health?: WorkspaceContextHealth } }
  | { action: 'list'; data: WorkspaceMeta[] | HierarchicalWorkspaceMeta[] }
  | { action: 'info'; data: WorkspaceInfoResult }
  | { action: 'reindex'; data: { workspace_id: string; previous_profile?: WorkspaceProfile; new_profile: WorkspaceProfile; changes: object } }
  | { action: 'merge'; data: MergeResult }
  | { action: 'scan_ghosts'; data: { ghosts: GhostFolderInfo[]; hierarchy_overlaps?: WorkspaceOverlapInfo[] } }
  | { action: 'migrate'; data: MigrateWorkspaceResult }
  | { action: 'link'; data: { mode: 'link' | 'unlink'; parent_id: string; child_id: string; hierarchy: WorkspaceHierarchyInfo } }
  | { action: 'set_display_name'; data: { workspace: WorkspaceMeta } }
  | { action: 'export_pending'; data: { workspace_id: string; file_path: string; plans_included: number; total_pending_steps: number } }
  | { action: 'generate_focused_workspace'; data: { file_path: string; files_in_scope: string[] } }
  | { action: 'list_focused_workspaces'; data: { workspaces: Array<{ plan_id: string; file_path: string; filename: string }> } }
  | { action: 'check_context_sync'; data: WorkspaceContextSyncReport }
  | { action: 'import_context_file'; data: ImportContextFileResult }
  | { action: 'inject_cli_mcp'; data: { injected: Array<{ workspace_id: string; workspace_path: string; status: 'written' | 'updated' | 'skipped' | 'error'; detail?: string }>; total: number; written: number; skipped: number; errors: number } };

function extractYamlFrontmatter(content: string): string | null {
  const match = content.match(/^---\s*\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  return match?.[1] ?? null;
}

function extractInstructionApplyTo(content: string): string {
  const frontmatter = extractYamlFrontmatter(content);
  if (!frontmatter) {
    return '**/*';
  }

  const match = frontmatter.match(/^applyTo:\s*["']?([^"'\n]+)["']?\s*$/m);
  return match?.[1]?.trim() || '**/*';
}

function getImportPolicyRejection(entry: WorkspaceContextSyncEntry): string | null {
  if (entry.policy.cull_reason) {
    return 'This file is DB-only by manifest policy and cannot be manually imported from the workspace.';
  }
  if (entry.policy.validation_errors.length > 0) {
    return `This file has invalid PM metadata and cannot be imported: ${entry.policy.validation_errors.join(' | ')}`;
  }
  if (!entry.policy.sync_managed || entry.policy.controlled || entry.policy.import_mode !== 'manual') {
    return 'This file is not an eligible manual-import candidate under the current PM policy.';
  }
  return null;
}

function buildImportContextFileError(entry: WorkspaceContextSyncEntry): string {
  switch (entry.status) {
    case 'protected_drift':
      return 'PM-controlled files cannot be imported from the workspace. Use an explicit redeploy or reseed-from-canonical flow instead.';
    case 'ignored_local':
      return 'This file is outside PM sync management and is not eligible for manual DB import.';
    case 'local_only':
      return 'This file exists only in the workspace but is not marked as a manual import candidate.';
    case 'db_only':
      return 'This file already exists in the DB only; import_context_file only handles DB-missing local files.';
    case 'content_mismatch':
      return 'This file already has a DB row. Use an explicit update or redeploy workflow instead of import_context_file.';
    case 'in_sync':
      return 'This file is already in sync and does not need manual import.';
    case 'import_candidate':
      return 'Ready for manual import.';
  }
}

async function handleImportContextFile(
  params: MemoryWorkspaceParams,
): Promise<ToolResponse<WorkspaceResult>> {
  if (!params.workspace_id) {
    return { success: false, error: 'workspace_id is required for action: import_context_file' };
  }
  if (!params.relative_path) {
    return { success: false, error: 'relative_path is required for action: import_context_file' };
  }

  const validated = await validateAndResolveWorkspaceId(params.workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<WorkspaceResult>;

  const workspace = await store.getWorkspace(validated.workspace_id);
  if (!workspace) {
    return { success: false, error: `Workspace not found: ${validated.workspace_id}` };
  }

  const wsPath = workspace.workspace_path || (workspace as unknown as { path?: string }).path;
  if (!wsPath) {
    return { success: false, error: `Workspace has no filesystem path: ${validated.workspace_id}` };
  }

  const normalizedRelativePath = normalizeWorkspaceSyncRelativePath(params.relative_path);
  const preview = inspectWorkspaceSyncFile(wsPath, normalizedRelativePath);
  if (!preview) {
    return {
      success: false,
      error: 'relative_path must reference an existing .github agent or instruction file under the workspace root',
    };
  }

  if (params.expected_kind && preview.kind !== params.expected_kind) {
    return {
      success: false,
      error: `expected_kind=${params.expected_kind} does not match detected file kind ${preview.kind}`,
    };
  }

  const policyRejection = getImportPolicyRejection(preview.entry);
  if (policyRejection) {
    return { success: false, error: policyRejection };
  }

  if (preview.entry.status !== 'import_candidate') {
    return { success: false, error: buildImportContextFileError(preview.entry) };
  }

  if (!params.confirm) {
    return {
      success: true,
      data: {
        action: 'import_context_file',
        data: {
          workspace_id: validated.workspace_id,
          relative_path: preview.relative_path,
          kind: preview.kind,
          imported: false,
          previous_status: preview.entry.status,
          current_status: preview.entry.status,
          preview: preview.entry,
          message: 'Preview only. Re-run with confirm=true to import this manual-import candidate into the DB.',
        },
      },
    };
  }

  if (preview.kind === 'agent') {
    storeAgent(preview.local.canonical_name, preview.local.content, {
      metadata: {
        source: 'manual_import',
        workspace_id: validated.workspace_id,
        workspace_relative_path: preview.relative_path,
        canonical_filename: preview.local.canonical_filename,
        imported_at: new Date().toISOString(),
      },
    });
  } else {
    storeInstruction(
      preview.local.canonical_filename,
      extractInstructionApplyTo(preview.local.content),
      preview.local.content,
    );
  }

  const refreshed = inspectWorkspaceSyncFile(wsPath, normalizedRelativePath);
  const currentEntry = refreshed?.entry ?? preview.entry;

  return {
    success: true,
    data: {
      action: 'import_context_file',
      data: {
        workspace_id: validated.workspace_id,
        relative_path: preview.relative_path,
        kind: preview.kind,
        imported: true,
        previous_status: preview.entry.status,
        current_status: currentEntry.status,
        preview: currentEntry,
        message: 'Imported the manual-import candidate into the DB. Passive sync checks remain read-only.',
      },
    },
  };
}

// Helper: generate a focused .code-workspace file scoped to a plan's directories
async function handleGenerateFocusedWorkspace(
  params: MemoryWorkspaceParams
): Promise<ToolResponse<WorkspaceResult>> {
  if (!params.workspace_id) {
    return { success: false, error: 'workspace_id is required for action: generate_focused_workspace' };
  }
  if (!params.plan_id) {
    return { success: false, error: 'plan_id is required for action: generate_focused_workspace' };
  }

  const validated = await validateAndResolveWorkspaceId(params.workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<WorkspaceResult>;
  const workspaceId = validated.workspace_id;

  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    return { success: false, error: `Workspace not found: ${workspaceId}` };
  }
  const workspacePath = workspace.workspace_path || workspace.path;
  if (!workspacePath) {
    return { success: false, error: `Workspace has no filesystem path: ${workspaceId}` };
  }

  const planId = params.plan_id;

  // Build folders array: resolve relative paths to absolute
  const folders = (params.directories_allowed ?? []).map(dir =>
    path.isAbsolute(dir) ? dir : path.join(workspacePath, dir)
  );

  // Build workspace JSON
  const workspaceJson: Record<string, unknown> = {
    folders: folders.map(f => ({ path: f })),
    settings: {
      'files.watcherExclude': {
        '**': true,
        ...Object.fromEntries(folders.map(f => [`${f}/**`, false]))
      },
      'search.exclude': { '**': true }
    }
  };

  // Optional base workspace merge
  if (params.base_workspace_path) {
    try {
      const baseContent = fs.readFileSync(params.base_workspace_path, 'utf-8');
      const baseJson = JSON.parse(baseContent) as Record<string, unknown>;
      // Plan folders replace base folders entirely; plan settings win on conflict
      workspaceJson.settings = Object.assign(
        {},
        (baseJson.settings as Record<string, unknown>) ?? {},
        workspaceJson.settings as Record<string, unknown>
      );
    } catch (err) {
      return { success: false, error: `Failed to read base_workspace_path: ${(err as Error).message}` };
    }
  }

  // Compute output path and write file
  const outputPath = getFocusedWorkspacePath(workspacePath, planId, params.output_filename);
  fs.mkdirSync(getFocusedWorkspacesDir(workspacePath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(workspaceJson, null, 2));

  // Note: upsertSessionRegistry not present in this file — session_id param accepted but registry update skipped

  const filesInScope = [
    ...(params.directories_allowed ?? []),
    ...(params.files_allowed ?? [])
  ];

  // Emit workspace_scope_changed event
  await events.workspaceScopeChanged(workspaceId, planId, {
    workspace_id: workspaceId,
    plan_id: planId,
    file_path: outputPath,
    files_in_scope: filesInScope,
  });

  return {
    success: true,
    data: {
      action: 'generate_focused_workspace',
      data: { file_path: outputPath, files_in_scope: filesInScope }
    }
  };
}

// Helper: list all focused .code-workspace files for a workspace
async function handleListFocusedWorkspaces(
  params: MemoryWorkspaceParams
): Promise<ToolResponse<WorkspaceResult>> {
  if (!params.workspace_id) {
    return { success: false, error: 'workspace_id is required for action: list_focused_workspaces' };
  }

  const validated = await validateAndResolveWorkspaceId(params.workspace_id);
  if (!validated.success) return validated.error_response as ToolResponse<WorkspaceResult>;
  const workspaceId = validated.workspace_id;

  const workspace = await store.getWorkspace(workspaceId);
  if (!workspace) {
    return { success: false, error: `Workspace not found: ${workspaceId}` };
  }
  const workspacePath = workspace.workspace_path || workspace.path;
  if (!workspacePath) {
    return { success: false, error: `Workspace has no filesystem path: ${workspaceId}` };
  }

  const dir = getFocusedWorkspacesDir(workspacePath);
  if (!fs.existsSync(dir)) {
    return { success: true, data: { action: 'list_focused_workspaces', data: { workspaces: [] } } };
  }

  let files = fs.readdirSync(dir).filter(f => f.endsWith('.code-workspace'));
  if (params.plan_id) {
    files = files.filter(f => f.startsWith(`plan-${params.plan_id}`));
  }

  const extractPlanId = (f: string) => f.match(/^plan-(.+)\.code-workspace$/)?.[1] ?? '';

  return {
    success: true,
    data: {
      action: 'list_focused_workspaces',
      data: {
        workspaces: files.map(f => ({
          filename: f,
          file_path: path.join(dir, f),
          plan_id: extractPlanId(f)
        }))
      }
    }
  };
}

// ---------------------------------------------------------------------------
// CLI MCP config injection helpers
// ---------------------------------------------------------------------------

const CLI_MCP_ENTRY_KEY = 'project-memory-cli';

/**
 * Resolve the CLI MCP port from params, env var, or default.
 */
function resolveCliMcpPort(override?: number): number {
  if (override && override > 0 && override < 65536) return override;
  const fromEnv = parseInt(process.env.PM_CLI_MCP_PORT ?? '', 10);
  if (!isNaN(fromEnv) && fromEnv > 0 && fromEnv < 65536) return fromEnv;
  return 3466;
}

/**
 * Write or update `.mcp.json` at the workspace root so that Claude Code
 * agents running inside that workspace automatically discover the CLI MCP
 * server.  Existing entries in the file are preserved — only the
 * `project-memory-cli` key is touched.
 *
 * @returns `'written'` (new file), `'updated'` (key added/port changed),
 *          or `'skipped'` (entry already correct).
 */
async function injectCliMcpConfig(
  workspacePath: string,
  port: number,
): Promise<'written' | 'updated' | 'skipped'> {
  const mcpJsonPath = path.join(workspacePath, '.mcp.json');
  const targetUrl = `http://127.0.0.1:${port}/mcp`;

  let existing: Record<string, unknown> = {};
  let fileExisted = false;

  try {
    const raw = await fs.promises.readFile(mcpJsonPath, 'utf-8');
    existing = JSON.parse(raw) as Record<string, unknown>;
    fileExisted = true;
  } catch {
    // File absent or malformed — treat as empty
  }

  const servers = (existing.mcpServers ?? {}) as Record<string, unknown>;
  const entry = servers[CLI_MCP_ENTRY_KEY] as { url?: string } | undefined;

  if (entry?.url === targetUrl) {
    return 'skipped'; // Already correct
  }

  servers[CLI_MCP_ENTRY_KEY] = { type: 'http', url: targetUrl };
  existing.mcpServers = servers;

  await fs.promises.mkdir(workspacePath, { recursive: true });
  await fs.promises.writeFile(mcpJsonPath, JSON.stringify(existing, null, 2) + '\n', 'utf-8');

  return fileExisted ? 'updated' : 'written';
}

/**
 * Handle the `inject_cli_mcp` action.
 */
async function handleInjectCliMcp(
  params: MemoryWorkspaceParams,
): Promise<ToolResponse<WorkspaceResult>> {
  const port = resolveCliMcpPort(params.cli_mcp_port);

  type InjectionEntry = { workspace_id: string; workspace_path: string; status: 'written' | 'updated' | 'skipped' | 'error'; detail?: string };
  const results: InjectionEntry[] = [];

  // Collect target workspaces
  let targetWorkspaces: Array<{ id: string; path: string }> = [];

  if (params.all_workspaces) {
    const listResult = await workspaceTools.listWorkspaces();
    if (!listResult.success) {
      return { success: false, error: `Failed to list workspaces: ${listResult.error}` };
    }
    for (const ws of listResult.data ?? []) {
      const wsPath = ws.workspace_path || (ws as unknown as { path?: string }).path;
      if (wsPath) targetWorkspaces.push({ id: ws.workspace_id, path: wsPath });
    }
  } else {
    // Single workspace — resolve via workspace_id or workspace_path
    let wsId = params.workspace_id;
    let wsPath = params.workspace_path;
    if (wsId) {
      const validated = await validateAndResolveWorkspaceId(wsId);
      if (!validated.success) {
        return validated.error_response as ToolResponse<WorkspaceResult>;
      }
      wsId = validated.workspace_id;
      const ws = await store.getWorkspace(wsId);
      wsPath = ws?.workspace_path || (ws as unknown as { path?: string })?.path || wsPath;
    } else if (!wsPath) {
      return { success: false, error: 'workspace_id or workspace_path is required for inject_cli_mcp' };
    }
    if (!wsPath) {
      return { success: false, error: 'Workspace has no filesystem path' };
    }
    targetWorkspaces = [{ id: wsId ?? 'unknown', path: wsPath }];
  }

  if (targetWorkspaces.length === 0) {
    return { success: false, error: 'No workspaces found to inject CLI MCP config into' };
  }

  for (const { id, path: wsPath } of targetWorkspaces) {
    try {
      const status = await injectCliMcpConfig(wsPath, port);
      results.push({ workspace_id: id, workspace_path: wsPath, status });
    } catch (err) {
      results.push({
        workspace_id: id,
        workspace_path: wsPath,
        status: 'error',
        detail: (err as Error).message,
      });
    }
  }

  const written = results.filter(r => r.status === 'written').length;
  const updated = results.filter(r => r.status === 'updated').length;
  const skipped = results.filter(r => r.status === 'skipped').length;
  const errors  = results.filter(r => r.status === 'error').length;

  return {
    success: true,
    data: {
      action: 'inject_cli_mcp',
      data: { injected: results, total: results.length, written: written + updated, skipped, errors },
    },
  };
}

export async function memoryWorkspace(params: MemoryWorkspaceParams): Promise<ToolResponse<WorkspaceResult>> {
  const { action } = params;

  if (!action) {
    return {
      success: false,
      error: 'action is required. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate, link, set_display_name'
    };
  }

  // Preflight validation — catch missing required fields early
  if (action !== 'import_context_file') {
    const preflight = preflightValidate('memory_workspace', action, params as unknown as Record<string, unknown>);
    if (!preflight.valid) {
      return buildPreflightFailure('memory_workspace', action, preflight) as ToolResponse<WorkspaceResult>;
    }
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
      // Auto-inject CLI MCP config into the workspace so Claude Code agents
      // running inside it automatically discover the CLI MCP server.
      try {
        await injectCliMcpConfig(params.workspace_path, resolveCliMcpPort());
      } catch {
        // Non-fatal — workspace may be read-only or container-mounted
      }
      const context_health = checkWorkspaceContextHealth(params.workspace_path);
      return {
        success: true,
        data: { action: 'register', data: { ...result.data!, context_health } }
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
          data: {
            action: 'list',
            data: hierarchicalList,
          }
        };
      }

      return {
        success: true,
        data: {
          action: 'list',
          data: result.data!,
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

      const planSummaries: PlanInfoSummary[] = plans.map(p => ({
        plan_id: p.id,
        title: p.title,
        status: p.status,
        current_phase: p.current_phase,
        steps_done: p.steps.filter((s: { status: string }) => s.status === 'done').length,
        steps_total: p.steps.length,
        last_updated: p.updated_at,
      }));
      return {
        success: true,
        data: {
          action: 'info',
          data: {
            workspace,
            plans: planSummaries,
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

    case 'generate_focused_workspace':
      return await handleGenerateFocusedWorkspace(params);
    case 'list_focused_workspaces':
      return await handleListFocusedWorkspaces(params);
    case 'import_context_file':
      return await handleImportContextFile(params);
    case 'check_context_sync': {
      const wsId = params.workspace_id;
      if (!wsId) {
        return { success: false, error: 'workspace_id is required for action: check_context_sync' };
      }
      const validated = await validateAndResolveWorkspaceId(wsId);
      if (!validated.success) return validated.error_response as ToolResponse<WorkspaceResult>;
      const workspace = await store.getWorkspace(validated.workspace_id);
      if (!workspace) {
        return { success: false, error: `Workspace not found: ${validated.workspace_id}` };
      }
      const wsPath = workspace.workspace_path || (workspace as unknown as { path?: string }).path;
      if (!wsPath) {
        return { success: false, error: `Workspace has no filesystem path: ${validated.workspace_id}` };
      }
      const report = checkWorkspaceDbSync(wsPath, validated.workspace_id);
      return { success: true, data: { action: 'check_context_sync', data: report } };
    }
    case 'inject_cli_mcp':
      return await handleInjectCliMcp(params);

    default:
      return {
        success: false,
        error: `Unknown action: ${action}. Valid actions: register, list, info, reindex, merge, scan_ghosts, migrate, link, set_display_name, export_pending, generate_focused_workspace, list_focused_workspaces, check_context_sync, import_context_file, inject_cli_mcp`
      };
  }
}
