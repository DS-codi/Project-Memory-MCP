/**
 * migration/migrate-workspaces.ts — Phase 2: Workspace Migration
 *
 * Reads workspace-registry.json and all workspace.meta.json files from the
 * data root, then inserts rows into `workspaces`, `context_items`, and
 * `update_log`.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { getDb }          from '../db/connection.js';
import { run, queryOne }  from '../db/query-helpers.js';
import { storeContext }   from '../db/context-db.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Well-known test stubs that should be skipped
// ---------------------------------------------------------------------------

const SKIP_WORKSPACE_IDS = new Set([
  'ws_nonexistent',
  'ws_test_buildscripts_123',
]);

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function migrateWorkspaces(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 2: Workspace Migration');

  const registryPath = path.join(dataRoot, 'workspace-registry.json');
  const registry = readRegistry(registryPath);

  // Build a set of known workspace IDs from the registry (path → id map).
  const registryIdByPath = new Map<string, string>(
    Object.entries(registry.entries ?? {}).map(([p, id]) => [normalizePath(p), id as string])
  );

  // Iterates over all subdirectories in data root that contain workspace.meta.json
  const dirs = fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  for (const dir of dirs) {
    const wsId = dir;

    if (SKIP_WORKSPACE_IDS.has(wsId)) {
      report.skip(dir, 'test stub workspace');
      continue;
    }

    const metaPath = path.join(dataRoot, dir, 'workspace.meta.json');
    if (!fs.existsSync(metaPath)) {
      // Not a workspace dir (e.g., events/, logs/)
      report.skip(dir, 'no workspace.meta.json');
      continue;
    }

    let meta: WorkspaceMeta;
    try {
      meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8')) as WorkspaceMeta;
    } catch (err) {
      report.error(metaPath, `corrupt JSON: ${(err as Error).message}`);
      continue;
    }

    // Determine if this workspace is in the registry or is a ghost
    const normalizedWsPath = normalizePath(meta.path ?? meta.workspace_path ?? '');
    const registryId       = registryIdByPath.get(normalizedWsPath);
    const isGhost          = !registryId;

    if (!dryRun) {
      upsertWorkspace(wsId, meta, isGhost);
    }

    if (isGhost) {
      report.increment('workspaces_ghost');
    } else {
      report.increment('workspaces_registered');
    }

    // Migrate legacy_workspace_ids as alias metadata
    if (!dryRun && meta.legacy_workspace_ids?.length) {
      upsertWorkspaceLegacyAliases(wsId, meta.legacy_workspace_ids);
      report.increment('workspace_aliases', meta.legacy_workspace_ids.length);
    }

    // Migrate workspace.context.json → context_items + update_log
    const contextPath = path.join(dataRoot, dir, 'workspace.context.json');
    if (fs.existsSync(contextPath)) {
      try {
        const ctx = JSON.parse(fs.readFileSync(contextPath, 'utf-8')) as WorkspaceContext;
        if (!dryRun) {
          migrateWorkspaceContext(wsId, ctx, report);
        } else {
          // Count what we would migrate
          const sectionCount = Object.keys(ctx.sections ?? {}).length;
          const logCount     = ctx.update_log?.entries?.length ?? 0;
          report.increment('context_sections', sectionCount);
          report.increment('update_log_entries', logCount);
        }
      } catch (err) {
        report.error(contextPath, `corrupt JSON: ${(err as Error).message}`);
      }
    }

    // Migrate terminal-allowlist.json → context_item
    const allowlistPath = path.join(dataRoot, dir, 'terminal-allowlist.json');
    if (fs.existsSync(allowlistPath)) {
      try {
        const allowlist = JSON.parse(fs.readFileSync(allowlistPath, 'utf-8')) as object;
        if (!dryRun) {
          storeContext('workspace', wsId, 'terminal_allowlist', allowlist);
        }
        report.increment('terminal_allowlists');
      } catch (err) {
        report.error(allowlistPath, `corrupt JSON: ${(err as Error).message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace upsert
// ---------------------------------------------------------------------------

function upsertWorkspace(wsId: string, meta: WorkspaceMeta, isGhost: boolean): void {
  const db = getDb();

  // Check if workspace already exists (idempotent)
  const existing = queryOne<{ id: string }>('SELECT id FROM workspaces WHERE id = ?', [wsId]);

  const profile = meta.profile ? JSON.stringify(meta.profile) : null;
  const metaObj = buildWorkspaceMetaObject(meta, isGhost);
  const metaJson = JSON.stringify(metaObj);

  const wsPath = meta.path ?? meta.workspace_path ?? '';
  const name   = meta.name ?? wsId;

  const createdAt     = meta.created_at     ?? meta.registered_at ?? new Date().toISOString();
  const updatedAt     = meta.updated_at     ?? createdAt;
  const registeredAt  = meta.registered_at  ?? createdAt;

  if (existing) {
    run(
      `UPDATE workspaces
       SET path = ?, name = ?, profile = ?, meta = ?, registered_at = ?, updated_at = ?
       WHERE id = ?`,
      [wsPath, name, profile, metaJson, registeredAt, updatedAt, wsId]
    );
  } else {
    run(
      `INSERT INTO workspaces (id, path, name, parent_workspace_id, profile, meta, registered_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [wsId, wsPath, name, null, profile, metaJson, registeredAt, updatedAt]
    );
  }
}

function buildWorkspaceMetaObject(meta: WorkspaceMeta, isGhost: boolean): object {
  return {
    display_name:          meta.name,
    schema_version:        meta.schema_version,
    last_accessed:         meta.last_accessed,
    last_seen_at:          meta.last_seen_at,
    indexed:               meta.indexed ?? false,
    legacy_workspace_ids:  meta.legacy_workspace_ids ?? [],
    data_root:             meta.data_root,
    is_ghost:              isGhost,
  };
}

function upsertWorkspaceLegacyAliases(wsId: string, legacyIds: string[]): void {
  const db = getDb();
  for (const legacyId of legacyIds) {
    // Store as a context item so the server lookup can resolve old→new
    const existing = queryOne<{ id: string }>(
      `SELECT id FROM context_items
       WHERE parent_type = 'workspace' AND parent_id = ? AND type = 'legacy_alias_source'
         AND json_extract(data, '$.legacy_id') = ?`,
      [wsId, legacyId]
    );
    if (!existing) {
      storeContext('workspace', wsId, 'legacy_alias_source', { legacy_id: legacyId, canonical_id: wsId });
    }
  }
}

// ---------------------------------------------------------------------------
// Workspace context migration
// ---------------------------------------------------------------------------

function migrateWorkspaceContext(wsId: string, ctx: WorkspaceContext, report: ReportBuilder): void {
  // Migrate each section as a typed context item
  for (const [sectionKey, sectionData] of Object.entries(ctx.sections ?? {})) {
    try {
      storeContext('workspace', wsId, sectionKey, sectionData as object);
      report.increment('context_sections');
    } catch (err) {
      report.error(`workspace/${wsId}/section/${sectionKey}`, (err as Error).message);
    }
  }

  // Migrate update_log entries
  const entries = ctx.update_log?.entries ?? [];
  let logCount = 0;
  for (const entry of entries) {
    try {
      run(
        `INSERT INTO update_log (workspace_id, timestamp, action, data)
         VALUES (?, ?, ?, ?)
         ON CONFLICT DO NOTHING`,
        [
          wsId,
          entry.timestamp ?? new Date().toISOString(),
          entry.action    ?? 'unknown',
          entry.data      ? JSON.stringify(entry.data) : null,
        ]
      );
      logCount++;
    } catch (err) {
      report.error(`workspace/${wsId}/update_log`, (err as Error).message);
    }
  }
  if (logCount > 0) report.increment('update_log_entries', logCount);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePath(p: string): string {
  return p.toLowerCase().replace(/\\/g, '/').replace(/\/$/, '');
}

function readRegistry(registryPath: string): WorkspaceRegistry {
  if (!fs.existsSync(registryPath)) return { entries: {} };
  try {
    return JSON.parse(fs.readFileSync(registryPath, 'utf-8')) as WorkspaceRegistry;
  } catch {
    return { entries: {} };
  }
}

// ---------------------------------------------------------------------------
// Loose types for the file shapes
// ---------------------------------------------------------------------------

interface WorkspaceRegistry {
  schema_version?: string;
  entries:         Record<string, string>;
  updated_at?:     string;
}

interface WorkspaceMeta {
  schema_version?:      string;
  workspace_id?:        string;
  workspace_path?:      string;
  path?:                string;
  name?:                string;
  created_at?:          string;
  updated_at?:          string;
  registered_at?:       string;
  last_accessed?:       string;
  last_seen_at?:        string;
  data_root?:           string;
  indexed?:             boolean;
  profile?:             object;
  legacy_workspace_ids?: string[];
  active_plans?:        string[];
  archived_plans?:      string[];
}

interface WorkspaceContext {
  sections?:   Record<string, unknown>;
  update_log?: {
    entries?: Array<{
      timestamp?: string;
      action?:    string;
      data?:      unknown;
    }>;
  };
}
