/**
 * Workspace Context Manifest
 *
 * Single source of truth for what MUST exist in `.github/` across all workspaces,
 * and what MUST NOT (because it's DB-only and agents access it via memory_instructions / memory_agent).
 *
 * The DefaultDeployer uses this manifest to:
 *   1. Deploy mandatory files to every workspace
 *   2. Cull DB-only files that should not be in `.github/`
 *   3. Leave workspace-specific files untouched
 */

// ── Mandatory items — deployed to every workspace ────────────────────────────

/** Core agents that must exist in `.github/agents/` */
export const MANDATORY_AGENTS: readonly string[] = [
    'hub',
    'prompt-analyst',
    'shell',
];

/** Instructions that must exist in `.github/instructions/` */
export const MANDATORY_INSTRUCTIONS: readonly string[] = [
    'hub',
    'mcp-usage',
    'prompt-analyst',
    'subagent-recovery',
];

// ── DB-only items — must be CULLED from `.github/` if found ──────────────────

/**
 * Instructions that live exclusively in the DB.
 * Agents access them via `memory_instructions(action: get, ...)`.
 * If these appear in `.github/instructions/`, they are removed.
 */
export const DB_ONLY_INSTRUCTIONS: readonly string[] = [
    'build-scripts',
    'context-files',
    'folder-cleanup',
    'handoff-protocol',
    'hub-interaction-discipline',
    'mcp-best-practices',
    'mcp-tool-agent',
    'mcp-tool-brainstorm',
    'mcp-tool-cartographer',
    'mcp-tool-context',
    'mcp-tool-filesystem',
    'mcp-tool-instructions',
    'mcp-tool-plan',
    'mcp-tool-session',
    'mcp-tool-steps',
    'mcp-tool-terminal',
    'mcp-tool-workspace',
    'mcp-workflow-examples',
    'plan-context',
    'project-memory-system',
    'session-interruption',
    'shell',
    'workspace-migration',
];

/**
 * Spoke agents that live exclusively in the DB.
 * Hub spawns them via `memory_agent(action: deploy)`.
 * If these appear in `.github/agents/`, they are removed.
 */
export const DB_ONLY_AGENTS: readonly string[] = [
    'architect',
    'archivist',
    'brainstorm',
    'cognition',
    'executor',
    'folder-cleanup-shell',
    'migrator',
    'researcher',
    'reviewer',
    'revisionist',
    'runner',
    'skill-writer',
    'tdd-driver',
    'tester',
    'worker',
];

/**
 * ALL skills are DB-only. Any `.github/skills/` directory should be removed entirely.
 * Agents discover skills via `memory_agent(action: list_skills)`.
 */
export const SKILLS_ARE_DB_ONLY = true;

// ── Imported-file cull pattern ───────────────────────────────────────────────

/**
 * Files matching this prefix were created by the legacy install script's
 * Import-DistributedArtifacts function. They should be culled.
 */
export const IMPORTED_FILE_PREFIX = 'imported-';

// ── Lookup helpers ───────────────────────────────────────────────────────────

const mandatoryAgentSet = new Set(MANDATORY_AGENTS);
const mandatoryInstructionSet = new Set(MANDATORY_INSTRUCTIONS);
const dbOnlyAgentSet = new Set(DB_ONLY_AGENTS);
const dbOnlyInstructionSet = new Set(DB_ONLY_INSTRUCTIONS);

/** All known agent names (mandatory + DB-only) */
const knownAgentSet = new Set([...MANDATORY_AGENTS, ...DB_ONLY_AGENTS]);
/** All known instruction names (mandatory + DB-only) */
const knownInstructionSet = new Set([...MANDATORY_INSTRUCTIONS, ...DB_ONLY_INSTRUCTIONS]);

export function isMandatoryAgent(name: string): boolean {
    return mandatoryAgentSet.has(name);
}

export function isMandatoryInstruction(name: string): boolean {
    return mandatoryInstructionSet.has(name);
}

export function isDbOnlyAgent(name: string): boolean {
    return dbOnlyAgentSet.has(name);
}

export function isDbOnlyInstruction(name: string): boolean {
    return dbOnlyInstructionSet.has(name);
}

export function isKnownAgent(name: string): boolean {
    return knownAgentSet.has(name);
}

export function isKnownInstruction(name: string): boolean {
    return knownInstructionSet.has(name);
}

/**
 * Returns true if the filename starts with the imported-file prefix.
 * These are legacy artefacts from `new-install.ps1::Import-DistributedArtifacts`.
 */
export function isImportedFile(filename: string): boolean {
    return filename.startsWith(IMPORTED_FILE_PREFIX);
}

// ── Health-check types ───────────────────────────────────────────────────────

export interface ManifestHealthReport {
    /** Mandatory files missing from `.github/` */
    missingMandatory: { kind: 'agent' | 'instruction'; name: string }[];
    /** DB-only files found in `.github/` that should be culled */
    cullTargets: { kind: 'agent' | 'instruction' | 'skill' | 'imported'; path: string; name: string }[];
    /** Files in `.github/` not in the manifest — workspace-specific, left alone */
    workspaceSpecific: { kind: 'agent' | 'instruction'; path: string; name: string }[];
    /** Whether the workspace is fully compliant */
    healthy: boolean;
}
