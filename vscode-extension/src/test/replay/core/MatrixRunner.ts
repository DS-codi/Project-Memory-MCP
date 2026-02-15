import * as fs from 'fs/promises';
import * as path from 'path';
import { compareReplayRuns } from './Comparator';
import { evaluateReplayGateWithRetry } from './GateEvaluator';
import { expandReplayMatrixCells, selectScenarioIdsForSlice } from './MatrixContract';
import { buildReplayMatrixReport, evaluateReplayMatrixPromotable, scoreReplayMatrixCell } from './MatrixScoring';
import { ReplayOrchestrator } from './ReplayOrchestrator';
import { stableStringify, toWorkspaceRelativePath } from './StableJson';
import {
    type ReplayComparatorProfile,
    type ReplayMatrixCellDefinition,
    type ReplayMatrixCellResult,
    type ReplayMatrixReport,
    type ReplayMatrixRunContract,
    type ReplayScenario
} from './types';

export interface ReplayMatrixRunOptions {
    output_root: string;
    workspace_path?: string;
    run_label: string;
    contract: ReplayMatrixRunContract;
    scenarios: ReplayScenario[];
    comparator_profiles: Record<string, ReplayComparatorProfile>;
}

export interface ReplayMatrixRunOutput {
    report: ReplayMatrixReport;
    output_file: string;
    markdown_file: string;
}

function normalizeScenarioForCell(scenario: ReplayScenario, cell: ReplayMatrixCellDefinition, requireNormalization: boolean): ReplayScenario {
    return {
        ...scenario,
        runtime: {
            ...scenario.runtime,
            terminal_surface: cell.axes.execution_surface
        },
        normalization: {
            ...(scenario.normalization ?? {}),
            ...cell.axes.normalization_profile.config,
            canonicalize_timestamps: requireNormalization ? true : ((scenario.normalization?.canonicalize_timestamps ?? false) || (cell.axes.normalization_profile.config.canonicalize_timestamps ?? false)),
            canonicalize_paths: requireNormalization ? true : ((scenario.normalization?.canonicalize_paths ?? false) || (cell.axes.normalization_profile.config.canonicalize_paths ?? false)),
            strip_nondeterministic_text: requireNormalization ? true : ((scenario.normalization?.strip_nondeterministic_text ?? false) || (cell.axes.normalization_profile.config.strip_nondeterministic_text ?? false))
        },
        metadata: {
            ...(scenario.metadata ?? {}),
            matrix: {
                model_variant: cell.axes.model_variant.model_id,
                comparator_profile: cell.axes.comparator_profile.profile_id,
                scenario_slice: cell.axes.scenario_slice.slice_id,
                execution_surface: cell.axes.execution_surface,
                gate_mode: cell.axes.gate_mode,
                normalization_profile: cell.axes.normalization_profile.normalization_id
            }
        }
    };
}

function deterministicFingerprint(report: ReplayMatrixReport): string {
    const tokens = report.cells
        .map((cell) => `${cell.cell_id}|${cell.gate.classification}|${cell.comparison.summary.high_severity_drifts}|${cell.comparison.summary.medium_severity_drifts}|${cell.comparison.summary.low_severity_drifts}`)
        .sort((left, right) => left.localeCompare(right));
    return tokens.join('||');
}

function renderReplayMatrixReportMarkdown(report: ReplayMatrixReport): string {
    const lines: string[] = [
        '# Replay Matrix Report',
        '',
        `- Matrix ID: ${report.matrix_id}`,
        `- Generated at: ${report.generated_at}`,
        `- Run label: ${report.run_label}`,
        `- Total cells: ${report.total_cells}`,
        `- Promotable cells: ${report.promotable_cells}`,
        `- Deterministic regressions: ${report.deterministic_regressions}`,
        '',
        '## Risk Tier Summary',
        ''
    ];

    for (const tier of report.risk_tier_summary) {
        lines.push(`- ${tier.risk_tier}: cells=${tier.cell_count}, promotable=${tier.promotable_cells}, deterministic_regressions=${tier.deterministic_regressions}`);
    }

    lines.push('', '## Cell Results', '');
    for (const cell of report.cells) {
        lines.push(`### ${cell.cell_id}`);
        lines.push(`- Scenarios: ${cell.scenario_ids.length}`);
        lines.push(`- Gate: ${cell.gate.status} (${cell.gate.classification})`);
        lines.push(`- Promotable: ${cell.promotable ? 'yes' : 'no'}`);
        lines.push(`- Score: WDS=${cell.score.wds}, SPR=${cell.score.spr}, ECI=${cell.score.eci}, BBR=${cell.score.bbr}, CMS=${cell.score.cms}`);
        lines.push('');
    }

    return lines.join('\n');
}

async function writeReplayMatrixReport(outputRoot: string, report: ReplayMatrixReport, workspacePath?: string): Promise<{ output_file: string; markdown_file: string; }> {
    const absoluteRoot = path.resolve(outputRoot);
    await fs.mkdir(absoluteRoot, { recursive: true });

    const jsonFile = path.join(absoluteRoot, 'matrix-report.json');
    const markdownFile = path.join(absoluteRoot, 'matrix-report.md');

    await fs.writeFile(jsonFile, `${stableStringify(report)}\n`, 'utf8');
    await fs.writeFile(markdownFile, `${renderReplayMatrixReportMarkdown(report)}\n`, 'utf8');

    return {
        output_file: toWorkspaceRelativePath(jsonFile, workspacePath),
        markdown_file: toWorkspaceRelativePath(markdownFile, workspacePath)
    };
}

export async function runReplayMatrix(options: ReplayMatrixRunOptions): Promise<ReplayMatrixRunOutput> {
    process.env.TZ = options.contract.controls.determinism.fixed_tz;
    process.env.LANG = options.contract.controls.determinism.fixed_locale;
    process.env.LC_ALL = options.contract.controls.determinism.fixed_locale;

    const cells = expandReplayMatrixCells(options.contract);
    const orchestrator = new ReplayOrchestrator({ output_root: options.output_root });
    const cellResults: ReplayMatrixCellResult[] = [];

    for (const cell of cells) {
        const comparatorProfile = options.comparator_profiles[cell.axes.comparator_profile.profile_id];
        if (!comparatorProfile) {
            throw new Error(`Comparator profile '${cell.axes.comparator_profile.profile_id}' was not loaded.`);
        }

        const selectedScenarioIds = new Set(selectScenarioIdsForSlice(options.scenarios, cell.axes.scenario_slice));
        const selectedScenarios = options.scenarios
            .filter((scenario) => selectedScenarioIds.has(scenario.scenario_id))
            .map((scenario) => normalizeScenarioForCell(
                scenario,
                cell,
                options.contract.controls.determinism.normalization_required
            ));

        if (selectedScenarios.length === 0) {
            continue;
        }

        const run = await orchestrator.run(
            selectedScenarios,
            `${options.run_label}-${cell.cell_id}`,
            options.workspace_path
        );
        const comparison = compareReplayRuns(selectedScenarios, run.baseline, run.candidate, comparatorProfile);

        let retryComparison;
        if (options.contract.controls.determinism.retry_once_classification && (!comparison.passed || comparison.summary.high_severity_drifts > 0)) {
            const retryRun = await orchestrator.run(
                selectedScenarios,
                `${options.run_label}-${cell.cell_id}-retry`,
                options.workspace_path
            );
            retryComparison = compareReplayRuns(selectedScenarios, retryRun.baseline, retryRun.candidate, comparatorProfile);
        }

        const gate = evaluateReplayGateWithRetry(comparison, retryComparison, cell.axes.gate_mode);
        const score = scoreReplayMatrixCell(comparison, gate);
        const provisionalCell: ReplayMatrixCellResult = {
            cell_id: cell.cell_id,
            scenario_ids: selectedScenarios.map((scenario) => scenario.scenario_id),
            axes: cell.axes,
            comparison,
            gate,
            score,
            promotable: true
        };

        provisionalCell.promotable = evaluateReplayMatrixPromotable(provisionalCell, options.contract);
        cellResults.push(provisionalCell);
    }

    const report = buildReplayMatrixReport(options.contract.matrix_id, options.run_label, cellResults);

    if (options.contract.controls.determinism.fingerprint_stability_check && report.cells.length > 0) {
        const fingerprintA = deterministicFingerprint(report);
        const fingerprintB = deterministicFingerprint(report);
        if (fingerprintA !== fingerprintB) {
            throw new Error('Matrix fingerprint stability check failed: report fingerprint is not stable.');
        }
    }

    const written = await writeReplayMatrixReport(
        path.join(options.output_root, `${options.run_label}-matrix-${Date.now()}`),
        report,
        options.workspace_path
    );

    return {
        report,
        output_file: written.output_file,
        markdown_file: written.markdown_file
    };
}
