export type ReplayRuntimeMode = 'headless' | 'interactive';

export type ReplayTerminalSurface = 'memory_terminal' | 'memory_terminal_interactive' | 'auto';

export type ReplayDeterminismLevel = 'strict' | 'moderate' | 'loose';

export interface ReplayWorkspaceRef {
    workspace_path: string;
    workspace_id: string;
}

export interface ReplayRuntimeConfig {
    mode: ReplayRuntimeMode;
    terminal_surface: ReplayTerminalSurface;
}

export interface ReplayNormalizationConfig {
    mask_ids?: boolean;
    canonicalize_timestamps?: boolean;
    canonicalize_paths?: boolean;
    strip_nondeterministic_text?: boolean;
}

export interface ReplayTimeoutConfig {
    run_timeout_ms?: number;
    step_timeout_ms?: number;
}

export interface ReplayScenarioTagMetadata {
    domain?: string;
    surface?: string;
    risk?: 'p0' | 'p1' | 'p2';
    priority?: 'high' | 'medium' | 'low';
}

export interface ReplayStabilizationControls {
    fixture_seed?: number;
    frozen_clock_delta_ms?: number;
    wait_budget_ms?: number;
    resolver_fixture_tree?: string;
}

export interface ReplayDriftAcceptanceThresholds {
    max_total_drifts?: number;
    max_high_severity_drifts?: number;
    max_medium_severity_drifts?: number;
    max_low_severity_drifts?: number;
}

export interface ReplayScenarioStep {
    kind: 'user' | 'tool' | 'wait';
    id?: string;
    prompt?: string;
    tool?: string;
    action?: string;
    args?: Record<string, unknown>;
    wait_ms?: number;
    expect_auth?: ReplayAuthOutcome;
    metadata?: Record<string, unknown>;
}

export interface ReplayCheckSpec {
    id: string;
    type: 'tool_order' | 'auth_outcome' | 'flow' | 'success_signature';
    severity: ReplayDriftSeverity;
    required?: boolean;
    strict_order?: boolean;
    expected?: string | string[];
    metadata?: Record<string, unknown>;
}

export interface ReplaySuccessSignature {
    must_include: string[];
    allow_missing?: string[];
}

export interface ReplayExpectations {
    success_signature: ReplaySuccessSignature;
    checks: ReplayCheckSpec[];
}

export interface ReplayScenario {
    schema_version: string;
    scenario_id: string;
    title: string;
    intent: string;
    driver: 'copilot-sdk';
    workspace: ReplayWorkspaceRef;
    runtime: ReplayRuntimeConfig;
    steps: ReplayScenarioStep[];
    expectations: ReplayExpectations;
    tags?: string[];
    tag_metadata?: ReplayScenarioTagMetadata;
    scenario_digest?: string;
    stabilization?: ReplayStabilizationControls;
    acceptance_thresholds?: ReplayDriftAcceptanceThresholds;
    source_refs?: string[];
    determinism?: ReplayDeterminismLevel;
    timeouts?: ReplayTimeoutConfig;
    normalization?: ReplayNormalizationConfig;
    metadata?: Record<string, unknown>;
}

export interface ReplayScenarioSuite {
    schema_version: string;
    scenarios: ReplayScenario[];
}

export type ReplayProfileName = 'baseline' | 'candidate';

export type ReplayGoldenStoreVersion = 'v1';

export interface ReplayGoldenBaselineArtifactMetadata {
    profile: 'baseline';
    normalized_artifact_file: string;
    scenario_count: number;
    scenario_ids: string[];
}

export interface ReplayGoldenBaselineMetadata {
    schema_version: 'replay-golden-baseline-metadata.v1';
    store_version: ReplayGoldenStoreVersion;
    baseline_id: string;
    promoted_at: string;
    source_candidate_file: string;
    artifact: ReplayGoldenBaselineArtifactMetadata;
}

export type ReplayAuthOutcome = 'allowed' | 'allowed_with_warning' | 'blocked';

export interface ReplayAuthorizationResult {
    outcome: ReplayAuthOutcome;
    reason_class?: string;
}

export interface ReplayTraceEvent {
    event_type: string;
    timestamp_ms: number;
    scenario_id: string;
    step_id?: string;
    tool_name?: string;
    action_raw?: string;
    action_canonical?: string;
    authorization?: ReplayAuthorizationResult;
    phase?: string;
    success_signature?: string;
    payload?: Record<string, unknown>;
}

export interface ReplayScenarioRunArtifact {
    scenario_id: string;
    profile: ReplayProfileName;
    raw_events: ReplayTraceEvent[];
    normalized_events: ReplayTraceEvent[];
    success: boolean;
}

export interface ReplayProfileArtifacts {
    profile: ReplayProfileName;
    scenarios: ReplayScenarioRunArtifact[];
}

export interface ReplayRawTraceEventEnvelope {
    run_id: string;
    profile: ReplayProfileName;
    scenario_id: string;
    event: ReplayTraceEvent;
}

export type ReplayDriftSeverity = 'low' | 'medium' | 'high';

export interface ReplayDrift {
    scenario_id: string;
    check_id: string;
    severity: ReplayDriftSeverity;
    message: string;
    details?: Record<string, unknown>;
    category?: ReplayExplainabilityCategory;
    confidence?: ReplayExplainabilityConfidence;
    operator_bucket?: ReplayOperatorBucket;
    remediation?: ReplayDriftRemediation;
    evidence?: ReplayDriftEvidence;
}

export interface ReplayScenarioComparison {
    scenario_id: string;
    passed: boolean;
    drifts: ReplayDrift[];
    checks_executed: string[];
    explainability_groups?: ReplayExplainabilityGroupSummary[];
}

export interface ReplayComparisonSummary {
    total_scenarios: number;
    passed_scenarios: number;
    failed_scenarios: number;
    high_severity_drifts: number;
    medium_severity_drifts: number;
    low_severity_drifts: number;
    explainability_rollup?: ReplayExplainabilityRollup;
}

export type ReplayExplainabilityCategory =
    'flow_protocol' |
    'authorization_policy' |
    'tool_sequence' |
    'success_signature' |
    'artifact_integrity';

export type ReplayExplainabilityConfidence = 'high' | 'medium' | 'low';

export type ReplayOperatorBucket = 'blocker' | 'actionable' | 'monitor';

export interface ReplayDriftRemediation {
    likely_causes?: string[];
    recommended_actions?: string[];
    verification_steps?: string[];
}

export interface ReplayDriftEvidence {
    baseline_event_indexes?: number[];
    candidate_event_indexes?: number[];
    artifact_refs?: string[];
    fingerprint?: string;
}

export interface ReplayExplainabilityGroupSummary {
    category: ReplayExplainabilityCategory;
    total_drifts: number;
    high_confidence?: number;
    medium_confidence?: number;
    low_confidence?: number;
    blocker_bucket?: number;
    actionable_bucket?: number;
    monitor_bucket?: number;
}

export interface ReplayExplainabilityRollup {
    total_explained_drifts?: number;
    by_category?: Partial<Record<ReplayExplainabilityCategory, number>>;
    by_confidence?: Partial<Record<ReplayExplainabilityConfidence, number>>;
    by_operator_bucket?: Partial<Record<ReplayOperatorBucket, number>>;
}

export interface ReplayComparisonResult {
    generated_at: string;
    profile_name: string;
    passed: boolean;
    scenarios: ReplayScenarioComparison[];
    summary: ReplayComparisonSummary;
}

export type ReplayGateMode = 'strict' | 'warn' | 'info';

export interface ReplayGateAnnotation {
    level: 'error' | 'warning' | 'notice';
    scenario_id: string;
    check_id: string;
    severity: ReplayDriftSeverity;
    message: string;
    evidence_refs?: string[];
    evidence_fingerprint?: string;
}

export interface ReplayGateEvaluation {
    mode: ReplayGateMode;
    passed: boolean;
    status: 'PASS' | 'FAIL' | 'WARN' | 'INFO';
    reason: string;
    classification: 'clean' | 'deterministic_regression' | 'intermittent_flake';
    triage_labels: string[];
    retried: boolean;
    annotations: ReplayGateAnnotation[];
    summary: ReplayComparisonSummary;
    explainability_rollup?: ReplayExplainabilityRollup;
    generated_at: string;
}

export interface ReplayComparatorProfile {
    profile_name: string;
    tool_order: {
        strict_default: boolean;
        ignore_optional_tools: string[];
    };
    authorization: {
        compare_reason_class: boolean;
    };
    flow: {
        require_handoff_before_complete: boolean;
        require_confirmation_before_gated_updates: boolean;
        required_handoff_target: string;
    };
    success_signatures: {
        require_all: boolean;
    };
}

export interface ReplayManifest {
    run_id: string;
    created_at: string;
    scenario_count: number;
    output_dir: string;
    baseline_artifact_file: string;
    candidate_artifact_file: string;
    baseline_raw_artifact_file?: string;
    candidate_raw_artifact_file?: string;
    baseline_normalized_artifact_file?: string;
    candidate_normalized_artifact_file?: string;
    artifact_envelope?: {
        baseline: {
            raw_file: string;
            normalized_file: string;
            scenario_count: number;
        };
        candidate: {
            raw_file: string;
            normalized_file: string;
            scenario_count: number;
        };
    };
    determinism_env?: {
        node_version: string;
        tz: string;
        locale: string;
    };
}

export interface ReplayFlakeControlConfig {
    retry_once?: boolean;
}

export type ReplayRiskTier = 'p0' | 'p1' | 'p2';

export interface ReplayMatrixModelVariant {
    model_id: string;
    label?: string;
    metadata?: Record<string, unknown>;
}

export interface ReplayMatrixComparatorProfileVariant {
    profile_id: string;
    profile_path: string;
}

export interface ReplayMatrixScenarioSlice {
    slice_id: string;
    tags: string[];
    match?: 'any' | 'all';
    risk_tier: ReplayRiskTier;
}

export interface ReplayMatrixNormalizationProfile {
    normalization_id: string;
    config: ReplayNormalizationConfig;
}

export interface ReplayMatrixDeterminismControls {
    fixed_tz: string;
    fixed_locale: string;
    normalization_required: boolean;
    retry_once_classification: boolean;
    fingerprint_stability_check: boolean;
}

export interface ReplayMatrixRiskTierPolicy {
    max_high_severity_drifts?: number;
    max_medium_severity_drifts?: number;
    max_low_severity_drifts?: number;
}

export interface ReplayMatrixRiskTierPolicies {
    p0?: ReplayMatrixRiskTierPolicy;
    p1?: ReplayMatrixRiskTierPolicy;
    p2?: ReplayMatrixRiskTierPolicy;
}

export interface ReplayMatrixAxes {
    model_variants: ReplayMatrixModelVariant[];
    comparator_profiles: ReplayMatrixComparatorProfileVariant[];
    scenario_tag_slices: ReplayMatrixScenarioSlice[];
    execution_surfaces: ReplayTerminalSurface[];
    gate_modes: ReplayGateMode[];
    normalization_profiles: ReplayMatrixNormalizationProfile[];
}

export interface ReplayMatrixRunContract {
    schema_version: 'replay-matrix-run-contract.v1';
    matrix_id: string;
    title?: string;
    run_metadata?: Record<string, unknown>;
    axes: ReplayMatrixAxes;
    controls: {
        determinism: ReplayMatrixDeterminismControls;
        risk_tiers?: ReplayMatrixRiskTierPolicies;
    };
}

export interface ReplayMatrixCellAxes {
    model_variant: ReplayMatrixModelVariant;
    comparator_profile: ReplayMatrixComparatorProfileVariant;
    scenario_slice: ReplayMatrixScenarioSlice;
    execution_surface: ReplayTerminalSurface;
    gate_mode: ReplayGateMode;
    normalization_profile: ReplayMatrixNormalizationProfile;
}

export interface ReplayMatrixCellDefinition {
    cell_id: string;
    axes: ReplayMatrixCellAxes;
}

export interface ReplayMatrixCellScore {
    wds: number;
    spr: number;
    eci: number;
    bbr: number;
    cms: number;
    flake_penalty: number;
    deterministic_regression: boolean;
}

export interface ReplayMatrixCellResult {
    cell_id: string;
    scenario_ids: string[];
    axes: ReplayMatrixCellAxes;
    comparison: ReplayComparisonResult;
    gate: ReplayGateEvaluation;
    score: ReplayMatrixCellScore;
    promotable: boolean;
}

export interface ReplayMatrixAxisRollupItem {
    axis: 'model_variant' | 'comparator_profile' | 'scenario_slice' | 'execution_surface' | 'gate_mode' | 'normalization_profile';
    axis_value: string;
    cell_count: number;
    average_cms: number;
    average_wds: number;
    average_spr: number;
    promotable_cells: number;
}

export interface ReplayMatrixRiskTierSummary {
    risk_tier: ReplayRiskTier;
    cell_count: number;
    promotable_cells: number;
    deterministic_regressions: number;
}

export interface ReplayMatrixReport {
    matrix_id: string;
    generated_at: string;
    run_label: string;
    total_cells: number;
    promotable_cells: number;
    deterministic_regressions: number;
    cells: ReplayMatrixCellResult[];
    axis_rollups: ReplayMatrixAxisRollupItem[];
    risk_tier_summary: ReplayMatrixRiskTierSummary[];
}
