import { promises as fs } from 'node:fs';
import path from 'node:path';
import { AGENTS_ROOT } from '../agent.tools.js';

export interface HubRolloutInput {
  session_id: string;
  feature_flag_enabled?: boolean;
  canary_percent?: number;
  force_legacy_fallback?: boolean;
  deprecation_window_active?: boolean;
  backup_directory_override?: string;
}

export interface HubRolloutDecision {
  routing: 'dynamic_session_scoped' | 'legacy_static_fallback';
  reason_code:
    | 'dynamic_enabled'
    | 'feature_flag_disabled'
    | 'forced_legacy_fallback'
    | 'deprecation_window_canary_holdback';
  feature_flag_enabled: boolean;
  canary_percent: number;
  canary_bucket: number;
  deprecation_window_active: boolean;
  backup_directory: string;
}

export interface RestoreLegacyResult {
  restored_files: string[];
  warnings: string[];
  target_agent_path: string | null;
}

function envBoolean(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const value = raw.trim().toLowerCase();
  if (value === '1' || value === 'true' || value === 'yes' || value === 'on') return true;
  if (value === '0' || value === 'false' || value === 'no' || value === 'off') return false;
  return fallback;
}

function envNumber(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw == null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 100;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return Math.floor(value);
}

function stableBucket(seed: string): number {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return hash % 100;
}

export function resolveHubRolloutDecision(
  workspacePath: string,
  input: HubRolloutInput,
): HubRolloutDecision {
  const featureFlagEnabled = input.feature_flag_enabled ?? envBoolean('PM_DYNAMIC_HUB_ENABLED', true);
  const canaryPercent = clampPercent(input.canary_percent ?? envNumber('PM_DYNAMIC_HUB_CANARY_PERCENT', 100));
  const forceLegacyFallback = input.force_legacy_fallback ?? envBoolean('PM_DYNAMIC_HUB_FORCE_LEGACY_FALLBACK', false);
  const deprecationWindowActive = input.deprecation_window_active ?? envBoolean('PM_DYNAMIC_HUB_DEPRECATION_WINDOW_ACTIVE', true);
  const bucket = stableBucket(input.session_id);
  const backupDirectory = input.backup_directory_override ?? path.join(workspacePath, '.projectmemory', 'backups', 'legacy-static-agents');

  if (forceLegacyFallback) {
    return {
      routing: 'legacy_static_fallback',
      reason_code: 'forced_legacy_fallback',
      feature_flag_enabled: featureFlagEnabled,
      canary_percent: canaryPercent,
      canary_bucket: bucket,
      deprecation_window_active: deprecationWindowActive,
      backup_directory: backupDirectory,
    };
  }

  if (!featureFlagEnabled) {
    return {
      routing: 'legacy_static_fallback',
      reason_code: 'feature_flag_disabled',
      feature_flag_enabled: featureFlagEnabled,
      canary_percent: canaryPercent,
      canary_bucket: bucket,
      deprecation_window_active: deprecationWindowActive,
      backup_directory: backupDirectory,
    };
  }

  if (deprecationWindowActive && bucket >= canaryPercent) {
    return {
      routing: 'legacy_static_fallback',
      reason_code: 'deprecation_window_canary_holdback',
      feature_flag_enabled: featureFlagEnabled,
      canary_percent: canaryPercent,
      canary_bucket: bucket,
      deprecation_window_active: deprecationWindowActive,
      backup_directory: backupDirectory,
    };
  }

  return {
    routing: 'dynamic_session_scoped',
    reason_code: 'dynamic_enabled',
    feature_flag_enabled: featureFlagEnabled,
    canary_percent: canaryPercent,
    canary_bucket: bucket,
    deprecation_window_active: deprecationWindowActive,
    backup_directory: backupDirectory,
  };
}

async function listAgentFiles(dirPath: string): Promise<string[]> {
  const files = await fs.readdir(dirPath);
  return files.filter((fileName) => fileName.endsWith('.agent.md'));
}

async function ensureBackupPopulated(backupDirectory: string): Promise<void> {
  await fs.mkdir(backupDirectory, { recursive: true });

  const existing = await listAgentFiles(backupDirectory).catch(() => [] as string[]);
  if (existing.length > 0) {
    return;
  }

  const sourceFiles = await listAgentFiles(AGENTS_ROOT);
  for (const sourceFile of sourceFiles) {
    const sourcePath = path.join(AGENTS_ROOT, sourceFile);
    const destinationPath = path.join(backupDirectory, sourceFile);
    await fs.copyFile(sourcePath, destinationPath);
  }
}

export async function restoreLegacyStaticAgentsFromBackup(
  workspacePath: string,
  agentType: string,
  backupDirectory: string,
): Promise<RestoreLegacyResult> {
  const warnings: string[] = [];
  const restoredFiles: string[] = [];
  const agentsDirectory = path.join(workspacePath, '.github', 'agents');
  await fs.mkdir(agentsDirectory, { recursive: true });

  try {
    await ensureBackupPopulated(backupDirectory);
  } catch (error) {
    warnings.push(`Failed to prepare legacy backup directory (${backupDirectory}): ${(error as Error).message}`);
  }

  let sourceDirectory = backupDirectory;
  let sourceFiles: string[] = [];

  try {
    sourceFiles = await listAgentFiles(sourceDirectory);
  } catch {
    sourceDirectory = AGENTS_ROOT;
    warnings.push('Legacy backup unavailable; falling back to AGENTS_ROOT static files.');
    sourceFiles = await listAgentFiles(sourceDirectory);
  }

  for (const fileName of sourceFiles) {
    const sourcePath = path.join(sourceDirectory, fileName);
    const destinationPath = path.join(agentsDirectory, fileName);
    try {
      await fs.copyFile(sourcePath, destinationPath);
      restoredFiles.push(destinationPath);
    } catch (error) {
      warnings.push(`Failed to restore static agent file ${fileName}: ${(error as Error).message}`);
    }
  }

  const requestedSlug = agentType.toLowerCase().replace(/\s+/g, '-');
  const requestedFile = `${requestedSlug}.agent.md`;
  const targetAgentPath = restoredFiles.find((filePath) => path.basename(filePath).toLowerCase() === requestedFile) ?? null;

  return {
    restored_files: restoredFiles,
    warnings,
    target_agent_path: targetAgentPath,
  };
}