import * as path from 'path';

type GenericRecord = Record<string, unknown>;

interface WorkspaceCandidate {
    workspace_id?: unknown;
    workspaceId?: unknown;
    id?: unknown;
    legacy_workspace_id?: unknown;
    legacyWorkspaceId?: unknown;
    alias_workspace_id?: unknown;
    aliasWorkspaceId?: unknown;
    path?: unknown;
    workspace_path?: unknown;
    workspacePath?: unknown;
}

function isObject(value: unknown): value is GenericRecord {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
    return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function normalizePathValue(inputPath: string): string {
    const normalized = path.normalize(inputPath).replace(/[\\/]+/g, '\\').toLowerCase();
    return normalized.endsWith('\\') ? normalized.slice(0, -1) : normalized;
}

function isParentOrChildPath(a: string, b: string): boolean {
    if (!a || !b) return false;
    const withSepA = a.endsWith('\\') ? a : `${a}\\`;
    const withSepB = b.endsWith('\\') ? b : `${b}\\`;
    return withSepA.startsWith(withSepB) || withSepB.startsWith(withSepA);
}

function extractWorkspaceIdFromCandidate(candidate: WorkspaceCandidate): string | undefined {
    return (
        asString(candidate.workspace_id)
        ?? asString(candidate.workspaceId)
        ?? asString(candidate.id)
        ?? asString(candidate.legacy_workspace_id)
        ?? asString(candidate.legacyWorkspaceId)
        ?? asString(candidate.alias_workspace_id)
        ?? asString(candidate.aliasWorkspaceId)
    );
}

function extractWorkspacePathFromCandidate(candidate: WorkspaceCandidate): string | undefined {
    return (
        asString(candidate.path)
        ?? asString(candidate.workspace_path)
        ?? asString(candidate.workspacePath)
    );
}

function deepFindWorkspaceId(payload: unknown, visited = new WeakSet<object>()): string | undefined {
    if (Array.isArray(payload)) {
        for (const item of payload) {
            const found = deepFindWorkspaceId(item, visited);
            if (found) return found;
        }
        return undefined;
    }

    if (!isObject(payload)) {
        return undefined;
    }

    if (visited.has(payload)) {
        return undefined;
    }
    visited.add(payload);

    const direct = extractWorkspaceIdFromCandidate(payload as WorkspaceCandidate);
    if (direct) {
        return direct;
    }

    const preferredContainers: Array<unknown> = [
        payload.workspace,
        payload.data,
        payload.result,
        payload.payload,
    ];
    for (const container of preferredContainers) {
        const found = deepFindWorkspaceId(container, visited);
        if (found) return found;
    }

    for (const value of Object.values(payload)) {
        const found = deepFindWorkspaceId(value, visited);
        if (found) return found;
    }

    return undefined;
}

function collectWorkspaceCandidates(payload: unknown, candidates: WorkspaceCandidate[], visited = new WeakSet<object>()): void {
    if (Array.isArray(payload)) {
        for (const item of payload) {
            collectWorkspaceCandidates(item, candidates, visited);
        }
        return;
    }

    if (!isObject(payload)) {
        return;
    }

    if (visited.has(payload)) {
        return;
    }
    visited.add(payload);

    const candidate = payload as WorkspaceCandidate;
    if (extractWorkspaceIdFromCandidate(candidate) || extractWorkspacePathFromCandidate(candidate)) {
        candidates.push(candidate);
    }

    const workspaces = payload.workspaces;
    if (Array.isArray(workspaces)) {
        for (const workspace of workspaces) {
            collectWorkspaceCandidates(workspace, candidates, visited);
        }
    }

    const preferredContainers: Array<unknown> = [payload.data, payload.result, payload.payload];
    for (const container of preferredContainers) {
        collectWorkspaceCandidates(container, candidates, visited);
    }
}

export function extractWorkspaceIdFromRegisterResponse(payload: unknown): string | undefined {
    return deepFindWorkspaceId(payload);
}

export function resolveWorkspaceIdFromWorkspaceList(
    listPayload: unknown,
    requestedWorkspacePath: string,
    effectiveWorkspacePath?: string
): string | undefined {
    const desiredPaths = [requestedWorkspacePath, effectiveWorkspacePath].filter((value): value is string => !!value);
    const normalizedDesired = desiredPaths.map(normalizePathValue);

    const candidates: WorkspaceCandidate[] = [];
    collectWorkspaceCandidates(listPayload, candidates);

    let bestScore = -1;
    let bestId: string | undefined;

    for (const candidate of candidates) {
        const candidateId = extractWorkspaceIdFromCandidate(candidate);
        const candidatePath = extractWorkspacePathFromCandidate(candidate);
        if (!candidateId || !candidatePath) {
            continue;
        }

        const normalizedCandidate = normalizePathValue(candidatePath);

        for (const desiredPath of desiredPaths) {
            if (candidatePath === desiredPath && bestScore < 300) {
                bestScore = 300;
                bestId = candidateId;
            }
        }

        for (const desired of normalizedDesired) {
            if (normalizedCandidate === desired && bestScore < 200) {
                bestScore = 200;
                bestId = candidateId;
            }
        }

        for (const desired of normalizedDesired) {
            if (isParentOrChildPath(normalizedCandidate, desired) && bestScore < 100) {
                bestScore = 100;
                bestId = candidateId;
            }
        }
    }

    return bestId;
}
