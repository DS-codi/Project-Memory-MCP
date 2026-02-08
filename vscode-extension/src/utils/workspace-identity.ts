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

        return {
            workspaceId: parsed.workspace_id,
            workspaceName: path.basename(parsed.workspace_path),
            projectPath: parsed.workspace_path,
        };
    } catch {
        // Corrupt or unreadable file
        return null;
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
