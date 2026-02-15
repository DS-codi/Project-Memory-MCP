import {
    type ReplayComparisonResult,
    type ReplayGateEvaluation,
    type ReplayMatrixAxisRollupItem,
    type ReplayMatrixCellResult,
    type ReplayMatrixCellScore,
    type ReplayMatrixReport,
    type ReplayMatrixRiskTier,
    type ReplayMatrixRiskTierSummary,
    type ReplayMatrixRunContract,
    type ReplayOperatorBucket
} from './types';

function clamp(value: number, minimum: number, maximum: number): number {
    if (value < minimum) {
        return minimum;
    }
    if (value > maximum) {
        return maximum;
    }

    return value;
}

function round(value: number): number {
    return Math.round(value * 1000) / 1000;
}

function getOperatorBucketCount(comparison: ReplayComparisonResult, bucket: ReplayOperatorBucket): number {
    return comparison.scenarios
        .flatMap((scenario) => scenario.drifts)
        .filter((drift) => drift.operator_bucket === bucket)
        .length;
}

export function scoreReplayMatrixCell(comparison: ReplayComparisonResult, gate: ReplayGateEvaluation): ReplayMatrixCellScore {
    const high = comparison.summary.high_severity_drifts;
    const medium = comparison.summary.medium_severity_drifts;
    const low = comparison.summary.low_severity_drifts;

    const wds = clamp(100 - ((20 * high) + (7 * medium) + (2 * low)), 0, 100);
    const spr = comparison.summary.total_scenarios > 0
        ? comparison.summary.passed_scenarios / comparison.summary.total_scenarios
        : 0;

    const totalDrifts = high + medium + low;
    const explainedDrifts = comparison.summary.explainability_rollup?.total_explained_drifts ?? 0;
    const blockerBucket = getOperatorBucketCount(comparison, 'blocker');
    const eci = totalDrifts > 0 ? explainedDrifts / totalDrifts : 1;
    const bbr = explainedDrifts > 0 ? blockerBucket / explainedDrifts : 0;

    const flakePenalty = gate.classification === 'intermittent_flake' ? 5 : 0;
    const cms = (wds * spr) - flakePenalty;

    return {
        wds: round(wds),
        spr: round(spr),
        eci: round(eci),
        bbr: round(bbr),
        cms: round(cms),
        flake_penalty: flakePenalty,
        deterministic_regression: gate.classification === 'deterministic_regression'
    };
}

function passesRiskTierPolicy(cell: ReplayMatrixCellResult, contract: ReplayMatrixRunContract): boolean {
    const policy = contract.controls.risk_tiers?.[cell.axes.scenario_slice.risk_tier];
    if (!policy) {
        return true;
    }

    const summary = cell.comparison.summary;
    if (typeof policy.max_high_severity_drifts === 'number' && summary.high_severity_drifts > policy.max_high_severity_drifts) {
        return false;
    }

    if (typeof policy.max_medium_severity_drifts === 'number' && summary.medium_severity_drifts > policy.max_medium_severity_drifts) {
        return false;
    }

    if (typeof policy.max_low_severity_drifts === 'number' && summary.low_severity_drifts > policy.max_low_severity_drifts) {
        return false;
    }

    return true;
}

export function evaluateReplayMatrixPromotable(cell: ReplayMatrixCellResult, contract: ReplayMatrixRunContract): boolean {
    if (cell.score.deterministic_regression) {
        return false;
    }

    if (!cell.gate.passed) {
        return false;
    }

    return passesRiskTierPolicy(cell, contract);
}

function aggregateAxis(
    cells: ReplayMatrixCellResult[],
    axis: ReplayMatrixAxisRollupItem['axis'],
    getAxisValue: (cell: ReplayMatrixCellResult) => string
): ReplayMatrixAxisRollupItem[] {
    const grouped = new Map<string, ReplayMatrixCellResult[]>();

    for (const cell of cells) {
        const key = getAxisValue(cell);
        const existing = grouped.get(key) ?? [];
        existing.push(cell);
        grouped.set(key, existing);
    }

    return Array.from(grouped.entries())
        .sort((left, right) => left[0].localeCompare(right[0]))
        .map(([axisValue, group]) => {
            const total = group.length;
            const cmsSum = group.reduce((sum, cell) => sum + cell.score.cms, 0);
            const wdsSum = group.reduce((sum, cell) => sum + cell.score.wds, 0);
            const sprSum = group.reduce((sum, cell) => sum + cell.score.spr, 0);
            return {
                axis,
                axis_value: axisValue,
                cell_count: total,
                average_cms: round(cmsSum / total),
                average_wds: round(wdsSum / total),
                average_spr: round(sprSum / total),
                promotable_cells: group.filter((cell) => cell.promotable).length
            };
        });
}

function summarizeRiskTiers(cells: ReplayMatrixCellResult[]): ReplayMatrixRiskTierSummary[] {
    const tiers: ReplayMatrixRiskTier[] = ['p0', 'p1', 'p2'];

    return tiers.map((tier) => {
        const inTier = cells.filter((cell) => cell.axes.scenario_slice.risk_tier === tier);
        return {
            risk_tier: tier,
            cell_count: inTier.length,
            promotable_cells: inTier.filter((cell) => cell.promotable).length,
            deterministic_regressions: inTier.filter((cell) => cell.score.deterministic_regression).length
        };
    });
}

export function buildReplayMatrixReport(
    matrixId: string,
    runLabel: string,
    cells: ReplayMatrixCellResult[]
): ReplayMatrixReport {
    const axisRollups: ReplayMatrixAxisRollupItem[] = [
        ...aggregateAxis(cells, 'model_variant', (cell) => cell.axes.model_variant.model_id),
        ...aggregateAxis(cells, 'comparator_profile', (cell) => cell.axes.comparator_profile.profile_id),
        ...aggregateAxis(cells, 'scenario_slice', (cell) => cell.axes.scenario_slice.slice_id),
        ...aggregateAxis(cells, 'execution_surface', (cell) => cell.axes.execution_surface),
        ...aggregateAxis(cells, 'gate_mode', (cell) => cell.axes.gate_mode),
        ...aggregateAxis(cells, 'normalization_profile', (cell) => cell.axes.normalization_profile.normalization_id)
    ];

    return {
        matrix_id: matrixId,
        generated_at: new Date().toISOString(),
        run_label: runLabel,
        total_cells: cells.length,
        promotable_cells: cells.filter((cell) => cell.promotable).length,
        deterministic_regressions: cells.filter((cell) => cell.score.deterministic_regression).length,
        cells,
        axis_rollups: axisRollups,
        risk_tier_summary: summarizeRiskTiers(cells)
    };
}
