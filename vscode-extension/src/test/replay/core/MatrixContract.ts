import * as fs from 'fs/promises';
import * as path from 'path';
import {
    type ReplayGateMode,
    type ReplayMatrixCellDefinition,
    type ReplayMatrixComparatorProfileVariant,
    type ReplayMatrixModelVariant,
    type ReplayMatrixNormalizationProfile,
    type ReplayMatrixRiskTier,
    type ReplayMatrixRunContract,
    type ReplayMatrixScenarioSlice,
    type ReplayNormalizationConfig,
    type ReplayScenario,
    type ReplayTerminalSurface
} from './types';

function toObject(value: unknown, context: string): Record<string, unknown> {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(`${context} must be an object.`);
    }

    return value as Record<string, unknown>;
}

function toNonEmptyString(value: unknown, context: string): string {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(`${context} must be a non-empty string.`);
    }

    return value.trim();
}

function parseModelVariants(value: unknown): ReplayMatrixModelVariant[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.model_variants must be a non-empty array.');
    }

    return value.map((entry, index) => {
        const source = toObject(entry, `axes.model_variants[${index}]`);
        return {
            model_id: toNonEmptyString(source.model_id, `axes.model_variants[${index}].model_id`),
            label: typeof source.label === 'string' ? source.label.trim() : undefined,
            metadata: typeof source.metadata === 'object' && source.metadata ? source.metadata as Record<string, unknown> : undefined
        };
    });
}

function parseComparatorProfiles(value: unknown): ReplayMatrixComparatorProfileVariant[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.comparator_profiles must be a non-empty array.');
    }

    return value.map((entry, index) => {
        const source = toObject(entry, `axes.comparator_profiles[${index}]`);
        return {
            profile_id: toNonEmptyString(source.profile_id, `axes.comparator_profiles[${index}].profile_id`),
            profile_path: toNonEmptyString(source.profile_path, `axes.comparator_profiles[${index}].profile_path`)
        };
    });
}

function parseRiskTier(value: unknown, context: string): ReplayMatrixRiskTier {
    if (value === 'p0' || value === 'p1' || value === 'p2') {
        return value;
    }

    throw new Error(`${context} must be one of: p0, p1, p2.`);
}

function parseScenarioSlices(value: unknown): ReplayMatrixScenarioSlice[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.scenario_tag_slices must be a non-empty array.');
    }

    return value.map((entry, index) => {
        const source = toObject(entry, `axes.scenario_tag_slices[${index}]`);
        const tags = Array.isArray(source.tags)
            ? source.tags.filter((token): token is string => typeof token === 'string' && token.trim().length > 0).map((token) => token.trim().toLowerCase())
            : [];
        if (tags.length === 0) {
            throw new Error(`axes.scenario_tag_slices[${index}].tags must include at least one tag.`);
        }

        const match = source.match === 'all' ? 'all' : 'any';

        return {
            slice_id: toNonEmptyString(source.slice_id, `axes.scenario_tag_slices[${index}].slice_id`),
            tags,
            match,
            risk_tier: parseRiskTier(source.risk_tier, `axes.scenario_tag_slices[${index}].risk_tier`)
        };
    });
}

function parseTerminalSurfaces(value: unknown): ReplayTerminalSurface[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.execution_surfaces must be a non-empty array.');
    }

    return value.map((entry, index) => {
        if (entry === 'auto' || entry === 'memory_terminal' || entry === 'memory_terminal_interactive') {
            return entry;
        }

        throw new Error(`axes.execution_surfaces[${index}] must be one of: auto, memory_terminal, memory_terminal_interactive.`);
    });
}

function parseGateModes(value: unknown): ReplayGateMode[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.gate_modes must be a non-empty array.');
    }

    return value.map((entry, index) => {
        if (entry === 'strict' || entry === 'warn' || entry === 'info') {
            return entry;
        }

        throw new Error(`axes.gate_modes[${index}] must be one of: strict, warn, info.`);
    });
}

function parseNormalizationConfig(value: unknown, context: string): ReplayNormalizationConfig {
    const source = toObject(value, context);
    return {
        mask_ids: source.mask_ids === true,
        canonicalize_timestamps: source.canonicalize_timestamps === true,
        canonicalize_paths: source.canonicalize_paths === true,
        strip_nondeterministic_text: source.strip_nondeterministic_text === true
    };
}

function parseNormalizationProfiles(value: unknown): ReplayMatrixNormalizationProfile[] {
    if (!Array.isArray(value) || value.length === 0) {
        throw new Error('axes.normalization_profiles must be a non-empty array.');
    }

    return value.map((entry, index) => {
        const source = toObject(entry, `axes.normalization_profiles[${index}]`);
        return {
            normalization_id: toNonEmptyString(source.normalization_id, `axes.normalization_profiles[${index}].normalization_id`),
            config: parseNormalizationConfig(source.config, `axes.normalization_profiles[${index}].config`)
        };
    });
}

export function parseReplayMatrixRunContract(input: unknown): ReplayMatrixRunContract {
    const source = toObject(input, 'matrix contract');
    const schemaVersion = toNonEmptyString(source.schema_version, 'schema_version');
    if (schemaVersion !== 'replay-matrix-run-contract.v1') {
        throw new Error(`Unsupported matrix contract schema_version '${schemaVersion}'.`);
    }

    const axes = toObject(source.axes, 'axes');
    const controls = toObject(source.controls, 'controls');
    const determinism = toObject(controls.determinism, 'controls.determinism');

    const contract: ReplayMatrixRunContract = {
        schema_version: 'replay-matrix-run-contract.v1',
        matrix_id: toNonEmptyString(source.matrix_id, 'matrix_id'),
        title: typeof source.title === 'string' ? source.title.trim() : undefined,
        run_metadata: typeof source.run_metadata === 'object' && source.run_metadata ? source.run_metadata as Record<string, unknown> : undefined,
        axes: {
            model_variants: parseModelVariants(axes.model_variants),
            comparator_profiles: parseComparatorProfiles(axes.comparator_profiles),
            scenario_tag_slices: parseScenarioSlices(axes.scenario_tag_slices),
            execution_surfaces: parseTerminalSurfaces(axes.execution_surfaces),
            gate_modes: parseGateModes(axes.gate_modes),
            normalization_profiles: parseNormalizationProfiles(axes.normalization_profiles)
        },
        controls: {
            determinism: {
                fixed_tz: toNonEmptyString(determinism.fixed_tz ?? 'UTC', 'controls.determinism.fixed_tz'),
                fixed_locale: toNonEmptyString(determinism.fixed_locale ?? 'C.UTF-8', 'controls.determinism.fixed_locale'),
                normalization_required: determinism.normalization_required !== false,
                retry_once_classification: determinism.retry_once_classification !== false,
                fingerprint_stability_check: determinism.fingerprint_stability_check !== false
            },
            risk_tiers: typeof controls.risk_tiers === 'object' && controls.risk_tiers ? controls.risk_tiers as ReplayMatrixRunContract['controls']['risk_tiers'] : undefined
        }
    };

    return contract;
}

export async function loadReplayMatrixRunContract(contractPath: string): Promise<ReplayMatrixRunContract> {
    const absolutePath = path.resolve(contractPath);
    const raw = await fs.readFile(absolutePath, 'utf8');
    const parsed = JSON.parse(raw) as unknown;
    return parseReplayMatrixRunContract(parsed);
}

function scenarioHasSliceTags(scenario: ReplayScenario, slice: ReplayMatrixScenarioSlice): boolean {
    const tags = new Set((scenario.tags ?? []).map((tag) => tag.toLowerCase()));
    if (slice.match === 'all') {
        return slice.tags.every((tag) => tags.has(tag));
    }

    return slice.tags.some((tag) => tags.has(tag));
}

export function selectScenarioIdsForSlice(scenarios: ReplayScenario[], slice: ReplayMatrixScenarioSlice): string[] {
    return scenarios.filter((scenario) => scenarioHasSliceTags(scenario, slice)).map((scenario) => scenario.scenario_id);
}

export function expandReplayMatrixCells(contract: ReplayMatrixRunContract): ReplayMatrixCellDefinition[] {
    const cells: ReplayMatrixCellDefinition[] = [];

    for (const modelVariant of contract.axes.model_variants) {
        for (const comparatorProfile of contract.axes.comparator_profiles) {
            for (const scenarioSlice of contract.axes.scenario_tag_slices) {
                for (const executionSurface of contract.axes.execution_surfaces) {
                    for (const gateMode of contract.axes.gate_modes) {
                        for (const normalizationProfile of contract.axes.normalization_profiles) {
                            const cellId = [
                                modelVariant.model_id,
                                comparatorProfile.profile_id,
                                scenarioSlice.slice_id,
                                executionSurface,
                                gateMode,
                                normalizationProfile.normalization_id
                            ].join('__');

                            cells.push({
                                cell_id: cellId,
                                axes: {
                                    model_variant: modelVariant,
                                    comparator_profile: comparatorProfile,
                                    scenario_slice: scenarioSlice,
                                    execution_surface: executionSurface,
                                    gate_mode: gateMode,
                                    normalization_profile: normalizationProfile
                                }
                            });
                        }
                    }
                }
            }
        }
    }

    return cells;
}