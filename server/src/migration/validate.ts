/**
 * migration/validate.ts — Phase 10: Post-Migration Validation
 *
 * Performs referential-integrity checks and count comparisons between
 * the source data/ directory and the SQLite database.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { getDb }              from '../db/connection.js';
import { queryOne, queryAll } from '../db/query-helpers.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Validation report types
// ---------------------------------------------------------------------------

export interface CountCheck {
  entity:    string;
  onDisk:    number;
  inDb:      number;
  match:     boolean;
  delta:     number;
}

export interface IntegrityCheck {
  table:   string;
  column:  string;
  broken:  number;
  samples: string[];
}

export interface ValidationResult {
  passed:          boolean;
  countChecks:     CountCheck[];
  integrityErrors: IntegrityCheck[];
  spotChecks:      SpotCheckResult[];
}

export interface SpotCheckResult {
  planId: string;
  passed: boolean;
  notes:  string[];
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function runValidation(dataRoot: string, report: ReportBuilder): ValidationResult {
  report.beginPhase('Phase 10: Post-Migration Validation');

  const result: ValidationResult = {
    passed:          true,
    countChecks:     [],
    integrityErrors: [],
    spotChecks:      [],
  };

  // ── Count comparisons ────────────────────────────────────────────────────
  checkCounts(dataRoot, result, report);

  // ── Referential integrity ────────────────────────────────────────────────
  checkReferentialIntegrity(result, report);

  // ── Spot checks ──────────────────────────────────────────────────────────
  runSpotChecks(dataRoot, result, report);

  result.passed = result.integrityErrors.length === 0 &&
    result.countChecks.every(c => c.match || Math.abs(c.delta) <= 2);

  return result;
}

// ---------------------------------------------------------------------------
// Count comparisons
// ---------------------------------------------------------------------------

function checkCounts(dataRoot: string, result: ValidationResult, report: ReportBuilder): void {
  const db = getDb();

  // Workspaces
  const diskWs = countWorkspaceDirs(dataRoot);
  const dbWs   = scalar('SELECT COUNT(*) FROM workspaces');
  addCount(result, report, 'workspaces', diskWs, dbWs);

  // Plans (all workspaces combined)
  const diskPlans = countPlanDirs(dataRoot);
  const dbPlans   = scalar('SELECT COUNT(*) FROM plans');
  addCount(result, report, 'plans', diskPlans, dbPlans);

  // Steps
  const dbSteps = scalar('SELECT COUNT(*) FROM steps');
  report.increment('db_steps', dbSteps);

  // Sessions
  const dbSessions = scalar('SELECT COUNT(*) FROM sessions');
  report.increment('db_sessions', dbSessions);

  // Lineage
  const dbLineage = scalar('SELECT COUNT(*) FROM lineage');
  report.increment('db_lineage', dbLineage);

  // Programs
  const dbPrograms = scalar('SELECT COUNT(*) FROM programs');
  report.increment('db_programs', dbPrograms);

  // Knowledge
  const diskKnowledge = countKnowledgeFiles(dataRoot);
  const dbKnowledge   = scalar('SELECT COUNT(*) FROM knowledge');
  addCount(result, report, 'knowledge', diskKnowledge, dbKnowledge);

  // Events
  const dbEvents = scalar('SELECT COUNT(*) FROM event_log');
  report.increment('db_events', dbEvents);
}

function addCount(
  result:  ValidationResult,
  report:  ReportBuilder,
  entity:  string,
  onDisk:  number,
  inDb:    number
): void {
  const delta = inDb - onDisk;
  const match = Math.abs(delta) <= 2; // allow tiny drift for ghost/legacy items
  const check: CountCheck = { entity, onDisk, inDb, match, delta };
  result.countChecks.push(check);

  if (!match) {
    report.error(
      `count_check/${entity}`,
      `on-disk=${onDisk} vs db=${inDb} (delta=${delta > 0 ? '+' : ''}${delta})`
    );
  } else {
    report.increment(`count_ok_${entity}`);
  }
}

// ---------------------------------------------------------------------------
// Referential integrity
// ---------------------------------------------------------------------------

function checkReferentialIntegrity(result: ValidationResult, report: ReportBuilder): void {
  const checks: Array<{ label: string; sql: string; idCol: string }> = [
    {
      label: 'plans.workspace_id → workspaces',
      sql:   `SELECT p.id FROM plans p LEFT JOIN workspaces w ON w.id = p.workspace_id WHERE w.id IS NULL`,
      idCol: 'id',
    },
    {
      label: 'phases.plan_id → plans',
      sql:   `SELECT ph.id FROM phases ph LEFT JOIN plans p ON p.id = ph.plan_id WHERE p.id IS NULL`,
      idCol: 'id',
    },
    {
      label: 'steps.phase_id → phases',
      sql:   `SELECT s.id FROM steps s LEFT JOIN phases ph ON ph.id = s.phase_id WHERE ph.id IS NULL`,
      idCol: 'id',
    },
    {
      label: 'steps.plan_id → plans',
      sql:   `SELECT s.id FROM steps s LEFT JOIN plans p ON p.id = s.plan_id WHERE p.id IS NULL`,
      idCol: 'id',
    },
    {
      label: 'sessions.plan_id → plans',
      sql:   `SELECT s.id FROM sessions s LEFT JOIN plans p ON p.id = s.plan_id WHERE p.id IS NULL`,
      idCol: 'id',
    },
    {
      label: 'lineage.plan_id → plans',
      sql:   `SELECT l.id FROM lineage l LEFT JOIN plans p ON p.id = l.plan_id WHERE p.id IS NULL`,
      idCol: 'id',
    },
  ];

  for (const { label, sql, idCol } of checks) {
    try {
      const rows = queryAll<Record<string, string>>(sql);
      if (rows.length > 0) {
        const samples = rows.slice(0, 5).map(r => r[idCol] ?? '?');
        const check: IntegrityCheck = {
          table:   label,
          column:  idCol,
          broken:  rows.length,
          samples,
        };
        result.integrityErrors.push(check);
        report.error(`integrity/${label}`, `${rows.length} broken FK rows — samples: ${samples.join(', ')}`);
      } else {
        report.increment(`integrity_ok`);
      }
    } catch (err) {
      report.error(`integrity/${label}`, `query failed: ${(err as Error).message}`);
    }
  }
}

// ---------------------------------------------------------------------------
// Spot checks — compare 5 random plans against source JSON
// ---------------------------------------------------------------------------

function runSpotChecks(dataRoot: string, result: ValidationResult, report: ReportBuilder): void {
  // Pick up to 5 plan IDs from the DB
  const rows = queryAll<{ id: string; workspace_id: string }>(
    'SELECT id, workspace_id FROM plans ORDER BY RANDOM() LIMIT 5'
  );

  for (const row of rows) {
    const check = spotCheckPlan(dataRoot, row.id, row.workspace_id);
    result.spotChecks.push(check);
    if (!check.passed) {
      for (const note of check.notes) {
        report.error(`spot_check/${row.id}`, note);
      }
    } else {
      report.increment('spot_checks_passed');
    }
  }
}

function spotCheckPlan(dataRoot: string, planId: string, wsId: string): SpotCheckResult {
  const notes: string[] = [];

  // Find the state.json on disk
  const activePath   = path.join(dataRoot, wsId, 'plans', planId, 'state.json');
  const archivePath  = path.join(dataRoot, wsId, 'plans', '_archived', planId, 'state.json');
  const statePath    = fs.existsSync(activePath) ? activePath :
                       fs.existsSync(archivePath) ? archivePath : null;

  if (!statePath) {
    notes.push(`state.json not found on disk for plan ${planId}`);
    return { planId, passed: false, notes };
  }

  let state: SpotState;
  try {
    state = JSON.parse(fs.readFileSync(statePath, 'utf-8')) as SpotState;
  } catch {
    notes.push(`could not parse state.json`);
    return { planId, passed: false, notes };
  }

  // Compare step count
  const diskStepCount = state.steps?.length ?? 0;
  const dbStepCount   = scalar(`SELECT COUNT(*) FROM steps WHERE plan_id = '${planId}'`);
  if (diskStepCount !== dbStepCount) {
    notes.push(`step count mismatch: disk=${diskStepCount} db=${dbStepCount}`);
  }

  // Compare session count
  const diskSessCount = state.agent_sessions?.length ?? 0;
  const dbSessCount   = scalar(`SELECT COUNT(*) FROM sessions WHERE plan_id = '${planId}'`);
  if (diskSessCount !== dbSessCount) {
    notes.push(`session count mismatch: disk=${diskSessCount} db=${dbSessCount}`);
  }

  // Compare lineage count
  const diskLinCount  = state.lineage?.length ?? 0;
  const dbLinCount    = scalar(`SELECT COUNT(*) FROM lineage WHERE plan_id = '${planId}'`);
  if (diskLinCount !== dbLinCount) {
    notes.push(`lineage count mismatch: disk=${diskLinCount} db=${dbLinCount}`);
  }

  // Verify plan title matches
  const dbPlan = queryOne<{ title: string }>(`SELECT title FROM plans WHERE id = ?`, [planId]);
  if (dbPlan && state.title && dbPlan.title !== state.title) {
    notes.push(`title mismatch: disk="${state.title}" db="${dbPlan.title}"`);
  }

  return { planId, passed: notes.length === 0, notes };
}

// ---------------------------------------------------------------------------
// Result printing
// ---------------------------------------------------------------------------

export function printValidationResult(result: ValidationResult): void {
  console.log('\n' + '─'.repeat(60));
  console.log('  VALIDATION RESULT:', result.passed ? '✓ PASSED' : '✗ FAILED');
  console.log('─'.repeat(60));

  console.log('\n  Count Checks:');
  for (const c of result.countChecks) {
    const icon = c.match ? '  ✓' : '  ✗';
    console.log(`${icon}  ${c.entity.padEnd(20)} disk=${c.onDisk}  db=${c.inDb}  (delta=${c.delta > 0 ? '+' : ''}${c.delta})`);
  }

  if (result.integrityErrors.length > 0) {
    console.log('\n  ✗ Integrity Errors:');
    for (const e of result.integrityErrors) {
      console.log(`    ${e.table}: ${e.broken} broken rows — samples: ${e.samples.join(', ')}`);
    }
  } else {
    console.log('\n  ✓ All FK integrity checks passed');
  }

  console.log('\n  Spot Checks:');
  for (const s of result.spotChecks) {
    const icon = s.passed ? '  ✓' : '  ✗';
    console.log(`${icon}  ${s.planId}`);
    for (const note of s.notes) console.log(`       ${note}`);
  }

  console.log('─'.repeat(60) + '\n');
}

// ---------------------------------------------------------------------------
// Counting helpers
// ---------------------------------------------------------------------------

function scalar(sql: string): number {
  const row = queryOne<Record<string, number>>(sql);
  if (!row) return 0;
  return Object.values(row)[0] ?? 0;
}

function countWorkspaceDirs(dataRoot: string): number {
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(dataRoot, d.name, 'workspace.meta.json')))
    .length;
}

function countPlanDirs(dataRoot: string): number {
  let count = 0;
  const wsDirs = fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'workspace.meta.json')));

  for (const wsDir of wsDirs) {
    const plansDir = path.join(wsDir, 'plans');
    if (!fs.existsSync(plansDir)) continue;

    // Active plans
    count += fs.readdirSync(plansDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_archived' && d.name !== 'plan_temporary')
      .length;

    // Archived plans
    const archivedDir = path.join(plansDir, '_archived');
    if (fs.existsSync(archivedDir)) {
      count += fs.readdirSync(archivedDir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .length;
    }
  }
  return count;
}

function countKnowledgeFiles(dataRoot: string): number {
  let count = 0;
  const wsDirs = fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'workspace.meta.json')));

  for (const wsDir of wsDirs) {
    const kDir = path.join(wsDir, 'knowledge');
    if (fs.existsSync(kDir)) {
      count += fs.readdirSync(kDir).filter(f => f.endsWith('.json') || f.endsWith('.md')).length;
    }
  }
  return count;
}

// ---------------------------------------------------------------------------
// Loose types
// ---------------------------------------------------------------------------

interface SpotState {
  title?:          string;
  steps?:          unknown[];
  agent_sessions?: unknown[];
  lineage?:        unknown[];
}
