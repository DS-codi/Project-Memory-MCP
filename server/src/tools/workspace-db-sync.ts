/**
 * workspace-db-sync.ts
 *
 * Compares the context files that exist in a workspace's .github/ folder
 * against their counterparts stored in the Project Memory DB.
 *
 * Reports per-file sync status:
 *   in_sync          — local content matches DB content
 *   local_only       — file exists in workspace but has no DB entry
 *   db_only          — DB entry exists (mandatory file) but missing from workspace
 *   content_mismatch — both exist but content differs
 *
 * Used by:
 *   - memory_workspace(action: check_context_sync)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgent } from '../db/agent-definition-db.js';
import { getInstruction } from '../db/instruction-db.js';
import {
  MANDATORY_AGENTS,
  MANDATORY_INSTRUCTIONS,
  toCanonicalFilename,
} from './workspace-context-manifest.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SyncStatus = 'in_sync' | 'local_only' | 'db_only' | 'content_mismatch';

export interface SyncEntry {
  /** Filename as it appears on disk (may include workspace short code). */
  filename: string;
  /** Canonical DB key: agent name (e.g. "Hub") or instruction filename (e.g. "mcp-usage.instructions.md"). */
  canonical_name: string;
  status: SyncStatus;
  /** ISO timestamp of the DB version's last update (if DB entry exists). */
  db_updated_at?: string;
  /** Size of the local file in bytes (if local file exists). */
  local_size_bytes?: number;
  /** Short description of the first content difference (if status is content_mismatch). */
  content_mismatch_hint?: string;
}

export interface WorkspaceDbSyncReport {
  workspace_path: string;
  github_agents_dir: string;
  github_instructions_dir: string;
  agents: SyncEntry[];
  instructions: SyncEntry[];
  summary: {
    total: number;
    in_sync: number;
    local_only: number;
    db_only: number;
    content_mismatch: number;
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract a YAML frontmatter scalar field from file content. */
function extractFrontmatterField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^${field}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

/**
 * Derive the canonical agent name used for DB lookup.
 * Priority:  frontmatter `name:` field → filename stem (after stripping workspace code).
 */
function canonicalAgentName(filename: string, content: string): string {
  // Prefer the name declared in frontmatter
  const fm = extractFrontmatterField(content, 'name');
  if (fm) return fm;
  // Fall back: strip extension and workspace code
  return toCanonicalFilename(filename).replace(/\.agent\.md$/, '');
}

/** Build a concise diff hint (≤120 chars) pointing at the first difference. */
function diffHint(local: string, db: string): string {
  const a = local.trim();
  const b = db.trim();
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const start = Math.max(0, i - 30);
      return `First diff at char ${i}: "...${a.substring(start, i + 60)}..."`;
    }
  }
  return `Length mismatch: local=${a.length} db=${b.length} chars`;
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compare the workspace's .github/agents/ and .github/instructions/ files
 * against the Project Memory DB.
 *
 * @param workspacePath  Absolute path to the workspace root.
 */
export function checkWorkspaceDbSync(workspacePath: string): WorkspaceDbSyncReport {
  const agentsDir = path.join(workspacePath, '.github', 'agents');
  const instructionsDir = path.join(workspacePath, '.github', 'instructions');

  const agents: SyncEntry[] = [];
  const instructions: SyncEntry[] = [];

  // ── AGENTS ─────────────────────────────────────────────────────────────

  const localAgentFiles: string[] = fs.existsSync(agentsDir)
    ? fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'))
    : [];

  // Track canonical names seen from local files
  const seenAgentNames = new Set<string>();

  for (const filename of localAgentFiles) {
    const localPath = path.join(agentsDir, filename);
    const localContent = fs.readFileSync(localPath, 'utf-8');
    const canonName = canonicalAgentName(filename, localContent);
    seenAgentNames.add(canonName.toLowerCase());

    const dbRow = getAgent(canonName);

    if (!dbRow) {
      agents.push({
        filename,
        canonical_name: canonName,
        status: 'local_only',
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
      });
    } else if (localContent.trim() !== dbRow.content.trim()) {
      agents.push({
        filename,
        canonical_name: canonName,
        status: 'content_mismatch',
        db_updated_at: dbRow.updated_at,
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
        content_mismatch_hint: diffHint(localContent, dbRow.content),
      });
    } else {
      agents.push({
        filename,
        canonical_name: canonName,
        status: 'in_sync',
        db_updated_at: dbRow.updated_at,
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
      });
    }
  }

  // Check mandatory agents that have a DB entry but are absent from workspace
  for (const mandatoryFile of MANDATORY_AGENTS) {
    const canonName = mandatoryFile.replace(/\.agent\.md$/, '');
    if (!seenAgentNames.has(canonName.toLowerCase())) {
      const dbRow = getAgent(canonName);
      if (dbRow) {
        agents.push({
          filename: mandatoryFile,
          canonical_name: canonName,
          status: 'db_only',
          db_updated_at: dbRow.updated_at,
        });
      }
    }
  }

  // ── INSTRUCTIONS ────────────────────────────────────────────────────────

  const localInstructionFiles: string[] = fs.existsSync(instructionsDir)
    ? fs.readdirSync(instructionsDir).filter(f => f.endsWith('.instructions.md'))
    : [];

  const seenInstructionFilenames = new Set<string>();

  for (const filename of localInstructionFiles) {
    const localPath = path.join(instructionsDir, filename);
    const localContent = fs.readFileSync(localPath, 'utf-8');
    const canonFilename = toCanonicalFilename(filename); // strips workspace code
    seenInstructionFilenames.add(canonFilename);

    const dbRow = getInstruction(canonFilename);

    if (!dbRow) {
      instructions.push({
        filename,
        canonical_name: canonFilename,
        status: 'local_only',
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
      });
    } else if (localContent.trim() !== dbRow.content.trim()) {
      instructions.push({
        filename,
        canonical_name: canonFilename,
        status: 'content_mismatch',
        db_updated_at: dbRow.updated_at,
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
        content_mismatch_hint: diffHint(localContent, dbRow.content),
      });
    } else {
      instructions.push({
        filename,
        canonical_name: canonFilename,
        status: 'in_sync',
        db_updated_at: dbRow.updated_at,
        local_size_bytes: Buffer.byteLength(localContent, 'utf-8'),
      });
    }
  }

  // Check mandatory instructions that have a DB entry but are absent from workspace
  for (const mandatoryFile of MANDATORY_INSTRUCTIONS) {
    if (!seenInstructionFilenames.has(mandatoryFile)) {
      const dbRow = getInstruction(mandatoryFile);
      if (dbRow) {
        instructions.push({
          filename: mandatoryFile,
          canonical_name: mandatoryFile,
          status: 'db_only',
          db_updated_at: dbRow.updated_at,
        });
      }
    }
  }

  // ── Summary ──────────────────────────────────────────────────────────────

  const all = [...agents, ...instructions];
  const summary = {
    total: all.length,
    in_sync:          all.filter(e => e.status === 'in_sync').length,
    local_only:       all.filter(e => e.status === 'local_only').length,
    db_only:          all.filter(e => e.status === 'db_only').length,
    content_mismatch: all.filter(e => e.status === 'content_mismatch').length,
  };

  return {
    workspace_path: workspacePath,
    github_agents_dir: agentsDir,
    github_instructions_dir: instructionsDir,
    agents,
    instructions,
    summary,
  };
}
