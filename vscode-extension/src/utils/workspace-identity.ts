/**
 * Workspace Identity Resolution
 * 
 * Resolves workspace identity by finding .projectmemory/identity.json files.
 * Checks the given root path first, then scans immediate subdirectories.
 * Caches results to avoid repeated disk reads.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

export interface WorkspaceIdentity {
    workspaceId: string;
    workspaceName: string;
    projectPath: string;
}

interface IdentityJson {
    schema_version?: string;
    workspace_id: string;
    workspace_path: string;
    data_root?: string;
    project_mcps?: unknown[];
}

interface RegistryWorkspaceEntry {
    workspace_id?: string;
    workspaceId?: string;
    id?: string;
    path?: string;
    workspace_path?: string;
    workspacePath?: string;
    legacy_workspace_ids?: unknown;
    legacyWorkspaceIds?: unknown;
}

interface WorkspaceRegistryJson {
    entries?: Record<string, string | RegistryWorkspaceEntry>;
    workspaces?: RegistryWorkspaceEntry[];
}

// Module-level cache: rootPath -> resolved identity (or null)
const identityCache = new Map<string, WorkspaceIdentity | null>();

/**
 * Clear the identity cache (useful when workspace changes)
 */
export function clearIdentityCache(): void {
    identityCache.clear();
}

/**
 * Try to read and parse an identity.json file at the given directory.
 * Returns the parsed identity or null if not found/invalid.
 */
function tryReadIdentity(dir: string): WorkspaceIdentity | null {
    const identityPath = path.join(dir, '.projectmemory', 'identity.json');
    try {
        if (!fs.existsSync(identityPath)) {
            return null;
        }
        const raw = fs.readFileSync(identityPath, 'utf-8');
        const parsed: IdentityJson = JSON.parse(raw);

        if (!parsed.workspace_id || !parsed.workspace_path) {
            return null;
        }

        const normalizedDir = normalizePathForMatch(dir);
        const normalizedParsed = normalizePathForMatch(parsed.workspace_path);
        const isStale = normalizedDir !== normalizedParsed;

        return {
            workspaceId: canonicalizeWorkspaceId(parsed),
            workspaceName: path.basename(isStale ? dir : parsed.workspace_path),
            projectPath: isStale ? dir : parsed.workspace_path,
        };
    } catch {
        // Corrupt or unreadable file
        return null;
    }
}

function collectCanonicalAndLegacy(
    entry: RegistryWorkspaceEntry,
    registeredIds: Set<string>,
    legacyToCanonical: Map<string, string>
): void {
    const canonicalId = entry.workspace_id ?? entry.workspaceId ?? entry.id;
    if (!canonicalId || typeof canonicalId !== 'string') {
        return;
    }

    registeredIds.add(canonicalId);

    const legacyIds = entry.legacy_workspace_ids ?? entry.legacyWorkspaceIds;
    if (!Array.isArray(legacyIds)) {
        return;
    }

    for (const legacyId of legacyIds) {
        if (typeof legacyId === 'string') {
            legacyToCanonical.set(legacyId, canonicalId);
        }
    }
}

function normalizePathForMatch(inputPath: string): string {
    const normalized = path.normalize(inputPath).replace(/[\\/]+/g, '\\').toLowerCase();
    return normalized.endsWith('\\') ? normalized.slice(0, -1) : normalized;
}

function getEntryPath(entry: RegistryWorkspaceEntry): string | undefined {
    const candidate = entry.path ?? entry.workspace_path ?? entry.workspacePath;
    return typeof candidate === 'string' && candidate.trim().length > 0 ? candidate : undefined;
}

function isParentOrChildPath(a: string, b: string): boolean {
    if (!a || !b) return false;
    const withSepA = a.endsWith('\\') ? a : `${a}\\`;
    const withSepB = b.endsWith('\\') ? b : `${b}\\`;
    return withSepA.startsWith(withSepB) || withSepB.startsWith(withSepA);
}

function canonicalizeWorkspaceId(parsed: IdentityJson): string {
    if (!parsed.workspace_id || !parsed.data_root) {
        return parsed.workspace_id;
    }

    const registryPath = path.join(parsed.data_root, 'workspace-registry.json');

    try {
        if (!fs.existsSync(registryPath)) {
            return parsed.workspace_id;
        }

        const registryRaw = fs.readFileSync(registryPath, 'utf-8');
        const registry: WorkspaceRegistryJson = JSON.parse(registryRaw);

        const registeredIds = new Set<string>();
        const legacyToCanonical = new Map<string, string>();
        const registryPathToCanonical = new Map<string, string>();

        const entries = registry.entries ?? {};
        for (const [entryPath, value] of Object.entries(entries)) {
            if (typeof value === 'string') {
                registeredIds.add(value);
                if (entryPath) {
                    registryPathToCanonical.set(normalizePathForMatch(entryPath), value);
                }
                continue;
            }
            collectCanonicalAndLegacy(value, registeredIds, legacyToCanonical);
            const candidatePath = getEntryPath(value);
            if (candidatePath) {
                registryPathToCanonical.set(normalizePathForMatch(candidatePath), value.workspace_id ?? value.workspaceId ?? value.id ?? '');
            }
        }

        const workspaces = registry.workspaces ?? [];
        for (const workspace of workspaces) {
            collectCanonicalAndLegacy(workspace, registeredIds, legacyToCanonical);
            const candidatePath = getEntryPath(workspace);
            const candidateId = workspace.workspace_id ?? workspace.workspaceId ?? workspace.id;
            if (candidatePath && typeof candidateId === 'string') {
                registryPathToCanonical.set(normalizePathForMatch(candidatePath), candidateId);
            }
        }

        if (registeredIds.has(parsed.workspace_id)) {
            return parsed.workspace_id;
        }

        const byLegacy = legacyToCanonical.get(parsed.workspace_id);
        if (byLegacy) {
            return byLegacy;
        }

        if (parsed.workspace_path) {
            const desired = normalizePathForMatch(parsed.workspace_path);
            let bestScore = -1;
            let bestId: string | undefined;

            for (const [candidatePath, candidateId] of registryPathToCanonical.entries()) {
                if (!candidateId) continue;

                if (candidatePath === desired && bestScore < 3) {
                    bestScore = 3;
                    bestId = candidateId;
                    continue;
                }

                if (isParentOrChildPath(candidatePath, desired) && bestScore < 2) {
                    bestScore = 2;
                    bestId = candidateId;
                }
            }

            if (bestId) {
                return bestId;
            }
        }

        return parsed.workspace_id;
    } catch {
        return parsed.workspace_id;
    }
}

/**
 * Resolve workspace identity by searching for .projectmemory/identity.json.
 * 
 * 1. Checks `rootPath/.projectmemory/identity.json` first
 * 2. If not found, scans immediate subdirectories (1 level deep)
 * 3. Caches the result for subsequent calls with the same rootPath
 * 
 * @param rootPath - The VS Code workspace root path
 * @returns The resolved identity, or null if no identity file found
 */
export function resolveWorkspaceIdentity(rootPath: string): WorkspaceIdentity | null {
    const normalizedRoot = path.normalize(rootPath);
    console.log('[PM Identity] Resolving identity for:', normalizedRoot);

    if (identityCache.has(normalizedRoot)) {
        const cached = identityCache.get(normalizedRoot);
        console.log('[PM Identity] Cache hit:', cached?.workspaceId ?? 'null');
        return cached ?? null;
    }

    // Check the root path itself
    let identity = tryReadIdentity(normalizedRoot);
    if (identity) {
        console.log('[PM Identity] Found at root:', identity.workspaceId);
        identityCache.set(normalizedRoot, identity);
        return identity;
    }

    // Scan immediate subdirectories (1 level deep)
    try {
        const entries = fs.readdirSync(normalizedRoot, { withFileTypes: true });
        console.log('[PM Identity] Scanning', entries.length, 'entries in root');
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            // Skip hidden directories and common non-project dirs
            if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;

            const subdir = path.join(normalizedRoot, entry.name);
            identity = tryReadIdentity(subdir);
            if (identity) {
                console.log('[PM Identity] Found in subdir:', entry.name, '->', identity.workspaceId);
                identityCache.set(normalizedRoot, identity);
                return identity;
            }
        }
    } catch (e) {
        console.log('[PM Identity] Scan error:', e);
    }

    // Nothing found - cache the miss too
    console.log('[PM Identity] No identity found, caching null');
    identityCache.set(normalizedRoot, null);
    return null;
}

/**
 * Compute a fallback workspace ID using the same algorithm as the MCP server.
 * Used when no .projectmemory/identity.json is found.
 * 
 * Algorithm: sha256 hash of normalized lowercase path + basename
 * 
 * @param workspacePath - The workspace filesystem path
 * @returns A workspace ID string in the format `folderName-hash12`
 */
export function computeFallbackWorkspaceId(workspacePath: string): string {
    const normalizedPath = path.normalize(workspacePath).toLowerCase();
    const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex').substring(0, 12);
    const folderName = path.basename(workspacePath).replace(/[^a-zA-Z0-9-_]/g, '-');
    return `${folderName}-${hash}`;
}
