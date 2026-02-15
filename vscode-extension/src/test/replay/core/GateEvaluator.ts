import {
    type ReplayComparisonResult,
    type ReplayGateAnnotation,
    type ReplayGateEvaluation,
    type ReplayGateMode
} from './types';

interface GateEvaluationOptions {
    retry_comparison?: ReplayComparisonResult;
}

function normalizeGateMode(input: string | undefined): ReplayGateMode {
    const mode = (input ?? 'warn').trim().toLowerCase();
    if (mode === 'strict' || mode === 'warn' || mode === 'info') {
        return mode;
    }

    return 'warn';
}

function toAnnotationLevel(mode: ReplayGateMode): ReplayGateAnnotation['level'] {
    if (mode === 'strict') {
        return 'error';
    }

    if (mode === 'warn') {
        return 'warning';
    }

    return 'notice';
}

export function evaluateReplayGate(comparison: ReplayComparisonResult, modeInput: string | undefined): ReplayGateEvaluation {
    return evaluateReplayGateWithOptions(comparison, modeInput);
}

function comparisonHasBlockingFailure(comparison: ReplayComparisonResult): boolean {
    return !comparison.passed || comparison.summary.high_severity_drifts > 0;
}

function driftFingerprint(comparison: ReplayComparisonResult): string {
    const drifts = comparison.scenarios.flatMap((scenario) => scenario.drifts);
    const tokens = drifts
        .map((drift) => `${drift.scenario_id}|${drift.check_id}|${drift.severity}|${drift.message}`)
        .sort((left, right) => left.localeCompare(right));
    return tokens.join('||');
}

function normalizeEvidenceRef(ref: string): string {
    return ref.trim().replace(/\\/g, '/');
}

function renderAnnotationEvidenceSuffix(annotation: ReplayGateAnnotation): string {
    const suffixTokens: string[] = [];
    if (annotation.evidence_refs && annotation.evidence_refs.length > 0) {
        const normalizedRefs = annotation.evidence_refs
            .map((ref) => normalizeEvidenceRef(ref))
            .filter((ref) => ref.length > 0);

        if (normalizedRefs.length > 0) {
            suffixTokens.push(`evidence_refs=${normalizedRefs.join('|')}`);
        }
    }

    if (annotation.evidence_fingerprint) {
        suffixTokens.push(`evidence_fingerprint=${annotation.evidence_fingerprint}`);
    }

    if (suffixTokens.length === 0) {
        return '';
    }

    return ` [${suffixTokens.join(' ')}]`;
}

function evaluateReplayGateWithOptions(
    comparison: ReplayComparisonResult,
    modeInput: string | undefined,
    options: GateEvaluationOptions = {}
): ReplayGateEvaluation {
    const mode = normalizeGateMode(modeInput);
    const annotations: ReplayGateAnnotation[] = [];
    const level = toAnnotationLevel(mode);
    const retried = options.retry_comparison !== undefined;

    const primaryBlockingFailure = comparisonHasBlockingFailure(comparison);
    const retryBlockingFailure = options.retry_comparison
        ? comparisonHasBlockingFailure(options.retry_comparison)
        : false;
    const classification: ReplayGateEvaluation['classification'] =
        primaryBlockingFailure && retried && !retryBlockingFailure ? 'intermittent_flake' :
            primaryBlockingFailure ? 'deterministic_regression' : 'clean';

    const sameDriftFingerprint = options.retry_comparison
        ? driftFingerprint(comparison) === driftFingerprint(options.retry_comparison)
        : true;
    const triage_labels = classification === 'intermittent_flake'
        ? ['replay', 'intermittent', 'flake', `gate:${mode}`]
        : classification === 'deterministic_regression'
            ? ['replay', 'deterministic-regression', `gate:${mode}`, sameDriftFingerprint ? 'stable-fingerprint' : 'changed-fingerprint']
            : ['replay', 'clean', `gate:${mode}`];
    const explainability_rollup = comparison.summary.explainability_rollup;

    for (const scenario of comparison.scenarios) {
        for (const drift of scenario.drifts) {
            annotations.push({
                level,
                scenario_id: scenario.scenario_id,
                check_id: drift.check_id,
                severity: drift.severity,
                message: drift.message,
                evidence_refs: drift.evidence?.artifact_refs,
                evidence_fingerprint: drift.evidence?.fingerprint
            });
        }
    }

    const strictFailed = classification === 'deterministic_regression';
    if (mode === 'strict') {
        return {
            mode,
            passed: !strictFailed,
            status: strictFailed ? 'FAIL' : classification === 'intermittent_flake' ? 'WARN' : 'PASS',
            reason: strictFailed
                ? 'Strict gate failed due to deterministic replay regression.'
                : classification === 'intermittent_flake'
                    ? 'Strict gate retried once and recovered; labeling as intermittent flake.'
                    : 'Strict gate passed with no blocking replay drift.',
            classification,
            triage_labels,
            retried,
            annotations,
            summary: comparison.summary,
            explainability_rollup,
            generated_at: new Date().toISOString()
        };
    }

    if (mode === 'warn') {
        return {
            mode,
            passed: true,
            status: annotations.length > 0 ? 'WARN' : 'PASS',
            reason: annotations.length > 0
                ? 'Warn gate allows CI to pass while emitting replay drift annotations.'
                : 'Warn gate passed with no replay drift annotations.',
            classification,
            triage_labels,
            retried,
            annotations,
            summary: comparison.summary,
            explainability_rollup,
            generated_at: new Date().toISOString()
        };
    }

    return {
        mode,
        passed: true,
        status: annotations.length > 0 ? 'INFO' : 'PASS',
        reason:
            annotations.length > 0
                ? 'Info gate collected replay drift insights without failing CI.'
                : 'Info gate passed with no replay drift annotations.',
        classification,
        triage_labels,
        retried,
        annotations,
        summary: comparison.summary,
        explainability_rollup,
        generated_at: new Date().toISOString()
    };
}

export function evaluateReplayGateWithRetry(
    primaryComparison: ReplayComparisonResult,
    retryComparison: ReplayComparisonResult | undefined,
    modeInput: string | undefined
): ReplayGateEvaluation {
    return evaluateReplayGateWithOptions(primaryComparison, modeInput, {
        retry_comparison: retryComparison
    });
}

export function renderReplayGateSummaryMarkdown(evaluation: ReplayGateEvaluation): string {
    return [
        '## Replay Gate Summary',
        '',
        `- Mode: ${evaluation.mode}`,
        `- Status: ${evaluation.status}`,
        `- Passed: ${evaluation.passed ? 'yes' : 'no'}`,
        `- Reason: ${evaluation.reason}`,
        `- Classification: ${evaluation.classification}`,
        `- Retried: ${evaluation.retried ? 'yes' : 'no'}`,
        `- Triage labels: ${evaluation.triage_labels.join(', ')}`,
        `- Total scenarios: ${evaluation.summary.total_scenarios}`,
        `- Failed scenarios: ${evaluation.summary.failed_scenarios}`,
        `- High drifts: ${evaluation.summary.high_severity_drifts}`,
        `- Medium drifts: ${evaluation.summary.medium_severity_drifts}`,
        `- Low drifts: ${evaluation.summary.low_severity_drifts}`,
        `- Annotation count: ${evaluation.annotations.length}`
    ].join('\n');
}

export function toGitHubAnnotations(evaluation: ReplayGateEvaluation): string[] {
    return evaluation.annotations.map(
        (annotation) =>
            `::${annotation.level} title=Replay Gate (${annotation.severity.toUpperCase()})::[${evaluation.classification}] ${annotation.scenario_id} ${annotation.check_id} ${annotation.message}${renderAnnotationEvidenceSuffix(annotation)}`
    );
}
