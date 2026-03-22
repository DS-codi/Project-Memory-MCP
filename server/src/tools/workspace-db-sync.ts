/**
 * workspace-db-sync.ts
 *
 * Read-only comparison between workspace .github context files and the
 * Project Memory DB.
 *
 * Reports per-file sync status:
 *   in_sync          — managed file matches every required comparison target
 *   local_only       — managed non-protected file exists in workspace only
 *   db_only          — managed non-protected DB row exists without a workspace copy
 *   content_mismatch — managed non-protected local and DB copies differ
 *   protected_drift  — PM-controlled file diverges from canonical seed parity
 *   ignored_local    — local file is outside passive sync management / DB-only on disk
 *   import_candidate — local file is manual-import eligible and not yet in the DB
 *
 * Used by:
 *   - memory_workspace(action: check_context_sync)
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import { getAgent, listAgents } from '../db/agent-definition-db.js';
import { getInstruction, listInstructions } from '../db/instruction-db.js';
import {
  MANDATORY_AGENTS,
  MANDATORY_INSTRUCTIONS,
  inferWorkspaceFileKind,
  normalizeInstructionContentForSync,
  resolveWorkspaceFilePolicy,
  toCanonicalFilename,
  type ResolvedWorkspaceFilePolicy,
  type WorkspaceFileKind,
} from './workspace-context-manifest.js';

export type SyncStatus =
  | 'in_sync'
  | 'local_only'
  | 'db_only'
  | 'content_mismatch'
  | 'protected_drift'
  | 'ignored_local'
  | 'import_candidate';

export interface SyncEntry {
  kind: 'agent' | 'instruction';
  filename: string;
  relative_path: string;
  canonical_name: string;
  canonical_filename: string;
  status: SyncStatus;
  remediation: string;
  comparison_basis: 'ignored_local' | 'local_only' | 'db_only' | 'local_vs_db' | 'local_db_seed';
  db_updated_at?: string;
  local_size_bytes?: number;
  canonical_seed_path?: string;
  content_mismatch_hint?: string;
  policy: {
    sync_managed: boolean;
    controlled: boolean;
    import_mode: 'never' | 'manual';
    canonical_source: 'none' | 'database_seed_resources';
    canonical_path: string | null;
    required_workspace_copy: boolean;
    legacy_mandatory: boolean;
    cull_reason?: string;
    validation_errors: string[];
  };
}

export interface WorkspaceDbSyncReport {
  workspace_id?: string;
  workspace_path: string;
  report_mode: 'read_only';
  writes_performed: false;
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
    protected_drift: number;
    ignored_local: number;
    import_candidate: number;
  };
}

interface LocalFileRecord {
  filename: string;
  relative_path: string;
  canonical_filename: string;
  canonical_name: string;
  lookup_key: string;
  content: string;
  local_size_bytes: number;
}

interface DbFileRecord {
  canonical_name: string;
  canonical_filename: string;
  lookup_key: string;
  content: string;
  updated_at?: string;
}

export interface WorkspaceSyncPreview {
  kind: 'agent' | 'instruction';
  file_path: string;
  relative_path: string;
  local: {
    filename: string;
    canonical_name: string;
    canonical_filename: string;
    content: string;
    local_size_bytes: number;
  };
  entry: SyncEntry;
}

function extractFrontmatterField(content: string, field: string): string | null {
  const match = content.match(new RegExp(`^${field}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm'));
  return match?.[1]?.trim() ?? null;
}

function normalizeAgentLookupKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function agentNameToCanonicalFilename(name: string): string {
  const stem = name
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  return `${stem}.agent.md`;
}

function canonicalAgentName(filename: string, content: string): string {
  const frontmatterName = extractFrontmatterField(content, 'name');
  if (frontmatterName) return frontmatterName;
  return toCanonicalFilename(filename).replace(/\.agent\.md$/, '');
}

function normalizeContentForComparison(kind: WorkspaceFileKind, content: string): string {
  if (kind === 'instruction') {
    return normalizeInstructionContentForSync(content);
  }
  return content.trim();
}

function diffHint(leftLabel: string, left: string, rightLabel: string, right: string): string {
  const a = left.trim();
  const b = right.trim();

  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    if (a[i] !== b[i]) {
      const start = Math.max(0, i - 30);
      return `First diff between ${leftLabel} and ${rightLabel} at char ${i}: "...${a.substring(start, i + 60)}..."`;
    }
  }

  return `Length mismatch between ${leftLabel} and ${rightLabel}: ${a.length} vs ${b.length} chars`;
}

function readCanonicalSeedContent(
  workspacePath: string,
  policy: ResolvedWorkspaceFilePolicy,
): { seedPath: string; seedContent: string } | null {
  if (policy.canonical_source !== 'database_seed_resources' || !policy.canonical_path) {
    return null;
  }

  const seedPath = path.join(workspacePath, 'database-seed-resources', policy.canonical_path);
  if (!fs.existsSync(seedPath)) {
    return null;
  }

  return {
    seedPath: policy.canonical_path,
    seedContent: fs.readFileSync(seedPath, 'utf-8'),
  };
}

function buildRemediation(status: SyncStatus, policy: ResolvedWorkspaceFilePolicy): string {
  switch (status) {
    case 'in_sync':
      return 'No action required.';
    case 'ignored_local':
      return policy.cull_reason
        ? 'Leave this file out of watcher remediation; remove it only through explicit cleanup if it should not remain in the workspace.'
        : 'No watcher action. Add explicit PM metadata only if this file should participate in manual sync workflows.';
    case 'import_candidate':
      return 'Offer an explicit manual import action only. Do not update the DB from passive sync checks.';
    case 'local_only':
      return 'Report only. Either mark the file manual-import eligible, or leave/remove the workspace copy deliberately.';
    case 'db_only':
      return 'Offer an explicit deploy/materialize action if a workspace copy is desired. Do not write during passive checks.';
    case 'content_mismatch':
      return 'Manual review required. Resolve via an explicit import or redeploy action outside the passive watcher.';
    case 'protected_drift':
      return 'Use an explicit redeploy or reseed-from-canonical flow only. Never import workspace content into the DB for this file.';
  }
}

function toEntryPolicy(policy: ResolvedWorkspaceFilePolicy): SyncEntry['policy'] {
  return {
    sync_managed: policy.sync_managed,
    controlled: policy.controlled,
    import_mode: policy.import_mode,
    canonical_source: policy.canonical_source,
    canonical_path: policy.canonical_path,
    required_workspace_copy: policy.required_workspace_copy,
    legacy_mandatory: policy.legacy_mandatory,
    cull_reason: policy.cull_reason,
    validation_errors: policy.validation_errors,
  };
}

function isManualImportEligible(policy: ResolvedWorkspaceFilePolicy): boolean {
  return (
    policy.sync_managed &&
    !policy.controlled &&
    !policy.cull_reason &&
    policy.import_mode === 'manual' &&
    policy.validation_errors.length === 0
  );
}

function evaluateProtectedState(args: {
  kind: WorkspaceFileKind;
  localContent?: string;
  dbContent?: string;
  seedContent?: string;
}): { status: 'in_sync' | 'protected_drift'; hint?: string } {
  const { kind, localContent, dbContent, seedContent } = args;

  if (!seedContent) {
    return { status: 'protected_drift', hint: 'Canonical seed content is missing for this PM-controlled file.' };
  }
  if (!localContent) {
    return { status: 'protected_drift', hint: 'Workspace copy is missing for this PM-controlled file.' };
  }
  if (!dbContent) {
    return { status: 'protected_drift', hint: 'DB copy is missing for this PM-controlled file.' };
  }

  const normalizedLocal = normalizeContentForComparison(kind, localContent);
  const normalizedDb = normalizeContentForComparison(kind, dbContent);
  const normalizedSeed = normalizeContentForComparison(kind, seedContent);

  if (normalizedLocal !== normalizedSeed) {
    return {
      status: 'protected_drift',
      hint: diffHint('workspace', normalizedLocal, 'canonical seed', normalizedSeed),
    };
  }
  if (normalizedDb !== normalizedSeed) {
    return {
      status: 'protected_drift',
      hint: diffHint('db', normalizedDb, 'canonical seed', normalizedSeed),
    };
  }
  if (normalizedLocal !== normalizedDb) {
    return {
      status: 'protected_drift',
      hint: diffHint('workspace', normalizedLocal, 'db', normalizedDb),
    };
  }

  return { status: 'in_sync' };
}

function collectLocalAgents(agentsDir: string): LocalFileRecord[] {
  if (!fs.existsSync(agentsDir)) return [];

  return fs.readdirSync(agentsDir)
    .filter(filename => filename.endsWith('.agent.md'))
    .map(filename => {
      const localPath = path.join(agentsDir, filename);
      const content = fs.readFileSync(localPath, 'utf-8');
      const canonicalName = canonicalAgentName(filename, content);
      return {
        filename,
        relative_path: `agents/${filename}`,
        canonical_filename: toCanonicalFilename(filename),
        canonical_name: canonicalName,
        lookup_key: normalizeAgentLookupKey(canonicalName),
        content,
        local_size_bytes: Buffer.byteLength(content, 'utf-8'),
      };
    });
}

function collectLocalInstructions(instructionsDir: string): LocalFileRecord[] {
  if (!fs.existsSync(instructionsDir)) return [];

  return fs.readdirSync(instructionsDir)
    .filter(filename => filename.endsWith('.instructions.md'))
    .map(filename => {
      const localPath = path.join(instructionsDir, filename);
      const content = fs.readFileSync(localPath, 'utf-8');
      const canonicalFilename = toCanonicalFilename(filename);
      return {
        filename,
        relative_path: `instructions/${filename}`,
        canonical_filename: canonicalFilename,
        canonical_name: canonicalFilename,
        lookup_key: canonicalFilename.toLowerCase(),
        content,
        local_size_bytes: Buffer.byteLength(content, 'utf-8'),
      };
    });
}

export function normalizeWorkspaceSyncRelativePath(relativePath: string): string {
  const normalized = relativePath.replace(/\\/g, '/').replace(/^\/+/, '');
  return normalized.replace(/^\.github\//i, '');
}

function buildLocalRecordForRelativePath(
  workspacePath: string,
  relativePath: string,
): { kind: 'agent' | 'instruction'; filePath: string; local: LocalFileRecord } | null {
  const normalizedRelativePath = normalizeWorkspaceSyncRelativePath(relativePath);
  const inferredKind = inferWorkspaceFileKind(normalizedRelativePath);
  if (inferredKind !== 'agent' && inferredKind !== 'instruction') {
    return null;
  }

  const filename = path.basename(normalizedRelativePath);
  const filePath = path.join(workspacePath, '.github', ...normalizedRelativePath.split('/'));
  if (!fs.existsSync(filePath)) {
    return null;
  }

  const content = fs.readFileSync(filePath, 'utf-8');
  if (inferredKind === 'agent') {
    const canonicalName = canonicalAgentName(filename, content);
    return {
      kind: 'agent',
      filePath,
      local: {
        filename,
        relative_path: normalizedRelativePath,
        canonical_filename: toCanonicalFilename(filename),
        canonical_name: canonicalName,
        lookup_key: normalizeAgentLookupKey(canonicalName),
        content,
        local_size_bytes: Buffer.byteLength(content, 'utf-8'),
      },
    };
  }

  const canonicalFilename = toCanonicalFilename(filename);
  return {
    kind: 'instruction',
    filePath,
    local: {
      filename,
      relative_path: normalizedRelativePath,
      canonical_filename: canonicalFilename,
      canonical_name: canonicalFilename,
      lookup_key: canonicalFilename.toLowerCase(),
      content,
      local_size_bytes: Buffer.byteLength(content, 'utf-8'),
    },
  };
}

export function inspectWorkspaceSyncFile(
  workspacePath: string,
  relativePath: string,
): WorkspaceSyncPreview | null {
  const resolved = buildLocalRecordForRelativePath(workspacePath, relativePath);
  if (!resolved) {
    return null;
  }

  const { kind, filePath, local } = resolved;
  const db = kind === 'agent'
    ? getAgentDbRecord(local, buildAgentDbMap())
    : getInstructionDbRecord(local, buildInstructionDbMap());
  const entry = classifyLocalEntry({ kind, workspacePath, local, db });

  return {
    kind,
    file_path: filePath,
    relative_path: local.relative_path,
    local: {
      filename: local.filename,
      canonical_name: local.canonical_name,
      canonical_filename: local.canonical_filename,
      content: local.content,
      local_size_bytes: local.local_size_bytes,
    },
    entry,
  };
}

function buildAgentDbMap(): Map<string, DbFileRecord> {
  const rows = listAgents();
  if (!Array.isArray(rows)) {
    return new Map();
  }

  return new Map(
    rows.map(row => [
      normalizeAgentLookupKey(row.name),
      {
        canonical_name: row.name,
        canonical_filename: agentNameToCanonicalFilename(row.name),
        lookup_key: normalizeAgentLookupKey(row.name),
        content: row.content,
        updated_at: row.updated_at,
      },
    ]),
  );
}

function buildInstructionDbMap(): Map<string, DbFileRecord> {
  const rows = listInstructions();
  if (!Array.isArray(rows)) {
    return new Map();
  }

  return new Map(
    rows.map(row => [
      row.filename.toLowerCase(),
      {
        canonical_name: row.filename,
        canonical_filename: row.filename,
        lookup_key: row.filename.toLowerCase(),
        content: row.content,
        updated_at: row.updated_at,
      },
    ]),
  );
}

function getAgentDbRecord(local: LocalFileRecord, dbMap: Map<string, DbFileRecord>): DbFileRecord | undefined {
  const mapped = dbMap.get(local.lookup_key);
  if (mapped) return mapped;

  const row = getAgent(local.canonical_name.toLowerCase());
  if (!row) return undefined;

  return {
    canonical_name: row.name,
    canonical_filename: agentNameToCanonicalFilename(row.name),
    lookup_key: normalizeAgentLookupKey(row.name),
    content: row.content,
    updated_at: row.updated_at,
  };
}

function getInstructionDbRecord(local: LocalFileRecord, dbMap: Map<string, DbFileRecord>): DbFileRecord | undefined {
  const mapped = dbMap.get(local.lookup_key);
  if (mapped) return mapped;

  const row = getInstruction(local.canonical_filename.toLowerCase());
  if (!row) return undefined;

  return {
    canonical_name: row.filename,
    canonical_filename: row.filename,
    lookup_key: row.filename.toLowerCase(),
    content: row.content,
    updated_at: row.updated_at,
  };
}

function classifyLocalEntry(args: {
  kind: 'agent' | 'instruction';
  workspacePath: string;
  local: LocalFileRecord;
  db?: DbFileRecord;
}): SyncEntry {
  const { kind, workspacePath, local, db } = args;
  const policy = resolveWorkspaceFilePolicy({
    kind,
    canonical_filename: local.canonical_filename,
    relative_path: local.relative_path,
    content: local.content,
    db_present: Boolean(db),
  });
  const seed = readCanonicalSeedContent(workspacePath, policy);

  let status: SyncStatus;
  let comparisonBasis: SyncEntry['comparison_basis'];
  let mismatchHint: string | undefined;

  if (policy.cull_reason || !policy.sync_managed) {
    status = 'ignored_local';
    comparisonBasis = 'ignored_local';
  } else if (policy.controlled) {
    const protectedState = evaluateProtectedState({
      kind,
      localContent: local.content,
      dbContent: db?.content,
      seedContent: seed?.seedContent,
    });
    status = protectedState.status;
    comparisonBasis = 'local_db_seed';
    mismatchHint = protectedState.hint;
  } else if (!db) {
    status = isManualImportEligible(policy) ? 'import_candidate' : 'local_only';
    comparisonBasis = 'local_only';
    if (policy.validation_errors.length > 0) {
      mismatchHint = policy.validation_errors.join(' | ');
    }
  } else {
    const normalizedLocal = normalizeContentForComparison(kind, local.content);
    const normalizedDb = normalizeContentForComparison(kind, db.content);
    status = normalizedLocal === normalizedDb ? 'in_sync' : 'content_mismatch';
    comparisonBasis = 'local_vs_db';
    mismatchHint = normalizedLocal === normalizedDb
      ? undefined
      : diffHint('workspace', normalizedLocal, 'db', normalizedDb);
  }

  return {
    kind,
    filename: local.filename,
    relative_path: local.relative_path,
    canonical_name: local.canonical_name,
    canonical_filename: local.canonical_filename,
    status,
    remediation: buildRemediation(status, policy),
    comparison_basis: comparisonBasis,
    db_updated_at: db?.updated_at,
    local_size_bytes: local.local_size_bytes,
    canonical_seed_path: seed?.seedPath,
    content_mismatch_hint: mismatchHint,
    policy: toEntryPolicy(policy),
  };
}

function classifyDbOnlyEntry(args: {
  kind: 'agent' | 'instruction';
  workspacePath: string;
  db: DbFileRecord;
}): SyncEntry | null {
  const { kind, workspacePath, db } = args;
  const relativePath = kind === 'agent'
    ? `agents/${db.canonical_filename}`
    : `instructions/${db.canonical_filename}`;
  const policy = resolveWorkspaceFilePolicy({
    kind,
    canonical_filename: db.canonical_filename,
    relative_path: relativePath,
    content: db.content,
    db_present: true,
  });

  if (policy.cull_reason) {
    return null;
  }

  const seed = readCanonicalSeedContent(workspacePath, policy);
  const status: SyncStatus = policy.controlled ? 'protected_drift' : 'db_only';
  const mismatchHint = policy.controlled
    ? evaluateProtectedState({ kind, dbContent: db.content, seedContent: seed?.seedContent }).hint
    : undefined;

  return {
    kind,
    filename: db.canonical_filename,
    relative_path: relativePath,
    canonical_name: db.canonical_name,
    canonical_filename: db.canonical_filename,
    status,
    remediation: buildRemediation(status, policy),
    comparison_basis: policy.controlled ? 'local_db_seed' : 'db_only',
    db_updated_at: db.updated_at,
    canonical_seed_path: seed?.seedPath,
    content_mismatch_hint: mismatchHint,
    policy: toEntryPolicy(policy),
  };
}

function classifyMandatorySeedOnlyEntry(args: {
  kind: 'agent' | 'instruction';
  workspacePath: string;
  canonicalFilename: string;
  canonicalName: string;
}): SyncEntry | null {
  const { kind, workspacePath, canonicalFilename, canonicalName } = args;
  const relativePath = kind === 'agent'
    ? `agents/${canonicalFilename}`
    : `instructions/${canonicalFilename}`;
  const policy = resolveWorkspaceFilePolicy({
    kind,
    canonical_filename: canonicalFilename,
    relative_path: relativePath,
    db_present: false,
  });
  const seed = readCanonicalSeedContent(workspacePath, policy);

  if (!seed) {
    return null;
  }

  return {
    kind,
    filename: canonicalFilename,
    relative_path: relativePath,
    canonical_name: canonicalName,
    canonical_filename: canonicalFilename,
    status: 'protected_drift',
    remediation: buildRemediation('protected_drift', policy),
    comparison_basis: 'local_db_seed',
    canonical_seed_path: seed.seedPath,
    content_mismatch_hint: 'Workspace copy and DB row are missing while canonical seed content exists.',
    policy: toEntryPolicy(policy),
  };
}

function buildSummary(entries: SyncEntry[]): WorkspaceDbSyncReport['summary'] {
  return {
    total: entries.length,
    in_sync: entries.filter(entry => entry.status === 'in_sync').length,
    local_only: entries.filter(entry => entry.status === 'local_only').length,
    db_only: entries.filter(entry => entry.status === 'db_only').length,
    content_mismatch: entries.filter(entry => entry.status === 'content_mismatch').length,
    protected_drift: entries.filter(entry => entry.status === 'protected_drift').length,
    ignored_local: entries.filter(entry => entry.status === 'ignored_local').length,
    import_candidate: entries.filter(entry => entry.status === 'import_candidate').length,
  };
}

export function checkWorkspaceDbSync(workspacePath: string, workspaceId?: string): WorkspaceDbSyncReport {
  const agentsDir = path.join(workspacePath, '.github', 'agents');
  const instructionsDir = path.join(workspacePath, '.github', 'instructions');

  const agents: SyncEntry[] = [];
  const instructions: SyncEntry[] = [];

  const localAgents = collectLocalAgents(agentsDir);
  const localInstructions = collectLocalInstructions(instructionsDir);
  const agentDbMap = buildAgentDbMap();
  const instructionDbMap = buildInstructionDbMap();

  const seenAgentKeys = new Set<string>();
  const seenInstructionKeys = new Set<string>();

  for (const local of localAgents) {
    seenAgentKeys.add(local.lookup_key);
    agents.push(classifyLocalEntry({
      kind: 'agent',
      workspacePath,
      local,
      db: getAgentDbRecord(local, agentDbMap),
    }));
  }

  for (const local of localInstructions) {
    seenInstructionKeys.add(local.lookup_key);
    instructions.push(classifyLocalEntry({
      kind: 'instruction',
      workspacePath,
      local,
      db: getInstructionDbRecord(local, instructionDbMap),
    }));
  }

  for (const db of agentDbMap.values()) {
    if (seenAgentKeys.has(db.lookup_key)) continue;
    const entry = classifyDbOnlyEntry({ kind: 'agent', workspacePath, db });
    if (entry) {
      agents.push(entry);
    }
  }

  for (const db of instructionDbMap.values()) {
    if (seenInstructionKeys.has(db.lookup_key)) continue;
    const entry = classifyDbOnlyEntry({ kind: 'instruction', workspacePath, db });
    if (entry) {
      instructions.push(entry);
    }
  }

  for (const mandatoryFile of MANDATORY_AGENTS) {
    const canonicalName = mandatoryFile.replace(/\.agent\.md$/, '');
    const lookupKey = normalizeAgentLookupKey(canonicalName);
    if (seenAgentKeys.has(lookupKey) || agentDbMap.has(lookupKey)) continue;

    const entry = classifyMandatorySeedOnlyEntry({
      kind: 'agent',
      workspacePath,
      canonicalFilename: mandatoryFile,
      canonicalName,
    });
    if (entry) {
      agents.push(entry);
    }
  }

  for (const mandatoryFile of MANDATORY_INSTRUCTIONS) {
    const lookupKey = mandatoryFile.toLowerCase();
    if (seenInstructionKeys.has(lookupKey) || instructionDbMap.has(lookupKey)) continue;

    const entry = classifyMandatorySeedOnlyEntry({
      kind: 'instruction',
      workspacePath,
      canonicalFilename: mandatoryFile,
      canonicalName: mandatoryFile,
    });
    if (entry) {
      instructions.push(entry);
    }
  }

  const summary = buildSummary([...agents, ...instructions]);

  return {
    workspace_id: workspaceId,
    workspace_path: workspacePath,
    report_mode: 'read_only',
    writes_performed: false,
    github_agents_dir: agentsDir,
    github_instructions_dir: instructionsDir,
    agents,
    instructions,
    summary,
  };
}
