/**
 * migration/report.ts — Migration report builder
 *
 * Tracks counts, skipped items, and errors across all migration phases.
 * Produces a structured summary at the end of the migration run.
 */

import fs from 'node:fs';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SkippedItem {
  path:   string;
  reason: string;
}

export interface ErrorItem {
  path:    string;
  message: string;
}

export interface PhaseReport {
  name:    string;
  counts:  Record<string, number>;
  skipped: SkippedItem[];
  errors:  ErrorItem[];
}

export interface MigrationReport {
  startedAt:  string;
  finishedAt: string | null;
  dryRun:     boolean;
  phases:     PhaseReport[];
  totals:     Record<string, number>;
  totalErrors: number;
  totalSkipped: number;
}

// ---------------------------------------------------------------------------
// Report builder
// ---------------------------------------------------------------------------

export class ReportBuilder {
  private readonly report: MigrationReport;
  private currentPhase: PhaseReport | null = null;

  constructor(dryRun: boolean) {
    this.report = {
      startedAt:   new Date().toISOString(),
      finishedAt:  null,
      dryRun,
      phases:      [],
      totals:      {},
      totalErrors:  0,
      totalSkipped: 0,
    };
  }

  beginPhase(name: string): void {
    this.currentPhase = { name, counts: {}, skipped: [], errors: [] };
    this.report.phases.push(this.currentPhase);
  }

  private get phase(): PhaseReport {
    if (!this.currentPhase) throw new Error('No active phase — call beginPhase() first');
    return this.currentPhase;
  }

  increment(entity: string, by = 1): void {
    this.phase.counts[entity] = (this.phase.counts[entity] ?? 0) + by;
    this.report.totals[entity] = (this.report.totals[entity] ?? 0) + by;
  }

  skip(path: string, reason: string): void {
    this.phase.skipped.push({ path, reason });
    this.report.totalSkipped++;
  }

  error(path: string, message: string): void {
    this.phase.errors.push({ path, message });
    this.report.totalErrors++;
  }

  finish(): MigrationReport {
    this.report.finishedAt = new Date().toISOString();
    return this.report;
  }

  // -------------------------------------------------------------------------
  // Rendering
  // -------------------------------------------------------------------------

  print(verbose = false): void {
    const r = this.report;
    const elapsed = r.finishedAt
      ? ((new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()) / 1000).toFixed(1)
      : '?';

    console.log('\n' + '═'.repeat(60));
    console.log('  PROJECT MEMORY MCP — DATA MIGRATION REPORT');
    if (r.dryRun) console.log('  *** DRY-RUN MODE — no data was written ***');
    console.log('═'.repeat(60));
    console.log(`  Started:  ${r.startedAt}`);
    if (r.finishedAt) console.log(`  Finished: ${r.finishedAt}  (${elapsed}s)`);
    console.log();

    // Per-phase summary
    for (const phase of r.phases) {
      const errTag   = phase.errors.length   ? ` [${phase.errors.length} ERRORS]`   : '';
      const skipTag  = phase.skipped.length  ? ` [${phase.skipped.length} skipped]`  : '';
      console.log(`  ── ${phase.name}${errTag}${skipTag}`);
      for (const [entity, count] of Object.entries(phase.counts)) {
        console.log(`       ${entity.padEnd(28)} ${count}`);
      }
      if (verbose) {
        for (const s of phase.skipped) {
          console.log(`     SKIP  ${s.path}  →  ${s.reason}`);
        }
        for (const e of phase.errors) {
          console.log(`     ERROR ${e.path}  →  ${e.message}`);
        }
      } else if (phase.errors.length) {
        for (const e of phase.errors) {
          console.log(`     ERROR ${e.path}  →  ${e.message}`);
        }
      }
    }

    console.log();
    console.log('  ── TOTALS');
    for (const [entity, count] of Object.entries(r.totals)) {
      console.log(`       ${entity.padEnd(28)} ${count}`);
    }
    console.log();
    console.log(`  Total errors:  ${r.totalErrors}`);
    console.log(`  Total skipped: ${r.totalSkipped}`);
    console.log('═'.repeat(60) + '\n');
  }

  saveJson(outputPath: string): void {
    fs.writeFileSync(outputPath, JSON.stringify(this.report, null, 2));
    console.log(`  Report written → ${outputPath}`);
  }
}
