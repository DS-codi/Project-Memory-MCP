import * as fs from 'node:fs';
import * as path from 'node:path';

export interface SkillsSourceResolution {
    root: string | undefined;
    checkedPaths: string[];
}

export function resolveSkillsSourceRoot(
    primaryRoot: string | undefined,
    workspacePath: string,
    existsSync: (pathToCheck: fs.PathLike) => boolean = fs.existsSync,
    additionalSourceCandidates: Array<string | undefined> = []
): SkillsSourceResolution {
    const candidates = [
        primaryRoot,
        ...additionalSourceCandidates
    ]
        .filter((candidate): candidate is string => Boolean(candidate))
        .map((candidate) => path.resolve(candidate));

    const checkedPaths: string[] = [];
    const seen = new Set<string>();

    for (const candidate of candidates) {
        const key = process.platform === 'win32' ? candidate.toLowerCase() : candidate;
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        checkedPaths.push(candidate);

        if (existsSync(candidate)) {
            return {
                root: candidate,
                checkedPaths
            };
        }
    }

    return {
        root: undefined,
        checkedPaths
    };
}

export function buildMissingSkillsSourceWarning(workspacePath: string, checkedPaths: string[]): string {
    if (checkedPaths.length === 0) {
        return 'No skills source directory found.';
    }

    const display = checkedPaths
        .map((checkedPath) => {
            const relativePath = path.relative(workspacePath, checkedPath);
            return relativePath && !relativePath.startsWith('..') ? relativePath : checkedPath;
        })
        .join(', ');

    return `No skills source directory found. Checked: ${display}`;
}
