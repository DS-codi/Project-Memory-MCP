import * as fs from 'fs/promises';
import * as path from 'path';
import {
    readGoldenBaseline,
    resolveGoldenBaselineLocation,
    writeGoldenBaseline,
    type GoldenBaselineLocation,
    type GoldenBaselineRecord
} from './GoldenBaselineStore';
import { type ReplayProfileArtifacts } from './types';

function getScenarioSignature(artifact: ReplayProfileArtifacts, scenarioId: string): string {
    const scenario = artifact.scenarios.find((item) => item.scenario_id === scenarioId);
    return scenario ? JSON.stringify(scenario.normalized_events) : '';
}

async function readCandidateArtifacts(candidateFile: string): Promise<ReplayProfileArtifacts> {
    const raw = await fs.readFile(path.resolve(candidateFile), 'utf8');
    const parsed = JSON.parse(raw) as ReplayProfileArtifacts;
    if (parsed.profile !== 'baseline') {
        throw new Error(`Promotion requires a baseline artifact file; received profile '${parsed.profile}'.`);
    }
    return parsed;
}

export interface ReplayPromotionDiffSummary {
    baseline_id: string;
    has_existing_baseline: boolean;
    total_candidate_scenarios: number;
    added_scenarios: string[];
    removed_scenarios: string[];
    changed_scenarios: string[];
    unchanged_scenarios: string[];
}

export interface PromoteBaselineOptions {
    candidate_file: string;
    goldens_root: string;
    baseline_id: string;
    apply: boolean;
    approve: boolean;
    force?: boolean;
}

export interface PromoteBaselineResult {
    applied: boolean;
    guard_reason?: string;
    location: GoldenBaselineLocation;
    summary: ReplayPromotionDiffSummary;
    metadata_file?: string;
    baseline_artifact_file?: string;
}

export function summarizePromotionDiff(
    location: GoldenBaselineLocation,
    candidate: ReplayProfileArtifacts,
    existing: GoldenBaselineRecord | null
): ReplayPromotionDiffSummary {
    const candidateIds = candidate.scenarios.map((scenario) => scenario.scenario_id);
    const existingIds = existing ? existing.artifact.scenarios.map((scenario) => scenario.scenario_id) : [];

    const candidateSet = new Set(candidateIds);
    const existingSet = new Set(existingIds);

    const added = candidateIds.filter((scenarioId) => !existingSet.has(scenarioId));
    const removed = existingIds.filter((scenarioId) => !candidateSet.has(scenarioId));

    const changed: string[] = [];
    const unchanged: string[] = [];

    for (const scenarioId of candidateIds) {
        if (!existingSet.has(scenarioId) || !existing) {
            continue;
        }

        if (getScenarioSignature(candidate, scenarioId) === getScenarioSignature(existing.artifact, scenarioId)) {
            unchanged.push(scenarioId);
            continue;
        }

        changed.push(scenarioId);
    }

    return {
        baseline_id: location.baseline_id,
        has_existing_baseline: Boolean(existing),
        total_candidate_scenarios: candidate.scenarios.length,
        added_scenarios: added,
        removed_scenarios: removed,
        changed_scenarios: changed,
        unchanged_scenarios: unchanged
    };
}

export async function promoteBaseline(options: PromoteBaselineOptions): Promise<PromoteBaselineResult> {
    const location = resolveGoldenBaselineLocation({
        goldens_root: options.goldens_root,
        baseline_id: options.baseline_id
    });

    const candidate = await readCandidateArtifacts(options.candidate_file);
    const existing = await readGoldenBaseline(location);
    const summary = summarizePromotionDiff(location, candidate, existing);

    if (!options.apply) {
        return {
            applied: false,
            guard_reason: 'Dry-run mode. Re-run with --apply --approve to write baseline artifacts.',
            location,
            summary
        };
    }

    if (!options.approve) {
        return {
            applied: false,
            guard_reason: 'Promotion requires explicit approval. Re-run with --approve.',
            location,
            summary
        };
    }

    if (existing && !options.force) {
        return {
            applied: false,
            guard_reason: `Baseline '${location.baseline_id}' already exists. Re-run with --force to overwrite.`,
            location,
            summary
        };
    }

    const promoted = await writeGoldenBaseline({
        location,
        artifact: candidate,
        source_candidate_file: options.candidate_file
    });

    return {
        applied: true,
        location,
        summary,
        metadata_file: promoted.location.metadata_file,
        baseline_artifact_file: promoted.location.baseline_artifact_file
    };
}