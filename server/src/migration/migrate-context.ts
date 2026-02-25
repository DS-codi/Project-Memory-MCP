/**
 * migration/migrate-context.ts — Phase 4: Per-plan Context File Migration
 *
 * For each plan directory, reads known context JSON files and inserts them
 * as rows in the `context_items` table with parent_type='plan'.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { storeContext }       from '../db/context-db.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Mapping: filename → context type key
// ---------------------------------------------------------------------------

const FILE_TO_TYPE: Record<string, string> = {
  'original_request.json':    'original_request',
  'research.json':            'research_findings',
  'architecture.json':        'architecture',
  'review.json':              'review_findings',
  'execution_log.json':       'execution_log',
  'test_context.json':        'test_context',
  'test_plan.json':           'test_plan',
  'test_results.json':        'test_results',
  'discovery.json':           'discovery',
  'pivot.json':               'pivot',
  'build_failure_analysis.json': 'build_failure_analysis',
  'active_run_lane.json':     'active_run_lane',
  'stale_run_recovery.json':  'stale_run_recovery',
};

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateContext(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 4: Context File Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const plansDir = path.join(wsDir, 'plans');
    if (!fs.existsSync(plansDir)) continue;

    // Active + archived plan directories
    const planDirs = collectPlanDirs(plansDir);

    for (const { planDirPath, planId } of planDirs) {
      migrateContextFiles(planDirPath, planId, report, dryRun);
    }
  }
}

// ---------------------------------------------------------------------------
// Per-plan context file migration
// ---------------------------------------------------------------------------

function migrateContextFiles(
  planDirPath: string,
  planId:      string,
  report:      ReportBuilder,
  dryRun:      boolean
): void {
  // Known context files
  for (const [filename, contextType] of Object.entries(FILE_TO_TYPE)) {
    const filePath = path.join(planDirPath, filename);
    if (!fs.existsSync(filePath)) continue;

    let data: object;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as object;
    } catch (err) {
      report.error(filePath, `corrupt JSON: ${(err as Error).message}`);
      continue;
    }

    if (!dryRun) {
      try {
        storeContext('plan', planId, contextType, data);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('context_items');
  }

  // Handoff records: handoff_*.json
  const handoffFiles = fs.readdirSync(planDirPath)
    .filter(f => f.startsWith('handoff_') && f.endsWith('.json'));

  for (const filename of handoffFiles) {
    const filePath = path.join(planDirPath, filename);
    let data: object;
    try {
      data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as object;
    } catch (err) {
      report.error(filePath, `corrupt JSON: ${(err as Error).message}`);
      continue;
    }

    if (!dryRun) {
      try {
        storeContext('plan', planId, 'handoff_record', data);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('handoff_records');
  }
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
      // Recurse into _archived/
      const archivedDir = path.join(plansDir, '_archived');
      if (fs.existsSync(archivedDir)) {
        const archivedEntries = fs.readdirSync(archivedDir, { withFileTypes: true })
          .filter(d => d.isDirectory());
        for (const ae of archivedEntries) {
          const planDirPath = path.join(archivedDir, ae.name);
          const statePath   = path.join(planDirPath, 'state.json');
          if (fs.existsSync(statePath)) {
            results.push({ planDirPath, planId: ae.name });
          }
        }
      }
    } else {
      const planDirPath = path.join(plansDir, entry.name);
      const statePath   = path.join(planDirPath, 'state.json');
      if (fs.existsSync(statePath)) {
        results.push({ planDirPath, planId: entry.name });
      }
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
