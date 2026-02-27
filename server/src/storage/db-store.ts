/**
 * db-store.ts — Drop-in replacement for file-store.ts using SQLite.
 *
 * Provides the same public API as file-store.ts so callers only need
 * to change their import path:
 *
 *   -  import * as store from '../storage/file-store.js'
 *   +  import * as store from '../storage/db-store.js'
 *
 * All workspace / plan data goes through the DB layer.
 * File-I/O utilities (ensureDir, exists, readJson, etc.) are still
 * exported for tools that manage physical workspace files (agent deploy,
 * prompts, filesystem safety checks, etc.).
 *
 * NOTE: The DB functions in ../db/ are synchronous (better-sqlite3).
 * All functions here are async to preserve the existing call-site contract.
 */

import { promises as fs } from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

import type {
  PlanState,
  WorkspaceMeta,
  WorkspaceProfile,
  WorkspaceContext,
  RequestCategory,
  RequestCategorization,
  BuildScript,
  Investigation,
  WorkspaceOverlapInfo,
} from '../types/index.js';
import type {
  ProgramState,
  ProgramDependency,
  ProgramRisk,
  ProgramManifest,
} from '../types/program-v2.types.js';

// ── DB layer ─────────────────────────────────────────────────────────────────
import { getDb } from '../db/connection.js';
import { runMigrations } from '../db/migration-runner.js';
import { queryOne, queryAll, run, transaction, newId, nowIso } from '../db/query-helpers.js';
import {
  createWorkspace as dbCreateWorkspace,
  getWorkspace as dbGetWorkspace,
  getWorkspaceByPath,
  listWorkspaces as dbListWorkspaces,
  listChildWorkspaces,
  updateWorkspace as dbUpdateWorkspace,
} from '../db/workspace-db.js';
import {
  createPlan as dbCreatePlan,
  getPlan as dbGetPlan,
  getPlansByWorkspace,
  findPlanById as dbFindPlanById,
  updatePlan as dbUpdatePlan,
  deletePlan as dbDeletePlan,
} from '../db/plan-db.js';
import { createPhase, getOrCreatePhase, getPhases } from '../db/phase-db.js';
import {
  createStepInPhase,
  getAllSteps,
  updateStep as dbUpdateStep,
} from '../db/step-db.js';
import { getSessions } from '../db/session-db.js';
import { getLineage } from '../db/lineage-db.js';
import {
  addBuildScript as dbAddBuildScript,
  getBuildScripts as dbGetBuildScripts,
  deleteBuildScript as dbDeleteBuildScript,
} from '../db/build-script-db.js';
import {
  createProgram as dbCreateProgram,
  getProgram as dbGetProgram_prog,
  listPrograms as dbListPrograms_prog,
  listProgramPlans as dbListProgramPlans,
  addPlanToProgram as dbAddPlanToProgram,
  removePlanFromProgram as dbRemovePlanFromProgram,
  updateProgram as dbUpdateProgram_prog,
  deleteProgram as dbDeleteProgram_prog,
} from '../db/program-db.js';
import {
  getRisks as dbGetRisks,
  addRisk as dbAddRisk,
  deleteRisksForProgram as dbDeleteRisksForProgram,
} from '../db/program-risks-db.js';
import {
  addProgramDependency as dbAddProgramDependency,
  getPlanDependenciesForProgram as dbGetPlanDepsForProgram,
  deletePlanDependencies as dbDeletePlanDeps,
} from '../db/dependency-db.js';
import {
  storeContext as dbStoreContext,
  getContext as dbGetContext,
  deleteContext as dbDeleteContext,
} from '../db/context-db.js';
import {
  rowToWorkspaceMeta,
  rowToSession,
  rowToLineage,
  assemblePlanState,
} from '../db/mappers.js';
import type { WorkspaceRow, PlanRow, StepRow, PhaseRow, SessionRow, LineageRow, ProgramRow, ProgramRiskRow, ProgramPlanRow, DependencyRow } from '../db/types.js';

// ── File-lock utilities (inlined — file-lock.ts archived) ────────────────────
import {
  shouldProxyFilePath,
  writeJsonViaHostProxy,
  readJsonViaHostProxy,
} from './remote-file-proxy.js';

/**
 * In-process file lock manager for serializing concurrent file operations.
 * Uses Promise chaining for same-process serialization.
 * Cross-host paths (container mode) bypass locking via the remote proxy.
 */
class FileLockManager {
  private inMemoryLocks: Map<string, Promise<void>> = new Map();

  async withLock<T>(filePath: string, operation: () => Promise<T>): Promise<T> {
    if (shouldProxyFilePath(filePath)) {
      // Cross-host paths are written via remote MCP proxy; no local locking needed.
      return operation();
    }
    const normalizedPath = path.normalize(filePath).toLowerCase();
    const existingLock = this.inMemoryLocks.get(normalizedPath);
    if (existingLock) {
      await existingLock.catch(() => {});
    }
    let resolveLock!: () => void;
    const lockPromise = new Promise<void>((resolve) => { resolveLock = resolve; });
    this.inMemoryLocks.set(normalizedPath, lockPromise);
    try {
      await fs.mkdir(path.dirname(filePath), { recursive: true });
      return await operation();
    } finally {
      resolveLock();
      if (this.inMemoryLocks.get(normalizedPath) === lockPromise) {
        this.inMemoryLocks.delete(normalizedPath);
      }
    }
  }
}

export const fileLockManager = new FileLockManager();

const RESEARCH_NOTE_TYPE_PREFIX = 'research_note:';

type VirtualPlanPath =
  | { kind: 'context'; workspaceId: string; planId: string; contextType: string }
  | { kind: 'research_note'; workspaceId: string; planId: string; filename: string };

function normalizePathForCompare(inputPath: string): string {
  return path.resolve(inputPath).replace(/\\/g, '/').replace(/\/+$/, '');
}

function tryParseVirtualPlanPath(filePath: string): VirtualPlanPath | null {
  const normalized = normalizePathForCompare(filePath);
  const dataRoot = normalizePathForCompare(getDataRoot());
  if (!normalized.startsWith(`${dataRoot}/`)) return null;

  const rel = normalized.slice(dataRoot.length + 1);
  const parts = rel.split('/');
  if (parts.length < 4) return null;
  const [workspaceId, maybePlans, planId, ...rest] = parts;
  if (maybePlans !== 'plans' || !workspaceId || !planId || rest.length === 0) return null;

  if (rest.length === 1 && rest[0].endsWith('.json') && rest[0] !== 'state.json') {
    return {
      kind: 'context',
      workspaceId,
      planId,
      contextType: rest[0].replace(/\.json$/i, ''),
    };
  }

  if (rest[0] === 'research_notes' && rest.length >= 2) {
    return {
      kind: 'research_note',
      workspaceId,
      planId,
      filename: rest.slice(1).join('/'),
    };
  }

  return null;
}

function wrapContextValue(value: unknown): object {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return value as object;
  }
  return { __pm_value: value };
}

function unwrapContextValue<T>(value: unknown): T {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.prototype.hasOwnProperty.call(value, '__pm_value')
  ) {
    return (value as { __pm_value: T }).__pm_value;
  }
  return value as T;
}

function researchNoteType(filename: string): string {
  return `${RESEARCH_NOTE_TYPE_PREFIX}${filename}`;
}

function isResearchNoteType(type: string): boolean {
  return type.startsWith(RESEARCH_NOTE_TYPE_PREFIX);
}

function rowData(row: { data: string }): unknown {
  return JSON.parse(row.data);
}

/**
 * Read a JSON file (unlocked — use modifyJsonLocked for concurrent access).
 */
export async function readJson<T>(filePath: string): Promise<T | null> {
  const virtual = tryParseVirtualPlanPath(filePath);
  if (virtual?.kind === 'context') {
    const rows = dbGetContext('plan', virtual.planId, virtual.contextType);
    if (!rows.length) return null;
    return unwrapContextValue<T>(rowData(rows[0]));
  }
  if (virtual?.kind === 'research_note') {
    const rows = dbGetContext('plan', virtual.planId, researchNoteType(virtual.filename));
    if (!rows.length) return null;
    return rowData(rows[0]) as T;
  }

  if (shouldProxyFilePath(filePath)) {
    try { return await readJsonViaHostProxy<T>(filePath); } catch { return null; }
  }
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch { return null; }
}

/**
 * Write a JSON file with pretty formatting (unlocked).
 * Prefer writeJsonLocked() or modifyJsonLocked() for concurrent access.
 */
export async function writeJson<T>(filePath: string, data: T): Promise<void> {
  const virtual = tryParseVirtualPlanPath(filePath);
  if (virtual?.kind === 'context') {
    dbStoreContext('plan', virtual.planId, virtual.contextType, wrapContextValue(data));
    return;
  }
  if (virtual?.kind === 'research_note') {
    dbStoreContext('plan', virtual.planId, researchNoteType(virtual.filename), wrapContextValue(data));
    return;
  }

  if (shouldProxyFilePath(filePath)) {
    await writeJsonViaHostProxy(filePath, JSON.stringify(data, null, 2));
    return;
  }
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8');
}

/**
 * Read-modify-write a JSON file with in-process locking.
 * The modifier receives the current value (or null) and returns the new value.
 */
export async function modifyJsonLocked<T>(
  filePath: string,
  modifier: (data: T | null) => Promise<T> | T
): Promise<T> {
  return fileLockManager.withLock(filePath, async () => {
    const data = await readJson<T>(filePath);
    const modified = await modifier(data);
    await writeJson(filePath, modified);
    return modified;
  });
}

/**
 * Write a JSON file with in-process locking.
 * For read-modify-write, use modifyJsonLocked() instead.
 */
export async function writeJsonLocked<T>(filePath: string, data: T): Promise<void> {
  await fileLockManager.withLock(filePath, async () => {
    await writeJson(filePath, data);
  });
}

// ── workspace-identity re-exports ─────────────────────────────────────────────
export type { WorkspaceIdentityFile } from './workspace-identity.js';
export {
  getWorkspaceIdentityPath,
  readWorkspaceIdentityFile,
  resolveCanonicalWorkspaceId,
  ensureIdentityFile,
} from './workspace-identity.js';
// ── workspace-operations re-exports ───────────────────────────────────────────
export type { GhostFolderInfo, MergeResult, MigrateWorkspaceResult } from './workspace-operations.js';
export {
  WorkspaceNotRegisteredError,
  validateWorkspaceId,
  findCanonicalForLegacyId,
  resolveOrReject,
  isCanonicalIdFormat,
  validateWorkspaceIdFormat,
  scanGhostFolders,
  mergeWorkspace,
  migrateWorkspace,
} from './workspace-operations.js';

// ── Program operations (replacing program-store.ts file-based I/O) ───────────

export interface ProgramSearchArtifact {
  program_id: string;
  file_type: 'program_state' | 'program_manifest' | 'program_dependencies' | 'program_risks';
  file_path: string;
  payload: unknown;
  updated_at: string;
}

function rowToProgramState(row: ProgramRow): ProgramState {
  return {
    id:          row.id,
    workspace_id: row.workspace_id,
    title:       row.title,
    description: row.description,
    priority:    row.priority as ProgramState['priority'],
    category:    row.category,
    status:      (row.status === 'archived' ? 'archived' : 'active') as ProgramState['status'],
    created_at:  row.created_at,
    updated_at:  row.updated_at,
    ...(row.archived_at ? { archived_at: row.archived_at } : {}),
  };
}

function rowToProgramDependency(row: DependencyRow): ProgramDependency {
  return {
    id:             String(row.id),
    source_plan_id: row.source_id,
    target_plan_id: row.target_id,
    type:           row.dep_type,
    status:         row.dep_status,
    created_at:     row.created_at,
    ...(row.source_phase ? { source_phase: row.source_phase } : {}),
    ...(row.target_phase ? { target_phase: row.target_phase } : {}),
    ...(row.satisfied_at ? { satisfied_at: row.satisfied_at } : {}),
  };
}

function rowToProgramRisk(row: ProgramRiskRow): ProgramRisk {
  const affectedPlanIds: string[] = (() => {
    try { return JSON.parse(row.affected_plan_ids ?? '[]'); } catch { return []; }
  })();
  return {
    id:             row.id,
    program_id:     row.program_id,
    type:           row.risk_type,
    severity:       row.severity,
    status:         (row.risk_status ?? 'identified') as ProgramRisk['status'],
    title:          row.title || row.description,
    description:    row.description,
    mitigation:     row.mitigation ?? undefined,
    detected_by:    (row.detected_by ?? 'manual') as ProgramRisk['detected_by'],
    source_plan_id: affectedPlanIds[0],
    created_at:     row.created_at,
    updated_at:     row.updated_at ?? row.created_at,
  };
}

/** No-op: DB-backed programs don't need a directory. */
export async function createProgramDir(_workspaceId: string, _programId: string): Promise<void> {
  // DB programs don't use filesystem directories.
}

export async function readProgramState(
  _workspaceId: string,
  programId: string,
): Promise<ProgramState | null> {
  const row = dbGetProgram_prog(programId);
  return row ? rowToProgramState(row) : null;
}

export async function saveProgramState(
  workspaceId: string,
  programId: string,
  state: ProgramState,
): Promise<void> {
  const existing = dbGetProgram_prog(programId);
  if (!existing) {
    dbCreateProgram(workspaceId, {
      id:          programId,
      title:       state.title,
      description: state.description,
      category:    state.category,
      priority:    state.priority,
    });
  } else {
    dbUpdateProgram_prog(programId, {
      title:       state.title,
      description: state.description,
      category:    state.category,
      priority:    state.priority,
      status:      state.status === 'archived' ? 'archived' : 'active',
    });
  }
}

export async function readDependencies(
  _workspaceId: string,
  programId: string,
): Promise<ProgramDependency[]> {
  const planRows = dbListProgramPlans(programId);
  const planIds  = planRows.map(r => r.plan_id);
  const depRows  = dbGetPlanDepsForProgram(planIds);
  return depRows.map(rowToProgramDependency);
}

export async function saveDependencies(
  _workspaceId: string,
  programId: string,
  deps: ProgramDependency[],
): Promise<void> {
  // Delete all existing plan-level deps for plans in this program
  const planRows = dbListProgramPlans(programId);
  for (const pr of planRows) {
    dbDeletePlanDeps(pr.plan_id);
  }
  // Re-insert all deps
  for (const dep of deps) {
    dbAddProgramDependency(
      dep.source_plan_id,
      dep.target_plan_id,
      dep.type,
      dep.status,
      dep.source_phase ?? null,
      dep.target_phase ?? null,
      dep.satisfied_at ?? null,
    );
  }
}

export async function readRisks(
  _workspaceId: string,
  programId: string,
): Promise<ProgramRisk[]> {
  const rows = dbGetRisks(programId);
  return rows.map(rowToProgramRisk);
}

export async function saveRisks(
  _workspaceId: string,
  programId: string,
  risks: ProgramRisk[],
): Promise<void> {
  dbDeleteRisksForProgram(programId);
  for (const risk of risks) {
    dbAddRisk(programId, {
      risk_type:        risk.type,
      severity:         risk.severity,
      description:      risk.description,
      affected_plan_ids: JSON.stringify(risk.source_plan_id ? [risk.source_plan_id] : []),
      mitigation:       risk.mitigation ?? null,
      title:            risk.title,
      risk_status:      risk.status,
      detected_by:      risk.detected_by,
      source_plan_id:   risk.source_plan_id ?? null,
      updated_at:       risk.updated_at,
    });
  }
}

export async function readManifest(
  _workspaceId: string,
  programId: string,
): Promise<ProgramManifest | null> {
  const planRows = dbListProgramPlans(programId);
  if (planRows.length === 0) return null;
  const latestAddedAt = planRows.map(r => r.added_at).sort().at(-1) ?? nowIso();
  return {
    program_id: programId,
    plan_ids:   planRows.map(r => r.plan_id),
    updated_at: latestAddedAt,
  };
}

export async function saveManifest(
  _workspaceId: string,
  programId: string,
  manifest: ProgramManifest,
): Promise<void> {
  const existing = dbListProgramPlans(programId).map(r => r.plan_id);
  const incoming = manifest.plan_ids;

  // Remove plans no longer in manifest
  for (const planId of existing) {
    if (!incoming.includes(planId)) {
      dbRemovePlanFromProgram(programId, planId);
    }
  }
  // Add new plans
  for (let i = 0; i < incoming.length; i++) {
    const planId = incoming[i];
    if (!existing.includes(planId)) {
      dbAddPlanToProgram(programId, planId, i);
    }
  }
}

export async function listPrograms(workspaceId: string): Promise<string[]> {
  return dbListPrograms_prog(workspaceId).map(r => r.id);
}

export async function deleteProgram(_workspaceId: string, programId: string): Promise<void> {
  dbDeleteProgram_prog(programId);
}

export async function listProgramSearchArtifacts(workspaceId: string): Promise<ProgramSearchArtifact[]> {
  const artifacts: ProgramSearchArtifact[] = [];
  const programIds = await listPrograms(workspaceId);

  for (const programId of programIds) {
    const state = await readProgramState(workspaceId, programId);
    if (state) {
      artifacts.push({
        program_id: programId,
        file_type:  'program_state',
        file_path:  `db:programs/${programId}`,
        payload:    state,
        updated_at: state.updated_at,
      });
    }

    const manifest = await readManifest(workspaceId, programId);
    if (manifest) {
      artifacts.push({
        program_id: programId,
        file_type:  'program_manifest',
        file_path:  `db:programs/${programId}/manifest`,
        payload:    manifest,
        updated_at: manifest.updated_at,
      });
    }

    const deps = await readDependencies(workspaceId, programId);
    if (deps.length > 0) {
      const updatedAt = deps.map(d => d.satisfied_at ?? d.created_at).filter(Boolean).sort().at(-1) ?? nowIso();
      artifacts.push({
        program_id: programId,
        file_type:  'program_dependencies',
        file_path:  `db:programs/${programId}/dependencies`,
        payload:    deps,
        updated_at: updatedAt,
      });
    }

    const risks = await readRisks(workspaceId, programId);
    if (risks.length > 0) {
      const updatedAt = risks.map(r => r.updated_at).filter(Boolean).sort().at(-1) ?? nowIso();
      artifacts.push({
        program_id: programId,
        file_type:  'program_risks',
        file_path:  `db:programs/${programId}/risks`,
        payload:    risks,
        updated_at: updatedAt,
      });
    }
  }
  return artifacts;
}

// ── projectmemory-paths (inlined from projectmemory-paths.ts) ────────────────

export function getProjectMemoryDir(workspacePath: string): string {
  return path.join(workspacePath, '.projectmemory');
}
export function getActiveAgentsDir(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'active_agents');
}
export function getAgentDeployDir(workspacePath: string, agentName: string): string {
  return path.join(getActiveAgentsDir(workspacePath), agentName.toLowerCase());
}
export function getDeployedAgentFile(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), `${agentName.toLowerCase()}.agent.md`);
}
export function getContextBundlePath(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'context-bundle.json');
}
export function getManifestPath(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'manifest.json');
}
export function getInitContextPath(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'init-context.json');
}
export function getAgentContextDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'context');
}
export function getAgentPullStagingDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentContextDir(workspacePath, agentName), 'pull_staging');
}
export function getAgentPullSessionDir(workspacePath: string, agentName: string, sessionId: string): string {
  return path.join(getAgentPullStagingDir(workspacePath, agentName), sessionId);
}
export function getAgentPullManifestPath(workspacePath: string, agentName: string, sessionId: string): string {
  return path.join(getAgentPullSessionDir(workspacePath, agentName, sessionId), 'manifest.json');
}
export function getAgentInstructionsDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'instructions');
}
export function getAgentExecutionNotesDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'execution_notes');
}
export function getAgentToolResponsesDir(workspacePath: string, agentName: string): string {
  return path.join(getAgentDeployDir(workspacePath, agentName), 'tool_responses');
}
export function getReviewedQueueDir(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'reviewed_queue');
}
export function getReviewedAgentDir(
  workspacePath: string,
  planId: string,
  agentName: string,
  timestamp: string,
): string {
  return path.join(
    getReviewedQueueDir(workspacePath),
    planId,
    `${agentName.toLowerCase()}_${timestamp}`,
  );
}
export function getIdentityPath(workspacePath: string): string {
  return path.join(getProjectMemoryDir(workspacePath), 'identity.json');
}
export function getInvestigationDir(
  dataRoot: string,
  workspaceId: string,
  planId: string,
  investigationId: string,
): string {
  return path.join(dataRoot, workspaceId, 'plans', planId, 'investigations', investigationId);
}

// ── workspace-hierarchy (inlined from workspace-hierarchy.ts) ────────────────

/** Directories to skip when scanning downward for child workspaces. */
const _WH_SKIP_DIRS = new Set([
  'node_modules', '.git', '.memory', '.projectmemory', '.hg', '.svn',
  '__pycache__', '.tox', '.venv', 'venv', '.next', 'dist', 'build', 'target',
]);

export interface WorkspaceHierarchyInfo {
  parent?: { id: string; name: string; path: string };
  children: Array<{ id: string; name: string; path: string }>;
}

/**
 * Walk UP the directory tree from `startPath` looking for `.projectmemory/identity.json`.
 * Returns the first parent workspace found, or null.
 */
export async function scanUpForParent(
  startPath: string
): Promise<{ workspaceId: string; workspacePath: string } | null> {
  const { readWorkspaceIdentityFile, getWorkspaceIdentityPath } = await import('./workspace-identity.js');
  const resolvedStart = safeResolvePath(startPath);
  let current = path.dirname(resolvedStart);

  while (true) {
    const parent = path.dirname(current);
    if (parent === current) break; // filesystem root

    const identityPath = getWorkspaceIdentityPath(current);
    try {
      await fs.access(identityPath);
      const identity = await readWorkspaceIdentityFile(current);
      if (identity?.workspace_id && identity.workspace_path) {
        return { workspaceId: identity.workspace_id, workspacePath: identity.workspace_path };
      }
    } catch {
      // no identity.json here — keep climbing
    }
    current = parent;
  }
  return null;
}

/**
 * Recursively scan subdirectories of `startPath` up to `maxDepth` levels,
 * looking for `.projectmemory/identity.json` child workspaces.
 */
export async function scanDownForChildren(
  startPath: string,
  maxDepth: number = 2
): Promise<Array<{ workspaceId: string; workspacePath: string }>> {
  const { readWorkspaceIdentityFile, getWorkspaceIdentityPath } = await import('./workspace-identity.js');
  const resolvedStart = safeResolvePath(startPath);
  const results: Array<{ workspaceId: string; workspacePath: string }> = [];

  async function walk(dir: string, depth: number): Promise<void> {
    if (depth > maxDepth) return;
    let entries: import('fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      return; // permission denied or not a directory
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (_WH_SKIP_DIRS.has(entry.name)) continue;
      const childDir = path.join(dir, entry.name);
      const identityPath = getWorkspaceIdentityPath(childDir);
      try {
        await fs.access(identityPath);
        const identity = await readWorkspaceIdentityFile(childDir);
        if (identity?.workspace_id && identity.workspace_path) {
          results.push({ workspaceId: identity.workspace_id, workspacePath: identity.workspace_path });
          continue; // don't recurse into a child workspace's subtree
        }
      } catch {
        // no identity.json here — recurse deeper
      }
      await walk(childDir, depth + 1);
    }
  }

  await walk(resolvedStart, 1);
  return results;
}

/**
 * Detect overlapping workspaces by scanning both upward and downward from the given path.
 */
export async function detectOverlaps(workspacePath: string): Promise<WorkspaceOverlapInfo[]> {
  const resolvedPath = safeResolvePath(workspacePath);
  const overlaps: WorkspaceOverlapInfo[] = [];

  const parent = await scanUpForParent(resolvedPath);
  if (parent) {
    overlaps.push({
      overlap_detected: true,
      relationship: 'parent',
      existing_workspace_id: parent.workspaceId,
      existing_workspace_path: parent.workspacePath,
      existing_workspace_name: path.basename(parent.workspacePath),
      suggested_action: 'link',
      message: `Directory is inside existing workspace "${path.basename(parent.workspacePath)}" (${parent.workspaceId}). Consider linking as a child workspace.`,
    });
  }

  const children = await scanDownForChildren(resolvedPath);
  for (const child of children) {
    overlaps.push({
      overlap_detected: true,
      relationship: 'child',
      existing_workspace_id: child.workspaceId,
      existing_workspace_path: child.workspacePath,
      existing_workspace_name: path.basename(child.workspacePath),
      suggested_action: 'link',
      message: `Directory contains existing workspace "${path.basename(child.workspacePath)}" (${child.workspaceId}). Consider linking as a child workspace.`,
    });
  }

  return overlaps;
}

/**
 * Check the workspace registry for path containment overlaps.
 * Fallback used when identity.json files may not exist (e.g. container mode).
 */
export function checkRegistryForOverlaps(
  workspacePath: string,
  registry: Record<string, string>
): WorkspaceOverlapInfo[] {
  const normalizedNew = normalizeWorkspacePath(workspacePath);
  const overlaps: WorkspaceOverlapInfo[] = [];

  for (const [registeredPath, registeredId] of Object.entries(registry)) {
    if (registeredPath === normalizedNew) continue;
    const isParent = normalizedNew.startsWith(registeredPath + '/');
    const isChild = registeredPath.startsWith(normalizedNew + '/');
    if (isParent) {
      overlaps.push({
        overlap_detected: true,
        relationship: 'parent',
        existing_workspace_id: registeredId,
        existing_workspace_path: registeredPath,
        existing_workspace_name: path.basename(registeredPath),
        suggested_action: 'link',
        message: `Directory is inside registered workspace "${path.basename(registeredPath)}" (${registeredId}). Consider linking as a child workspace.`,
      });
    } else if (isChild) {
      overlaps.push({
        overlap_detected: true,
        relationship: 'child',
        existing_workspace_id: registeredId,
        existing_workspace_path: registeredPath,
        existing_workspace_name: path.basename(registeredPath),
        suggested_action: 'link',
        message: `Directory contains registered workspace "${path.basename(registeredPath)}" (${registeredId}). Consider linking as a child workspace.`,
      });
    }
  }

  return overlaps;
}

/**
 * Create a bidirectional parent-child link between two workspaces.
 * Updates DB meta for both workspaces and the child's on-disk identity.json.
 */
export async function linkWorkspaces(
  parentId: string,
  childId: string,
  _dataRoot?: string
): Promise<void> {
  const { getWorkspaceIdentityPath } = await import('./workspace-identity.js');
  const now = new Date().toISOString();

  const parentMeta = await getWorkspace(parentId);
  if (!parentMeta) throw new Error(`Parent workspace not found: ${parentId}`);
  const childIdSet = new Set(parentMeta.child_workspace_ids ?? []);
  childIdSet.add(childId);
  parentMeta.child_workspace_ids = [...childIdSet];
  parentMeta.hierarchy_linked_at = now;
  await saveWorkspace(parentMeta);

  const childMeta = await getWorkspace(childId);
  if (!childMeta) throw new Error(`Child workspace not found: ${childId}`);
  childMeta.parent_workspace_id = parentId;
  childMeta.hierarchy_linked_at = now;
  await saveWorkspace(childMeta);

  const childPath = childMeta.workspace_path || childMeta.path;
  const parentPath = parentMeta.workspace_path || parentMeta.path;
  if (childPath) {
    try {
      const identityPath = getWorkspaceIdentityPath(childPath);
      await modifyJsonLocked<Record<string, unknown>>(identityPath, (prev) => ({
        ...(prev ?? {}),
        parent_workspace_id: parentId,
        parent_workspace_path: parentPath,
        updated_at: now,
      }));
    } catch {
      console.warn(`[workspace-hierarchy] Could not update child identity.json at ${childPath}`);
    }
  }
}

/**
 * Remove the parent-child link between two workspaces.
 * Updates DB meta for both workspaces and clears the child's on-disk identity.json.
 */
export async function unlinkWorkspaces(
  parentId: string,
  childId: string,
  _dataRoot?: string
): Promise<void> {
  const { getWorkspaceIdentityPath } = await import('./workspace-identity.js');
  const now = new Date().toISOString();

  const parentMeta = await getWorkspace(parentId);
  if (!parentMeta) throw new Error(`Parent workspace not found: ${parentId}`);
  const remainingChildren = new Set(parentMeta.child_workspace_ids ?? []);
  remainingChildren.delete(childId);
  parentMeta.child_workspace_ids = remainingChildren.size > 0 ? [...remainingChildren] : undefined;
  if (!parentMeta.child_workspace_ids?.length && !parentMeta.parent_workspace_id) {
    parentMeta.hierarchy_linked_at = undefined;
  } else {
    parentMeta.hierarchy_linked_at = now;
  }
  await saveWorkspace(parentMeta);

  const childMeta = await getWorkspace(childId);
  if (!childMeta) throw new Error(`Child workspace not found: ${childId}`);
  childMeta.parent_workspace_id = undefined;
  if (!childMeta.child_workspace_ids?.length) childMeta.hierarchy_linked_at = undefined;
  await saveWorkspace(childMeta);

  const childPath = childMeta.workspace_path || childMeta.path;
  if (childPath) {
    try {
      const identityPath = getWorkspaceIdentityPath(childPath);
      await modifyJsonLocked<Record<string, unknown>>(identityPath, (prev) => {
        if (!prev) return {};
        const updated: Record<string, unknown> = { ...prev, updated_at: now };
        delete updated.parent_workspace_id;
        delete updated.parent_workspace_path;
        return updated;
      });
    } catch {
      console.warn(`[workspace-hierarchy] Could not update child identity.json at ${childPath}`);
    }
  }
}

/**
 * Retrieve the full hierarchy for a given workspace — its parent (if any) and all children.
 */
export async function getWorkspaceHierarchy(
  workspaceId: string,
  _dataRoot?: string
): Promise<WorkspaceHierarchyInfo> {
  const meta = await getWorkspace(workspaceId);
  if (!meta) return { children: [] };

  const hierarchy: WorkspaceHierarchyInfo = { children: [] };

  if (meta.parent_workspace_id) {
    const parentMeta = await getWorkspace(meta.parent_workspace_id);
    if (parentMeta) {
      hierarchy.parent = {
        id: parentMeta.workspace_id,
        name: parentMeta.name,
        path: parentMeta.workspace_path || parentMeta.path,
      };
    }
  }

  if (meta.child_workspace_ids?.length) {
    for (const cId of meta.child_workspace_ids) {
      const childMeta = await getWorkspace(cId);
      if (childMeta) {
        hierarchy.children.push({
          id: childMeta.workspace_id,
          name: childMeta.name,
          path: childMeta.workspace_path || childMeta.path,
        });
      }
    }
  }

  return hierarchy;
}

// ── Path helpers (inlined from workspace-utils.ts) ───────────────────────────

const _WU_DEFAULT_HASH_LENGTH = 12;
let _cachedWorkspaceRoot: string | null = null;
let _cachedDataRoot: string | null = null;

/**
 * Safely resolve a workspace path across platforms.
 * On Linux/macOS containers, path.resolve() corrupts Windows absolute paths
 * (e.g. "C:\\foo" becomes "/app/C:\\foo"). This detects Windows paths and
 * returns them as-is when running on non-Windows platforms.
 */
export function safeResolvePath(inputPath: string): string {
  const isWindowsAbsolute = /^[a-zA-Z]:[\\\/]/.test(inputPath);
  if (isWindowsAbsolute && process.platform !== 'win32') {
    return inputPath;
  }
  return path.resolve(inputPath);
}

export function resolveWorkspaceRoot(): string {
  if (_cachedWorkspaceRoot) {
    return _cachedWorkspaceRoot;
  }
  const envRoot = process.env.MBS_WORKSPACE_ROOT;
  if (envRoot) {
    _cachedWorkspaceRoot = path.resolve(envRoot);
    return _cachedWorkspaceRoot;
  }
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  _cachedWorkspaceRoot = path.resolve(currentDir, '../../..');
  return _cachedWorkspaceRoot;
}

/**
 * Return the platform-appropriate app-data base directory.
 * Mirrors the same logic in db/connection.ts and the Rust supervisor.
 *
 *   Windows : %APPDATA%                       (e.g. C:\Users\Alice\AppData\Roaming)
 *   macOS   : ~/Library/Application Support
 *   Linux   : $XDG_DATA_HOME  (fallback: ~/.local/share)
 */
function platformDataDir(): string {
  if (process.platform === 'win32') {
    return process.env['APPDATA'] ?? path.join(os.homedir(), 'AppData', 'Roaming');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support');
  }
  return process.env['XDG_DATA_HOME'] ?? path.join(os.homedir(), '.local', 'share');
}

export function getDataRoot(): string {
  if (_cachedDataRoot) {
    return _cachedDataRoot;
  }
  // Priority:
  //   1. PM_DATA_ROOT  — used by tests and container overrides
  //   2. MBS_DATA_ROOT — legacy env var (kept for transition period)
  //   3. Platform app-data: <appDataDir>/ProjectMemory/
  const override = process.env['PM_DATA_ROOT'] ?? process.env['MBS_DATA_ROOT'];
  _cachedDataRoot = override
    ? path.resolve(override)
    : path.join(platformDataDir(), 'ProjectMemory');
  return _cachedDataRoot;
}

export function normalizeWorkspacePath(workspacePath: string): string {
  const resolved = safeResolvePath(workspacePath);
  const normalized = resolved
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/') // collapse runs of // to /
    .toLowerCase();
  return normalized.replace(/\/+$/, '');
}

export function getWorkspaceIdFromPath(workspacePath: string): string {
  const normalizedPath = normalizeWorkspacePath(workspacePath);
  const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex');
  const shortHash = hash.substring(0, _WU_DEFAULT_HASH_LENGTH);
  const folderName = path.basename(normalizedPath).toLowerCase();
  return `${folderName}-${shortHash}`;
}

export function getWorkspaceDisplayName(workspacePath: string): string {
  const trimmedInput = workspacePath.trim().replace(/[\\\/]+$/, '');
  const isWindowsStyle = /^[a-zA-Z]:[\\\/]/.test(trimmedInput) || trimmedInput.includes('\\');
  if (isWindowsStyle) {
    const segments = trimmedInput.split(/[\\\/]+/).filter(Boolean);
    const candidate = segments[segments.length - 1];
    if (candidate && !/^[a-zA-Z]:$/.test(candidate)) {
      return candidate;
    }
  }
  const resolved = safeResolvePath(trimmedInput);
  const trimmedResolved = resolved.replace(/[\\\/]+$/, '');
  const posixBasename = path.posix.basename(trimmedResolved);
  return posixBasename || trimmedResolved;
}

export function getWorkspacePath(workspaceId: string): string {
  return path.join(getDataRoot(), workspaceId);
}

export function getWorkspaceMetaPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'workspace.meta.json');
}

export function getWorkspaceContextPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'workspace.context.json');
}

export function getPlansPath(workspaceId: string): string {
  return path.join(getWorkspacePath(workspaceId), 'plans');
}

export function getPlanPath(workspaceId: string, planId: string): string {
  return path.join(getPlansPath(workspaceId), planId);
}

export function getPlanStatePath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'state.json');
}

export function getPlanMdPath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'plan.md');
}

export function getResearchNotesPath(workspaceId: string, planId: string): string {
  return path.join(getPlanPath(workspaceId, planId), 'research_notes');
}

export function getContextPath(workspaceId: string, planId: string, contextType: string): string {
  return path.join(getPlanPath(workspaceId, planId), `${contextType}.json`);
}

// ── ID / timestamp generators ────────────────────────────────────────────────

export function generateWorkspaceId(workspacePath: string): string {
  return getWorkspaceIdFromPath(workspacePath);
}

export async function resolveWorkspaceIdForPath(workspacePath: string): Promise<string> {
  const { resolveCanonicalWorkspaceId } = await import('./workspace-identity.js');
  return resolveCanonicalWorkspaceId(workspacePath);
}

export function generatePlanId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `plan_${timestamp}_${random}`;
}

export function generateSessionId(): string {
  const timestamp = Date.now().toString(36);
  const random = crypto.randomBytes(4).toString('hex');
  return `sess_${timestamp}_${random}`;
}

export function nowISO(): string {
  return new Date().toISOString();
}

// ── Directory / file helpers ──────────────────────────────────────────────────

export async function ensureDir(dirPath: string): Promise<void> {
  try {
    await fs.mkdir(dirPath, { recursive: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') {
      throw error;
    }
  }
}

export async function exists(filePath: string): Promise<boolean> {
  const virtual = tryParseVirtualPlanPath(filePath);
  if (virtual?.kind === 'context') {
    const rows = dbGetContext('plan', virtual.planId, virtual.contextType);
    return rows.length > 0;
  }
  if (virtual?.kind === 'research_note') {
    const rows = dbGetContext('plan', virtual.planId, researchNoteType(virtual.filename));
    return rows.length > 0;
  }

  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

export async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

export async function writeText(filePath: string, content: string): Promise<void> {
  const virtual = tryParseVirtualPlanPath(filePath);
  if (virtual?.kind === 'research_note') {
    dbStoreContext('plan', virtual.planId, researchNoteType(virtual.filename), {
      filename: virtual.filename,
      content,
      updated_at: nowIso(),
    });
    return;
  }
  if (virtual?.kind === 'context') {
    try {
      const parsed = JSON.parse(content);
      dbStoreContext('plan', virtual.planId, virtual.contextType, wrapContextValue(parsed));
    } catch {
      dbStoreContext('plan', virtual.planId, virtual.contextType, { __pm_text: content });
    }
    return;
  }

  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, content, 'utf-8');
}

export async function readText(filePath: string): Promise<string | null> {
  const virtual = tryParseVirtualPlanPath(filePath);
  if (virtual?.kind === 'research_note') {
    const rows = dbGetContext('plan', virtual.planId, researchNoteType(virtual.filename));
    if (!rows.length) return null;
    const payload = rowData(rows[0]) as { content?: string; __pm_text?: string };
    if (typeof payload.content === 'string') return payload.content;
    if (typeof payload.__pm_text === 'string') return payload.__pm_text;
    return JSON.stringify(payload, null, 2);
  }
  if (virtual?.kind === 'context') {
    const rows = dbGetContext('plan', virtual.planId, virtual.contextType);
    if (!rows.length) return null;
    const payload = unwrapContextValue<unknown>(rowData(rows[0]));
    return typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2);
  }

  try {
    return await fs.readFile(filePath, 'utf-8');
  } catch {
    return null;
  }
}

// ── DB initialisation ─────────────────────────────────────────────────────────

/**
 * Ensure the SQLite DB is open and migrations are applied.
 * Replaces the old `initDataRoot()` which created the JSON data directory.
 */
export async function initDataRoot(): Promise<void> {
  getDb(); // opens the connection and applies PRAGMAs
  runMigrations();
}

// ── Internal helper ───────────────────────────────────────────────────────────

function buildPlanState(planId: string): PlanState | null {
  const planRow = dbGetPlan(planId);
  if (!planRow) return null;
  const phases   = getPhases(planId);
  const steps    = getAllSteps(planId);
  const sessions = getSessions(planId);
  const lineage  = getLineage(planId);
  return assemblePlanState(planRow, phases, steps, sessions, lineage);
}

function rowToPlanMeta(row: WorkspaceRow, wsId: string): WorkspaceMeta {
  const meta = rowToWorkspaceMeta(row);
  // Populate active_plans and archived_plans from the plans table
  const allPlans = getPlansByWorkspace(wsId);
  meta.active_plans   = allPlans.filter(p => p.status === 'active') .map(p => p.id);
  meta.archived_plans = allPlans.filter(p => p.status === 'archived').map(p => p.id);
  // Populate child_workspace_ids from parent_workspace_id FK relationship
  meta.child_workspace_ids = listChildWorkspaces(wsId).map(c => c.id);
  return meta;
}

// ── Workspace operations ──────────────────────────────────────────────────────

export async function getAllWorkspaces(): Promise<WorkspaceMeta[]> {
  return dbListWorkspaces().map(row => rowToPlanMeta(row, row.id));
}

export async function getWorkspace(workspaceId: string): Promise<WorkspaceMeta | null> {
  const row = dbGetWorkspace(workspaceId);
  if (!row) return null;
  return rowToPlanMeta(row, workspaceId);
}

export async function saveWorkspace(meta: WorkspaceMeta): Promise<void> {
  // Build the meta blob from the current WorkspaceMeta — always rebuild from
  // scratch so that clearing a field (e.g. hierarchy_linked_at → undefined)
  // is properly reflected in the DB rather than leaving stale blob values.
  const metaBlob: Record<string, unknown> = {};
  if (meta.hierarchy_linked_at) metaBlob['hierarchy_linked_at'] = meta.hierarchy_linked_at;

  const existingRow = dbGetWorkspace(meta.workspace_id);
  if (!existingRow) {
    // First-time creation via saveWorkspace (shouldn't normally happen)
    dbCreateWorkspace({
      id:                  meta.workspace_id,
      path:                meta.workspace_path ?? meta.path,
      name:                meta.name,
      parent_workspace_id: meta.parent_workspace_id ?? null,
      profile:             meta.profile ?? null,
      meta:                Object.keys(metaBlob).length ? metaBlob : null,
    });
  } else {
    dbUpdateWorkspace(meta.workspace_id, {
      name:                meta.name,
      parent_workspace_id: meta.parent_workspace_id ?? null,
      profile:             meta.profile ?? null,
      meta:                Object.keys(metaBlob).length ? metaBlob : null,
    });
  }
}

export interface WorkspaceMigrationReport {
  action: 'none' | 'aliased' | 'migrated';
  canonical_workspace_id: string;
  legacy_workspace_ids: string[];
  notes: string[];
}

export async function createWorkspace(
  workspacePath: string,
  profile?: WorkspaceProfile,
  force?: boolean
): Promise<{ meta: WorkspaceMeta; migration: WorkspaceMigrationReport; created: boolean; overlap?: WorkspaceOverlapInfo[] }> {
  const resolvedPath = safeResolvePath(workspacePath);
  const existingRow  = getWorkspaceByPath(resolvedPath);

  const migration: WorkspaceMigrationReport = {
    action: 'none',
    canonical_workspace_id: '',
    legacy_workspace_ids: [],
    notes: [],
  };

  if (existingRow) {
    // Workspace already registered — update profile if provided
    if (profile) {
      dbUpdateWorkspace(existingRow.id, { profile });
    }
    migration.canonical_workspace_id = existingRow.id;
    const meta = await getWorkspace(existingRow.id) as WorkspaceMeta;
    await _writeIdentityFile(resolvedPath, existingRow.id);
    return { meta, migration, created: false };
  }

  // New workspace
  const { resolveCanonicalWorkspaceId } = await import('./workspace-identity.js');
  const workspaceId = await resolveCanonicalWorkspaceId(resolvedPath);
  migration.canonical_workspace_id = workspaceId;

  // Check if there's already a row with this ID (different path somehow)
  const byId = dbGetWorkspace(workspaceId);
  if (byId) {
    if (profile) {
      dbUpdateWorkspace(workspaceId, { profile });
    }
    const meta = await getWorkspace(workspaceId) as WorkspaceMeta;
    await _writeIdentityFile(resolvedPath, workspaceId);
    return { meta, migration, created: false };
  }

  const row = dbCreateWorkspace({
    id:      workspaceId,
    path:    resolvedPath,
    name:    getWorkspaceDisplayName(resolvedPath),
    profile: profile ?? null,
  });

  await _writeIdentityFile(resolvedPath, workspaceId);

  const meta = rowToPlanMeta(row, workspaceId);
  return { meta, migration, created: true };
}

/** Write identity.json to the workspace directory. */
async function _writeIdentityFile(workspacePath: string, workspaceId: string): Promise<void> {
  try {
    const { resolveAccessiblePath } = await import('./workspace-mounts.js');
    const accessiblePath = await resolveAccessiblePath(workspacePath);
    if (!accessiblePath) return; // container mode — path not accessible

    const { getWorkspaceIdentityPath } = await import('./workspace-identity.js');
    const identityPath = getWorkspaceIdentityPath(accessiblePath);
    const dataRoot     = getDataRoot();

    await writeJsonLocked(identityPath, {
      schema_version: '1.0.0',
      workspace_id:   workspaceId,
      workspace_path: workspacePath,
      data_root:      dataRoot,
      created_at:     new Date().toISOString(),
      updated_at:     new Date().toISOString(),
    });
  } catch {
    // Non-fatal: identity.json write failure should not abort workspace creation
  }
}

export async function writeWorkspaceIdentityFile(
  workspacePath: string,
  meta: WorkspaceMeta
): Promise<{ schema_version: string; workspace_id: string; workspace_path: string; data_root: string; created_at: string; updated_at: string }> {
  const resolvedPath = safeResolvePath(workspacePath);
  const { resolveAccessiblePath } = await import('./workspace-mounts.js');
  const accessiblePath = await resolveAccessiblePath(resolvedPath);
  if (!accessiblePath) {
    throw new Error(
      `Workspace path not accessible from this process (container mode?): ${resolvedPath}`
    );
  }
  const { getWorkspaceIdentityPath } = await import('./workspace-identity.js');
  const identityPath = getWorkspaceIdentityPath(accessiblePath);
  const dataRoot = meta.data_root ?? getDataRoot();

  const identity = await modifyJsonLocked<{
    schema_version: string;
    workspace_id: string;
    workspace_path: string;
    data_root: string;
    created_at: string;
    updated_at: string;
  }>(identityPath, (existing) => {
    const now = new Date().toISOString();
    return {
      schema_version: '1.0.0',
      workspace_id:   meta.workspace_id,
      workspace_path: resolvedPath,
      data_root:      dataRoot,
      created_at:     existing?.created_at ?? now,
      updated_at:     now,
    };
  });

  return identity;
}

// ── Plan operations ───────────────────────────────────────────────────────────

export async function findPlanById(
  planId: string
): Promise<{ workspace_id: string; plan: PlanState } | null> {
  const row = dbFindPlanById(planId);
  if (!row) return null;
  const plan = buildPlanState(planId);
  if (!plan) return null;
  return { workspace_id: row.workspaceId, plan };
}

export async function getPlanState(
  workspaceId: string,
  planId: string
): Promise<PlanState | null> {
  // workspaceId not strictly needed since plan IDs are globally unique,
  // but we validate the plan belongs to the expected workspace.
  const row = dbGetPlan(planId);
  if (!row || row.workspace_id !== workspaceId) return null;
  return buildPlanState(planId);
}

/**
 * Persist a mutated PlanState back to the DB.
 *
 * Strategy:
 *  1. UPDATE the plan row with all scalar/JSON fields.
 *  2. Sync phases: getOrCreate each phase by name, record phase-name→id mapping.
 *  3. Sync steps: delete all existing steps for this plan then reinsert from
 *     state.steps.  Done in a transaction so it's atomic.
 *  4. Sync sessions: insert any sessions whose session_id is not yet in the DB.
 *  5. Sync lineage: insert any lineage entries beyond the current DB count.
 */
export async function savePlanState(state: PlanState): Promise<void> {
  const planId = state.id;

  // 1. Update plan row
  dbUpdatePlan(planId, {
    title:                  state.title,
    description:            state.description,
    status:                 state.status as PlanRow['status'],
    category:               state.category,
    priority:               state.priority,
    goals:                  state.goals,
    success_criteria:       state.success_criteria,
    recommended_next_agent: state.recommended_next_agent ?? null,
    categorization:         state.categorization ?? null,
    deployment_context:     (state as any).deployment_context ?? null,
    confirmation_state:     (state as any).confirmation_state ?? null,
    paused_at_snapshot:     (state as any).paused_at_snapshot ?? null,
    completed_at:           state.completed_at ?? null,
    program_id:             state.program_id ?? null,
  });

  // 2 & 3. Sync phases + steps in one transaction
  transaction(() => {
    // Delete all existing steps (cascade deletes step-level deps if FK ON)
    run('DELETE FROM steps WHERE plan_id = ?', [planId]);

    // Upsert phases and reinsert steps
    for (let i = 0; i < state.steps.length; i++) {
      const step = state.steps[i]!;
      const phase = getOrCreatePhase(planId, step.phase);
      createStepInPhase(planId, step.phase, {
        task:                       step.task,
        type:                       step.type ?? 'standard',
        status:                     step.status,
        assignee:                   step.assignee ?? null,
        notes:                      step.notes ?? null,
        order_index:                i,
        requires_confirmation:      step.requires_confirmation ?? false,
        requires_user_confirmation: step.requires_user_confirmation ?? false,
        requires_validation:        step.requires_validation ?? false,
      });
    }
  });

  // 4. Sync sessions (append-only)
  const existingSessionIds = new Set(
    queryAll<{ id: string }>('SELECT id FROM sessions WHERE plan_id = ?', [planId]).map(r => r.id)
  );
  for (const session of state.agent_sessions) {
    if (!existingSessionIds.has(session.session_id)) {
      run(
        `INSERT INTO sessions (id, plan_id, agent_type, started_at, completed_at, summary, artifacts, context)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          session.session_id,
          planId,
          session.agent_type,
          session.started_at,
          session.completed_at ?? null,
          session.summary      ?? null,
          session.artifacts    ? JSON.stringify(session.artifacts) : null,
          session.context && Object.keys(session.context).length
            ? JSON.stringify(session.context)
            : null,
        ]
      );
    }
  }

  // 5. Sync lineage (append-only by count)
  const existingLineageCount = queryOne<{ c: number }>(
    'SELECT COUNT(*) AS c FROM lineage WHERE plan_id = ?', [planId]
  )?.c ?? 0;

  for (let i = existingLineageCount; i < state.lineage.length; i++) {
    const entry = state.lineage[i]!;
    run(
      `INSERT INTO lineage (id, plan_id, from_agent, to_agent, reason, data, timestamp)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        newId(),
        planId,
        entry.from_agent,
        entry.to_agent,
        entry.reason,
        null,
        entry.timestamp,
      ]
    );
  }
}

export async function getWorkspacePlans(workspaceId: string): Promise<PlanState[]> {
  const rows = getPlansByWorkspace(workspaceId);
  return rows.map(row => buildPlanState(row.id)).filter((p): p is PlanState => p !== null);
}

export async function createPlan(
  workspaceId: string,
  title: string,
  description: string,
  category: RequestCategory,
  priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
  categorization?: RequestCategorization,
  goals?: string[],
  success_criteria?: string[]
): Promise<PlanState> {
  const planId = generatePlanId();

  dbCreatePlan({
    id:               planId,
    workspace_id:     workspaceId,
    title,
    description,
    category,
    priority,
    goals,
    success_criteria,
    categorization,
    schema_version:   '2.0',
  });

  return buildPlanState(planId)!;
}

export async function deletePlan(
  workspaceId: string,
  planId: string,
): Promise<boolean> {
  const row = dbGetPlan(planId);
  if (!row || row.workspace_id !== workspaceId) return false;
  dbDeletePlan(planId);
  return true;
}

/** No-op: plan.md is no longer generated from plan state. */
export async function generatePlanMd(_state: PlanState): Promise<void> {
  // plan.md is a legacy artifact; DB-backed plans don't use it.
}

// ── Build script operations ───────────────────────────────────────────────────

export async function getBuildScripts(workspaceId: string, planId?: string): Promise<BuildScript[]> {
  const rows = dbGetBuildScripts(workspaceId, planId);
  return rows.map(r => ({
    id:           r.id,
    workspace_id: r.workspace_id,
    plan_id:      r.plan_id     ?? undefined,
    name:         r.name,
    description:  r.description ?? undefined,
    command:      r.command,
    directory:    r.directory,
    mcp_handle:   r.mcp_handle  ?? undefined,
    created_at:   r.created_at,
  } as BuildScript));
}

export async function addBuildScript(
  workspaceId: string,
  scriptData: Omit<BuildScript, 'id' | 'created_at' | 'workspace_id'>,
  planId?: string
): Promise<BuildScript> {
  const ws = dbGetWorkspace(workspaceId);
  if (!ws) throw new Error(`Workspace not found: ${workspaceId}`);
  if (planId) {
    const plan = dbGetPlan(planId);
    if (!plan || plan.workspace_id !== workspaceId) throw new Error(`Plan not found: ${planId}`);
  }
  const row = dbAddBuildScript(workspaceId, {
    plan_id:     planId   ?? null,
    name:        scriptData.name,
    description: scriptData.description ?? null,
    command:     scriptData.command,
    directory:   scriptData.directory,
    mcp_handle:  scriptData.mcp_handle ?? null,
  });
  return {
    id:           row.id,
    workspace_id: row.workspace_id,
    plan_id:      row.plan_id  ?? undefined,
    name:         row.name,
    description:  row.description ?? undefined,
    command:      row.command,
    directory:    row.directory,
    mcp_handle:   row.mcp_handle  ?? undefined,
    created_at:   row.created_at,
  } as BuildScript;
}

export async function deleteBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string
): Promise<boolean> {
  dbDeleteBuildScript(workspaceId, scriptId);
  return true;
}

export async function findBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string,
): Promise<BuildScript | null> {
  const scripts = await getBuildScripts(workspaceId, planId);
  const directMatch = scripts.find(script => script.id === scriptId);

  if (directMatch || planId) {
    return directMatch ?? null;
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    return null;
  }

  const planIds = new Set<string>();
  for (const id of workspace.active_plans ?? []) {
    planIds.add(id);
  }
  for (const id of workspace.archived_plans ?? []) {
    planIds.add(id);
  }

  for (const id of planIds) {
    const plan = await getPlanState(workspaceId, id);
    const match = plan?.build_scripts?.find(script => script.id === scriptId);
    if (match) {
      return match;
    }
  }

  return null;
}

// ── Investigation CRUD (kept for backward-compat; backed by flat JSON) ────────

function getInvestigationsDir(workspaceId: string, planId: string): string {
  return path.join(getDataRoot(), workspaceId, 'plans', planId, 'investigations');
}

function getInvestigationStatePath(
  workspaceId: string,
  planId: string,
  investigationId: string
): string {
  return path.join(getInvestigationsDir(workspaceId, planId), investigationId, 'state.json');
}

export async function createInvestigation(
  workspaceId: string,
  planId: string,
  investigation: Investigation
): Promise<void> {
  const statePath = getInvestigationStatePath(workspaceId, planId, investigation.id);
  await ensureDir(path.dirname(statePath));
  await writeJsonLocked(statePath, investigation);
}

export async function getInvestigation(
  workspaceId: string,
  planId: string,
  investigationId: string
): Promise<Investigation | null> {
  const statePath = getInvestigationStatePath(workspaceId, planId, investigationId);
  if (!await exists(statePath)) return null;
  return readJson<Investigation>(statePath);
}

export async function updateInvestigation(
  workspaceId: string,
  planId: string,
  investigation: Investigation
): Promise<void> {
  const statePath = getInvestigationStatePath(workspaceId, planId, investigation.id);
  await writeJsonLocked(statePath, investigation);
}

export async function listInvestigations(
  workspaceId: string,
  planId: string
): Promise<Investigation[]> {
  const dir = getInvestigationsDir(workspaceId, planId);
  if (!await exists(dir)) return [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const investigations: Investigation[] = [];
  for (const entry of entries) {
    if (entry.isDirectory()) {
      const statePath = path.join(dir, entry.name, 'state.json');
      if (await exists(statePath)) {
        const inv = await readJson<Investigation>(statePath);
        if (inv) investigations.push(inv);
      }
    }
  }
  return investigations;
}

// ── Command tokeniser (pure utility, no I/O) ─────────────────────────────────

export function parseCommandTokens(command: string): string[] {
  const tokens: string[] = [];
  let current = '';
  let inQuotes = false;
  let quoteChar = '';

  for (let i = 0; i < command.length; i += 1) {
    const char = command[i]!;
    if (char === '"' || char === "'") {
      if (inQuotes && char === quoteChar) {
        inQuotes = false;
        quoteChar = '';
        continue;
      }
      if (!inQuotes) {
        inQuotes = true;
        quoteChar = char;
        continue;
      }
    }

    if (!inQuotes && /\s/.test(char)) {
      if (current.length > 0) {
        tokens.push(current);
        current = '';
      }
      continue;
    }

    current += char;
  }

  if (current.length > 0) {
    tokens.push(current);
  }

  return tokens;
}

// ---------------------------------------------------------------------------
// Workspace registry compatibility shims (replaces workspace-registry.ts)
// In the DB world the workspace table IS the registry — no separate JSON file.
// ---------------------------------------------------------------------------

/**
 * Look up a workspace ID by normalized path (DB-backed).
 * Replaces the file-based lookupByPath from workspace-registry.ts.
 * Returns null on any DB error (e.g. during tests where schema isn't applied).
 */
export async function lookupByPath(workspacePath: string): Promise<string | null> {
  try {
    const normalized = normalizeWorkspacePath(workspacePath);
    const row = getWorkspaceByPath(normalized);
    return row?.id ?? null;
  } catch {
    return null;
  }
}

/**
 * Register or update a path→ID mapping.
 * No-op in the DB world — workspace path→ID is stored in the SQLite workspaces table.
 * The real upsert happens in registerWorkspace() / ensureWorkspace().
 */
export async function upsertRegistryEntry(
  _workspacePath: string,
  _workspaceId: string,
): Promise<void> {
  // No-op: mapping is maintained in the DB by the workspace registration flow.
}

// ---------------------------------------------------------------------------
// Workspace context DB helpers (replaces workspace.context.json file I/O)
// ---------------------------------------------------------------------------

/**
 * Read workspace context from the DB context_items table.
 * Returns null when no context has been stored yet.
 */
export async function getWorkspaceContextFromDb(
  workspaceId: string
): Promise<WorkspaceContext | null> {
  const rows = dbGetContext('workspace', workspaceId, 'workspace_context');
  if (!rows.length) return null;
  return JSON.parse(rows[0].data) as WorkspaceContext;
}

/**
 * Persist workspace context to the DB context_items table (upsert).
 */
export async function saveWorkspaceContextToDb(
  workspaceId: string,
  context: WorkspaceContext
): Promise<void> {
  dbStoreContext('workspace', workspaceId, 'workspace_context', context as unknown as object);
}

/**
 * Delete workspace context from the DB context_items table.
 * Returns true if a row was found and deleted, false if nothing existed.
 */
export async function deleteWorkspaceContextFromDb(
  workspaceId: string
): Promise<boolean> {
  const rows = dbGetContext('workspace', workspaceId, 'workspace_context');
  if (!rows.length) return false;
  dbDeleteContext(rows[0].id);
  return true;
}

export async function getPlanContextFromDb(
  workspaceId: string,
  planId: string,
  contextType: string,
): Promise<unknown | null> {
  const plan = dbGetPlan(planId);
  if (!plan || plan.workspace_id !== workspaceId) return null;
  const rows = dbGetContext('plan', planId, contextType);
  if (!rows.length) return null;
  return unwrapContextValue(rowData(rows[0]));
}

export async function listPlanContextTypesFromDb(
  workspaceId: string,
  planId: string,
): Promise<string[]> {
  const plan = dbGetPlan(planId);
  if (!plan || plan.workspace_id !== workspaceId) return [];
  const rows = dbGetContext('plan', planId);
  return rows
    .map(row => row.type)
    .filter(type => !isResearchNoteType(type))
    .sort((a, b) => a.localeCompare(b));
}

export async function listPlanResearchNotesFromDb(
  workspaceId: string,
  planId: string,
): Promise<Array<{ filename: string; content: string; updated_at: string; size_bytes: number }>> {
  const plan = dbGetPlan(planId);
  if (!plan || plan.workspace_id !== workspaceId) return [];
  const rows = dbGetContext('plan', planId)
    .filter(row => isResearchNoteType(row.type));

  return rows.map(row => {
    const payload = rowData(row) as { filename?: string; content?: string; __pm_text?: string };
    const filename = payload.filename || row.type.slice(RESEARCH_NOTE_TYPE_PREFIX.length);
    const content = typeof payload.content === 'string'
      ? payload.content
      : (typeof payload.__pm_text === 'string' ? payload.__pm_text : JSON.stringify(payload, null, 2));
    return {
      filename,
      content,
      updated_at: row.updated_at,
      size_bytes: Buffer.byteLength(content, 'utf-8'),
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}

export async function listPlanResearchNoteNamesFromDb(
  workspaceId: string,
  planId: string,
): Promise<string[]> {
  const notes = await listPlanResearchNotesFromDb(workspaceId, planId);
  return notes.map(note => note.filename);
}
