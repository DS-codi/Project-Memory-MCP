import * as fs from 'node:fs';
import * as path from 'node:path';

export type ResolvedTerminalCwd = {
    cwd?: string;
    warning?: string;
};

export const sanitizeBuildScriptDirectoryPath = (rawPath: string, workspaceRoot?: string): string | undefined => {
    const trimmed = rawPath.trim();
    if (!trimmed) {
        return undefined;
    }

    const windowsPathMatch = trimmed.match(/[A-Za-z]:[\\/].*$/);
    let candidate = windowsPathMatch?.[0] ?? trimmed;

    if (workspaceRoot && (candidate === '/app' || candidate === '/app/')) {
        candidate = workspaceRoot;
    } else if (workspaceRoot && candidate.startsWith('/app/')) {
        const relativeFromContainerRoot = candidate.slice('/app/'.length).replace(/^[\\/]+/, '');
        candidate = relativeFromContainerRoot.length > 0
            ? path.join(workspaceRoot, relativeFromContainerRoot)
            : workspaceRoot;
    }

    if (workspaceRoot && !path.isAbsolute(candidate)) {
        candidate = path.join(workspaceRoot, candidate);
    }

    return path.normalize(candidate);
};

const isExistingDirectory = (candidatePath?: string): candidatePath is string => {
    if (!candidatePath) {
        return false;
    }

    try {
        return fs.statSync(candidatePath).isDirectory();
    } catch {
        return false;
    }
};

export const resolveTerminalCwdForBuildScript = (
    resolvedDirectoryPath: string | undefined,
    scriptDirectory: string | undefined,
    workspaceRoot: string | undefined
): ResolvedTerminalCwd => {
    const normalizedResolved = resolvedDirectoryPath
        ? sanitizeBuildScriptDirectoryPath(resolvedDirectoryPath, workspaceRoot)
        : undefined;
    const normalizedScriptDirectory = scriptDirectory
        ? sanitizeBuildScriptDirectoryPath(scriptDirectory, workspaceRoot)
        : undefined;

    if (isExistingDirectory(normalizedResolved)) {
        return { cwd: normalizedResolved };
    }

    if (isExistingDirectory(normalizedScriptDirectory)) {
        return {
            cwd: normalizedScriptDirectory,
            warning: 'Resolved script directory is not valid on this host. Using script directory fallback.',
        };
    }

    if (isExistingDirectory(workspaceRoot)) {
        const warningPrefix = resolvedDirectoryPath || scriptDirectory
            ? 'Resolved script directory is not valid on this host.'
            : 'No valid script directory was provided.';

        return {
            cwd: workspaceRoot,
            warning: `${warningPrefix} Using workspace root as fallback.`,
        };
    }

    if (resolvedDirectoryPath || scriptDirectory) {
        return {
            warning: 'No valid working directory was found for this build script. Running command without cwd override.',
        };
    }

    return {};
};
