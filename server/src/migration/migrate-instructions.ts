/**
 * migration/migrate-instructions.ts — Phase 9.2: Instruction File Seeding
 *
 * Reads all instruction files from .github/instructions/ and inserts them
 * into the `instruction_files` table.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { storeInstruction }   from '../db/instruction-db.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateInstructions(projectRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 9.2: Instruction File Seeding');

  const instructionsDir = path.join(projectRoot, '.github', 'instructions');
  if (!fs.existsSync(instructionsDir)) {
    report.skip('.github/instructions/', 'directory not found');
    return;
  }

  const files = fs.readdirSync(instructionsDir)
    .filter(f => f.endsWith('.md'));

  for (const filename of files) {
    const filePath = path.join(instructionsDir, filename);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      report.error(filePath, `read error: ${(err as Error).message}`);
      continue;
    }

    const appliesTo = extractAppliesTo(content);

    if (!dryRun) {
      try {
        storeInstruction(filename, appliesTo, content);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('instructions');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAppliesTo(content: string): string {
  const match = content.match(/^---\s*\n[\s\S]*?applyTo:\s*["']?([^"'\n]+)["']?/m);
  return match ? match[1].trim() : '**/*';
}
