/**
 * migration/migrate-knowledge.ts — Phase 6: Knowledge File Migration
 *
 * For each workspace with a knowledge/ directory, reads all .json files
 * and inserts them into the `knowledge` table.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { storeKnowledge }     from '../db/knowledge-db.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateKnowledge(dataRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 6: Knowledge File Migration');

  const workspaceDirs = getWorkspaceDirs(dataRoot);

  for (const wsDir of workspaceDirs) {
    const wsId        = path.basename(wsDir);
    const knowledgeDir = path.join(wsDir, 'knowledge');
    if (!fs.existsSync(knowledgeDir)) continue;

    const files = fs.readdirSync(knowledgeDir)
      .filter(f => f.endsWith('.json') || f.endsWith('.md'));

    for (const filename of files) {
      const filePath = path.join(knowledgeDir, filename);

      let raw: KnowledgeFile;
      try {
        if (filename.endsWith('.json')) {
          raw = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as KnowledgeFile;
        } else {
          // .md format — store as a document knowledge entry
          const content = fs.readFileSync(filePath, 'utf-8');
          raw = {
            slug:  path.basename(filename, '.md'),
            title: path.basename(filename, '.md'),
            data:  { content },
          };
        }
      } catch (err) {
        report.error(filePath, `read/parse error: ${(err as Error).message}`);
        continue;
      }

      const slug  = raw.slug  ?? path.basename(filename, path.extname(filename));
      const title = raw.title ?? slug;
      const data  = raw.data  ?? (raw as object);

      if (!dryRun) {
        try {
          storeKnowledge(wsId, slug, title, data, {
            category:        raw.category         ?? null,
            tags:            raw.tags             ?? null,
            created_by_agent: raw.created_by_agent ?? null,
            created_by_plan:  raw.created_by_plan  ?? null,
          });
        } catch (err) {
          report.error(filePath, `DB insert failed: ${(err as Error).message}`);
          continue;
        }
      }
      report.increment('knowledge_entries');
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getWorkspaceDirs(dataRoot: string): string[] {
  return fs.readdirSync(dataRoot, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => path.join(dataRoot, d.name))
    .filter(dir => fs.existsSync(path.join(dir, 'workspace.meta.json')));
}

// ---------------------------------------------------------------------------
// Loose types
// ---------------------------------------------------------------------------

interface KnowledgeFile {
  slug?:             string;
  title?:            string;
  category?:         string;
  tags?:             string[];
  created_by_agent?: string;
  created_by_plan?:  string;
  data?:             object;
  [key: string]:     unknown;
}
