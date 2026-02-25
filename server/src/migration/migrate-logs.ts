/**
 * migration/migrate-logs.ts — Phase 8b: Update Log Migration
 *
 * Migrates legacy workspace update-log entries from `workspace.context.json`
 * into the `update_log` table.
 *
 * Legacy storage layout:
 *   data/{workspace_id}/workspace.context.json
 *     → { ..., update_log: [ { timestamp, action, data? }, ... ] }
 *
 * Also handles a flat `update_log.json` file at:
 *   data/{workspace_id}/update_log.json
 *     → [ { timestamp, action, data? }, ... ]
 *
 * Errors during individual-entry insertion are non-fatal; they are recorded in
 * the report and the migration continues.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { run, queryOne }      from '../db/query-helpers.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateLogs(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 8b: Update Log Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  if (workspaceDirs.length === 0) {
    report.skip('data/', 'no workspace directories found');
    return;
  }

  for (const { dir, workspaceId } of workspaceDirs) {
    migrateWorkspaceLogs(dir, workspaceId, report, dryRun);
  }
}

// ---------------------------------------------------------------------------
// Per-workspace migration
// ---------------------------------------------------------------------------

function migrateWorkspaceLogs(
  wsDir:       string,
  workspaceId: string,
  report:      ReportBuilder,
  dryRun:      boolean
): void {
  const entries = collectUpdateLogEntries(wsDir, workspaceId, report);

  for (const entry of entries) {
    // Deduplicate: skip if a row with the same (workspace_id, timestamp, action) exists
    const existing = queryOne<{ id: number }>(
      `SELECT id FROM update_log WHERE workspace_id = ? AND timestamp = ? AND action = ?`,
      [workspaceId, entry.timestamp, entry.action]
    );
    if (existing) {
      report.skip(
        `update_log@${workspaceId}:${entry.timestamp}`,
        'duplicate — already in DB'
      );
      continue;
    }

    if (!dryRun) {
      try {
        run(
          `INSERT INTO update_log (workspace_id, timestamp, action, data)
           VALUES (?, ?, ?, ?)`,
          [
            workspaceId,
            entry.timestamp,
            entry.action,
            entry.data != null ? JSON.stringify(entry.data) : null,
          ]
        );
      } catch (err) {
        report.error(
          `update_log@${workspaceId}`,
          `DB insert failed: ${(err as Error).message}`
        );
        continue;
      }
    }

    report.increment('update_log_entries');
  }
}

// ---------------------------------------------------------------------------
// Collect entries from legacy files
// ---------------------------------------------------------------------------

interface UpdateLogEntry {
  timestamp: string;
  action:    string;
  data?:     object | null;
}

function collectUpdateLogEntries(
  wsDir:       string,
  workspaceId: string,
  report:      ReportBuilder
): UpdateLogEntry[] {
  const results: UpdateLogEntry[] = [];

  // ── Option 1: workspace.context.json → .update_log array ──────────────────
  const contextPath = path.join(wsDir, 'workspace.context.json');
  if (fs.existsSync(contextPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(contextPath, 'utf-8')) as Record<string, unknown>;
      const logArray = raw['update_log'];
      if (Array.isArray(logArray)) {
        for (const item of logArray) {
          const entry = normaliseEntry(item);
          if (entry) results.push(entry);
        }
      }
    } catch (err) {
      report.error(
        `${workspaceId}/workspace.context.json`,
        `parse error: ${(err as Error).message}`
      );
    }
  }

  // ── Option 2: dedicated update_log.json ───────────────────────────────────
  const dedicatedPath = path.join(wsDir, 'update_log.json');
  if (fs.existsSync(dedicatedPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(dedicatedPath, 'utf-8')) as unknown;
      if (Array.isArray(raw)) {
        for (const item of raw as unknown[]) {
          const entry = normaliseEntry(item);
          if (entry) results.push(entry);
        }
      }
    } catch (err) {
      report.error(
        `${workspaceId}/update_log.json`,
        `parse error: ${(err as Error).message}`
      );
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Normalise a loosely-typed legacy entry into a clean UpdateLogEntry
// ---------------------------------------------------------------------------

function normaliseEntry(item: unknown): UpdateLogEntry | null {
  if (item === null || typeof item !== 'object') return null;
  const obj = item as Record<string, unknown>;

  const timestamp = typeof obj['timestamp'] === 'string'
    ? obj['timestamp']
    : new Date().toISOString().replace('T', ' ').replace(/\.\d+Z$/, '');

  const action = typeof obj['action'] === 'string'
    ? obj['action']
    : 'legacy_log_entry';

  const data = obj['data'] != null && typeof obj['data'] === 'object'
    ? (obj['data'] as object)
    : null;

  return { timestamp, action, data };
}

// ---------------------------------------------------------------------------
// Workspace directory discovery
// ---------------------------------------------------------------------------

interface WsDirEntry { dir: string; workspaceId: string; }

function getWorkspaceDirs(dataRoot: string): WsDirEntry[] {
  if (!fs.existsSync(dataRoot)) return [];

  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => ({ dir: path.join(dataRoot, d.name), workspaceId: d.name }))
    .filter(({ dir }) => fs.existsSync(path.join(dir, 'workspace.meta.json')));
}
