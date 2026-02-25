/**
 * Terminal Authorization — allowlist management, command classification, and persistence
 *
 * Extracted from terminal.tools.ts (MAJ-2) to keep each module focused:
 * - terminal.tools.ts → session management, process spawning, output buffering
 * - terminal-auth.ts  → authorization model, allowlist CRUD, disk persistence
 */

import { join } from 'node:path';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import * as store from '../storage/db-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AuthorizationResult {
  status: 'allowed' | 'blocked';
  reason?: string;
}

export interface AllowlistResult {
  workspace_id: string;
  patterns: string[];
  message: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ALLOWLIST_FILENAME = 'terminal-allowlist.json';

/** Default patterns that are always considered safe */
export const DEFAULT_ALLOWLIST: string[] = [
  'git status', 'git log', 'git diff', 'git branch', 'git show',
  'npm test', 'npm run build', 'npm run lint',
  'npx tsc', 'npx vitest', 'npx jest',
  'ls', 'dir', 'cat', 'type', 'echo', 'pwd',
  'Get-ChildItem', 'Get-Content', 'Get-Location',
  'node --version', 'npm --version', 'git --version',
];

/** Shell operators that require manual approval */
const DANGEROUS_OPERATORS = /[|&;><`$]/;

/** Destructive command prefixes/keywords — always blocked */
const DESTRUCTIVE_KEYWORDS = [
  'rm ', 'rm\t', 'rmdir',
  'del ', 'del\t',
  'format ',
  'drop ', 'truncate ',
  'Remove-Item', 'Clear-Content',
  'shutdown', 'reboot',
  'mkfs', 'dd ',
];

// ---------------------------------------------------------------------------
// In-memory cache (workspace_id → patterns)
// ---------------------------------------------------------------------------

const workspaceAllowlists = new Map<string, string[]>();

/** Track which workspaces have been loaded from disk */
const loadedFromDisk = new Set<string>();

// ---------------------------------------------------------------------------
// Disk persistence helpers
// ---------------------------------------------------------------------------

/**
 * Resolve the file path for a workspace's allowlist.
 * Uses `data/{workspace_id}/terminal-allowlist.json`.
 */
function getAllowlistPath(workspaceId: string): string {
  return join(store.getWorkspacePath(workspaceId), ALLOWLIST_FILENAME);
}

function sanitizePatterns(input: unknown): string[] {
  if (!Array.isArray(input)) return [];

  const dedup = new Set<string>();
  const normalized: string[] = [];

  for (const value of input) {
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    if (dedup.has(key)) continue;
    dedup.add(key);
    normalized.push(trimmed);
  }

  return normalized;
}

/**
 * Load an allowlist from disk into the in-memory cache.
 * Returns the loaded patterns or null if no file exists.
 */
async function loadAllowlistFromDisk(workspaceId: string): Promise<string[] | null> {
  try {
    const filePath = getAllowlistPath(workspaceId);
    const raw = await readFile(filePath, 'utf-8');
    const data = JSON.parse(raw);
    if (Array.isArray(data?.patterns)) {
      return data.patterns as string[];
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Persist the current allowlist for a workspace to disk.
 */
async function saveAllowlistToDisk(workspaceId: string, patterns: string[]): Promise<void> {
  const filePath = getAllowlistPath(workspaceId);
  await mkdir(join(store.getWorkspacePath(workspaceId)), { recursive: true });
  const payload = JSON.stringify({ patterns, updated_at: new Date().toISOString() }, null, 2);
  await writeFile(filePath, payload, 'utf-8');
}

// ---------------------------------------------------------------------------
// Allowlist access
// ---------------------------------------------------------------------------

/**
 * Get the effective allowlist for a workspace, loading from disk on first access.
 */
export async function getEffectiveAllowlist(workspaceId?: string): Promise<string[]> {
  if (!workspaceId) return DEFAULT_ALLOWLIST;

  // Return cached if available
  if (workspaceAllowlists.has(workspaceId)) {
    return workspaceAllowlists.get(workspaceId)!;
  }

  // First access — try loading from disk
  if (!loadedFromDisk.has(workspaceId)) {
    loadedFromDisk.add(workspaceId);
    const diskPatterns = await loadAllowlistFromDisk(workspaceId);
    if (diskPatterns) {
      workspaceAllowlists.set(workspaceId, diskPatterns);
    }
  }

  const basePatterns = workspaceAllowlists.get(workspaceId) ?? DEFAULT_ALLOWLIST;
  return basePatterns;
}

/**
 * Synchronous variant for hot-path authorization checks.
 * Falls back to DEFAULT_ALLOWLIST when workspace hasn't been loaded yet.
 */
function getEffectiveAllowlistSync(workspaceId?: string): string[] {
  if (workspaceId && workspaceAllowlists.has(workspaceId)) {
    return workspaceAllowlists.get(workspaceId)!;
  }
  return DEFAULT_ALLOWLIST;
}

// ---------------------------------------------------------------------------
// Command classification
// ---------------------------------------------------------------------------

/**
 * Returns true if the command contains a destructive keyword.
 */
export function isDestructiveCommand(fullCommand: string): { match: boolean; keyword?: string } {
  const lower = fullCommand.toLowerCase();
  for (const kw of DESTRUCTIVE_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      return { match: true, keyword: kw.trim() };
    }
  }
  return { match: false };
}

/**
 * Returns true if the command contains dangerous shell operators.
 */
export function hasShellOperators(command: string): boolean {
  return DANGEROUS_OPERATORS.test(command);
}

// ---------------------------------------------------------------------------
// Authorization
// ---------------------------------------------------------------------------

/**
 * Check whether a command is authorized.
 *
 * Call `ensureAllowlistLoaded()` first for the workspace if you want
 * disk-persisted patterns to participate. Otherwise only the in-memory
 * cache / defaults are consulted (safe fast-path).
 */
export function authorizeCommand(
  command: string,
  args: string[],
  workspaceId?: string,
): AuthorizationResult {
  const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
  const lower = fullCommand.toLowerCase();

  // 1. Destructive keywords → always blocked
  const destructive = isDestructiveCommand(fullCommand);
  if (destructive.match) {
    return {
      status: 'blocked',
      reason: `Command contains destructive keyword: "${destructive.keyword}". This command is blocked for safety.`,
    };
  }

  // 2. Shell operators → blocked
  if (hasShellOperators(fullCommand)) {
    return {
      status: 'blocked',
      reason: 'Command contains shell operators (|, &&, ;, >, >>). Add individual commands to the allowlist instead.',
    };
  }

  // 3. Check against allowlist
  const allowlist = getEffectiveAllowlistSync(workspaceId);
  for (const pattern of allowlist) {
    if (fullCommand.startsWith(pattern) || lower.startsWith(pattern.toLowerCase())) {
      return { status: 'allowed' };
    }
  }

  return {
    status: 'blocked',
    reason: `Command "${command}" is not in the allowlist. Add it via update_allowlist to approve it.`,
  };
}

/**
 * Ensure the allowlist for a workspace has been loaded from disk.
 * Idempotent — safe to call multiple times.
 */
export async function ensureAllowlistLoaded(workspaceId: string): Promise<void> {
  await getEffectiveAllowlist(workspaceId);
}

// ---------------------------------------------------------------------------
// Allowlist CRUD (with persistence)
// ---------------------------------------------------------------------------

export async function getAllowlist(workspaceId?: string): Promise<AllowlistResult> {
  const wsId = workspaceId || 'global';
  const patterns = await getEffectiveAllowlist(workspaceId);

  return {
    workspace_id: wsId,
    patterns,
    message: `Allowlist contains ${patterns.length} patterns.`,
  };
}

export async function updateAllowlist(params: {
  workspace_id?: string;
  patterns: string[];
  operation: 'add' | 'remove' | 'set';
}): Promise<AllowlistResult> {
  const wsId = params.workspace_id || 'global';

  // Get or initialize workspace-specific allowlist
  let current = workspaceAllowlists.get(wsId);
  if (!current) {
    // Try loading from disk first
    const diskPatterns = await loadAllowlistFromDisk(wsId);
    current = diskPatterns ?? [...DEFAULT_ALLOWLIST];
  }

  switch (params.operation) {
    case 'add': {
      const toAdd = params.patterns.filter((p) => !current!.includes(p));
      current = [...current, ...toAdd];
      break;
    }
    case 'remove': {
      current = current.filter((p) => !params.patterns.includes(p));
      break;
    }
    case 'set': {
      current = [...params.patterns];
      break;
    }
  }

  workspaceAllowlists.set(wsId, current);

  // Persist to disk (skip for 'global' pseudo-workspace)
  if (wsId !== 'global') {
    try {
      await saveAllowlistToDisk(wsId, current);
    } catch {
      // Non-fatal — in-memory update still applies
    }
  }

  return {
    workspace_id: wsId,
    patterns: current,
    message: `Allowlist updated (${params.operation}). Now has ${current.length} patterns.`,
  };
}
