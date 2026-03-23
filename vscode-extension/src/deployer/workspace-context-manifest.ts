/**
 * Workspace Context Manifest
 *
 * Extension-side view of the server-backed workspace sync contract.
 *
 * Rules:
 *   1. MANDATORY_* defines the bootstrap files the extension may deploy or redeploy.
 *   2. Cleanup decisions come from memory_workspace(action: check_context_sync), not
 *      from extension-only DB-only filename lists.
 *   3. Workspace-local skills and unmanaged customization files are preserved unless
 *      the server explicitly classifies a local file as cullable.
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

// ── Sync contract types ─────────────────────────────────────────────────────

export type WorkspaceContextSyncStatus =
    | 'in_sync'
    | 'local_only'
    | 'db_only'
    | 'content_mismatch'
    | 'protected_drift'
    | 'ignored_local'
    | 'import_candidate';

export interface WorkspaceContextSyncEntryPolicy {
    sync_managed: boolean;
    controlled: boolean;
    import_mode: 'never' | 'manual';
    canonical_source: 'none' | 'database_seed_resources';
    canonical_path: string | null;
    required_workspace_copy: boolean;
    legacy_mandatory: boolean;
    cull_reason?: string;
    validation_errors: string[];
}

export interface WorkspaceContextSyncEntry {
    kind: 'agent' | 'instruction';
    filename: string;
    relative_path: string;
    canonical_name: string;
    canonical_filename: string;
    status: WorkspaceContextSyncStatus;
    remediation: string;
    comparison_basis: 'ignored_local' | 'local_only' | 'db_only' | 'local_vs_db' | 'local_db_seed';
    db_updated_at?: string;
    local_size_bytes?: number;
    canonical_seed_path?: string;
    content_mismatch_hint?: string;
    policy: WorkspaceContextSyncEntryPolicy;
}

export interface WorkspaceContextSyncReport {
    workspace_id?: string;
    workspace_path: string;
    report_mode: 'read_only';
    writes_performed: false;
    github_agents_dir: string;
    github_instructions_dir: string;
    agents: WorkspaceContextSyncEntry[];
    instructions: WorkspaceContextSyncEntry[];
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

export interface ManifestCullTarget {
    kind: 'agent' | 'instruction';
    path: string;
    name: string;
    relativePath: string;
    status: WorkspaceContextSyncStatus;
    cullReason: string;
}

export interface ManifestRedeployTarget {
    kind: 'agent' | 'instruction';
    name: string;
    relativePath: string;
}

export interface ManifestWorkspaceSpecificEntry {
    kind: 'agent' | 'instruction' | 'skill';
    path: string;
    name: string;
}

// ── Imported-file legacy hint ───────────────────────────────────────────────

/**
 * Files matching this prefix were created by the legacy install script's
 * Import-DistributedArtifacts function. They are preserved unless the server
 * sync report explicitly marks them as safe to cull.
 */
export const IMPORTED_FILE_PREFIX = 'imported-';

// ── Lookup helpers ───────────────────────────────────────────────────────────

const mandatoryAgentSet = new Set(MANDATORY_AGENTS);
const mandatoryInstructionSet = new Set(MANDATORY_INSTRUCTIONS);

export function isMandatoryAgent(name: string): boolean {
    return mandatoryAgentSet.has(name);
}

export function isMandatoryInstruction(name: string): boolean {
    return mandatoryInstructionSet.has(name);
}

/**
 * Returns true if the filename starts with the imported-file prefix.
 * This is only a legacy hint. Imported artifacts are preserved unless the server
 * sync report explicitly marks them as safe to cull.
 */
export function isImportedFile(filename: string): boolean {
    return filename.startsWith(IMPORTED_FILE_PREFIX);
}

export function isServerBackedCullCandidate(entry: WorkspaceContextSyncEntry): boolean {
    return entry.status === 'ignored_local' && typeof entry.policy.cull_reason === 'string' && entry.policy.cull_reason.length > 0;
}

export function isMandatoryRedeployCandidate(entry: WorkspaceContextSyncEntry): boolean {
    if (entry.status !== 'protected_drift' || !entry.policy.required_workspace_copy) {
        return false;
    }

    if (entry.kind === 'agent') {
        return mandatoryAgentSet.has(entry.canonical_name);
    }

    return mandatoryInstructionSet.has(stripInstructionBaseName(entry.canonical_filename));
}

export function toInstructionBaseName(filename: string): string {
    return stripInstructionBaseName(filename);
}

function stripInstructionBaseName(filename: string): string {
    return filename.replace(/\.instructions\.md$/i, '');
}

// ── Health-check types ───────────────────────────────────────────────────────

export interface ManifestHealthReport {
    /** Mandatory files missing from `.github/` */
    missingMandatory: { kind: 'agent' | 'instruction'; name: string }[];
    /** Mandatory files present but out of canonical parity and safe to redeploy */
    redeployTargets: ManifestRedeployTarget[];
    /** Server-backed local files that are explicitly safe to cull */
    cullTargets: ManifestCullTarget[];
    /** Files in `.github/` preserved by default */
    workspaceSpecific: ManifestWorkspaceSpecificEntry[];
    /** Whether cleanup findings were derived from the server sync report */
    syncBacked: boolean;
    /** Whether the workspace is fully compliant */
    healthy: boolean;
}
