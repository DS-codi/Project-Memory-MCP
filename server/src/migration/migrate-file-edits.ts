/**
 * migration/migrate-file-edits.ts — Phase 8: File-Edit History Migration
 *
 * Best-effort scrape of file-change history from existing plan context data.
 *
 * Sources (in order of preference):
 *   1. execution_log.json context files  — files_created, files_modified, artifacts
 *   2. agent session artifacts arrays    — from state.json.agent_sessions[].artifacts
 *   3. lineage entries data              — data.files_modified
 *
 * All rows are inserted with step_id = null and notes = 'v1_migrated_best_effort'.
 * Duplicate (workspace_id, plan_id, file_path) pairs within a run are deduplicated
 * in-memory (step_file_edits has no UNIQUE constraint).
 *
 * Errors are non-fatal; a single plan failure does not abort the overall run.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { run }              from '../db/query-helpers.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateFileEdits(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 11: File-Edit History Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const wsId     = path.basename(wsDir);
    const plansDir = path.join(wsDir, 'plans');
    if (!fs.existsSync(plansDir)) continue;

    for (const { planDirPath, planId } of collectPlanDirs(plansDir)) {
      try {
        extractAndInsert(planDirPath, planId, wsId, report, dryRun);
      } catch (err) {
        report.error(planDirPath, `file-edits migration failed: ${(err as Error).message}`);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Per-plan extraction
// ---------------------------------------------------------------------------

function extractAndInsert(
  planDirPath: string,
  planId:      string,
  wsId:        string,
  report:      ReportBuilder,
  dryRun:      boolean
): void {
  const filePaths = new Set<string>();

  // ── Source 1: execution_log context file ─────────────────────────────
  const execLogPath = path.join(planDirPath, 'execution_log.json');
  if (fs.existsSync(execLogPath)) {
    try {
      const raw = JSON.parse(fs.readFileSync(execLogPath, 'utf-8')) as ExecutionLog;
      extractFromExecutionLog(raw, filePaths);
    } catch {
      // skip corrupt context files silently
    }
  }

  // ── Source 2: agent session artifacts from state.json ────────────────
  const statePath = path.join(planDirPath, 'state.json');
  if (fs.existsSync(statePath)) {
    try {
      const state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as PlanStateLike;
      extractFromSessions(state, filePaths);
      extractFromLineage(state, filePaths);
    } catch {
      // skip corrupt state files silently
    }
  }

  if (filePaths.size === 0) return;

  const editedAt = new Date().toISOString();

  for (const filePath of filePaths) {
    if (!dryRun) {
      run(
        `INSERT INTO step_file_edits
           (workspace_id, plan_id, step_id, file_path, change_type, edited_at, notes)
         VALUES (?, ?, NULL, ?, 'edit', ?, 'v1_migrated_best_effort')`,
        [wsId, planId, filePath, editedAt]
      );
    }
    report.increment('file_edits_migrated');
  }
}

// ---------------------------------------------------------------------------
// Extraction helpers
// ---------------------------------------------------------------------------

function extractFromExecutionLog(log: ExecutionLog, out: Set<string>): void {
  const addAll = (arr: unknown): void => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (typeof item === 'string' && item.trim()) out.add(item.trim());
    }
  };
  addAll(log.files_created);
  addAll(log.files_modified);
  addAll(log.artifacts);
  // Some logs nest under a 'data' key
  if (log.data) {
    addAll(log.data.files_created);
    addAll(log.data.files_modified);
    addAll(log.data.artifacts);
  }
}

function extractFromSessions(state: PlanStateLike, out: Set<string>): void {
  for (const sess of state.agent_sessions ?? []) {
    for (const artifact of sess.artifacts ?? []) {
      if (typeof artifact === 'string' && artifact.trim()) {
        out.add(artifact.trim());
      }
    }
    // Some sessions store artifacts in context.files_modified etc.
    if (sess.context) {
      const ctx = sess.context as Record<string, unknown>;
      extractStringArray(ctx.files_created, out);
      extractStringArray(ctx.files_modified, out);
      extractStringArray(ctx.artifacts, out);
    }
  }
}

function extractFromLineage(state: PlanStateLike, out: Set<string>): void {
  for (const entry of state.lineage ?? []) {
    if (entry.data) {
      extractStringArray((entry.data as Record<string, unknown>).files_modified, out);
      extractStringArray((entry.data as Record<string, unknown>).artifacts, out);
    }
  }
}

function extractStringArray(val: unknown, out: Set<string>): void {
  if (!Array.isArray(val)) return;
  for (const item of val) {
    if (typeof item === 'string' && item.trim()) out.add(item.trim());
  }
}

// ---------------------------------------------------------------------------
// Loose types (only fields we actually read)
// ---------------------------------------------------------------------------

interface ExecutionLog {
  files_created?:  unknown[];
  files_modified?: unknown[];
  artifacts?:      unknown[];
  data?: {
    files_created?:  unknown[];
    files_modified?: unknown[];
    artifacts?:      unknown[];
  };
}

interface PlanStateLike {
  agent_sessions?: Array<{
    artifacts?: unknown[];
    context?:   unknown;
  }>;
  lineage?: Array<{
    data?: unknown;
  }>;
}

// ---------------------------------------------------------------------------
// Filesystem helpers
// ---------------------------------------------------------------------------

interface PlanDirEntry { planDirPath: string; planId: string; }

function collectPlanDirs(plansDir: string): PlanDirEntry[] {
  const results: PlanDirEntry[] = [];
  const entries = fs.readdirSync(plansDir, { withFileTypes: true })
    .filter(d => d.isDirectory());

  for (const entry of entries) {
    if (entry.name === '_archived') {
      const archivedDir = path.join(plansDir, '_archived');
      if (fs.existsSync(archivedDir)) {
        fs.readdirSync(archivedDir, { withFileTypes: true })
          .filter(d => d.isDirectory())
          .forEach(ae => {
            results.push({ planDirPath: path.join(archivedDir, ae.name), planId: ae.name });
          });
      }
    } else {
      results.push({ planDirPath: path.join(plansDir, entry.name), planId: entry.name });
    }
  }
  return results;
}

function getWorkspaceDirs(dataRoot: string): string[] {
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'workspace.meta.json')));
}
