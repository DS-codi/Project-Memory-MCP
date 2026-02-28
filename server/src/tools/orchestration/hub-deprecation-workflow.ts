import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { LegacyHubLabel } from './hub-alias-routing.js';

const LEGACY_LABEL_ORDER: LegacyHubLabel[] = ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'];
const PERMANENT_AGENT_FILES = new Set(['hub.agent.md', 'prompt-analyst.agent.md']);

export interface LegacyAliasWindowStatus {
  label: LegacyHubLabel;
  window_index: number;
  status: 'deprecated_removed' | 'deprecating_active' | 'active_until_window';
  alias_allowed: boolean;
}

export interface LegacyDeprecationWorkflowReport {
  strategy: 'fixed_window_deprecation';
  generated_at: string;
  current_window_index: number;
  alias_windows: LegacyAliasWindowStatus[];
  permanent_agent_files: string[];
  legacy_static_files_before: string[];
  legacy_static_files_after: string[];
  removal_applied: boolean;
  removal_archive_dir: string;
  removed_files: string[];
  warnings: string[];
}

interface BuildWorkflowOptions {
  current_window_index?: number;
  apply_legacy_static_removal?: boolean;
  archive_dir?: string;
}

function toSlug(label: LegacyHubLabel): string {
  return label.toLowerCase();
}

function legacyStaticFileName(label: LegacyHubLabel): string {
  return `${toSlug(label)}.agent.md`;
}

function getAliasWindowStatus(label: LegacyHubLabel, currentWindowIndex: number): LegacyAliasWindowStatus {
  const windowIndex = LEGACY_LABEL_ORDER.indexOf(label) + 1;
  if (windowIndex <= 0) {
    return {
      label,
      window_index: -1,
      status: 'active_until_window',
      alias_allowed: true,
    };
  }

  if (windowIndex < currentWindowIndex) {
    return {
      label,
      window_index: windowIndex,
      status: 'deprecated_removed',
      alias_allowed: false,
    };
  }

  if (windowIndex === currentWindowIndex) {
    return {
      label,
      window_index: windowIndex,
      status: 'deprecating_active',
      alias_allowed: true,
    };
  }

  return {
    label,
    window_index: windowIndex,
    status: 'active_until_window',
    alias_allowed: true,
  };
}

async function listLegacyStaticFiles(agentsDir: string): Promise<string[]> {
  const entries = await fs.readdir(agentsDir, { withFileTypes: true }).catch(() => []);
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.agent.md'))
    .map((entry) => entry.name)
    .filter((fileName) => !PERMANENT_AGENT_FILES.has(fileName.toLowerCase()));
}

async function removeLegacyStaticFiles(
  workspacePath: string,
  files: string[],
  archiveDir: string,
): Promise<{ removed_files: string[]; warnings: string[] }> {
  const warnings: string[] = [];
  const removedFiles: string[] = [];
  const agentsDir = path.join(workspacePath, '.github', 'agents');

  await fs.mkdir(archiveDir, { recursive: true });

  for (const fileName of files) {
    const sourcePath = path.join(agentsDir, fileName);
    const archivePath = path.join(archiveDir, fileName);
    try {
      await fs.copyFile(sourcePath, archivePath);
      await fs.rm(sourcePath, { force: true });
      removedFiles.push(fileName);
    } catch (error) {
      warnings.push(`Failed to remove legacy static file ${fileName}: ${(error as Error).message}`);
    }
  }

  return { removed_files: removedFiles, warnings };
}

export async function buildLegacyDeprecationWorkflowReport(
  workspacePath: string,
  options?: BuildWorkflowOptions,
): Promise<LegacyDeprecationWorkflowReport> {
  const currentWindowIndex = Math.max(1, Math.floor(options?.current_window_index ?? 1));
  const applyRemoval = options?.apply_legacy_static_removal === true;
  const warnings: string[] = [];
  const agentsDir = path.join(workspacePath, '.github', 'agents');
  const defaultArchiveDir = path.join(
    workspacePath,
    '.projectmemory',
    'backups',
    'legacy-static-agents-removed',
    new Date().toISOString().replace(/[:.]/g, '-'),
  );
  const archiveDir = options?.archive_dir ?? defaultArchiveDir;

  const aliasWindows = LEGACY_LABEL_ORDER.map((label) => getAliasWindowStatus(label, currentWindowIndex));
  const expectedDeprecatedFiles = new Set(
    aliasWindows
      .filter((window) => window.status === 'deprecated_removed')
      .map((window) => legacyStaticFileName(window.label)),
  );

  const legacyBefore = await listLegacyStaticFiles(agentsDir);
  const removalCandidates = legacyBefore.filter((fileName) => expectedDeprecatedFiles.has(fileName));

  let removedFiles: string[] = [];
  if (applyRemoval && removalCandidates.length > 0) {
    const removed = await removeLegacyStaticFiles(workspacePath, removalCandidates, archiveDir);
    removedFiles = removed.removed_files;
    warnings.push(...removed.warnings);
  }

  const legacyAfter = await listLegacyStaticFiles(agentsDir);

  return {
    strategy: 'fixed_window_deprecation',
    generated_at: new Date().toISOString(),
    current_window_index: currentWindowIndex,
    alias_windows: aliasWindows,
    permanent_agent_files: Array.from(PERMANENT_AGENT_FILES),
    legacy_static_files_before: legacyBefore,
    legacy_static_files_after: legacyAfter,
    removal_applied: applyRemoval,
    removal_archive_dir: archiveDir,
    removed_files: removedFiles,
    warnings,
  };
}
