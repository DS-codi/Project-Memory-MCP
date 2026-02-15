import * as fs from 'fs/promises';
import * as path from 'path';
import { type ReplayGoldenBaselineMetadata, type ReplayGoldenStoreVersion, type ReplayProfileArtifacts } from './types';
import { stableStringify, toWorkspaceRelativePath } from './StableJson';

const GOLDEN_METADATA_SCHEMA_V1: ReplayGoldenBaselineMetadata['schema_version'] =
    'replay-golden-baseline-metadata.v1';

function sanitizeBaselineId(value: string): string {
    const trimmed = value.trim().toLowerCase();
    const normalized = trimmed.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
    return normalized.length > 0 ? normalized : 'default';
}

function validateBaselineArtifacts(artifacts: ReplayProfileArtifacts): void {
    if (artifacts.profile !== 'baseline') {
        throw new Error(`Golden baseline promotion requires profile 'baseline', received '${artifacts.profile}'.`);
    }
}

export interface GoldenBaselineLocation {
    store_root: string;
    store_version: ReplayGoldenStoreVersion;
    baseline_id: string;
    baseline_dir: string;
    baseline_artifact_file: string;
    metadata_file: string;
}

export interface GoldenBaselineRecord {
    location: GoldenBaselineLocation;
    metadata: ReplayGoldenBaselineMetadata;
    artifact: ReplayProfileArtifacts;
}

export interface ResolveGoldenBaselineLocationOptions {
    goldens_root: string;
    baseline_id: string;
}

export interface WriteGoldenBaselineOptions {
    location: GoldenBaselineLocation;
    artifact: ReplayProfileArtifacts;
    promoted_at?: string;
    source_candidate_file: string;
}

export function resolveGoldenBaselineLocation(options: ResolveGoldenBaselineLocationOptions): GoldenBaselineLocation {
    const storeRoot = path.resolve(options.goldens_root);
    const baselineId = sanitizeBaselineId(options.baseline_id);
    const storeVersion: ReplayGoldenStoreVersion = 'v1';
    const baselineDir = path.join(storeRoot, storeVersion, baselineId);

    return {
        store_root: storeRoot,
        store_version: storeVersion,
        baseline_id: baselineId,
        baseline_dir: baselineDir,
        baseline_artifact_file: path.join(baselineDir, 'baseline.norm.json'),
        metadata_file: path.join(baselineDir, 'metadata.json')
    };
}

export async function readGoldenBaseline(location: GoldenBaselineLocation): Promise<GoldenBaselineRecord | null> {
    try {
        const [metadataRaw, artifactRaw] = await Promise.all([
            fs.readFile(location.metadata_file, 'utf8'),
            fs.readFile(location.baseline_artifact_file, 'utf8')
        ]);

        const metadata = JSON.parse(metadataRaw) as ReplayGoldenBaselineMetadata;
        const artifact = JSON.parse(artifactRaw) as ReplayProfileArtifacts;
        validateBaselineArtifacts(artifact);

        return {
            location,
            metadata,
            artifact
        };
    } catch (error: unknown) {
        if (error instanceof Error && 'code' in error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
            return null;
        }

        throw error;
    }
}

export async function writeGoldenBaseline(options: WriteGoldenBaselineOptions): Promise<GoldenBaselineRecord> {
    validateBaselineArtifacts(options.artifact);

    const promotedAt = options.promoted_at ?? new Date().toISOString();
    const metadata: ReplayGoldenBaselineMetadata = {
        schema_version: GOLDEN_METADATA_SCHEMA_V1,
        store_version: options.location.store_version,
        baseline_id: options.location.baseline_id,
        promoted_at: promotedAt,
        source_candidate_file: toWorkspaceRelativePath(options.source_candidate_file, options.location.store_root),
        artifact: {
            profile: 'baseline',
            normalized_artifact_file: path.basename(options.location.baseline_artifact_file),
            scenario_count: options.artifact.scenarios.length,
            scenario_ids: options.artifact.scenarios.map((scenario) => scenario.scenario_id)
        }
    };

    await fs.mkdir(options.location.baseline_dir, { recursive: true });
    await fs.writeFile(options.location.baseline_artifact_file, `${stableStringify(options.artifact)}\n`, 'utf8');
    await fs.writeFile(options.location.metadata_file, `${stableStringify(metadata)}\n`, 'utf8');

    return {
        location: options.location,
        metadata,
        artifact: options.artifact
    };
}