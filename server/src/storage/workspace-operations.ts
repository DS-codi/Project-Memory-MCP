/**
 * Workspace Operations — ID resolution, validation, ghost-scan, merge, migrate
 *
 * This module contains all workspace operations that were formerly part of
 * workspace-identity.ts. workspace-identity.ts has been reduced to identity.json
 * read/write only (~90 lines). Everything else lives here.
 *
 * Consumers import through db-store.ts (which re-exports from here), so
 * call-sites don't need to change.
 */

import path from 'path';
import { promises as fs } from 'fs';
import type {
  WorkspaceMeta,
  WorkspaceContext,
  WorkspaceContextSection,
  WorkspaceContextSectionItem,
} from '../types/index.js';
import {
  normalizeWorkspacePath,
  getDataRoot,
  safeResolvePath,
  writeJsonLocked,
  modifyJsonLocked,
  lookupByPath,
  upsertRegistryEntry,
  getWorkspace,
  getWorkspaceContextFromDb,
  saveWorkspaceContextToDb,
} from './db-store.js';
import {
  getWorkspaceIdentityPath,
  readWorkspaceIdentityFile,
  ensureIdentityFile,
  type WorkspaceIdentityFile,
} from './workspace-identity.js';
import { buildWorkspaceContextSectionsFromProfile } from '../utils/workspace-context-seed.js';

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function readJsonSafe<T>(filePath: string): Promise<T | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(content) as T;
  } catch {
    return null;
  }
}

async function pathExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function listDirs(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.filter(e => e.isDirectory()).map(e => e.name);
  } catch {
    return [];
  }
}

/**
 * Recursively copy a directory. More reliable than fs.rename when
 * files may be locked by another process (e.g., VS Code file watchers).
 */
async function copyDirRecursive(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  const entries = await fs.readdir(src, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);

    if (entry.isDirectory()) {
      await copyDirRecursive(srcPath, destPath);
    } else {
      await fs.copyFile(srcPath, destPath);
    }
  }
}

/**
 * Move a directory using copy + delete. Falls back to recursive copy
 * if fs.rename fails (e.g., EPERM from locked files).
 */
async function moveDirSafe(src: string, dest: string): Promise<void> {
  try {
    await fs.rename(src, dest);
  } catch (renameErr) {
    try {
      await copyDirRecursive(src, dest);
      await fs.rm(src, { recursive: true, force: true });
    } catch (copyErr) {
      throw new Error(
        `Failed to move '${src}' to '${dest}': rename failed (${(renameErr as Error).message}), copy also failed (${(copyErr as Error).message})`
      );
    }
  }
}

// ---------------------------------------------------------------------------
// Context normalisation helpers (used by mergeWorkspace / migrateWorkspace)
// ---------------------------------------------------------------------------

const MAX_CONTEXT_LOG_ENTRIES = 500;

function hasText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeSectionItem(value: unknown): WorkspaceContextSectionItem | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  if (!hasText(raw.title)) return null;

  const item: WorkspaceContextSectionItem = {
    title: raw.title.trim(),
  };

  if (hasText(raw.description)) {
    item.description = raw.description;
  }

  if (Array.isArray(raw.links)) {
    const links = raw.links.filter((link): link is string => hasText(link)).map(link => link.trim());
    if (links.length > 0) {
      item.links = links;
    }
  }

  return item;
}

function normalizeSection(value: unknown): WorkspaceContextSection | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;

  const section: WorkspaceContextSection = {};
  if (hasText(raw.summary)) {
    section.summary = raw.summary;
  }

  if (Array.isArray(raw.items)) {
    const items = raw.items
      .map(item => normalizeSectionItem(item))
      .filter((item): item is WorkspaceContextSectionItem => item !== null);
    if (items.length > 0) {
      section.items = items;
    }
  }

  if (!section.summary && !section.items) {
    return null;
  }

  return section;
}

function isSectionEmpty(section: WorkspaceContextSection | undefined): boolean {
  if (!section) return true;
  const hasSummary = hasText(section.summary);
  const hasItems = Array.isArray(section.items) && section.items.length > 0;
  return !hasSummary && !hasItems;
}

function areSectionsEmpty(sections: Record<string, WorkspaceContextSection> | undefined): boolean {
  if (!sections || Object.keys(sections).length === 0) {
    return true;
  }
  return Object.values(sections).every(section => isSectionEmpty(section));
}

function mergeSectionItems(
  canonicalItems: WorkspaceContextSectionItem[] = [],
  sourceItems: WorkspaceContextSectionItem[] = []
): WorkspaceContextSectionItem[] {
  const merged = [...canonicalItems];
  const seenTitles = new Set(
    canonicalItems
      .map(item => item.title.trim().toLowerCase())
      .filter(title => title.length > 0)
  );

  for (const sourceItem of sourceItems) {
    const normalizedTitle = sourceItem.title.trim().toLowerCase();
    if (!normalizedTitle || seenTitles.has(normalizedTitle)) {
      continue;
    }
    merged.push(sourceItem);
    seenTitles.add(normalizedTitle);
  }

  return merged;
}

function mergeSections(
  canonicalSections: Record<string, WorkspaceContextSection> = {},
  sourceSections: Record<string, WorkspaceContextSection> = {},
  notes: string[],
  sourceId: string
): Record<string, WorkspaceContextSection> {
  const merged: Record<string, WorkspaceContextSection> = {};

  for (const [key, section] of Object.entries(canonicalSections)) {
    const normalized = normalizeSection(section);
    if (normalized) {
      merged[key] = normalized;
    }
  }

  for (const [key, sourceRawSection] of Object.entries(sourceSections)) {
    const sourceSection = normalizeSection(sourceRawSection);
    if (!sourceSection) {
      notes.push(`Skipped invalid source context section '${key}' from '${sourceId}'.`);
      continue;
    }

    const canonicalSection = merged[key];
    if (!canonicalSection) {
      merged[key] = sourceSection;
      continue;
    }

    const mergedSection: WorkspaceContextSection = {
      summary: hasText(canonicalSection.summary)
        ? canonicalSection.summary
        : sourceSection.summary,
      items: mergeSectionItems(canonicalSection.items || [], sourceSection.items || []),
    };

    if (!mergedSection.summary) {
      delete mergedSection.summary;
    }
    if (!mergedSection.items || mergedSection.items.length === 0) {
      delete mergedSection.items;
    }

    merged[key] = mergedSection;
  }

  return merged;
}

type ContextLog<TEntry extends { timestamp?: string }> = {
  entries: TEntry[];
  last_updated: string;
};

function mergeContextLog<TEntry extends { timestamp?: string }>(
  canonicalLog: ContextLog<TEntry> | undefined,
  sourceLog: ContextLog<TEntry> | undefined
): ContextLog<TEntry> | undefined {
  if (!canonicalLog && !sourceLog) {
    return undefined;
  }

  const mergedEntries: TEntry[] = [
    ...(canonicalLog?.entries || []),
    ...(sourceLog?.entries || []),
  ];

  mergedEntries.sort((left, right) => {
    const leftTime = typeof left.timestamp === 'string'
      ? Date.parse(left.timestamp)
      : Number.NaN;
    const rightTime = typeof right.timestamp === 'string'
      ? Date.parse(right.timestamp)
      : Number.NaN;

    if (Number.isNaN(leftTime) || Number.isNaN(rightTime)) {
      return 0;
    }

    return leftTime - rightTime;
  });

  const trimmedEntries = mergedEntries.slice(-MAX_CONTEXT_LOG_ENTRIES);
  const lastUpdatedCandidates = [canonicalLog?.last_updated, sourceLog?.last_updated]
    .filter((value): value is string => typeof value === 'string' && value.length > 0)
    .sort();

  return {
    entries: trimmedEntries,
    last_updated: lastUpdatedCandidates[lastUpdatedCandidates.length - 1] || new Date().toISOString(),
  };
}

interface PlanArtifactSignals {
  totalPlans: number;
  titledPlans: string[];
  architectureFiles: number;
  researchFiles: number;
  reviewFiles: number;
  researchNotes: number;
}

async function collectPlanArtifactSignals(canonicalWorkspacePath: string): Promise<PlanArtifactSignals> {
  const plansDir = path.join(canonicalWorkspacePath, 'plans');
  const planIds = await listDirs(plansDir);

  let architectureFiles = 0;
  let researchFiles = 0;
  let reviewFiles = 0;
  let researchNotes = 0;
  const titledPlans: string[] = [];

  for (const planId of planIds) {
    const planDir = path.join(plansDir, planId);
    const statePath = path.join(planDir, 'state.json');
    const state = await readJsonSafe<Record<string, unknown>>(statePath);
    const title = typeof state?.title === 'string' && state.title.trim().length > 0
      ? state.title.trim()
      : planId;
    titledPlans.push(title);

    if (await pathExists(path.join(planDir, 'architecture.json'))) architectureFiles += 1;
    if (await pathExists(path.join(planDir, 'research.json'))) researchFiles += 1;
    if (await pathExists(path.join(planDir, 'review.json'))) reviewFiles += 1;

    const researchNotesDir = path.join(planDir, 'research_notes');
    if (await pathExists(researchNotesDir)) {
      try {
        const entries = await fs.readdir(researchNotesDir);
        researchNotes += entries.length;
      } catch {
        // Ignore unreadable research notes directories
      }
    }
  }

  return {
    totalPlans: planIds.length,
    titledPlans,
    architectureFiles,
    researchFiles,
    reviewFiles,
    researchNotes,
  };
}

function buildSectionsFromPlanArtifactSignals(signals: PlanArtifactSignals): Record<string, WorkspaceContextSection> {
  const sections: Record<string, WorkspaceContextSection> = {};

  if (signals.totalPlans > 0) {
    sections.project_details = {
      summary: `Recovered context from ${signals.totalPlans} plan artifact(s) during workspace migration.`,
      items: signals.titledPlans.slice(0, 5).map(title => ({
        title,
        description: 'Recovered plan context artifact',
      })),
    };
  }

  if (signals.architectureFiles > 0) {
    sections.architecture = {
      summary: `Recovered ${signals.architectureFiles} architecture artifact file(s) from migrated plans.`,
      items: [],
    };
  }

  const researchSignalTotal = signals.researchFiles + signals.reviewFiles + signals.researchNotes;
  if (researchSignalTotal > 0) {
    sections.research_artifacts = {
      summary: `Recovered research/review signals: ${signals.researchFiles} research.json, ${signals.reviewFiles} review.json, ${signals.researchNotes} research note file(s).`,
      items: [],
    };
  }

  return sections;
}

async function repopulateSectionsIfEmpty(
  context: WorkspaceContext,
  canonicalWorkspacePath: string,
  canonicalMeta: WorkspaceMeta,
  notes: string[]
): Promise<{ context: WorkspaceContext; repopulated: boolean }> {
  if (!areSectionsEmpty(context.sections)) {
    return { context, repopulated: false };
  }

  const now = new Date().toISOString();
  const signals = await collectPlanArtifactSignals(canonicalWorkspacePath);
  const signalSections = buildSectionsFromPlanArtifactSignals(signals);

  if (!areSectionsEmpty(signalSections)) {
    context.sections = signalSections;
    context.updated_at = now;
    notes.push('Repopulated workspace context sections from plan/research artifacts.');
    return { context, repopulated: true };
  }

  if (canonicalMeta.profile) {
    const profileSections = buildWorkspaceContextSectionsFromProfile(canonicalMeta.profile);
    if (!areSectionsEmpty(profileSections)) {
      context.sections = profileSections;
      context.updated_at = now;
      notes.push('Repopulated workspace context sections from workspace profile.');
      return { context, repopulated: true };
    }
  }

  context.sections = {
    migration_status: {
      summary: 'Workspace migration completed with no recoverable plan/research/profile context signals.',
      items: [
        {
          title: 'Recovery summary',
          description: `plans=${signals.totalPlans}, architecture=${signals.architectureFiles}, research=${signals.researchFiles}, review=${signals.reviewFiles}, research_notes=${signals.researchNotes}`,
        },
      ],
    },
  };
  context.updated_at = now;
  notes.push('Repopulated workspace context with migration_status safety section.');
  return { context, repopulated: true };
}

interface ContextMergeOutcome {
  sourceHadContext: boolean;
  mergedSourceSections: boolean;
  repopulatedSections: boolean;
}

async function mergeContextIntoCanonical(
  sourcePath: string,
  sourceId: string,
  targetPath: string,
  targetId: string,
  targetMeta: WorkspaceMeta,
  notes: string[]
): Promise<ContextMergeOutcome> {
  const now = new Date().toISOString();
  const sourceContextPath = path.join(sourcePath, 'workspace.context.json');
  const targetContextFilePath = path.join(targetPath, 'workspace.context.json');
  const sourceHadContext = await pathExists(sourceContextPath);

  const sourceContext = sourceHadContext
    ? await readJsonSafe<WorkspaceContext>(sourceContextPath)
    : null;
  const canonicalContext =
    await getWorkspaceContextFromDb(targetId) ??
    await readJsonSafe<WorkspaceContext>(targetContextFilePath);

  const mergedSections = mergeSections(
    canonicalContext?.sections || {},
    sourceContext?.sections || {},
    notes,
    sourceId
  );

  const merged: WorkspaceContext = {
    schema_version: canonicalContext?.schema_version || sourceContext?.schema_version || '1.0.0',
    workspace_id: targetId,
    workspace_path: targetMeta.workspace_path || targetMeta.path || '',
    identity_file_path: canonicalContext?.identity_file_path || sourceContext?.identity_file_path,
    name: targetMeta.name || targetId,
    created_at: canonicalContext?.created_at || sourceContext?.created_at || now,
    updated_at: now,
    sections: mergedSections,
    update_log: mergeContextLog(canonicalContext?.update_log, sourceContext?.update_log),
    audit_log: mergeContextLog(canonicalContext?.audit_log, sourceContext?.audit_log),
  };

  const repopulated = await repopulateSectionsIfEmpty(merged, targetPath, targetMeta, notes);
  await saveWorkspaceContextToDb(targetId, repopulated.context);

  return {
    sourceHadContext,
    mergedSourceSections: sourceHadContext && !areSectionsEmpty(sourceContext?.sections || {}),
    repopulatedSections: repopulated.repopulated,
  };
}

async function ensureCanonicalContextNotEmpty(
  targetPath: string,
  targetId: string,
  targetMeta: WorkspaceMeta,
  notes: string[]
): Promise<boolean> {
  const now = new Date().toISOString();
  const contextFilePath = path.join(targetPath, 'workspace.context.json');
  const existing =
    await getWorkspaceContextFromDb(targetId) ??
    await readJsonSafe<WorkspaceContext>(contextFilePath);

  const context: WorkspaceContext = {
    schema_version: existing?.schema_version || '1.0.0',
    workspace_id: targetId,
    workspace_path: targetMeta.workspace_path || targetMeta.path || '',
    identity_file_path: existing?.identity_file_path,
    name: targetMeta.name || targetId,
    created_at: existing?.created_at || now,
    updated_at: now,
    sections: mergeSections(existing?.sections || {}, {}, notes, targetId),
    update_log: existing?.update_log,
    audit_log: existing?.audit_log,
  };

  const repopulated = await repopulateSectionsIfEmpty(context, targetPath, targetMeta, notes);
  await saveWorkspaceContextToDb(targetId, repopulated.context);
  return repopulated.repopulated;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class WorkspaceNotRegisteredError extends Error {
  public readonly candidateId: string;
  public readonly suggestions: string[];

  constructor(candidateId: string, suggestions: string[] = []) {
    const lines = [`Workspace '${candidateId}' is not registered.`];
    if (suggestions.length > 0) {
      lines.push(`Did you mean: ${suggestions.join(', ')}?`);
    }
    super(lines.join(' '));
    this.name = 'WorkspaceNotRegisteredError';
    this.candidateId = candidateId;
    this.suggestions = suggestions;
  }
}

// ---------------------------------------------------------------------------
// ID validation
// ---------------------------------------------------------------------------

/**
 * Check whether a workspace ID corresponds to a valid, registered workspace.
 */
export async function validateWorkspaceId(workspaceId: string): Promise<boolean> {
  const meta = await getWorkspace(workspaceId);
  return meta !== null;
}

/**
 * Find the canonical workspace ID that a given (possibly legacy) workspace ID
 * maps to. Searches all registered workspaces' `legacy_workspace_ids` arrays.
 */
export async function findCanonicalForLegacyId(legacyId: string): Promise<string | null> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const legacyLower = legacyId.toLowerCase();

  for (const dir of dirs) {
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (!meta) continue;

    if (meta.workspace_id?.toLowerCase() === legacyLower) {
      return meta.workspace_id;
    }

    if (
      Array.isArray(meta.legacy_workspace_ids) &&
      meta.legacy_workspace_ids.some(id => id.toLowerCase() === legacyLower)
    ) {
      return meta.workspace_id;
    }
  }

  return null;
}

/**
 * Resolve a workspace ID or throw a helpful error.
 */
export async function resolveOrReject(
  workspaceId: string
): Promise<{ meta: WorkspaceMeta; redirected_from?: string }> {
  const directMeta = await getWorkspace(workspaceId);
  if (directMeta) {
    return { meta: directMeta };
  }

  const canonicalId = await findCanonicalForLegacyId(workspaceId);
  if (canonicalId && canonicalId !== workspaceId) {
    const canonicalMeta = await getWorkspace(canonicalId);
    if (canonicalMeta) {
      return { meta: canonicalMeta, redirected_from: workspaceId };
    }
  }

  const suggestions = await findSimilarWorkspaceIds(workspaceId);
  throw new WorkspaceNotRegisteredError(workspaceId, suggestions);
}

const WORKSPACE_ID_PATTERN = /^[a-z0-9_-]+-[a-f0-9]{12}$/;

/**
 * Check whether a workspace ID matches the canonical format: `{name}-{12-hex-chars}`.
 */
export function isCanonicalIdFormat(workspaceId: string): boolean {
  return WORKSPACE_ID_PATTERN.test(workspaceId);
}

/**
 * Validate workspace_id format. Returns true if canonical or known legacy.
 */
export async function validateWorkspaceIdFormat(
  workspaceId: string
): Promise<{ valid: boolean; reason?: string }> {
  if (WORKSPACE_ID_PATTERN.test(workspaceId)) {
    return { valid: true };
  }

  const canonical = await findCanonicalForLegacyId(workspaceId);
  if (canonical) {
    return { valid: true, reason: `Legacy ID; canonical is '${canonical}'` };
  }

  return {
    valid: false,
    reason: `ID '${workspaceId}' does not match expected format: {name}-{12-hex-chars}`,
  };
}

async function findSimilarWorkspaceIds(targetId: string): Promise<string[]> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const suggestions: string[] = [];
  const targetLower = targetId.toLowerCase();

  for (const dir of dirs) {
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (!meta) continue;

    const name = (meta.name || '').toLowerCase();
    const wsId = (meta.workspace_id || '').toLowerCase();

    if (
      wsId.includes(targetLower) ||
      targetLower.includes(wsId) ||
      name.includes(targetLower) ||
      targetLower.includes(name)
    ) {
      suggestions.push(meta.workspace_id);
    }
  }

  return suggestions;
}

// ---------------------------------------------------------------------------
// Ghost folder scan
// ---------------------------------------------------------------------------

export interface GhostFolderInfo {
  folder_name: string;
  folder_path: string;
  contents: string[];
  plan_ids: string[];
  likely_canonical_match: string | null;
  match_reason: string | null;
  suggested_merge_command: string | null;
}

/**
 * Scan the data root for "ghost" folders — directories without a `workspace.meta.json`.
 */
export async function scanGhostFolders(): Promise<GhostFolderInfo[]> {
  const dataRoot = getDataRoot();
  const dirs = await listDirs(dataRoot);
  const systemDirs = new Set(['events', 'logs']);
  const ghosts: GhostFolderInfo[] = [];

  const canonicalWorkspaces: Array<{
    id: string;
    meta: WorkspaceMeta;
    activePlans: string[];
  }> = [];

  for (const dir of dirs) {
    if (systemDirs.has(dir)) continue;
    const meta = await readJsonSafe<WorkspaceMeta>(
      path.join(dataRoot, dir, 'workspace.meta.json')
    );
    if (meta) {
      canonicalWorkspaces.push({
        id: dir,
        meta,
        activePlans: [
          ...(meta.active_plans || []),
          ...(meta.archived_plans || []),
        ],
      });
    }
  }

  for (const dir of dirs) {
    if (systemDirs.has(dir)) continue;

    const metaPath = path.join(dataRoot, dir, 'workspace.meta.json');
    if (await pathExists(metaPath)) continue;

    const folderPath = path.join(dataRoot, dir);
    const contents = await listDirContents(folderPath);
    const planIds = await findPlanIdsInDir(folderPath);

    const { matchId, reason } = findCanonicalMatch(dir, planIds, canonicalWorkspaces);

    ghosts.push({
      folder_name: dir,
      folder_path: folderPath,
      contents,
      plan_ids: planIds,
      likely_canonical_match: matchId,
      match_reason: reason,
      suggested_merge_command: matchId
        ? `merge-workspace --source ${dir} --target ${matchId}`
        : null,
    });
  }

  return ghosts;
}

async function listDirContents(dirPath: string): Promise<string[]> {
  try {
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    return entries.map(e => (e.isDirectory() ? `${e.name}/` : e.name));
  } catch {
    return [];
  }
}

async function findPlanIdsInDir(dirPath: string): Promise<string[]> {
  const plansDir = path.join(dirPath, 'plans');
  if (!(await pathExists(plansDir))) return [];
  return listDirs(plansDir);
}

function findCanonicalMatch(
  ghostName: string,
  ghostPlanIds: string[],
  canonicals: Array<{ id: string; meta: WorkspaceMeta; activePlans: string[] }>
): { matchId: string | null; reason: string | null } {
  const ghostLower = ghostName.toLowerCase();

  for (const c of canonicals) {
    if (
      Array.isArray(c.meta.legacy_workspace_ids) &&
      c.meta.legacy_workspace_ids.some(id => id.toLowerCase() === ghostLower)
    ) {
      return { matchId: c.id, reason: `Ghost name found in legacy_workspace_ids` };
    }
  }

  if (ghostPlanIds.length > 0) {
    for (const c of canonicals) {
      const overlap = ghostPlanIds.filter(p => c.activePlans.includes(p));
      if (overlap.length > 0) {
        return {
          matchId: c.id,
          reason: `Plan overlap: ${overlap.join(', ')}`,
        };
      }
    }
  }

  for (const c of canonicals) {
    const cLower = c.id.toLowerCase();
    const cName = (c.meta.name || '').toLowerCase();
    if (
      cLower.startsWith(ghostLower) ||
      ghostLower.startsWith(cName) ||
      cName === ghostLower
    ) {
      return { matchId: c.id, reason: `Name similarity: '${ghostName}' ≈ '${c.id}'` };
    }
  }

  return { matchId: null, reason: null };
}

// ---------------------------------------------------------------------------
// Merge operations
// ---------------------------------------------------------------------------

export interface MergeResult {
  merged_plans: string[];
  merged_logs: string[];
  source_deleted: boolean;
  notes: string[];
}

/**
 * Merge a ghost/source workspace folder into a target canonical workspace.
 */
export async function mergeWorkspace(
  sourceId: string,
  targetId: string,
  dryRun: boolean = true
): Promise<MergeResult> {
  const dataRoot = getDataRoot();
  const sourcePath = path.join(dataRoot, sourceId);
  const targetPath = path.join(dataRoot, targetId);
  const result: MergeResult = {
    merged_plans: [],
    merged_logs: [],
    source_deleted: false,
    notes: [],
  };

  const targetMetaPath = path.join(targetPath, 'workspace.meta.json');
  const targetMeta = await readJsonSafe<WorkspaceMeta>(targetMetaPath);
  if (!targetMeta) {
    result.notes.push(`ERROR: Target '${targetId}' has no workspace.meta.json — refusing to merge.`);
    return result;
  }

  if (!(await pathExists(sourcePath))) {
    result.notes.push(`ERROR: Source '${sourceId}' does not exist.`);
    return result;
  }

  const sourcePlanIds = await findPlanIdsInDir(sourcePath);
  const targetPlanIds = await findPlanIdsInDir(targetPath);
  const targetPlanSet = new Set(targetPlanIds);
  const sourceContextPath = path.join(sourcePath, 'workspace.context.json');
  const sourceHasContext = await pathExists(sourceContextPath);

  for (const planId of sourcePlanIds) {
    const sourcePlanDir = path.join(sourcePath, 'plans', planId);
    const targetPlanDir = path.join(targetPath, 'plans', planId);

    if (targetPlanSet.has(planId)) {
      result.notes.push(`Skipped plan '${planId}': already exists in target.`);
      continue;
    }

    if (!dryRun) {
      await fs.mkdir(path.join(targetPath, 'plans'), { recursive: true });
      await moveDirSafe(sourcePlanDir, targetPlanDir);

      const statePath = path.join(targetPlanDir, 'state.json');
      const state = await readJsonSafe<Record<string, unknown>>(statePath);
      if (state) {
        state.workspace_id = targetId;
        state.updated_at = new Date().toISOString();
        await writeJsonLocked(statePath, state);
      } else {
        const minimalState = {
          id: planId,
          workspace_id: targetId,
          title: `Recovered plan: ${planId}`,
          status: 'archived',
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          steps: [],
          notes: ['This plan was recovered during workspace migration. No original state.json was found.'],
        };
        await writeJsonLocked(statePath, minimalState);
        result.notes.push(`Created minimal state.json for plan '${planId}' (was missing).`);
      }
    }

    result.merged_plans.push(planId);
  }

  const sourceLogsDir = path.join(sourcePath, 'logs');
  if (await pathExists(sourceLogsDir)) {
    try {
      const logFiles = await fs.readdir(sourceLogsDir);
      for (const logFile of logFiles) {
        const sourceLogPath = path.join(sourceLogsDir, logFile);
        const targetLogsDir = path.join(targetPath, 'logs');
        const targetLogPath = path.join(targetLogsDir, logFile);

        if (!dryRun) {
          await fs.mkdir(targetLogsDir, { recursive: true });
          const sourceContent = await fs.readFile(sourceLogPath, 'utf-8');
          try {
            const existing = await fs.readFile(targetLogPath, 'utf-8');
            await fs.writeFile(targetLogPath, existing + '\n' + sourceContent, 'utf-8');
          } catch {
            await fs.writeFile(targetLogPath, sourceContent, 'utf-8');
          }
        }

        result.merged_logs.push(logFile);
      }
    } catch {
      result.notes.push('No logs directory in source or failed to read logs.');
    }
  }

  let contextReadyForDeletion = true;

  if (!dryRun) {
    try {
      const contextOutcome = await mergeContextIntoCanonical(
        sourcePath, sourceId, targetPath, targetId, targetMeta, result.notes
      );

      if (contextOutcome.sourceHadContext && contextOutcome.mergedSourceSections) {
        result.notes.push(`Merged workspace context sections from '${sourceId}' into '${targetId}'.`);
      }
      if (contextOutcome.repopulatedSections) {
        result.notes.push(`Repopulated minimal workspace context sections for '${targetId}'.`);
      }
    } catch (error) {
      contextReadyForDeletion = false;
      result.notes.push(
        `ERROR: Failed to merge workspace context from '${sourceId}': ${(error as Error).message}`
      );
    }
  } else if (sourceHasContext) {
    result.notes.push(`DRY RUN: would merge workspace context from '${sourceId}' into '${targetId}' before deletion.`);
  }

  if (!dryRun) {
    const legacyIds = new Set<string>(targetMeta.legacy_workspace_ids || []);
    legacyIds.add(sourceId);
    targetMeta.legacy_workspace_ids = Array.from(legacyIds);
    targetMeta.updated_at = new Date().toISOString();
    await writeJsonLocked(targetMetaPath, targetMeta);

    const contextPath = path.join(targetPath, 'workspace.context.json');
    await modifyJsonLocked<WorkspaceContext>(contextPath, (existing) => {
      const context = existing || {
        schema_version: '1.0.0',
        workspace_id: targetId,
        workspace_path: targetMeta.workspace_path || targetMeta.path || '',
        name: targetMeta.name || targetId,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        sections: {},
      } as WorkspaceContext;

      const auditLog = context.audit_log || { entries: [], last_updated: '' };
      auditLog.entries.push({
        timestamp: new Date().toISOString(),
        tool: 'merge-workspace',
        action: 'merge',
        file_path: targetMetaPath,
        summary: `Merged ghost folder '${sourceId}' → '${targetId}'. Plans: ${result.merged_plans.join(', ') || 'none'}. Logs: ${result.merged_logs.join(', ') || 'none'}.`,
        warning: '',
      });
      auditLog.last_updated = new Date().toISOString();
      context.audit_log = auditLog;
      context.updated_at = new Date().toISOString();
      return context;
    });

    const remainingRefs = await checkRemainingReferences(sourceId, targetId);
    if (remainingRefs.length > 0) {
      result.notes.push(
        `WARNING: ${remainingRefs.length} plan state(s) still reference '${sourceId}'. Not deleting source.`
      );
    } else if (sourceHasContext && !contextReadyForDeletion) {
      result.notes.push(
        `WARNING: Source '${sourceId}' has workspace.context.json but context merge/persist did not complete. Not deleting source.`
      );
    } else {
      try {
        await fs.rm(sourcePath, { recursive: true, force: true });
        result.source_deleted = true;
      } catch (err) {
        result.notes.push(`Failed to delete source folder: ${(err as Error).message}`);
      }
    }
  }

  if (dryRun) {
    result.notes.push('DRY RUN — no changes were made.');
  }

  return result;
}

async function checkRemainingReferences(sourceId: string, targetId: string): Promise<string[]> {
  const dataRoot = getDataRoot();
  const targetPlansDir = path.join(dataRoot, targetId, 'plans');
  const planIds = await listDirs(targetPlansDir);
  const references: string[] = [];

  for (const planId of planIds) {
    const statePath = path.join(targetPlansDir, planId, 'state.json');
    const state = await readJsonSafe<Record<string, unknown>>(statePath);
    if (state && state.workspace_id === sourceId) {
      references.push(planId);
    }
  }

  return references;
}

// ---------------------------------------------------------------------------
// Full workspace migration
// ---------------------------------------------------------------------------

export interface MigrateWorkspaceResult {
  workspace_id: string;
  workspace_path: string;
  identity_written: boolean;
  ghost_folders_found: GhostFolderInfo[];
  ghost_folders_merged: string[];
  plans_recovered: string[];
  folders_deleted: string[];
  notes: string[];
}

/**
 * Full workspace migration: re-register, find all ghost/duplicate folders,
 * merge their plans into the canonical workspace, and clean up.
 */
export async function migrateWorkspace(workspacePath: string): Promise<MigrateWorkspaceResult> {
  const resolvedPath = safeResolvePath(workspacePath);
  const dataRoot = getDataRoot();

  // Import resolveCanonicalWorkspaceId from workspace-identity to avoid re-implementing it
  const { resolveCanonicalWorkspaceId: resolveId } = await import('./workspace-identity.js');
  const canonicalId = await resolveId(resolvedPath);

  const result: MigrateWorkspaceResult = {
    workspace_id: canonicalId,
    workspace_path: resolvedPath,
    identity_written: false,
    ghost_folders_found: [],
    ghost_folders_merged: [],
    plans_recovered: [],
    folders_deleted: [],
    notes: [],
  };

  const canonicalPath = path.join(dataRoot, canonicalId);
  const canonicalMetaPath = path.join(canonicalPath, 'workspace.meta.json');
  const canonicalPlansDir = path.join(canonicalPath, 'plans');
  await fs.mkdir(canonicalPlansDir, { recursive: true });

  let canonicalMeta = await readJsonSafe<WorkspaceMeta>(canonicalMetaPath);
  const now = new Date().toISOString();

  if (!canonicalMeta) {
    canonicalMeta = {
      schema_version: '1.0.0',
      workspace_id: canonicalId,
      workspace_path: resolvedPath,
      path: resolvedPath,
      name: path.basename(resolvedPath),
      created_at: now,
      updated_at: now,
      registered_at: now,
      last_accessed: now,
      last_seen_at: now,
      data_root: dataRoot,
      legacy_workspace_ids: [],
      active_plans: [],
      archived_plans: [],
      active_programs: [],
      indexed: false,
    };
    await writeJsonLocked(canonicalMetaPath, canonicalMeta);
    result.notes.push(`Created canonical workspace folder: ${canonicalId}`);
  } else {
    canonicalMeta.last_accessed = now;
    canonicalMeta.last_seen_at = now;
    canonicalMeta.updated_at = now;
    canonicalMeta.workspace_path = canonicalMeta.workspace_path || resolvedPath;
    canonicalMeta.data_root = canonicalMeta.data_root || dataRoot;
  }

  const allDirs = await listDirs(dataRoot);
  const systemDirs = new Set(['events', 'logs']);
  const normalizedTarget = normalizeWorkspacePath(resolvedPath);
  const matchingGhosts: GhostFolderInfo[] = [];
  const canonicalIdLower = canonicalId.toLowerCase();

  for (const dir of allDirs) {
    if (systemDirs.has(dir) || dir.toLowerCase() === canonicalIdLower) continue;

    const dirPath = path.join(dataRoot, dir);
    const dirMeta = await readJsonSafe<WorkspaceMeta>(
      path.join(dirPath, 'workspace.meta.json')
    );

    let isMatch = false;
    let matchReason = '';

    if (dirMeta) {
      const metaPath = dirMeta.workspace_path || dirMeta.path;
      if (metaPath && normalizeWorkspacePath(metaPath) === normalizedTarget) {
        isMatch = true;
        matchReason = `workspace_path matches: ${metaPath}`;
      }
    } else {
      const dirLower = dir.toLowerCase();
      const legacyIdsLower = (canonicalMeta.legacy_workspace_ids || []).map(id => id.toLowerCase());
      if (legacyIdsLower.includes(dirLower)) {
        isMatch = true;
        matchReason = `Listed in canonical legacy_workspace_ids`;
      } else {
        const baseName = path.basename(resolvedPath).toLowerCase();
        if (dirLower === baseName || dirLower.startsWith(baseName + '-') || baseName.startsWith(dirLower)) {
          isMatch = true;
          matchReason = `Name similarity: '${dir}' ≈ workspace '${path.basename(resolvedPath)}'`;
        }
      }
    }

    if (isMatch) {
      const planIds = await findPlanIdsInDir(dirPath);
      const contents = await listDirContents(dirPath);
      matchingGhosts.push({
        folder_name: dir,
        folder_path: dirPath,
        contents,
        plan_ids: planIds,
        likely_canonical_match: canonicalId,
        match_reason: matchReason,
        suggested_merge_command: null,
      });
    }
  }

  result.ghost_folders_found = matchingGhosts;

  const existingPlanIds = new Set(await findPlanIdsInDir(canonicalPath));

  for (const ghost of matchingGhosts) {
    const ghostPath = path.join(dataRoot, ghost.folder_name);
    let mergedAny = false;

    for (const planId of ghost.plan_ids) {
      if (existingPlanIds.has(planId)) {
        result.notes.push(`Skipped plan '${planId}' from '${ghost.folder_name}': already exists in canonical.`);
        continue;
      }

      const sourcePlanDir = path.join(ghostPath, 'plans', planId);
      const targetPlanDir = path.join(canonicalPlansDir, planId);

      await moveDirSafe(sourcePlanDir, targetPlanDir);

      const statePath = path.join(targetPlanDir, 'state.json');
      const state = await readJsonSafe<Record<string, unknown>>(statePath);
      if (state) {
        state.workspace_id = canonicalId;
        state.updated_at = now;
        await writeJsonLocked(statePath, state);
      } else {
        const minimalState = {
          id: planId,
          workspace_id: canonicalId,
          title: `Recovered plan: ${planId}`,
          status: 'archived',
          created_at: now,
          updated_at: now,
          steps: [],
          notes: ['This plan was recovered during workspace migration. No original state.json was found.'],
        };
        await writeJsonLocked(statePath, minimalState);
        result.notes.push(`Created minimal state.json for plan '${planId}' (was missing).`);
      }

      existingPlanIds.add(planId);
      result.plans_recovered.push(planId);
      mergedAny = true;
    }

    const ghostLogsDir = path.join(ghostPath, 'logs');
    if (await pathExists(ghostLogsDir)) {
      try {
        const logFiles = await fs.readdir(ghostLogsDir);
        const targetLogsDir = path.join(canonicalPath, 'logs');
        await fs.mkdir(targetLogsDir, { recursive: true });
        for (const logFile of logFiles) {
          const srcLog = path.join(ghostLogsDir, logFile);
          const dstLog = path.join(targetLogsDir, logFile);
          const srcContent = await fs.readFile(srcLog, 'utf-8');
          try {
            const existing = await fs.readFile(dstLog, 'utf-8');
            await fs.writeFile(dstLog, existing + '\n' + srcContent, 'utf-8');
          } catch {
            await fs.writeFile(dstLog, srcContent, 'utf-8');
          }
        }
      } catch {
        // ignore log merge failures
      }
    }

    if (!canonicalMeta.legacy_workspace_ids) {
      canonicalMeta.legacy_workspace_ids = [];
    }
    if (!canonicalMeta.legacy_workspace_ids.includes(ghost.folder_name)) {
      canonicalMeta.legacy_workspace_ids.push(ghost.folder_name);
    }

    if (mergedAny) {
      result.ghost_folders_merged.push(ghost.folder_name);
    }

    const ghostContextPath = path.join(ghostPath, 'workspace.context.json');
    const ghostHasContext = await pathExists(ghostContextPath);
    let contextReadyForDeletion = true;

    try {
      const contextOutcome = await mergeContextIntoCanonical(
        ghostPath, ghost.folder_name, canonicalPath, canonicalId, canonicalMeta, result.notes
      );

      if (contextOutcome.sourceHadContext && contextOutcome.mergedSourceSections) {
        result.notes.push(`Merged workspace context sections from '${ghost.folder_name}' into '${canonicalId}'.`);
      }
      if (contextOutcome.repopulatedSections) {
        result.notes.push(`Repopulated minimal workspace context sections for '${canonicalId}'.`);
      }
    } catch (error) {
      contextReadyForDeletion = false;
      result.notes.push(
        `ERROR: Failed to merge workspace context from '${ghost.folder_name}': ${(error as Error).message}`
      );
    }

    if (ghostHasContext && !contextReadyForDeletion) {
      result.notes.push(
        `WARNING: '${ghost.folder_name}' retains workspace.context.json and merge did not complete. Folder not deleted.`
      );
    } else {
      try {
        await fs.rm(ghostPath, { recursive: true, force: true });
        result.folders_deleted.push(ghost.folder_name);
      } catch (err) {
        result.notes.push(`Failed to delete '${ghost.folder_name}': ${(err as Error).message}`);
      }
    }
  }

  try {
    const repopulated = await ensureCanonicalContextNotEmpty(
      canonicalPath, canonicalId, canonicalMeta, result.notes
    );
    if (repopulated) {
      result.notes.push(`Final context repopulation applied for '${canonicalId}'.`);
    }
  } catch (error) {
    result.notes.push(`Failed final canonical context repopulation: ${(error as Error).message}`);
  }

  const allPlanIds = await findPlanIdsInDir(canonicalPath);
  const activePlans: string[] = [];
  const archivedPlans: string[] = [];
  for (const planId of allPlanIds) {
    const statePath = path.join(canonicalPlansDir, planId, 'state.json');
    const state = await readJsonSafe<Record<string, unknown>>(statePath);
    if (state?.status === 'archived') {
      archivedPlans.push(planId);
    } else {
      activePlans.push(planId);
    }
  }
  canonicalMeta.active_plans = activePlans;
  canonicalMeta.archived_plans = archivedPlans;
  canonicalMeta.updated_at = now;
  await writeJsonLocked(canonicalMetaPath, canonicalMeta);

  // Write/refresh identity.json in the workspace directory
  const { resolveAccessiblePath: resolveAccessible } = await import('./workspace-mounts.js');
  const accessibleMigratePath = await resolveAccessible(resolvedPath);
  if (accessibleMigratePath) {
    try {
      const identityPath = getWorkspaceIdentityPath(accessibleMigratePath);
      await modifyJsonLocked<WorkspaceIdentityFile>(identityPath, (existingIdentity) => {
        return {
          schema_version: '1.0.0',
          workspace_id: canonicalId,
          workspace_path: resolvedPath,
          data_root: dataRoot,
          created_at: existingIdentity?.created_at || now,
          updated_at: now,
          project_mcps: existingIdentity?.project_mcps,
        };
      });
      result.identity_written = true;
    } catch (err) {
      result.notes.push(`Failed to write identity.json: ${(err as Error).message}`);
    }
  } else {
    result.notes.push(`Workspace path not accessible from this process (container mode?): ${resolvedPath}`);
  }

  try {
    await upsertRegistryEntry(resolvedPath, canonicalId);
  } catch (err) {
    result.notes.push(`Failed to update workspace registry: ${(err as Error).message}`);
  }

  return result;
}

// Re-export identity-file helpers so consumers can get everything from db-store
export { getWorkspaceIdentityPath, ensureIdentityFile, type WorkspaceIdentityFile };
