import * as fs from 'fs/promises';
import * as path from 'path';

export type ReplayArtifactKind = 'baseline' | 'candidate';

export interface ResolveReplayArtifactOptions {
    kind: ReplayArtifactKind;
    explicit_file?: string;
    goldens_root: string;
    baseline_id: string;
    legacy_runs_root: string;
    legacy_run_dir?: string;
}

export interface ResolvedReplayArtifact {
    file: string;
    source: 'explicit' | 'golden_v1' | 'legacy_run';
    legacy_run_dir?: string;
}

async function fileExists(filePath: string): Promise<boolean> {
    try {
        const stat = await fs.stat(filePath);
        return stat.isFile();
    } catch {
        return false;
    }
}

function getLegacyArtifactFileCandidates(kind: ReplayArtifactKind): string[] {
    if (kind === 'baseline') {
        return ['baseline.norm.json', 'baseline.json'];
    }

    return ['candidate.norm.json', 'candidate.json'];
}

async function resolveFromLegacyRunDir(
    legacyRunDir: string,
    kind: ReplayArtifactKind
): Promise<ResolvedReplayArtifact | null> {
    const candidates = getLegacyArtifactFileCandidates(kind).map((fileName) => path.join(legacyRunDir, fileName));
    for (const candidate of candidates) {
        if (await fileExists(candidate)) {
            return {
                file: candidate,
                source: 'legacy_run',
                legacy_run_dir: legacyRunDir
            };
        }
    }

    return null;
}

async function resolveLatestLegacyRun(
    legacyRunsRoot: string,
    kind: ReplayArtifactKind
): Promise<ResolvedReplayArtifact | null> {
    let entries: Awaited<ReturnType<typeof fs.readdir>>;
    try {
        entries = await fs.readdir(legacyRunsRoot, { withFileTypes: true });
    } catch {
        return null;
    }

    const runDirectories = await Promise.all(
        entries
            .filter((entry) => entry.isDirectory())
            .map(async (entry) => {
                const absolutePath = path.join(legacyRunsRoot, entry.name);
                const stat = await fs.stat(absolutePath);
                return {
                    path: absolutePath,
                    mtime_ms: stat.mtimeMs
                };
            })
    );

    runDirectories.sort((left, right) => right.mtime_ms - left.mtime_ms);

    for (const runDir of runDirectories) {
        const resolved = await resolveFromLegacyRunDir(runDir.path, kind);
        if (resolved) {
            return resolved;
        }
    }

    return null;
}

function resolveLegacyRunDirPath(legacyRunsRoot: string, legacyRunDir: string): string {
    if (path.isAbsolute(legacyRunDir)) {
        return path.resolve(legacyRunDir);
    }

    return path.resolve(legacyRunsRoot, legacyRunDir);
}

export async function resolveReplayArtifact(options: ResolveReplayArtifactOptions): Promise<ResolvedReplayArtifact | null> {
    if (options.explicit_file) {
        const explicitFile = path.resolve(options.explicit_file);
        if (await fileExists(explicitFile)) {
            return {
                file: explicitFile,
                source: 'explicit'
            };
        }
    }

    if (options.kind === 'baseline') {
        const goldenFile = path.resolve(options.goldens_root, 'v1', options.baseline_id, 'baseline.norm.json');
        if (await fileExists(goldenFile)) {
            return {
                file: goldenFile,
                source: 'golden_v1'
            };
        }
    }

    if (options.legacy_run_dir) {
        const legacyRunDir = resolveLegacyRunDirPath(options.legacy_runs_root, options.legacy_run_dir);
        const resolved = await resolveFromLegacyRunDir(legacyRunDir, options.kind);
        if (resolved) {
            return resolved;
        }
    }

    return resolveLatestLegacyRun(path.resolve(options.legacy_runs_root), options.kind);
}