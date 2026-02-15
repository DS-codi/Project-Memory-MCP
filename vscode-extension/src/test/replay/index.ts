export { loadScenarioSuite, parseScenarioSuite } from './core/ScenarioSchema';
export { normalizeTraceEvents, projectTraceForComparison } from './core/Normalize';
export { ReplayOrchestrator } from './core/ReplayOrchestrator';
export { captureScenarioArtifact, createRawTraceEventEnvelopes } from './core/TraceCapture';
export { compareReplayRuns } from './core/Comparator';
export { evaluateReplayGate, evaluateReplayGateWithRetry, renderReplayGateSummaryMarkdown, toGitHubAnnotations } from './core/GateEvaluator';
export { loadReplayMatrixRunContract, parseReplayMatrixRunContract, expandReplayMatrixCells } from './core/MatrixContract';
export { runReplayMatrix } from './core/MatrixRunner';
export { scoreReplayMatrixCell, evaluateReplayMatrixPromotable, buildReplayMatrixReport } from './core/MatrixScoring';
export { resolveGoldenBaselineLocation, readGoldenBaseline, writeGoldenBaseline } from './core/GoldenBaselineStore';
export { promoteBaseline, summarizePromotionDiff } from './core/BaselinePromotion';
export { resolveReplayArtifact } from './core/MigrationResolver';
export { renderReplayReportMarkdown, writeReplayReport } from './core/ReportWriter';
export type {
    ReplayComparatorProfile,
    ReplayComparisonResult,
    ReplayGateEvaluation,
    ReplayGateMode,
    ReplayMatrixRunContract,
    ReplayMatrixCellResult,
    ReplayMatrixCellScore,
    ReplayMatrixReport,
    ReplayGoldenBaselineMetadata,
    ReplayGoldenStoreVersion,
    ReplayScenario,
    ReplayScenarioSuite,
    ReplayTraceEvent
} from './core/types';
