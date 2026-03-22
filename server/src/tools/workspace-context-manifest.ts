/**
 * workspace-context-manifest.ts
 *
 * Single source of truth for what belongs in a workspace's .github/ folder
 * when using Project Memory MCP.
 *
 * Rules:
 *   MANDATORY — must exist in the workspace; deployed from DB if missing.
 *   CULL      — should NOT exist in the workspace; they are DB-only and
 *               fetched on demand by agents via memory_instructions / memory_agent.
 *
 * Used by:
 *   - memory_workspace(action: register) — reports context_health in response
 *   - VS Code extension deployer         — deploys missing, warns about cull candidates
 *   - registry checks                    — consistent state across workspaces
 */

// ---------------------------------------------------------------------------
// Mandatory files
// ---------------------------------------------------------------------------

/**
 * Agent files that must exist in .github/agents/.
 * These are the ONLY agents VS Code needs on disk to offer chat modes.
 * All other agents are provisioned by Hub at spawn time from the DB.
 */
export const MANDATORY_AGENTS: string[] = [
  'hub.agent.md',
  'prompt-analyst.agent.md',
  'shell.agent.md',
];

/**
 * Instruction files that must exist in .github/instructions/.
 * These are the minimal bootstrap context an agent needs before it can
 * call memory_agent(action: init) and pull the rest from the DB.
 *
 * Every other instruction should be DB-only and fetched on demand.
 */
export const MANDATORY_INSTRUCTIONS: string[] = [
  'mcp-usage.instructions.md',         // tool table + init protocol
  'hub.instructions.md',               // hub-specific supplement (applyTo: hub.agent.md)
  'prompt-analyst.instructions.md',    // pa-specific supplement (applyTo: prompt-analyst.agent.md)
  'subagent-recovery.instructions.md', // recovery protocol (applyTo: hub.agent.md)
];

/** No skill files are mandatory in the workspace. Skills are always DB-only. */
export const MANDATORY_SKILLS: string[] = [];

export interface MandatoryWorkspaceFileSpec {
  canonical_seed_path: string;
  required_workspace_copy: boolean;
}

export type WorkspaceFileKind = 'agent' | 'instruction' | 'skill';
export type WorkspaceImportMode = 'never' | 'manual';
export type WorkspaceCanonicalSource = 'none' | 'database_seed_resources';

export interface WorkspacePolicyFrontmatter {
  pm_file_kind?: string;
  pm_sync_managed?: boolean;
  pm_controlled?: boolean;
  pm_import_mode?: string;
  pm_canonical_source?: string;
  pm_canonical_path?: string | null;
  pm_required_workspace_copy?: boolean;
}

export interface ResolvedWorkspaceFilePolicy {
  kind: WorkspaceFileKind;
  canonical_filename: string;
  sync_managed: boolean;
  controlled: boolean;
  import_mode: WorkspaceImportMode;
  canonical_source: WorkspaceCanonicalSource;
  canonical_path: string | null;
  required_workspace_copy: boolean;
  legacy_mandatory: boolean;
  cull_reason?: string;
  validation_errors: string[];
  frontmatter: WorkspacePolicyFrontmatter;
}

export const MANDATORY_AGENT_SPECS: Record<string, MandatoryWorkspaceFileSpec> = {
  'hub.agent.md': {
    canonical_seed_path: 'agents/core/hub.agent.md',
    required_workspace_copy: true,
  },
  'prompt-analyst.agent.md': {
    canonical_seed_path: 'agents/core/prompt-analyst.agent.md',
    required_workspace_copy: true,
  },
  'shell.agent.md': {
    canonical_seed_path: 'agents/core/shell.agent.md',
    required_workspace_copy: true,
  },
};

export const MANDATORY_INSTRUCTION_SPECS: Record<string, MandatoryWorkspaceFileSpec> = {
  'mcp-usage.instructions.md': {
    canonical_seed_path: 'instructions/mcp-usage.instructions.md',
    required_workspace_copy: true,
  },
  'hub.instructions.md': {
    canonical_seed_path: 'instructions/hub.instructions.md',
    required_workspace_copy: true,
  },
  'prompt-analyst.instructions.md': {
    canonical_seed_path: 'instructions/prompt-analyst.instructions.md',
    required_workspace_copy: true,
  },
  'subagent-recovery.instructions.md': {
    canonical_seed_path: 'instructions/subagent-recovery.instructions.md',
    required_workspace_copy: true,
  },
};

// ---------------------------------------------------------------------------
// Cull lists
// ---------------------------------------------------------------------------

/**
 * Agent files that should NOT exist in the workspace.
 * Shell and specialist spokes are provisioned dynamically; having their
 * .agent.md files on disk pollutes VS Code's agent picker with modes that
 * are never directly invoked by users.
 */
export const CULL_AGENTS: string[] = [
  'folder-cleanup-shell.agent.md',
];

/**
 * Instruction files that should NOT exist in the workspace.
 * These are detailed reference docs or role-specific instructions that agents
 * fetch from the DB on demand (via memory_instructions or memory_agent).
 */
export const CULL_INSTRUCTIONS: string[] = [
  // Role-specific: fetched by Shell agents on spawn init
  'shell.instructions.md',
  'folder-cleanup.instructions.md',
  'hub-interaction-discipline.instructions.md',

  // Reference docs: available via memory_instructions(action: get/search)
  'plan-context.instructions.md',
  'session-interruption.instructions.md',
  'workspace-migration.instructions.md',
  'build-scripts.instructions.md',        // workspace-specific; assigned via workspace_instruction_assignments

  // Archive subdirectory: all files in it are cull candidates
  // (checked separately as a directory)
];

/**
 * The archive subdirectory inside .github/instructions/ — all files here
 * should be removed from the workspace. They are DB-only reference files.
 */
export const CULL_INSTRUCTIONS_ARCHIVE_DIR = 'archive';

/**
 * Skill directories are never deployed to the workspace.
 * All skills are stored in the DB and pulled on demand.
 * If a .github/skills/ directory is detected, all its contents are cull candidates.
 */
export const CULL_ALL_SKILLS = true;

// ---------------------------------------------------------------------------
// Helper types
// ---------------------------------------------------------------------------

export interface WorkspaceContextHealth {
  /** Files that must exist but are missing */
  mandatory_missing: string[];
  /** Files that are present but should not be in the workspace */
  cull_detected: string[];
  /** 'ok' | 'needs_attention' */
  status: 'ok' | 'needs_attention';
}

// ---------------------------------------------------------------------------
// Checker
// ---------------------------------------------------------------------------

import * as fs from 'node:fs';
import * as path from 'node:path';

// ---------------------------------------------------------------------------
// Workspace short code
// ---------------------------------------------------------------------------

/**
 * Derive a 6-character hex short code from a workspace ID.
 * Workspace IDs have the format: `{foldername}-{12hexchars}`
 * Short code = first 6 chars of the hex suffix.
 * Example: "project_memory_mcp-50e04147a402" → "50e041"
 */
export function getWorkspaceShortCode(workspaceId: string): string {
  const parts = workspaceId.split('-');
  const hex = parts[parts.length - 1] ?? '';
  return hex.substring(0, 6);
}

/**
 * Read the workspace identity file and return the 6-char short code,
 * or null if identity.json cannot be read.
 */
export function readWorkspaceShortCode(workspacePath: string): string | null {
  const identityPath = path.join(workspacePath, '.projectmemory', 'identity.json');
  try {
    const raw = fs.readFileSync(identityPath, 'utf-8');
    const identity = JSON.parse(raw) as { workspace_id?: string };
    const id = identity.workspace_id;
    if (!id) return null;
    return getWorkspaceShortCode(id);
  } catch {
    return null;
  }
}

/**
 * Given a bare agent name (e.g. "hub") and an optional workspace short code,
 * return the deployed filename (e.g. "hub.50e041.agent.md" or "hub.agent.md").
 */
export function agentFilename(name: string, shortCode?: string | null): string {
  return shortCode ? `${name}.${shortCode}.agent.md` : `${name}.agent.md`;
}

/**
 * Given a bare instruction stem (e.g. "mcp-usage") and an optional workspace
 * short code, return the deployed filename
 * (e.g. "mcp-usage.50e041.instructions.md" or "mcp-usage.instructions.md").
 */
export function instructionFilename(stem: string, shortCode?: string | null): string {
  return shortCode ? `${stem}.${shortCode}.instructions.md` : `${stem}.instructions.md`;
}

/**
 * Strip a workspace short code from a deployed filename to get the canonical form.
 * "hub.50e041.agent.md" → "hub.agent.md"
 * "mcp-usage.50e041.instructions.md" → "mcp-usage.instructions.md"
 * Canonical forms pass through unchanged.
 */
export function toCanonicalFilename(filename: string): string {
  return filename
    .replace(/^(.+)\.[a-f0-9]{6}(\.agent\.md)$/, '$1$2')
    .replace(/^(.+)\.[a-f0-9]{6}(\.instructions\.md)$/, '$1$2');
}

function parseFrontmatterBoolean(value: string): boolean | undefined {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return undefined;
}

export function parseWorkspacePolicyFrontmatter(content: string): WorkspacePolicyFrontmatter {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) {
    return {};
  }

  const frontmatter: WorkspacePolicyFrontmatter = {};
  for (const rawLine of match[1].split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const kvMatch = line.match(/^(\w[\w_]*)\s*:\s*(.*)$/);
    if (!kvMatch) continue;

    const key = kvMatch[1] as keyof WorkspacePolicyFrontmatter;
    const rawValue = kvMatch[2].trim();
    const unquoted = rawValue.replace(/^['"]|['"]$/g, '');

    switch (key) {
      case 'pm_sync_managed':
      case 'pm_controlled':
      case 'pm_required_workspace_copy': {
        const boolValue = parseFrontmatterBoolean(unquoted);
        if (boolValue !== undefined) {
          frontmatter[key] = boolValue as never;
        }
        break;
      }
      case 'pm_canonical_path':
        frontmatter.pm_canonical_path = unquoted === 'null' ? null : unquoted;
        break;
      case 'pm_file_kind':
      case 'pm_import_mode':
      case 'pm_canonical_source':
        frontmatter[key] = unquoted as never;
        break;
      default:
        break;
    }
  }

  return frontmatter;
}

export function inferWorkspaceFileKind(relativePath: string): WorkspaceFileKind | null {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  if (normalized.endsWith('.agent.md')) return 'agent';
  if (normalized.endsWith('.instructions.md')) return 'instruction';
  if (/^skills\/.+\/skill\.md$/.test(normalized)) return 'skill';
  return null;
}

export function getMandatoryCanonicalSeedPath(
  kind: WorkspaceFileKind,
  canonicalFilename: string,
): string | null {
  const spec = getMandatoryWorkspaceFileSpec(kind, canonicalFilename);
  return spec?.canonical_seed_path ?? null;
}

export function getMandatoryWorkspaceFileSpec(
  kind: WorkspaceFileKind,
  canonicalFilename: string,
): MandatoryWorkspaceFileSpec | null {
  if (kind === 'agent') {
    return MANDATORY_AGENT_SPECS[canonicalFilename] ?? null;
  }
  if (kind === 'instruction') {
    return MANDATORY_INSTRUCTION_SPECS[canonicalFilename] ?? null;
  }
  return null;
}

export function isMandatoryWorkspaceFile(
  kind: WorkspaceFileKind,
  canonicalFilename: string,
): boolean {
  return getMandatoryWorkspaceFileSpec(kind, canonicalFilename) !== null;
}

export function normalizeInstructionContentForSync(content: string): string {
  return content
    .replace(/\.([a-f0-9]{6})(\.agent\.md)/gi, '$2')
    .replace(/\.([a-f0-9]{6})(\.instructions\.md)/gi, '$2')
    .trim();
}

export function resolveWorkspaceFilePolicy(args: {
  kind: WorkspaceFileKind;
  canonical_filename: string;
  relative_path: string;
  content?: string;
  db_present?: boolean;
}): ResolvedWorkspaceFilePolicy {
  const { kind, canonical_filename, relative_path, content, db_present = false } = args;
  const frontmatter = content ? parseWorkspacePolicyFrontmatter(content) : {};
  const validationErrors: string[] = [];
  const normalizedPath = relative_path.replace(/\\/g, '/').toLowerCase();
  const mandatorySpec = getMandatoryWorkspaceFileSpec(kind, canonical_filename);

  const legacyMandatory = mandatorySpec !== null;

  let cullReason: string | undefined;
  if (kind === 'agent' && CULL_AGENTS.includes(canonical_filename)) {
    cullReason = 'db_only_agent';
  } else if (
    kind === 'instruction' &&
    (CULL_INSTRUCTIONS.includes(canonical_filename) ||
      normalizedPath.startsWith(`instructions/${CULL_INSTRUCTIONS_ARCHIVE_DIR.toLowerCase()}/`))
  ) {
    cullReason = 'db_only_instruction';
  } else if (kind === 'skill' && CULL_ALL_SKILLS) {
    cullReason = 'db_only_skill';
  }

  const controlled = legacyMandatory || frontmatter.pm_controlled === true;
  const importMode: WorkspaceImportMode = controlled || Boolean(cullReason)
    ? 'never'
    : frontmatter.pm_import_mode === 'manual'
      ? 'manual'
      : 'never';

  const canonicalSource: WorkspaceCanonicalSource = controlled
    ? 'database_seed_resources'
    : frontmatter.pm_canonical_source === 'database_seed_resources'
      ? 'database_seed_resources'
      : 'none';

  const canonicalPath = controlled
    ? frontmatter.pm_canonical_path ?? mandatorySpec?.canonical_seed_path ?? null
    : frontmatter.pm_canonical_path ?? null;

  const requiredWorkspaceCopy = mandatorySpec?.required_workspace_copy ?? frontmatter.pm_required_workspace_copy === true;
  let syncManaged =
    legacyMandatory ||
    db_present ||
    controlled ||
    frontmatter.pm_sync_managed === true ||
    importMode === 'manual';

  if (cullReason) {
    syncManaged = false;
  }

  if (frontmatter.pm_file_kind && frontmatter.pm_file_kind !== kind) {
    validationErrors.push(
      `pm_file_kind=${frontmatter.pm_file_kind} does not match inferred kind ${kind}`,
    );
  }
  if (cullReason && frontmatter.pm_import_mode === 'manual') {
    validationErrors.push('Cull-listed DB-only files cannot declare pm_import_mode=manual');
  }
  if (controlled && frontmatter.pm_import_mode === 'manual') {
    validationErrors.push('PM-controlled files cannot declare pm_import_mode=manual');
  }
  if (controlled && canonicalSource !== 'database_seed_resources') {
    validationErrors.push('PM-controlled files must use pm_canonical_source=database_seed_resources');
  }
  if (controlled && !canonicalPath) {
    validationErrors.push('PM-controlled files require pm_canonical_path or a legacy mandatory mapping');
  }
  if (requiredWorkspaceCopy && kind === 'skill') {
    validationErrors.push('Skills cannot require a workspace copy');
  }

  return {
    kind,
    canonical_filename,
    sync_managed: syncManaged,
    controlled,
    import_mode: importMode,
    canonical_source: canonicalSource,
    canonical_path: canonicalPath,
    required_workspace_copy: requiredWorkspaceCopy,
    legacy_mandatory: legacyMandatory,
    cull_reason: cullReason,
    validation_errors: validationErrors,
    frontmatter,
  };
}

/**
 * Inspect a workspace's .github/ directory and return a health report.
 * Does not modify any files — reporting only.
 */
export function checkWorkspaceContextHealth(workspacePath: string, workspaceId?: string): WorkspaceContextHealth {
  const shortCode = workspaceId ? getWorkspaceShortCode(workspaceId) : readWorkspaceShortCode(workspacePath);
  const githubDir = path.join(workspacePath, '.github');
  const agentsDir = path.join(githubDir, 'agents');
  const instructionsDir = path.join(githubDir, 'instructions');
  const skillsDir = path.join(githubDir, 'skills');

  const mandatoryMissing: string[] = [];
  const cullDetected: string[] = [];

  // ── mandatory agents ────────────────────────────────────────────────────
  for (const filename of MANDATORY_AGENTS) {
    const canonical = path.join(agentsDir, filename);
    // Also accept workspace-coded form: hub.50e041.agent.md
    const coded = shortCode
      ? path.join(agentsDir, agentFilename(filename.replace(/\.agent\.md$/, ''), shortCode))
      : null;
    if (!fs.existsSync(canonical) && !(coded && fs.existsSync(coded))) {
      mandatoryMissing.push(`agents/${filename}`);
    }
  }

  // ── mandatory instructions ───────────────────────────────────────────────
  for (const filename of MANDATORY_INSTRUCTIONS) {
    const canonical = path.join(instructionsDir, filename);
    const stem = filename.replace(/\.instructions\.md$/, '');
    const coded = shortCode
      ? path.join(instructionsDir, instructionFilename(stem, shortCode))
      : null;
    if (!fs.existsSync(canonical) && !(coded && fs.existsSync(coded))) {
      mandatoryMissing.push(`instructions/${filename}`);
    }
  }

  // ── cull: agent files ────────────────────────────────────────────────────
  if (fs.existsSync(agentsDir)) {
    const allAgents = fs.readdirSync(agentsDir).filter(f => f.endsWith('.agent.md'));
    for (const filename of allAgents) {
      // Resolve canonical form (strip workspace code if present) then compare against mandatory list
      const canonical = toCanonicalFilename(filename);
      if (!MANDATORY_AGENTS.includes(canonical)) {
        cullDetected.push(`agents/${filename}`);
      }
    }
  }

  // ── cull: named instruction files ────────────────────────────────────────
  for (const filename of CULL_INSTRUCTIONS) {
    // Check both canonical and workspace-coded forms
    const stem = filename.replace(/\.instructions\.md$/, '');
    const codedFilename = shortCode ? instructionFilename(stem, shortCode) : null;
    if (
      fs.existsSync(path.join(instructionsDir, filename)) ||
      (codedFilename && fs.existsSync(path.join(instructionsDir, codedFilename)))
    ) {
      cullDetected.push(`instructions/${filename}`);
    }
  }

  // ── cull: archive/ subdirectory ──────────────────────────────────────────
  const archiveDir = path.join(instructionsDir, CULL_INSTRUCTIONS_ARCHIVE_DIR);
  if (fs.existsSync(archiveDir)) {
    const archiveFiles = fs.readdirSync(archiveDir).filter(f => f.endsWith('.md'));
    for (const filename of archiveFiles) {
      cullDetected.push(`instructions/${CULL_INSTRUCTIONS_ARCHIVE_DIR}/${filename}`);
    }
  }

  // ── cull: skills directory ───────────────────────────────────────────────
  if (CULL_ALL_SKILLS && fs.existsSync(skillsDir)) {
    try {
      const skillEntries = fs.readdirSync(skillsDir, { withFileTypes: true });
      for (const entry of skillEntries) {
        if (entry.isDirectory()) {
          cullDetected.push(`skills/${entry.name}/`);
        } else if (entry.name.endsWith('.md')) {
          cullDetected.push(`skills/${entry.name}`);
        }
      }
    } catch {
      // ignore read errors — directory may be empty or inaccessible
    }
  }

  const status = mandatoryMissing.length > 0 || cullDetected.length > 0
    ? 'needs_attention'
    : 'ok';

  return { mandatory_missing: mandatoryMissing, cull_detected: cullDetected, status };
}
