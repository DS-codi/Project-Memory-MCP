import * as fs from 'fs/promises';
import * as path from 'path';
import { compareReplayRuns } from '../core/Comparator';
import { promoteBaseline } from '../core/BaselinePromotion';
import { resolveReplayArtifact } from '../core/MigrationResolver';
import {
    evaluateReplayGate,
    evaluateReplayGateWithRetry,
    renderReplayGateSummaryMarkdown,
    toGitHubAnnotations
} from '../core/GateEvaluator';
import { loadReplayMatrixRunContract } from '../core/MatrixContract';
import { runReplayMatrix } from '../core/MatrixRunner';
import { ReplayOrchestrator } from '../core/ReplayOrchestrator';
import { loadScenarioSuite } from '../core/ScenarioSchema';
import { renderReplayReportMarkdown, writeReplayReport } from '../core/ReportWriter';
import { type ReplayComparatorProfile, type ReplayGateMode, type ReplayProfileArtifacts, type ReplayScenario } from '../core/types';
import { stableStringify, toWorkspaceRelativePath } from '../core/StableJson';

interface CliOptions {
    command: string;
    scenariosPath: string;
    profilePath: string;
    outputDir: string;
    label: string;
    workspacePath?: string;
    scenarioFilter?: string[];
    tagFilter?: string[];
    shardIndex?: number;
    shardCount?: number;
    captureProfile?: 'baseline' | 'candidate';
    baselineFile?: string;
    candidateFile?: string;
    comparisonFile?: string;
    baselineId: string;
    goldensRoot: string;
    gateMode: ReplayGateMode;
    gateOutput?: string;
    emitGithubAnnotations: boolean;
    retryOnce: boolean;
    legacyRunsRoot: string;
    legacyRunDir?: string;
    apply: boolean;
    approve: boolean;
    force: boolean;
    matrixContractPath?: string;
}

function resolveManifestOutputDir(manifestOutputDir: string, workspacePath?: string): string {
    if (path.isAbsolute(manifestOutputDir)) {
        return manifestOutputDir;
    }

    const basePath = workspacePath ? path.resolve(workspacePath) : process.cwd();
    return path.resolve(basePath, manifestOutputDir);
}

function parseArgs(argv: string[]): CliOptions {
    const command = argv[2] ?? 'run';
    const options = new Map<string, string[]>();

    for (let index = 3; index < argv.length; index += 1) {
        const token = argv[index];
        if (!token.startsWith('--')) {
            continue;
        }

        const key = token.slice(2);
        const next = argv[index + 1];
        if (!next || next.startsWith('--')) {
            options.set(key, ['true']);
            continue;
        }

        const values = options.get(key) ?? [];
        values.push(next);
        options.set(key, values);
        index += 1;
    }

    const scenariosPath = options.get('scenarios')?.[0] ?? path.resolve(__dirname, '../scenarios/baseline-scenarios.v1.json');
    const profilePath = options.get('profile')?.[0] ?? path.resolve(__dirname, '../config/default.profile.json');
    const outputDir = options.get('out')?.[0] ?? path.resolve(process.cwd(), '.replay-runs');
    const label = options.get('label')?.[0] ?? 'replay';

    const scenarioFilter = options.get('scenario');
    const tagFilter = options.get('tag')?.map((tag) => tag.trim().toLowerCase()).filter((tag) => tag.length > 0);
    const shardIndexRaw = options.get('shard-index')?.[0];
    const shardCountRaw = options.get('shard-count')?.[0];
    const shardIndex = typeof shardIndexRaw === 'string' ? Number.parseInt(shardIndexRaw, 10) : undefined;
    const shardCount = typeof shardCountRaw === 'string' ? Number.parseInt(shardCountRaw, 10) : undefined;
    const captureProfileToken = options.get('capture-profile')?.[0];
    const captureProfile =
        captureProfileToken === 'baseline' || captureProfileToken === 'candidate' ? captureProfileToken : undefined;
    const parseBooleanOption = (key: string): boolean => {
        const value = options.get(key)?.[0];
        return value === 'true';
    };
    const gateModeToken = (options.get('gate-mode')?.[0] ?? 'warn').trim().toLowerCase();
    const gateMode: ReplayGateMode =
        gateModeToken === 'strict' || gateModeToken === 'warn' || gateModeToken === 'info' ? gateModeToken : 'warn';

    return {
        command,
        scenariosPath,
        profilePath,
        outputDir,
        label,
        workspacePath: options.get('workspace-path')?.[0],
        scenarioFilter,
        tagFilter,
        shardIndex: Number.isFinite(shardIndex) ? shardIndex : undefined,
        shardCount: Number.isFinite(shardCount) ? shardCount : undefined,
        captureProfile,
        baselineFile: options.get('baseline')?.[0],
        candidateFile: options.get('candidate')?.[0],
        comparisonFile: options.get('comparison')?.[0],
        baselineId: options.get('baseline-id')?.[0] ?? 'default',
        goldensRoot: options.get('goldens-root')?.[0] ?? path.resolve(__dirname, '../goldens'),
        gateMode,
        gateOutput: options.get('gate-output')?.[0],
        emitGithubAnnotations: parseBooleanOption('emit-github-annotations'),
        retryOnce: parseBooleanOption('retry-once'),
        legacyRunsRoot: options.get('legacy-runs-root')?.[0] ?? outputDir,
        legacyRunDir: options.get('legacy-run-dir')?.[0],
        apply: parseBooleanOption('apply'),
        approve: parseBooleanOption('approve'),
        force: parseBooleanOption('force'),
        matrixContractPath: options.get('matrix-contract')?.[0]
    };
}

function filterScenariosByTags(scenarios: ReplayScenario[], tags?: string[]): ReplayScenario[] {
    if (!tags || tags.length === 0) {
        return scenarios;
    }

    const required = new Set(tags.map((tag) => tag.toLowerCase()));
    return scenarios.filter((scenario) => {
        const scenarioTags = new Set((scenario.tags ?? []).map((tag) => tag.toLowerCase()));
        for (const tag of required) {
            if (scenarioTags.has(tag)) {
                return true;
            }
        }
        return false;
    });
}

function shardScenarios(scenarios: ReplayScenario[], shardIndex?: number, shardCount?: number): ReplayScenario[] {
    if (typeof shardIndex !== 'number' || typeof shardCount !== 'number') {
        return scenarios;
    }

    if (!Number.isInteger(shardIndex) || !Number.isInteger(shardCount) || shardCount <= 0 || shardIndex < 0 || shardIndex >= shardCount) {
        throw new Error(`Invalid shard arguments: shard-index=${String(shardIndex)}, shard-count=${String(shardCount)}.`);
    }

    const ordered = [...scenarios].sort((left, right) => left.scenario_id.localeCompare(right.scenario_id));
    return ordered.filter((_, index) => index % shardCount === shardIndex);
}

function selectScenarios(scenarios: ReplayScenario[], options: CliOptions): ReplayScenario[] {
    const byId = filterScenarios(scenarios, options.scenarioFilter);
    const byTag = filterScenariosByTags(byId, options.tagFilter);
    return shardScenarios(byTag, options.shardIndex, options.shardCount);
}

async function writeGateSummaryArtifacts(
    outputDir: string,
    gateOutputOption: string | undefined,
    markdown: string,
    payload: unknown,
    workspacePath?: string
): Promise<{ summary_file: string; markdown_file: string }> {
    const resolvedOutputDir = path.resolve(outputDir);
    await fs.mkdir(resolvedOutputDir, { recursive: true });

    const summaryJsonPath = gateOutputOption
        ? path.resolve(gateOutputOption)
        : path.join(resolvedOutputDir, 'gate-summary.json');
    const gateMarkdownPath = path.join(resolvedOutputDir, 'gate-summary.md');

    await fs.mkdir(path.dirname(summaryJsonPath), { recursive: true });
    await fs.writeFile(summaryJsonPath, `${stableStringify(payload)}\n`, 'utf8');
    await fs.writeFile(gateMarkdownPath, `${markdown}\n`, 'utf8');

    return {
        summary_file: toWorkspaceRelativePath(summaryJsonPath, workspacePath),
        markdown_file: toWorkspaceRelativePath(gateMarkdownPath, workspacePath)
    };
}

async function loadProfile(profilePath: string): Promise<ReplayComparatorProfile> {
    const raw = await fs.readFile(path.resolve(profilePath), 'utf8');
    const parsed = JSON.parse(raw) as ReplayComparatorProfile;

    return parsed;
}

function filterScenarios(scenarios: ReplayScenario[], ids?: string[]): ReplayScenario[] {
    if (!ids || ids.length === 0) {
        return scenarios;
    }

    const requested = new Set(ids.map((value) => value.trim().toUpperCase()));
    return scenarios.filter((scenario) => requested.has(scenario.scenario_id));
}

async function readArtifacts(filePath: string): Promise<ReplayProfileArtifacts> {
    const raw = await fs.readFile(path.resolve(filePath), 'utf8');
    return JSON.parse(raw) as ReplayProfileArtifacts;
}

async function runCommand(options: CliOptions): Promise<void> {
    const suite = await loadScenarioSuite(options.scenariosPath);
    const profile = await loadProfile(options.profilePath);
    const scenarios = selectScenarios(suite.scenarios, options);

    if (scenarios.length === 0) {
        throw new Error('No scenarios matched the provided scenario/tag/shard filters.');
    }

    const orchestrator = new ReplayOrchestrator({ output_root: options.outputDir });
    const result = await orchestrator.run(scenarios, options.label, options.workspacePath);
    const resolvedManifestOutputDir = resolveManifestOutputDir(result.manifest.output_dir, options.workspacePath);
    const comparison = compareReplayRuns(scenarios, result.baseline, result.candidate, profile);
    let retryComparison;
    if (options.retryOnce && (!comparison.passed || comparison.summary.high_severity_drifts > 0)) {
        const retryResult = await orchestrator.run(scenarios, `${options.label}-retry`, options.workspacePath);
        retryComparison = compareReplayRuns(scenarios, retryResult.baseline, retryResult.candidate, profile);
    }
    const report = await writeReplayReport(resolvedManifestOutputDir, comparison, options.workspacePath);
    const gate = evaluateReplayGateWithRetry(comparison, retryComparison, options.gateMode);
    const gateSummaryMarkdown = renderReplayGateSummaryMarkdown(gate);
    const gateArtifacts = await writeGateSummaryArtifacts(resolvedManifestOutputDir, options.gateOutput, gateSummaryMarkdown, {
        gate,
        explainability_rollup: gate.explainability_rollup,
        report,
        flake_controls: {
            retry_once_enabled: options.retryOnce,
            retry_performed: retryComparison !== undefined,
            retry_summary: retryComparison?.summary
        }
    }, options.workspacePath);

    process.stdout.write(`Replay run complete.\n`);
    process.stdout.write(`Manifest: ${path.join(resolvedManifestOutputDir, 'manifest.json')}\n`);
    process.stdout.write(`Comparison: ${report.comparison_json}\n`);
    process.stdout.write(`Markdown report: ${report.report_markdown}\n`);
    process.stdout.write(`${gateSummaryMarkdown}\n`);
    process.stdout.write(`Gate summary JSON: ${gateArtifacts.summary_file}\n`);
    process.stdout.write(`Gate summary Markdown: ${gateArtifacts.markdown_file}\n`);

    if (options.emitGithubAnnotations) {
        for (const line of toGitHubAnnotations(gate)) {
            process.stdout.write(`${line}\n`);
        }
    }

    const githubStepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (githubStepSummaryPath) {
        await fs.appendFile(githubStepSummaryPath, `${gateSummaryMarkdown}\n\n`, 'utf8');
    }

    if (!gate.passed) {
        process.exitCode = 1;
    }
}

async function captureCommand(options: CliOptions): Promise<void> {
    const suite = await loadScenarioSuite(options.scenariosPath);
    const scenarios = selectScenarios(suite.scenarios, options);
    const profileName = options.captureProfile ?? 'baseline';

    if (scenarios.length === 0) {
        throw new Error('No scenarios matched the provided scenario/tag/shard filters.');
    }

    const orchestrator = new ReplayOrchestrator({ output_root: options.outputDir });
    const result = await orchestrator.capture(profileName, scenarios, options.label, options.workspacePath);

    process.stdout.write(`Capture complete (${profileName}).\n`);
    process.stdout.write(`Artifact: ${result.output_file}\n`);
    process.stdout.write(`Raw artifact: ${result.raw_output_file}\n`);
}

async function compareCommand(options: CliOptions): Promise<void> {
    const resolvedBaseline = await resolveReplayArtifact({
        kind: 'baseline',
        explicit_file: options.baselineFile,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        legacy_runs_root: options.legacyRunsRoot,
        legacy_run_dir: options.legacyRunDir
    });
    const resolvedCandidate = await resolveReplayArtifact({
        kind: 'candidate',
        explicit_file: options.candidateFile,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        legacy_runs_root: options.legacyRunsRoot,
        legacy_run_dir: options.legacyRunDir
    });

    if (!resolvedBaseline || !resolvedCandidate) {
        throw new Error(
            'compare command could not resolve artifacts. Provide --baseline and --candidate, or use --baseline-id plus --legacy-runs-root/--legacy-run-dir for legacy replay outputs.'
        );
    }

    const suite = await loadScenarioSuite(options.scenariosPath);
    const profile = await loadProfile(options.profilePath);
    const scenarios = selectScenarios(suite.scenarios, options);

    if (scenarios.length === 0) {
        throw new Error('No scenarios matched the provided scenario/tag/shard filters.');
    }
    const baseline = await readArtifacts(resolvedBaseline.file);
    const candidate = await readArtifacts(resolvedCandidate.file);

    const comparison = compareReplayRuns(scenarios, baseline, candidate, profile);
    const outputDir = path.resolve(options.outputDir, `${options.label}-${Date.now()}`);
    const report = await writeReplayReport(outputDir, comparison, options.workspacePath);
    const gate = evaluateReplayGate(comparison, options.gateMode);
    const gateSummaryMarkdown = renderReplayGateSummaryMarkdown(gate);
    const gateArtifacts = await writeGateSummaryArtifacts(outputDir, options.gateOutput, gateSummaryMarkdown, {
        gate,
        explainability_rollup: gate.explainability_rollup,
        report
    }, options.workspacePath);

    process.stdout.write(`Comparison complete.\n`);
    process.stdout.write(`Resolved baseline (${resolvedBaseline.source}): ${resolvedBaseline.file}\n`);
    process.stdout.write(`Resolved candidate (${resolvedCandidate.source}): ${resolvedCandidate.file}\n`);
    process.stdout.write(`Comparison: ${report.comparison_json}\n`);
    process.stdout.write(`Markdown report: ${report.report_markdown}\n`);
    process.stdout.write(`${gateSummaryMarkdown}\n`);
    process.stdout.write(`Gate summary JSON: ${gateArtifacts.summary_file}\n`);
    process.stdout.write(`Gate summary Markdown: ${gateArtifacts.markdown_file}\n`);

    if (options.emitGithubAnnotations) {
        for (const line of toGitHubAnnotations(gate)) {
            process.stdout.write(`${line}\n`);
        }
    }

    const githubStepSummaryPath = process.env.GITHUB_STEP_SUMMARY;
    if (githubStepSummaryPath) {
        await fs.appendFile(githubStepSummaryPath, `${gateSummaryMarkdown}\n\n`, 'utf8');
    }

    if (!gate.passed) {
        process.exitCode = 1;
    }
}

async function reportCommand(options: CliOptions): Promise<void> {
    if (!options.comparisonFile) {
        throw new Error('report command requires --comparison <comparison.json>.');
    }

    const raw = await fs.readFile(path.resolve(options.comparisonFile), 'utf8');
    const comparison = JSON.parse(raw) as ReturnType<typeof JSON.parse>;
    const markdown = renderReplayReportMarkdown(comparison as Parameters<typeof renderReplayReportMarkdown>[0]);

    const outputDir = path.resolve(options.outputDir, `${options.label}-${Date.now()}`);
    await fs.mkdir(outputDir, { recursive: true });
    const reportPath = path.join(outputDir, 'report.md');
    await fs.writeFile(reportPath, `${markdown}\n`, 'utf8');

    process.stdout.write(`Report rendered: ${reportPath}\n`);
}

async function runMatrixCommand(options: CliOptions): Promise<void> {
    if (!options.matrixContractPath) {
        throw new Error('run-matrix command requires --matrix-contract <matrix-contract.json>.');
    }

    const contract = await loadReplayMatrixRunContract(options.matrixContractPath);
    const suite = await loadScenarioSuite(options.scenariosPath);
    const scenarios = selectScenarios(suite.scenarios, options);
    if (scenarios.length === 0) {
        throw new Error('No scenarios matched the provided scenario/tag/shard filters.');
    }

    const comparatorProfiles: Record<string, ReplayComparatorProfile> = {};
    for (const profileRef of contract.axes.comparator_profiles) {
        const profilePath = path.isAbsolute(profileRef.profile_path)
            ? profileRef.profile_path
            : path.resolve(path.dirname(path.resolve(options.matrixContractPath)), profileRef.profile_path);
        comparatorProfiles[profileRef.profile_id] = await loadProfile(profilePath);
    }

    const output = await runReplayMatrix({
        output_root: options.outputDir,
        workspace_path: options.workspacePath,
        run_label: options.label,
        contract,
        scenarios,
        comparator_profiles: comparatorProfiles
    });

    process.stdout.write('Replay matrix run complete.\n');
    process.stdout.write(`Matrix ID: ${output.report.matrix_id}\n`);
    process.stdout.write(`Total cells: ${output.report.total_cells}\n`);
    process.stdout.write(`Promotable cells: ${output.report.promotable_cells}\n`);
    process.stdout.write(`Deterministic regressions: ${output.report.deterministic_regressions}\n`);
    process.stdout.write(`Matrix report JSON: ${output.output_file}\n`);
    process.stdout.write(`Matrix report Markdown: ${output.markdown_file}\n`);
}

async function listScenariosCommand(options: CliOptions): Promise<void> {
    const suite = await loadScenarioSuite(options.scenariosPath);
    const scenarios = selectScenarios(suite.scenarios, options);

    for (const scenario of scenarios) {
        const tags = scenario.tags && scenario.tags.length > 0 ? ` [${scenario.tags.join(', ')}]` : '';
        process.stdout.write(`${scenario.scenario_id}: ${scenario.title}${tags}\n`);
    }
}

async function promoteBaselineCommand(options: CliOptions): Promise<void> {
    const resolvedBaselineForPromotion = await resolveReplayArtifact({
        kind: 'baseline',
        explicit_file: options.candidateFile,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        legacy_runs_root: options.legacyRunsRoot,
        legacy_run_dir: options.legacyRunDir
    });

    if (!resolvedBaselineForPromotion) {
        throw new Error(
            'promote-baseline command requires --candidate <baseline.norm.json>, or legacy run artifacts resolvable via --legacy-runs-root/--legacy-run-dir.'
        );
    }

    const result = await promoteBaseline({
        candidate_file: resolvedBaselineForPromotion.file,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        apply: options.apply,
        approve: options.approve,
        force: options.force
    });

    process.stdout.write(`Baseline id: ${result.summary.baseline_id}\n`);
    process.stdout.write(`Resolved source (${resolvedBaselineForPromotion.source}): ${resolvedBaselineForPromotion.file}\n`);
    process.stdout.write(`Store location: ${result.location.baseline_dir}\n`);
    process.stdout.write(`Existing baseline: ${result.summary.has_existing_baseline ? 'yes' : 'no'}\n`);
    process.stdout.write(`Candidate scenarios: ${result.summary.total_candidate_scenarios}\n`);
    process.stdout.write(`Added scenarios: ${result.summary.added_scenarios.length}\n`);
    process.stdout.write(`Removed scenarios: ${result.summary.removed_scenarios.length}\n`);
    process.stdout.write(`Changed scenarios: ${result.summary.changed_scenarios.length}\n`);
    process.stdout.write(`Unchanged scenarios: ${result.summary.unchanged_scenarios.length}\n`);

    if (!result.applied) {
        process.stdout.write(`Promotion not applied: ${result.guard_reason ?? 'guarded write path not satisfied'}\n`);
        if (options.apply) {
            process.exitCode = 1;
        }
        return;
    }

    process.stdout.write(`Promotion applied.\n`);
    process.stdout.write(`Baseline artifact: ${result.baseline_artifact_file}\n`);
    process.stdout.write(`Metadata: ${result.metadata_file}\n`);
}

async function migrateLegacyRunsCommand(options: CliOptions): Promise<void> {
    const resolvedLegacyBaseline = await resolveReplayArtifact({
        kind: 'baseline',
        explicit_file: options.candidateFile,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        legacy_runs_root: options.legacyRunsRoot,
        legacy_run_dir: options.legacyRunDir
    });

    if (!resolvedLegacyBaseline || resolvedLegacyBaseline.source === 'golden_v1') {
        throw new Error(
            'migrate-legacy-runs requires a legacy baseline artifact. Provide --candidate or --legacy-runs-root/--legacy-run-dir pointing to historical replay run output.'
        );
    }

    const result = await promoteBaseline({
        candidate_file: resolvedLegacyBaseline.file,
        goldens_root: options.goldensRoot,
        baseline_id: options.baselineId,
        apply: options.apply,
        approve: options.approve,
        force: options.force
    });

    process.stdout.write(`Legacy migration baseline id: ${result.summary.baseline_id}\n`);
    process.stdout.write(`Resolved legacy source (${resolvedLegacyBaseline.source}): ${resolvedLegacyBaseline.file}\n`);
    if (resolvedLegacyBaseline.legacy_run_dir) {
        process.stdout.write(`Legacy run directory: ${resolvedLegacyBaseline.legacy_run_dir}\n`);
    }
    process.stdout.write(`Store location: ${result.location.baseline_dir}\n`);

    if (!result.applied) {
        process.stdout.write(`Migration not applied: ${result.guard_reason ?? 'guarded write path not satisfied'}\n`);
        if (options.apply) {
            process.exitCode = 1;
        }
        return;
    }

    process.stdout.write('Migration applied.\n');
    process.stdout.write(`Baseline artifact: ${result.baseline_artifact_file}\n`);
    process.stdout.write(`Metadata: ${result.metadata_file}\n`);
}

async function main(): Promise<void> {
    process.env.TZ = process.env.TZ ?? 'UTC';
    process.env.LANG = process.env.LANG ?? 'C.UTF-8';
    process.env.LC_ALL = process.env.LC_ALL ?? process.env.LANG;

    const options = parseArgs(process.argv);

    if (options.command === 'run') {
        await runCommand(options);
        return;
    }

    if (options.command === 'capture') {
        await captureCommand(options);
        return;
    }

    if (options.command === 'compare') {
        await compareCommand(options);
        return;
    }

    if (options.command === 'report') {
        await reportCommand(options);
        return;
    }

    if (options.command === 'run-matrix') {
        await runMatrixCommand(options);
        return;
    }

    if (options.command === 'list-scenarios') {
        await listScenariosCommand(options);
        return;
    }

    if (options.command === 'promote-baseline') {
        await promoteBaselineCommand(options);
        return;
    }

    if (options.command === 'migrate-legacy-runs') {
        await migrateLegacyRunsCommand(options);
        return;
    }

    throw new Error(
        `Unknown command '${options.command}'. Supported: run, run-matrix, capture, compare, report, list-scenarios, promote-baseline, migrate-legacy-runs.`
    );
}

main().catch((error: unknown) => {
    process.stderr.write(`Replay CLI failed: ${error instanceof Error ? error.message : String(error)}\n`);
    process.exit(1);
});
