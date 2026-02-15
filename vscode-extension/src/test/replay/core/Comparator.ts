import {
    type ReplayCheckSpec,
    type ReplayComparatorProfile,
    type ReplayComparisonResult,
    type ReplayDrift,
    type ReplayExplainabilityCategory,
    type ReplayExplainabilityConfidence,
    type ReplayExplainabilityGroupSummary,
    type ReplayExplainabilityRollup,
    type ReplayOperatorBucket,
    type ReplayProfileArtifacts,
    type ReplayScenario,
    type ReplayScenarioComparison,
    type ReplayScenarioRunArtifact,
    type ReplayTraceEvent
} from './types';

const EXPLAINABILITY_TAXONOMY_ORDER: ReplayExplainabilityCategory[] = [
    'flow_protocol',
    'authorization_policy',
    'tool_sequence',
    'success_signature',
    'artifact_integrity'
];

const CATEGORY_BY_CHECK_TYPE: Record<ReplayCheckSpec['type'], ReplayExplainabilityCategory> = {
    tool_order: 'tool_sequence',
    auth_outcome: 'authorization_policy',
    flow: 'flow_protocol',
    success_signature: 'success_signature'
};

function inferCategoryFromText(checkId: string | undefined, message: string): ReplayExplainabilityCategory {
    const token = `${checkId ?? ''} ${message}`.toLowerCase();
    if (token.includes('scenario-presence') || token.includes('artifact')) {
        return 'artifact_integrity';
    }
    if (token.includes('auth')) {
        return 'authorization_policy';
    }
    if (token.includes('tool') || token.includes('order') || token.includes('sequence')) {
        return 'tool_sequence';
    }
    if (token.includes('handoff') || token.includes('complete') || token.includes('confirmation') || token.includes('flow')) {
        return 'flow_protocol';
    }
    if (token.includes('signature')) {
        return 'success_signature';
    }

    return 'artifact_integrity';
}

function deriveDriftCategory(check: ReplayCheckSpec | undefined, drift: ReplayDrift): ReplayExplainabilityCategory {
    if (check) {
        return CATEGORY_BY_CHECK_TYPE[check.type];
    }

    return inferCategoryFromText(drift.check_id, drift.message);
}

function deriveConfidenceBand(drift: ReplayDrift): ReplayExplainabilityConfidence {
    const detailCount = drift.details ? Object.keys(drift.details).length : 0;
    if (drift.severity === 'high') {
        return detailCount > 0 ? 'high' : 'medium';
    }
    if (drift.severity === 'medium') {
        return detailCount >= 2 ? 'high' : detailCount > 0 ? 'medium' : 'low';
    }

    return detailCount >= 2 ? 'medium' : 'low';
}

function deriveOperatorBucket(drift: ReplayDrift): ReplayOperatorBucket {
    if (drift.severity === 'high') {
        return 'blocker';
    }
    if (drift.severity === 'medium') {
        return 'actionable';
    }
    return 'monitor';
}

function remediationForCategory(category: ReplayExplainabilityCategory, drift: ReplayDrift) {
    if (category === 'tool_sequence') {
        return {
            likely_causes: ['Planner selected a different tool/action sequence than baseline.'],
            recommended_actions: ['Compare baseline/candidate tool-action order and align decision flow.'],
            verification_steps: ['Re-run replay and confirm tool-order drift no longer appears.']
        };
    }
    if (category === 'authorization_policy') {
        return {
            likely_causes: ['Authorization policy outcome or reason-class changed.'],
            recommended_actions: ['Inspect authorization rationale and policy envelopes for parity.'],
            verification_steps: ['Validate auth events and reason_class values match baseline expectations.']
        };
    }
    if (category === 'flow_protocol') {
        return {
            likely_causes: ['Required sequencing (confirmation/handoff/complete) was violated.'],
            recommended_actions: ['Restore protocol ordering before gated updates and completion.'],
            verification_steps: ['Replay scenario and verify protocol event ordering checks pass.']
        };
    }
    if (category === 'success_signature') {
        return {
            likely_causes: ['Expected success signature tokens were missing from candidate run.'],
            recommended_actions: ['Restore missing success-signature emitting path.'],
            verification_steps: ['Confirm must_include signatures are present in normalized candidate events.']
        };
    }

    return {
        likely_causes: ['Required replay artifacts were missing or could not be resolved.'],
        recommended_actions: ['Rebuild baseline/candidate artifacts and verify scenario coverage parity.'],
        verification_steps: [`Confirm artifacts exist for scenario ${drift.scenario_id} and rerun comparison.`]
    };
}

function findActionIndexes(events: ReplayTraceEvent[], actions: string[] | undefined): number[] | undefined {
    if (!Array.isArray(actions) || actions.length === 0) {
        return undefined;
    }

    const expected = new Set(actions.map((action) => action.trim().toLowerCase()));
    const indexes: number[] = [];

    events.forEach((event, index) => {
        const action = (event.action_canonical ?? event.action_raw ?? '').trim().toLowerCase();
        if (expected.has(action)) {
            indexes.push(index);
        }
    });

    return indexes.length > 0 ? indexes : undefined;
}

function normalizeEvidenceRef(value: string): string {
    return value.trim().replace(/\\/g, '/');
}

function toScenarioArtifactRef(profile: string, scenarioId: string): string {
    return normalizeEvidenceRef(`${profile}.norm.json#scenario:${scenarioId}`);
}

function buildEvidence(
    drift: ReplayDrift,
    baselineArtifact: ReplayScenarioRunArtifact,
    candidateArtifact: ReplayScenarioRunArtifact
) {
    const details = drift.details ?? {};
    const baselineEventIndexes = Array.isArray(details.baseline_event_indexes)
        ? (details.baseline_event_indexes as number[])
        : findActionIndexes(baselineArtifact.normalized_events, details.baseline_actions as string[] | undefined);
    const candidateEventIndexes = Array.isArray(details.candidate_event_indexes)
        ? (details.candidate_event_indexes as number[])
        : findActionIndexes(candidateArtifact.normalized_events, details.candidate_actions as string[] | undefined);

    const fingerprint = [drift.scenario_id, drift.check_id, drift.severity, drift.message.trim().toLowerCase()].join('|');

    return {
        baseline_event_indexes: baselineEventIndexes,
        candidate_event_indexes: candidateEventIndexes,
        artifact_refs: [
            toScenarioArtifactRef(baselineArtifact.profile, drift.scenario_id),
            toScenarioArtifactRef(candidateArtifact.profile, drift.scenario_id)
        ],
        fingerprint
    };
}

function enrichDrift(
    drift: ReplayDrift,
    check: ReplayCheckSpec | undefined,
    baselineArtifact: ReplayScenarioRunArtifact,
    candidateArtifact: ReplayScenarioRunArtifact
): ReplayDrift {
    const category = deriveDriftCategory(check, drift);

    return {
        ...drift,
        category,
        confidence: deriveConfidenceBand(drift),
        operator_bucket: deriveOperatorBucket(drift),
        remediation: remediationForCategory(category, drift),
        evidence: buildEvidence(drift, baselineArtifact, candidateArtifact)
    };
}

function buildExplainabilityGroups(drifts: ReplayDrift[]): ReplayExplainabilityGroupSummary[] | undefined {
    if (drifts.length === 0) {
        return undefined;
    }

    const grouped = new Map<ReplayExplainabilityCategory, ReplayExplainabilityGroupSummary>();

    for (const drift of drifts) {
        if (!drift.category) {
            continue;
        }

        const current = grouped.get(drift.category) ?? {
            category: drift.category,
            total_drifts: 0,
            high_confidence: 0,
            medium_confidence: 0,
            low_confidence: 0,
            blocker_bucket: 0,
            actionable_bucket: 0,
            monitor_bucket: 0
        };

        current.total_drifts += 1;
        if (drift.confidence === 'high') {
            current.high_confidence = (current.high_confidence ?? 0) + 1;
        } else if (drift.confidence === 'medium') {
            current.medium_confidence = (current.medium_confidence ?? 0) + 1;
        } else if (drift.confidence === 'low') {
            current.low_confidence = (current.low_confidence ?? 0) + 1;
        }

        if (drift.operator_bucket === 'blocker') {
            current.blocker_bucket = (current.blocker_bucket ?? 0) + 1;
        } else if (drift.operator_bucket === 'actionable') {
            current.actionable_bucket = (current.actionable_bucket ?? 0) + 1;
        } else if (drift.operator_bucket === 'monitor') {
            current.monitor_bucket = (current.monitor_bucket ?? 0) + 1;
        }

        grouped.set(drift.category, current);
    }

    return EXPLAINABILITY_TAXONOMY_ORDER
        .filter((category) => grouped.has(category))
        .map((category) => grouped.get(category) as ReplayExplainabilityGroupSummary);
}

function buildExplainabilityRollup(drifts: ReplayDrift[]): ReplayExplainabilityRollup | undefined {
    const explained = drifts.filter((drift) => drift.category || drift.confidence || drift.operator_bucket);
    if (explained.length === 0) {
        return undefined;
    }

    const byCategory: Partial<Record<ReplayExplainabilityCategory, number>> = {};
    const byConfidence: Partial<Record<ReplayExplainabilityConfidence, number>> = {};
    const byOperatorBucket: Partial<Record<ReplayOperatorBucket, number>> = {};

    for (const drift of explained) {
        if (drift.category) {
            byCategory[drift.category] = (byCategory[drift.category] ?? 0) + 1;
        }
        if (drift.confidence) {
            byConfidence[drift.confidence] = (byConfidence[drift.confidence] ?? 0) + 1;
        }
        if (drift.operator_bucket) {
            byOperatorBucket[drift.operator_bucket] = (byOperatorBucket[drift.operator_bucket] ?? 0) + 1;
        }
    }

    return {
        total_explained_drifts: explained.length,
        by_category: byCategory,
        by_confidence: byConfidence,
        by_operator_bucket: byOperatorBucket
    };
}

function normalizeComparatorProfile(profile: ReplayComparatorProfile): ReplayComparatorProfile {
    return {
        profile_name: profile.profile_name ?? 'default-replay-profile',
        tool_order: {
            strict_default: profile.tool_order?.strict_default ?? true,
            ignore_optional_tools: Array.isArray(profile.tool_order?.ignore_optional_tools)
                ? profile.tool_order.ignore_optional_tools
                : []
        },
        authorization: {
            compare_reason_class: profile.authorization?.compare_reason_class ?? true
        },
        flow: {
            require_handoff_before_complete: profile.flow?.require_handoff_before_complete ?? true,
            require_confirmation_before_gated_updates: profile.flow?.require_confirmation_before_gated_updates ?? true,
            required_handoff_target: profile.flow?.required_handoff_target ?? 'Coordinator'
        },
        success_signatures: {
            require_all: profile.success_signatures?.require_all ?? true
        }
    };
}

interface ToolAction {
    tool: string;
    action: string;
}

function getToolActions(events: ReplayTraceEvent[], profile: ReplayComparatorProfile): ToolAction[] {
    const ignoredTools = new Set(profile.tool_order.ignore_optional_tools.map((tool) => tool.trim().toLowerCase()));

    return events
        .filter((event) => event.event_type === 'tool_call')
        .map((event) => ({
            tool: (event.tool_name ?? 'unknown').trim().toLowerCase(),
            action: (event.action_canonical ?? event.action_raw ?? 'unknown').trim().toLowerCase()
        }))
        .filter((entry) => !ignoredTools.has(entry.tool));
}

function hasSubsequenceInOrder(source: string[], target: string[]): boolean {
    if (source.length === 0) {
        return true;
    }

    let sourceIndex = 0;
    for (const value of target) {
        if (value === source[sourceIndex]) {
            sourceIndex += 1;
            if (sourceIndex === source.length) {
                return true;
            }
        }
    }

    return false;
}

function compareToolOrder(
    scenario: ReplayScenario,
    baseline: ReplayTraceEvent[],
    candidate: ReplayTraceEvent[],
    check: ReplayCheckSpec,
    profile: ReplayComparatorProfile
): ReplayDrift[] {
    const baselineToolActions = getToolActions(baseline, profile);
    const candidateToolActions = getToolActions(candidate, profile);
    const baselineActions = baselineToolActions.map((entry) => entry.action);
    const candidateActions = candidateToolActions.map((entry) => entry.action);
    const strictOrder = typeof check.strict_order === 'boolean' ? check.strict_order : profile.tool_order.strict_default;

    if (strictOrder && baselineActions.join('>') !== candidateActions.join('>')) {
        return [
            {
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: 'Tool call order drift detected under strict ordering.',
                details: {
                    baseline_actions: baselineActions,
                    candidate_actions: candidateActions
                }
            }
        ];
    }

    if (!strictOrder && !hasSubsequenceInOrder(baselineActions, candidateActions)) {
        return [
            {
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: 'Tool call sequence drift detected (candidate does not preserve baseline action order).',
                details: {
                    baseline_actions: baselineActions,
                    candidate_actions: candidateActions
                }
            }
        ];
    }

    for (const action of baselineActions) {
        if (!candidateActions.includes(action)) {
            return [
                {
                    scenario_id: scenario.scenario_id,
                    check_id: check.id,
                    severity: check.severity,
                    message: `Candidate trace is missing required tool action '${action}'.`,
                    details: {
                        baseline_actions: baselineActions,
                        candidate_actions: candidateActions
                    }
                }
            ];
        }
    }

    const baselineActionCounts = new Map<string, number>();
    for (const action of baselineActions) {
        baselineActionCounts.set(action, (baselineActionCounts.get(action) ?? 0) + 1);
    }

    const candidateActionCounts = new Map<string, number>();
    for (const action of candidateActions) {
        candidateActionCounts.set(action, (candidateActionCounts.get(action) ?? 0) + 1);
    }

    const unexpectedExtras = Array.from(candidateActionCounts.entries())
        .filter(([action, count]) => count > (baselineActionCounts.get(action) ?? 0))
        .map(([action]) => action);

    if (unexpectedExtras.length > 0) {
        return [
            {
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: `Candidate trace contains unexpected extra tool actions: ${unexpectedExtras.join(', ')}.`,
                details: {
                    baseline_actions: baselineActions,
                    candidate_actions: candidateActions,
                    unexpected_actions: unexpectedExtras
                }
            }
        ];
    }

    return [];
}

function compareAuthorization(
    scenario: ReplayScenario,
    baseline: ReplayTraceEvent[],
    candidate: ReplayTraceEvent[],
    check: ReplayCheckSpec,
    profile: ReplayComparatorProfile
): ReplayDrift[] {
    const normalizeAuth = (events: ReplayTraceEvent[]) =>
        events
            .filter((event) => event.authorization)
            .map((event) => ({
                action: event.action_canonical ?? event.action_raw ?? event.event_type,
                outcome: event.authorization?.outcome,
                reason_class: event.authorization?.reason_class
            }));

    const baselineAuth = normalizeAuth(baseline);
    const candidateAuth = normalizeAuth(candidate);
    const drifts: ReplayDrift[] = [];

    for (let index = 0; index < Math.min(baselineAuth.length, candidateAuth.length); index += 1) {
        const b = baselineAuth[index];
        const c = candidateAuth[index];
        if (b.outcome !== c.outcome) {
            drifts.push({
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: `Authorization outcome drift at index ${index}.`,
                details: {
                    baseline: b,
                    candidate: c
                }
            });
        }

        if (profile.authorization.compare_reason_class && b.reason_class !== c.reason_class) {
            drifts.push({
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: `Authorization reason-class drift at index ${index}.`,
                details: {
                    baseline: b,
                    candidate: c
                }
            });
        }
    }

    if (baselineAuth.length !== candidateAuth.length) {
        drifts.push({
            scenario_id: scenario.scenario_id,
            check_id: check.id,
            severity: check.severity,
            message: 'Authorization event count drift detected.',
            details: {
                baseline_count: baselineAuth.length,
                candidate_count: candidateAuth.length
            }
        });
    }

    return drifts;
}

function hasOrderedEvents(events: ReplayTraceEvent[], requiredSequence: string[]): boolean {
    let cursor = 0;

    for (const event of events) {
        if (event.event_type === requiredSequence[cursor]) {
            cursor += 1;
            if (cursor === requiredSequence.length) {
                return true;
            }
        }
    }

    return requiredSequence.length === 0;
}

function toExpectedSurfaceSequence(check: ReplayCheckSpec): string[] {
    const fromExpected = typeof check.expected === 'string'
        ? [check.expected]
        : Array.isArray(check.expected)
            ? check.expected
            : [];

    const metadata = check.metadata as { expected_selected_surfaces?: unknown } | undefined;
    const fromMetadata = Array.isArray(metadata?.expected_selected_surfaces)
        ? metadata.expected_selected_surfaces
        : [];

    return [...fromExpected, ...fromMetadata]
        .filter((value): value is string => typeof value === 'string')
        .map((value) => value.trim().toLowerCase())
        .filter((value) => value.length > 0);
}

function compareFlow(
    scenario: ReplayScenario,
    candidate: ReplayTraceEvent[],
    check: ReplayCheckSpec,
    profile: ReplayComparatorProfile
): ReplayDrift[] {
    const drifts: ReplayDrift[] = [];

    if (profile.flow.require_handoff_before_complete) {
        const hasCompleteEvent = candidate.some((event) => event.event_type === 'complete');
        const flowOkay = hasOrderedEvents(candidate, ['handoff', 'complete']);
        if (hasCompleteEvent && !flowOkay) {
            drifts.push({
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: 'Expected handoff event before complete event was not observed.'
            });
        }
    }

    if (profile.flow.require_confirmation_before_gated_updates) {
        const updates = candidate.filter((event) => event.event_type === 'plan_step_update');
        const confirmations = candidate.filter((event) => event.event_type === 'confirmation');
        if (updates.length > 0 && confirmations.length === 0) {
            drifts.push({
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: 'medium',
                message: 'Plan step updates occurred without a confirmation event.'
            });
        }
    }

    const handoffTarget = profile.flow.required_handoff_target;
    const invalidHandoff = candidate.find(
        (event) => event.event_type === 'handoff' && event.payload?.to_agent !== handoffTarget
    );

    if (invalidHandoff) {
        drifts.push({
            scenario_id: scenario.scenario_id,
            check_id: check.id,
            severity: check.severity,
            message: `Unexpected handoff target '${String(invalidHandoff.payload?.to_agent)}'; expected '${handoffTarget}'.`,
            details: {
                observed_target: invalidHandoff.payload?.to_agent,
                expected_target: handoffTarget
            }
        });
    }

    const expectedSurfaceSequence = toExpectedSurfaceSequence(check);
    if (expectedSurfaceSequence.length > 0) {
        const observedSurfaceSequence = candidate
            .filter((event) => event.event_type === 'tool_call')
            .map((event) => {
                const selected = event.payload?.selected_terminal_surface;
                return typeof selected === 'string' ? selected.trim().toLowerCase() : undefined;
            })
            .filter((value): value is string => typeof value === 'string' && value.length > 0);

        const strictOrder = check.strict_order === true;
        const matched = strictOrder
            ? hasSubsequenceInOrder(expectedSurfaceSequence, observedSurfaceSequence)
            : expectedSurfaceSequence.every((surface) => observedSurfaceSequence.includes(surface));

        if (!matched) {
            drifts.push({
                scenario_id: scenario.scenario_id,
                check_id: check.id,
                severity: check.severity,
                message: strictOrder
                    ? 'Selected terminal surface order did not match expected flow sequence.'
                    : 'Expected selected terminal surfaces were not observed in flow events.',
                details: {
                    expected_selected_surfaces: expectedSurfaceSequence,
                    observed_selected_surfaces: observedSurfaceSequence
                }
            });
        }
    }

    return drifts;
}

function compareSuccessSignatures(
    scenario: ReplayScenario,
    candidate: ReplayTraceEvent[],
    check: ReplayCheckSpec,
    profile: ReplayComparatorProfile
): ReplayDrift[] {
    const observed = new Set(
        candidate
            .map((event) => event.success_signature)
            .filter((signature): signature is string => typeof signature === 'string' && signature.length > 0)
    );

    const requiredSignatures = scenario.expectations.success_signature.must_include;
    const missing = requiredSignatures.filter((signature) => !observed.has(signature));

    if (missing.length === 0) {
        return [];
    }

    return [
        {
            scenario_id: scenario.scenario_id,
            check_id: check.id,
            severity: check.severity,
            message: `Missing required success signatures: ${missing.join(', ')}`,
            details: {
                required: requiredSignatures,
                observed: Array.from(observed)
            }
        }
    ];
}

function compareAcceptanceThresholds(scenario: ReplayScenario, drifts: ReplayDrift[]): ReplayDrift[] {
    const thresholds = scenario.acceptance_thresholds;
    if (!thresholds) {
        return [];
    }

    const thresholdDrifts: ReplayDrift[] = [];
    const high = drifts.filter((drift) => drift.severity === 'high').length;
    const medium = drifts.filter((drift) => drift.severity === 'medium').length;
    const low = drifts.filter((drift) => drift.severity === 'low').length;
    const total = drifts.length;

    if (typeof thresholds.max_total_drifts === 'number' && total > thresholds.max_total_drifts) {
        thresholdDrifts.push({
            scenario_id: scenario.scenario_id,
            check_id: 'drift-threshold-total',
            severity: 'high',
            message: `Scenario exceeded max_total_drifts threshold (${total} > ${thresholds.max_total_drifts}).`,
            details: {
                observed_total: total,
                threshold: thresholds.max_total_drifts
            }
        });
    }

    if (typeof thresholds.max_high_severity_drifts === 'number' && high > thresholds.max_high_severity_drifts) {
        thresholdDrifts.push({
            scenario_id: scenario.scenario_id,
            check_id: 'drift-threshold-high',
            severity: 'high',
            message: `Scenario exceeded max_high_severity_drifts threshold (${high} > ${thresholds.max_high_severity_drifts}).`,
            details: {
                observed_high: high,
                threshold: thresholds.max_high_severity_drifts
            }
        });
    }

    if (typeof thresholds.max_medium_severity_drifts === 'number' && medium > thresholds.max_medium_severity_drifts) {
        thresholdDrifts.push({
            scenario_id: scenario.scenario_id,
            check_id: 'drift-threshold-medium',
            severity: 'medium',
            message: `Scenario exceeded max_medium_severity_drifts threshold (${medium} > ${thresholds.max_medium_severity_drifts}).`,
            details: {
                observed_medium: medium,
                threshold: thresholds.max_medium_severity_drifts
            }
        });
    }

    if (typeof thresholds.max_low_severity_drifts === 'number' && low > thresholds.max_low_severity_drifts) {
        thresholdDrifts.push({
            scenario_id: scenario.scenario_id,
            check_id: 'drift-threshold-low',
            severity: 'low',
            message: `Scenario exceeded max_low_severity_drifts threshold (${low} > ${thresholds.max_low_severity_drifts}).`,
            details: {
                observed_low: low,
                threshold: thresholds.max_low_severity_drifts
            }
        });
    }

    return thresholdDrifts;
}

function compareScenario(
    scenario: ReplayScenario,
    baselineArtifact: ReplayScenarioRunArtifact,
    candidateArtifact: ReplayScenarioRunArtifact,
    profile: ReplayComparatorProfile
): ReplayScenarioComparison {
    const drifts: ReplayDrift[] = [];
    const checks = scenario.expectations.checks;

    for (const check of checks) {
        if (check.type === 'tool_order') {
            drifts.push(
                ...compareToolOrder(
                    scenario,
                    baselineArtifact.normalized_events,
                    candidateArtifact.normalized_events,
                    check,
                    profile
                )
            );
            continue;
        }

        if (check.type === 'auth_outcome') {
            drifts.push(
                ...compareAuthorization(
                    scenario,
                    baselineArtifact.normalized_events,
                    candidateArtifact.normalized_events,
                    check,
                    profile
                )
            );
            continue;
        }

        if (check.type === 'flow') {
            drifts.push(...compareFlow(scenario, candidateArtifact.normalized_events, check, profile));
            continue;
        }

        if (check.type === 'success_signature') {
            drifts.push(...compareSuccessSignatures(scenario, candidateArtifact.normalized_events, check, profile));
        }
    }

    const enrichedDrifts = drifts.map((drift) => {
        const matchingCheck = checks.find((check) => check.id === drift.check_id);
        return enrichDrift(drift, matchingCheck, baselineArtifact, candidateArtifact);
    });

    const thresholdDrifts = compareAcceptanceThresholds(scenario, enrichedDrifts).map((drift) =>
        enrichDrift(drift, undefined, baselineArtifact, candidateArtifact)
    );
    const allDrifts = [...enrichedDrifts, ...thresholdDrifts];

    return {
        scenario_id: scenario.scenario_id,
        passed: allDrifts.length === 0,
        drifts: allDrifts,
        checks_executed: checks.map((check) => check.id),
        explainability_groups: buildExplainabilityGroups(allDrifts)
    };
}

export function compareReplayRuns(
    suite: ReplayScenario[],
    baselineArtifacts: ReplayProfileArtifacts,
    candidateArtifacts: ReplayProfileArtifacts,
    profile: ReplayComparatorProfile
): ReplayComparisonResult {
    const resolvedProfile = normalizeComparatorProfile(profile);
    const baselineByScenario = new Map(
        baselineArtifacts.scenarios.map((artifact) => [artifact.scenario_id, artifact] as const)
    );
    const candidateByScenario = new Map(
        candidateArtifacts.scenarios.map((artifact) => [artifact.scenario_id, artifact] as const)
    );

    const scenarioComparisons: ReplayScenarioComparison[] = [];

    for (const scenario of suite) {
        const baseline = baselineByScenario.get(scenario.scenario_id);
        const candidate = candidateByScenario.get(scenario.scenario_id);

        if (!baseline || !candidate) {
            scenarioComparisons.push({
                scenario_id: scenario.scenario_id,
                passed: false,
                checks_executed: [],
                drifts: [
                    {
                        scenario_id: scenario.scenario_id,
                        check_id: 'scenario-presence',
                        severity: 'high',
                        message: 'Baseline or candidate artifacts are missing for this scenario.',
                        details: {
                            baseline_found: Boolean(baseline),
                            candidate_found: Boolean(candidate)
                        }
                    }
                ]
            });
            continue;
        }

        scenarioComparisons.push(compareScenario(scenario, baseline, candidate, resolvedProfile));
    }

    const allDrifts = scenarioComparisons.flatMap((scenario) => scenario.drifts);

    const summary = {
        total_scenarios: scenarioComparisons.length,
        passed_scenarios: scenarioComparisons.filter((scenario) => scenario.passed).length,
        failed_scenarios: scenarioComparisons.filter((scenario) => !scenario.passed).length,
        high_severity_drifts: allDrifts.filter((drift) => drift.severity === 'high').length,
        medium_severity_drifts: allDrifts.filter((drift) => drift.severity === 'medium').length,
        low_severity_drifts: allDrifts.filter((drift) => drift.severity === 'low').length,
        explainability_rollup: buildExplainabilityRollup(allDrifts)
    };

    return {
        generated_at: new Date().toISOString(),
        profile_name: resolvedProfile.profile_name,
        passed: summary.failed_scenarios === 0 && summary.high_severity_drifts === 0,
        scenarios: scenarioComparisons,
        summary
    };
}
