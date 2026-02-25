/**
 * migration/migrate-agents.ts — Phase 9.1: Agent Definition Seeding
 *
 * Reads all agent markdown files from agents-v2/*.agent.md and inserts
 * them into the `agent_definitions` table. Also migrates workspace-specific
 * agent deployments found in *.memory/instructions/*.
 */

import fs   from 'node:fs';
import path from 'node:path';

import { storeAgent }         from '../db/agent-definition-db.js';
import type { ReportBuilder } from './report.js';

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

export function migrateAgents(projectRoot: string, report: ReportBuilder, dryRun: boolean): void {
  report.beginPhase('Phase 9.1: Agent Definition Seeding');

  const agentsDir = path.join(projectRoot, 'agents-v2');
  if (!fs.existsSync(agentsDir)) {
    report.skip('agents-v2/', 'directory not found');
    return;
  }

  const agentFiles = fs.readdirSync(agentsDir)
    .filter(f => f.endsWith('.agent.md') || f.endsWith('.md'));

  for (const filename of agentFiles) {
    const filePath = path.join(agentsDir, filename);
    let content: string;
    try {
      content = fs.readFileSync(filePath, 'utf-8');
    } catch (err) {
      report.error(filePath, `read error: ${(err as Error).message}`);
      continue;
    }

    const agentName = extractAgentName(filename, content);
    const metadata  = extractFrontmatter(content);

    if (!dryRun) {
      try {
        storeAgent(agentName, content, metadata);
      } catch (err) {
        report.error(filePath, `DB insert failed: ${(err as Error).message}`);
        continue;
      }
    }
    report.increment('agents');
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractAgentName(filename: string, content: string): string {
  // Try to find a title heading first
  const titleMatch = content.match(/^#\s+(.+)$/m);
  if (titleMatch) {
    const cleaned = titleMatch[1].replace(/\s+agent$/i, '').trim();
    if (cleaned) return cleaned;
  }
  // Fall back to filename without extension
  return filename.replace(/\.agent\.md$/, '').replace(/\.md$/, '');
}

function extractFrontmatter(content: string): object {
  // Parse YAML-like frontmatter between --- markers
  const match = content.match(/^---\s*\n([\s\S]*?)\n---/);
  if (!match) return {};

  const meta: Record<string, unknown> = {};
  const lines = match[1].split('\n');
  for (const line of lines) {
    const colonIdx = line.indexOf(':');
    if (colonIdx < 0) continue;
    const key   = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) meta[key] = value;
  }
  return meta;
}
