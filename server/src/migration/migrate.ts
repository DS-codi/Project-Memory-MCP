#!/usr/bin/env node
/**
 * migration/migrate.ts — Phase 1.1: Main CLI Entry Point
 *
 * Usage:
 *   node dist/migration/migrate.js [options]
 *
 * Options:
 *   --data-root <path>   Root of the file-based data directory
 *                        (default: PM_DATA_ROOT env or <projectRoot>/data)
 *   --dry-run            Analyse + report without writing to the DB
 *   --verbose            Print per-item progress lines
 *   --output <file>      Save JSON report to this path
 *   --skip-validate      Skip Phase 10 validation (faster for repeated runs)
 *   --phases <list>      Comma-separated phase numbers to run (e.g. 3,4,5)
 */

import fs   from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { getDb }           from '../db/connection.js';
import { runMigrations }  from '../db/migration-runner.js';
import { ReportBuilder }  from './report.js';

import { migrateWorkspaces }   from './migrate-workspaces.js';
import { migratePrograms }     from './migrate-programs.js';
import { migratePlans }        from './migrate-plans.js';
import { migrateContext }      from './migrate-context.js';
import { migrateResearch }     from './migrate-research.js';
import { migrateKnowledge }    from './migrate-knowledge.js';
import { migrateEvents }       from './migrate-events.js';
import { migrateLogs }         from './migrate-logs.js';
import { migrateAgents }       from './migrate-agents.js';
import { migrateInstructions } from './migrate-instructions.js';
import { migrateSkills }       from './migrate-skills.js';
import { migrateFileEdits }    from './migrate-file-edits.js';
import { runValidation, printValidationResult } from './validate.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

/** Two levels up from dist/migration/ → project root (server/) then one more → workspace root */
function resolveProjectRoot(): string {
  // __dirname = <projectRoot>/dist/migration  (after compile)
  // go up to dist/, then server/, then Project-Memory-MCP/
  return path.resolve(__dirname, '..', '..', '..');
}

function parseArgs(argv: string[]): CliOptions {
  const opts: CliOptions = {
    dataRoot:     process.env['PM_DATA_ROOT'] ?? '',
    dryRun:       false,
    verbose:      false,
    output:       '',
    skipValidate: false,
    phases:       null,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === '--dry-run')        { opts.dryRun = true; continue; }
    if (arg === '--verbose')        { opts.verbose = true; continue; }
    if (arg === '--skip-validate')  { opts.skipValidate = true; continue; }
    if (arg === '--data-root')      { opts.dataRoot    = argv[++i] ?? ''; continue; }
    if (arg === '--output')         { opts.output      = argv[++i] ?? ''; continue; }
    if (arg === '--phases')         {
      const raw = argv[++i] ?? '';
      opts.phases = raw.split(',').map(s => parseInt(s.trim(), 10)).filter(n => !isNaN(n));
      continue;
    }
  }

  return opts;
}

function shouldRun(phaseNum: number, phases: number[] | null): boolean {
  return phases === null || phases.includes(phaseNum);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));

  // ── Resolve data root ────────────────────────────────────────────────────
  if (!opts.dataRoot) {
    const projectRoot = resolveProjectRoot();
    opts.dataRoot = path.join(projectRoot, 'data');
  }

  if (!fs.existsSync(opts.dataRoot)) {
    console.error(`[migrate] ERROR: data root not found: ${opts.dataRoot}`);
    process.exit(1);
  }

  console.log('[migrate] ══════════════════════════════════════════════');
  console.log('[migrate]  Project Memory — File-to-SQLite Migration');
  console.log('[migrate] ══════════════════════════════════════════════');
  console.log(`[migrate]  data-root    : ${opts.dataRoot}`);
  console.log(`[migrate]  dry-run      : ${opts.dryRun}`);
  console.log(`[migrate]  verbose      : ${opts.verbose}`);
  if (opts.phases) console.log(`[migrate]  phases       : ${opts.phases.join(', ')}`);
  console.log('[migrate] ══════════════════════════════════════════════');

  if (opts.dryRun) {
    console.log('[migrate]  DRY-RUN mode — no data will be written\n');
    await dryRunAnalysis(opts);
    process.exit(0);
  }

  // ── Initialise DB ────────────────────────────────────────────────────────
  console.log('[migrate] Initialising database …');
  const db = getDb();          // opens/creates the DB singleton
  runMigrations();

  // Disable FK enforcement during migration — we insert in bulk across
  // interdependent tables; FKs are re-enabled and verified at the end.
  db.pragma('foreign_keys = OFF');
  console.log('[migrate] Database ready (FK checks deferred).\n');

  // ── Run phases ───────────────────────────────────────────────────────────
  const report = new ReportBuilder(false);

  try {
    // Phase 2 — Workspaces (must come first — plans and programs FK to workspace_id)
    if (shouldRun(2, opts.phases)) {
      console.log('[migrate] Phase 2: Workspaces …');
      migrateWorkspaces(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 7 — Programs (must come before plans so program rows exist for FK)
    if (shouldRun(7, opts.phases)) {
      console.log('[migrate] Phase 7: Programs …');
      migratePrograms(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 3 — Plans
    if (shouldRun(3, opts.phases)) {
      console.log('[migrate] Phase 3: Plans …');
      migratePlans(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 4 — Context files
    if (shouldRun(4, opts.phases)) {
      console.log('[migrate] Phase 4: Context …');
      migrateContext(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 5 — Research notes
    if (shouldRun(5, opts.phases)) {
      console.log('[migrate] Phase 5: Research …');
      migrateResearch(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 6 — Knowledge
    if (shouldRun(6, opts.phases)) {
      console.log('[migrate] Phase 6: Knowledge …');
      migrateKnowledge(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 8 — Events + Update Logs
    if (shouldRun(8, opts.phases)) {
      console.log('[migrate] Phase 8: Events …');
      migrateEvents(opts.dataRoot, report, opts.dryRun);

      console.log('[migrate] Phase 8b: Update Logs …');
      migrateLogs(opts.dataRoot, report, opts.dryRun);
    }

    // Phase 9.1 — Agent definitions
    if (shouldRun(9, opts.phases)) {
      const projectRoot = resolveProjectRoot();
      console.log('[migrate] Phase 9.1: Agent definitions …');
      migrateAgents(projectRoot, report, opts.dryRun);

      console.log('[migrate] Phase 9.2: Instruction files …');
      migrateInstructions(projectRoot, report, opts.dryRun);

      console.log('[migrate] Phase 9.3: Skill definitions …');
      migrateSkills(projectRoot, report, opts.dryRun);
    }

    // Phase 10 — Validation
    if (!opts.skipValidate && shouldRun(10, opts.phases)) {
      console.log('[migrate] Phase 10: Validation …');
      const validation = runValidation(opts.dataRoot, report);
      printValidationResult(validation);
    }

    // Phase 11 — File-edit history (best-effort)
    if (shouldRun(11, opts.phases)) {
      console.log('[migrate] Phase 11: File-Edit History …');
      migrateFileEdits(opts.dataRoot, report, opts.dryRun);
    }

  } catch (err) {
    console.error('[migrate] FATAL:', (err as Error).message);
    console.error((err as Error).stack);
    process.exit(2);
  }

  // ── Re-enable FK enforcement and verify ──────────────────────────────────
  db.pragma('foreign_keys = ON');
  const fkErrors = db.pragma('foreign_key_check') as Array<{ table: string; rowid: number; parent: string; fkid: number }>;
  if (fkErrors.length > 0) {
    console.warn(`[migrate] ⚠ ${fkErrors.length} FK violation(s) detected after migration:`);
    for (const e of fkErrors.slice(0, 20)) {
      console.warn(`  table=${e.table} rowid=${e.rowid} parent=${e.parent}`);
    }
    if (fkErrors.length > 20) console.warn(`  ... and ${fkErrors.length - 20} more`);
  } else {
    console.log('[migrate] FK integrity check passed. ✓');
  }

  // ── Print summary ────────────────────────────────────────────────────────
  const summary = report.finish();
  report.print(opts.verbose);

  if (opts.output) {
    report.saveJson(opts.output);
    console.log(`[migrate] Report saved → ${opts.output}`);
  }

  const exitCode = summary.totalErrors > 0 ? 1 : 0;
  if (exitCode !== 0) {
    console.warn(`[migrate] Completed with ${summary.totalErrors} error(s). See report for details.`);
  } else {
    console.log('[migrate] Migration complete. ✓');
  }
  process.exit(exitCode);
}

// ---------------------------------------------------------------------------
// Dry-run analysis (no DB writes)
// ---------------------------------------------------------------------------

async function dryRunAnalysis(opts: CliOptions): Promise<void> {
  const dataRoot = opts.dataRoot;

  // Workspace count
  const wsDirs = fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory() && fs.existsSync(path.join(dataRoot, d.name, 'workspace.meta.json')));
  console.log(`  Workspaces found    : ${wsDirs.length}`);

  let totalPlans = 0;
  let totalArchived = 0;
  for (const wsDir of wsDirs) {
    const plansDir = path.join(dataRoot, wsDir.name, 'plans');
    if (!fs.existsSync(plansDir)) continue;
    const active = fs.readdirSync(plansDir, { withFileTypes: true })
      .filter(d => d.isDirectory() && d.name !== '_archived').length;
    const archDir = path.join(plansDir, '_archived');
    const archived = fs.existsSync(archDir)
      ? fs.readdirSync(archDir, { withFileTypes: true }).filter(d => d.isDirectory()).length
      : 0;
    totalPlans    += active;
    totalArchived += archived;
  }
  console.log(`  Active plans        : ${totalPlans}`);
  console.log(`  Archived plans      : ${totalArchived}`);
  console.log(`  Total plans         : ${totalPlans + totalArchived}`);

  // Knowledge
  let knowledgeTotal = 0;
  for (const wsDir of wsDirs) {
    const kDir = path.join(dataRoot, wsDir.name, 'knowledge');
    if (fs.existsSync(kDir)) {
      knowledgeTotal += fs.readdirSync(kDir).filter(f => f.endsWith('.json') || f.endsWith('.md')).length;
    }
  }
  console.log(`  Knowledge files     : ${knowledgeTotal}`);
  console.log('\n  (dry-run) No changes made.');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface CliOptions {
  dataRoot:     string;
  dryRun:       boolean;
  verbose:      boolean;
  output:       string;
  skipValidate: boolean;
  phases:       number[] | null;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------

main().catch(err => {
  console.error('[migrate] Unhandled error:', err);
  process.exit(3);
});
