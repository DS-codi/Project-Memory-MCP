import * as path from 'path';

function normalizeManifestPath(value: string): string {
    return value.replace(/\\/g, '/');
}

function normalizeObject(value: unknown): unknown {
    if (Array.isArray(value)) {
        return value.map((entry) => normalizeObject(entry));
    }

    if (value && typeof value === 'object') {
        const record = value as Record<string, unknown>;
        const keys = Object.keys(record).sort((left, right) => left.localeCompare(right));
        const normalizedEntries = keys.map((key) => [key, normalizeObject(record[key])] as const);
        return Object.fromEntries(normalizedEntries);
    }

    return value;
}

export function stableStringify(value: unknown): string {
    return JSON.stringify(normalizeObject(value), null, 2);
}

export function toWorkspaceRelativePath(filePath: string, workspacePath?: string): string {
    const base = workspacePath ? path.resolve(workspacePath) : process.cwd();
    const absolute = path.resolve(filePath);
    const relative = path.relative(base, absolute);

    if (relative.length === 0) {
        return '.';
    }

    if (relative.startsWith('..')) {
        return normalizeManifestPath(absolute);
    }

    return normalizeManifestPath(relative);
}
