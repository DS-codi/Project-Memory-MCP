import * as fs from 'fs/promises';
import * as path from 'path';
import {
    type ReplayComparisonResult,
    type ReplayDrift,
    type ReplayExplainabilityCategory,
    type ReplayExplainabilityConfidence,
    type ReplayOperatorBucket
} from './types';
import { stableStringify, toWorkspaceRelativePath } from './StableJson';

const EXPLAINABILITY_CATEGORY_ORDER: ReplayExplainabilityCategory[] = [
    'flow_protocol',
    'authorization_policy',
    'tool_sequence',
    'success_signature',
    'artifact_integrity'
];

const EXPLAINABILITY_CONFIDENCE_ORDER: ReplayExplainabilityConfidence[] = ['high', 'medium', 'low'];
const EXPLAINABILITY_BUCKET_ORDER: ReplayOperatorBucket[] = ['blocker', 'actionable', 'monitor'];

export interface ReplayReportOutput {
    comparison_json: string;
    report_markdown: string;
}

export async function writeReplayReport(
    outputDir: string,
    comparison: ReplayComparisonResult,
    workspacePath?: string
): Promise<ReplayReportOutput> {
    const absoluteOutputDir = path.resolve(outputDir);
    await fs.mkdir(absoluteOutputDir, { recursive: true });

    const comparisonJsonPath = path.join(absoluteOutputDir, 'comparison.json');
    const reportMarkdownPath = path.join(absoluteOutputDir, 'report.md');

    await fs.writeFile(comparisonJsonPath, `${stableStringify(comparison)}\n`, 'utf8');
    await fs.writeFile(reportMarkdownPath, `${renderReplayReportMarkdown(comparison)}\n`, 'utf8');

    return {
        comparison_json: toWorkspaceRelativePath(comparisonJsonPath, workspacePath),
        report_markdown: toWorkspaceRelativePath(reportMarkdownPath, workspacePath)
    };
}

function normalizeEvidenceRef(ref: string): string {
    return ref.trim().replace(/\\/g, '/');
}

export function renderReplayReportMarkdown(comparison: ReplayComparisonResult): string {
    const header = [
        '# Replay Drift Report',
        '',
        `- Generated at: ${comparison.generated_at}`,
        `- Comparator profile: ${comparison.profile_name}`,
        `- Overall result: ${comparison.passed ? 'PASS' : 'FAIL'}`,
        ''
    ];

    const summary = [
        '## Summary',
        '',
        `- Total scenarios: ${comparison.summary.total_scenarios}`,
        `- Passed scenarios: ${comparison.summary.passed_scenarios}`,
        `- Failed scenarios: ${comparison.summary.failed_scenarios}`,
        `- High severity drifts: ${comparison.summary.high_severity_drifts}`,
        `- Medium severity drifts: ${comparison.summary.medium_severity_drifts}`,
        `- Low severity drifts: ${comparison.summary.low_severity_drifts}`,
        ''
    ];

    const details: string[] = ['## Scenario Results', ''];

    for (const scenario of comparison.scenarios) {
        details.push(`### ${scenario.scenario_id} — ${scenario.passed ? 'PASS' : 'FAIL'}`);
        details.push('');
        details.push(`- Checks executed: ${scenario.checks_executed.length}`);

        if (scenario.drifts.length === 0) {
            details.push('- Drift findings: none');
            details.push('');
            continue;
        }

        details.push('- Drift findings:');
        for (const drift of scenario.drifts) {
            details.push(`  - [${drift.severity.toUpperCase()}] ${drift.check_id}: ${drift.message}`);
        }
        details.push('');
    }

    const explainability = renderExplainabilitySection(comparison);
    return [...header, ...summary, ...details, ...explainability].join('\n');
}

function hasExplainabilityData(comparison: ReplayComparisonResult): boolean {
    if (comparison.summary.explainability_rollup) {
        return true;
    }

    for (const scenario of comparison.scenarios) {
        if ((scenario.explainability_groups?.length ?? 0) > 0) {
            return true;
        }

        if (scenario.drifts.some((drift) => driftHasExplainability(drift))) {
            return true;
        }
    }

    return false;
}

function driftHasExplainability(drift: ReplayDrift): boolean {
    return Boolean(
        drift.category ||
        drift.confidence ||
        drift.operator_bucket ||
        drift.remediation ||
        drift.evidence
    );
}

function renderExplainabilitySection(comparison: ReplayComparisonResult): string[] {
    if (!hasExplainabilityData(comparison)) {
        return [];
    }

    const lines: string[] = ['## Explainability', ''];
    const rollup = comparison.summary.explainability_rollup;

    if (rollup) {
        lines.push('### Rollup', '');

        if (typeof rollup.total_explained_drifts === 'number') {
            lines.push(`- Explained drifts: ${rollup.total_explained_drifts}`);
        }

        const categorySummary = renderCountMap(rollup.by_category, EXPLAINABILITY_CATEGORY_ORDER);
        if (categorySummary) {
            lines.push(`- By category: ${categorySummary}`);
        }

        const confidenceSummary = renderCountMap(rollup.by_confidence, EXPLAINABILITY_CONFIDENCE_ORDER);
        if (confidenceSummary) {
            lines.push(`- By confidence: ${confidenceSummary}`);
        }

        const bucketSummary = renderCountMap(rollup.by_operator_bucket, EXPLAINABILITY_BUCKET_ORDER);
        if (bucketSummary) {
            lines.push(`- By operator bucket: ${bucketSummary}`);
        }

        lines.push('');
    }

    const scenarioGroups = comparison.scenarios.filter((scenario) => (scenario.explainability_groups?.length ?? 0) > 0);
    if (scenarioGroups.length > 0) {
        lines.push('### Group Summaries', '');
        for (const scenario of scenarioGroups) {
            lines.push(`#### ${scenario.scenario_id}`);
            for (const group of scenario.explainability_groups ?? []) {
                const confidenceParts: string[] = [];
                if (typeof group.high_confidence === 'number') {
                    confidenceParts.push(`high ${group.high_confidence}`);
                }
                if (typeof group.medium_confidence === 'number') {
                    confidenceParts.push(`medium ${group.medium_confidence}`);
                }
                if (typeof group.low_confidence === 'number') {
                    confidenceParts.push(`low ${group.low_confidence}`);
                }

                const bucketParts: string[] = [];
                if (typeof group.blocker_bucket === 'number') {
                    bucketParts.push(`blocker ${group.blocker_bucket}`);
                }
                if (typeof group.actionable_bucket === 'number') {
                    bucketParts.push(`actionable ${group.actionable_bucket}`);
                }
                if (typeof group.monitor_bucket === 'number') {
                    bucketParts.push(`monitor ${group.monitor_bucket}`);
                }

                const confidenceText = confidenceParts.length > 0 ? `; confidence ${confidenceParts.join(', ')}` : '';
                const bucketText = bucketParts.length > 0 ? `; buckets ${bucketParts.join(', ')}` : '';
                lines.push(`- ${group.category}: ${group.total_drifts} drift(s)${confidenceText}${bucketText}`);
            }
            lines.push('');
        }
    }

    const topActions = collectTopActions(comparison);
    if (topActions.length > 0) {
        lines.push('### Top Actions', '');
        for (const action of topActions) {
            lines.push(`- ${action}`);
        }
        lines.push('');
    }

    const evidenceHandles = collectEvidenceHandles(comparison);
    if (evidenceHandles.length > 0) {
        lines.push('### Evidence Handles', '');
        for (const evidence of evidenceHandles) {
            lines.push(`- ${evidence}`);
        }
        lines.push('');
    }

    return lines;
}

function renderCountMap<T extends string>(
    map: Partial<Record<T, number>> | undefined,
    order: T[]
): string | undefined {
    if (!map) {
        return undefined;
    }

    const entries = order
        .map((key) => [key, map[key]] as const)
        .filter((entry): entry is readonly [T, number] => typeof entry[1] === 'number');

    if (entries.length === 0) {
        return undefined;
    }

    return entries.map(([key, value]) => `${key} ${value}`).join(', ');
}

function collectTopActions(comparison: ReplayComparisonResult): string[] {
    const frequency = new Map<string, number>();

    for (const scenario of comparison.scenarios) {
        for (const drift of scenario.drifts) {
            for (const action of drift.remediation?.recommended_actions ?? []) {
                const normalized = action.trim();
                if (!normalized) {
                    continue;
                }
                frequency.set(normalized, (frequency.get(normalized) ?? 0) + 1);
            }
        }
    }

    return Array.from(frequency.entries())
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, 5)
        .map(([action, count]) => `${action} (x${count})`);
}

function collectEvidenceHandles(comparison: ReplayComparisonResult): string[] {
    const handles = new Set<string>();

    for (const scenario of comparison.scenarios) {
        for (const drift of scenario.drifts) {
            const fingerprint = drift.evidence?.fingerprint?.trim();
            if (fingerprint) {
                handles.add(`fingerprint:${fingerprint}`);
            }

            for (const ref of drift.evidence?.artifact_refs ?? []) {
                const normalized = normalizeEvidenceRef(ref);
                if (normalized) {
                    handles.add(`artifact:${normalized}`);
                }
            }
        }
    }

    return Array.from(handles).sort((left, right) => left.localeCompare(right));
}
