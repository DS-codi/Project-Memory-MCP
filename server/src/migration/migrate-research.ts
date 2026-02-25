/**
 * migration/migrate-research.ts — Phase 5: Research Notes Migration
 *
 * For each plan with a research_notes/ directory, reads all .md files
 * and inserts them into the `research_documents` table.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { run, queryOne } from '../db/query-helpers.js';
import type { ReportBuilder }   from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateResearch(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 5: Research Notes Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const wsId     = path.basename(wsDir);
    const plansDir = path.join(wsDir, 'plans');
    if (!fs.existsSync(plansDir)) continue;

    const planDirs = collectPlanDirs(plansDir);

    for (const { planDirPath, planId } of planDirs) {
      migrateResearchNotes(planDirPath, planId, wsId, report, dryRun);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-plan research notes
// ---------------------------------------------------------------------------

function migrateResearchNotes(
  planDirPath: string,
  planId:      string,
  wsId:        string,
  report:      ReportBuilder,
  dryRun:      boolean
): void {
  const researchDir = path.join(planDirPath, 'research_notes');
  if (!fs.existsSync(researchDir)) return;

  const files = fs.readdirSync(researchDir)
    .filter(f => f.endsWith('.md') || f.endsWith('.txt'));

  for (const filename of files) {
    const filePath = path.join(researchDir, filename);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      report.error(filePath, `read error: ${(err as Error).message}`);
      continue;
    }

    // Derive created_at from file mtime
    let createdAt: string;
    try {
      createdAt = new Date(fs.statSync(filePath).mtime).toISOString();
    } catch {
      createdAt = new Date().toISOString();
    }

    if (!dryRun) {
      try {
        upsertResearchDoc(planId, wsId, filename, content, createdAt);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('research_documents');
  }
}

// ---------------------------------------------------------------------------
// DB helper
// ---------------------------------------------------------------------------

function upsertResearchDoc(
  planId:    string,
  wsId:      string,
  filename:  string,
  content:   string,
  createdAt: string
): void {
  const existing = queryOne<{ id: number }>(
    `SELECT id FROM research_documents
     WHERE workspace_id = ? AND parent_type = 'plan' AND parent_id = ? AND filename = ?`,
    [wsId, planId, filename]
  );

  if (existing) {
    run(
      'UPDATE research_documents SET content = ?, updated_at = ? WHERE id = ?',
      [content, new Date().toISOString(), existing.id]
    );
  } else {
    run(
      `INSERT INTO research_documents
         (workspace_id, parent_type, parent_id, filename, content, created_at, updated_at)
       VALUES (?, 'plan', ?, ?, ?, ?, ?)`,
      [wsId, planId, filename, content, createdAt, createdAt]
    );
  }
}

// Inline since we can't import newId without triggering the db singleton
function await_newId(): { newId: () => string } {
  const { newId } = require('../db/query-helpers.js') as { newId: () => string };
  return { newId };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

interface PlanDirEntry {
  planDirPath: string;
  planId:      string;
}

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
