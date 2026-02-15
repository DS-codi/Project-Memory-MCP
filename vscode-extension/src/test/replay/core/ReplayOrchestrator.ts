import * as fs from 'fs/promises';
import * as path from 'path';
import { captureScenarioArtifact, createRawTraceEventEnvelopes, type TraceScenarioRunner } from './TraceCapture';
import {
    type ReplayManifest,
    type ReplayProfileArtifacts,
    type ReplayProfileName,
    type ReplayRawTraceEventEnvelope,
    type ReplayScenario,
    type ReplayTerminalSurface,
    type ReplayTraceEvent
} from './types';
import { stableStringify, toWorkspaceRelativePath } from './StableJson';

export interface ReplayRunnerContext {
    profile: ReplayProfileName;
    run_id: string;
}

export type ReplayScenarioRunner = (
    scenario: ReplayScenario,
    context: ReplayRunnerContext
) => Promise<ReplayTraceEvent[]>;

export interface ReplayRunResult {
    manifest: ReplayManifest;
    baseline: ReplayProfileArtifacts;
    candidate: ReplayProfileArtifacts;
}

export interface ReplayCaptureResult {
    profile: ReplayProfileArtifacts;
    output_file: string;
    raw_output_file: string;
}

export interface ReplayOrchestratorOptions {
    output_root: string;
    runner?: ReplayScenarioRunner;
    runner_mode?: 'synthetic' | 'adapter';
    adapter_runner?: ReplayScenarioRunner;
}

export class ReplayOrchestrator {
    private readonly outputRoot: string;

    private readonly syntheticRunner: TraceScenarioRunner;

    private readonly adapterRunner?: TraceScenarioRunner;

    private readonly runnerMode: 'synthetic' | 'adapter';

    public constructor(options: ReplayOrchestratorOptions) {
        this.outputRoot = path.resolve(options.output_root);
        this.syntheticRunner = options.runner ?? defaultScenarioRunner;
        this.adapterRunner = options.adapter_runner;
        this.runnerMode = options.runner_mode ?? 'synthetic';

        if (this.runnerMode === 'adapter' && !this.adapterRunner) {
            throw new Error('ReplayOrchestrator runner_mode=adapter requires adapter_runner.');
        }
    }

    public async run(
        scenarios: ReplayScenario[],
        label: string,
        workspacePath?: string
    ): Promise<ReplayRunResult> {
        const runId = `${label}-${Date.now()}`;
        const outputDir = path.join(this.outputRoot, runId);

        await fs.mkdir(outputDir, { recursive: true });

        const baseline = await this.executeProfile('baseline', scenarios, runId, workspacePath);
        const candidate = await this.executeProfile('candidate', scenarios, runId, workspacePath);

        const baselineRawFile = path.join(outputDir, 'baseline.raw.jsonl');
        const candidateRawFile = path.join(outputDir, 'candidate.raw.jsonl');
        const baselineFile = path.join(outputDir, 'baseline.norm.json');
        const candidateFile = path.join(outputDir, 'candidate.norm.json');

        await this.writeJsonLines(baselineRawFile, createRawTraceEventEnvelopes(runId, baseline));
        await this.writeJsonLines(candidateRawFile, createRawTraceEventEnvelopes(runId, candidate));
        await this.writeJsonFile(baselineFile, baseline);
        await this.writeJsonFile(candidateFile, candidate);

        const manifest: ReplayManifest = {
            run_id: runId,
            created_at: new Date().toISOString(),
            scenario_count: scenarios.length,
            output_dir: toWorkspaceRelativePath(outputDir, workspacePath),
            baseline_artifact_file: toWorkspaceRelativePath(baselineFile, workspacePath),
            candidate_artifact_file: toWorkspaceRelativePath(candidateFile, workspacePath),
            baseline_raw_artifact_file: toWorkspaceRelativePath(baselineRawFile, workspacePath),
            candidate_raw_artifact_file: toWorkspaceRelativePath(candidateRawFile, workspacePath),
            baseline_normalized_artifact_file: toWorkspaceRelativePath(baselineFile, workspacePath),
            candidate_normalized_artifact_file: toWorkspaceRelativePath(candidateFile, workspacePath),
            artifact_envelope: {
                baseline: {
                    raw_file: toWorkspaceRelativePath(baselineRawFile, workspacePath),
                    normalized_file: toWorkspaceRelativePath(baselineFile, workspacePath),
                    scenario_count: baseline.scenarios.length
                },
                candidate: {
                    raw_file: toWorkspaceRelativePath(candidateRawFile, workspacePath),
                    normalized_file: toWorkspaceRelativePath(candidateFile, workspacePath),
                    scenario_count: candidate.scenarios.length
                }
            },
            determinism_env: {
                node_version: process.version,
                tz: process.env.TZ ?? 'UTC',
                locale: process.env.LC_ALL ?? process.env.LANG ?? 'C.UTF-8'
            }
        };

        await this.writeJsonFile(path.join(outputDir, 'manifest.json'), manifest);

        return {
            manifest,
            baseline,
            candidate
        };
    }

    public async capture(
        profileName: ReplayProfileName,
        scenarios: ReplayScenario[],
        label: string,
        workspacePath?: string
    ): Promise<ReplayCaptureResult> {
        const runId = `${label}-${profileName}-${Date.now()}`;
        const outputDir = path.join(this.outputRoot, runId);
        await fs.mkdir(outputDir, { recursive: true });

        const profile = await this.executeProfile(profileName, scenarios, runId, workspacePath);
        const rawOutputFile = path.join(outputDir, `${profileName}.raw.jsonl`);
        const outputFile = path.join(outputDir, `${profileName}.norm.json`);
        await this.writeJsonLines(rawOutputFile, createRawTraceEventEnvelopes(runId, profile));
        await this.writeJsonFile(outputFile, profile);

        return {
            profile,
            output_file: outputFile,
            raw_output_file: rawOutputFile
        };
    }

    private async executeProfile(
        profileName: ReplayProfileName,
        scenarios: ReplayScenario[],
        runId: string,
        workspacePath?: string
    ): Promise<ReplayProfileArtifacts> {
        const scenarioArtifacts = [];
        const resolvedRunner = this.runnerMode === 'adapter'
            ? this.adapterRunner ?? this.syntheticRunner
            : this.syntheticRunner;

        for (const scenario of scenarios) {
            const artifact = await captureScenarioArtifact(
                scenario,
                {
                    profile: profileName,
                    run_id: runId
                },
                resolvedRunner,
                {
                    workspacePath
                }
            );

            scenarioArtifacts.push(artifact);
        }

        return {
            profile: profileName,
            scenarios: scenarioArtifacts
        };
    }

    private async writeJsonLines(filePath: string, rows: ReplayRawTraceEventEnvelope[]): Promise<void> {
        const serialized = rows.map((row) => stableStringify(row)).join('\n');
        const payload = serialized.length > 0 ? `${serialized}\n` : '';
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, payload, 'utf8');
    }

    private async writeJsonFile(filePath: string, data: unknown): Promise<void> {
        await fs.mkdir(path.dirname(filePath), { recursive: true });
        await fs.writeFile(filePath, `${stableStringify(data)}\n`, 'utf8');
    }
}

const AUTH_REASON_BY_OUTCOME: Record<string, string> = {
    allowed: 'allowlist_match',
    allowed_with_warning: 'interactive_warning',
    blocked: 'policy_block'
};

function resolveSelectedSurface(scenario: ReplayScenario, stepTool: string | undefined): {
    requested_surface: ReplayTerminalSurface;
    selected_surface: 'memory_terminal' | 'memory_terminal_interactive';
    selection_reason: string;
} {
    const requestedSurface = scenario.runtime.terminal_surface;
    const normalizedTool = (stepTool ?? '').trim().toLowerCase();

    if (requestedSurface === 'memory_terminal') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal',
            selection_reason: 'explicit_runtime_surface'
        };
    }

    if (requestedSurface === 'memory_terminal_interactive') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal_interactive',
            selection_reason: 'explicit_runtime_surface'
        };
    }

    if (normalizedTool === 'memory_terminal_interactive') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal_interactive',
            selection_reason: 'auto_tool_surface_preference'
        };
    }

    if (normalizedTool === 'memory_terminal') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal',
            selection_reason: 'auto_tool_surface_preference'
        };
    }

    if (normalizedTool === 'memory_terminal_vscode') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal_interactive',
            selection_reason: 'auto_policy_vscode_maps_to_interactive'
        };
    }

    if (scenario.runtime.mode === 'interactive') {
        return {
            requested_surface: requestedSurface,
            selected_surface: 'memory_terminal_interactive',
            selection_reason: 'auto_runtime_mode_interactive'
        };
    }

    return {
        requested_surface: requestedSurface,
        selected_surface: 'memory_terminal',
        selection_reason: 'auto_runtime_mode_headless_default'
    };
}

async function defaultScenarioRunner(
    scenario: ReplayScenario,
    context: ReplayRunnerContext
): Promise<ReplayTraceEvent[]> {
    let timestamp = Date.now();
    const events: ReplayTraceEvent[] = [];

    for (const step of scenario.steps) {
        timestamp += 25;

        if (step.kind === 'user') {
            events.push({
                event_type: 'user_prompt',
                timestamp_ms: timestamp,
                scenario_id: scenario.scenario_id,
                step_id: step.id,
                payload: {
                    prompt: step.prompt,
                    profile: context.profile
                }
            });
            continue;
        }

        if (step.kind === 'wait') {
            events.push({
                event_type: 'wait',
                timestamp_ms: timestamp,
                scenario_id: scenario.scenario_id,
                step_id: step.id,
                payload: {
                    wait_ms: step.wait_ms ?? 100
                }
            });
            continue;
        }

        if (step.kind === 'tool') {
            const authOutcome = step.expect_auth ?? 'allowed';
            const surfaceResolution = resolveSelectedSurface(scenario, step.tool);
            events.push({
                event_type: 'tool_call',
                timestamp_ms: timestamp,
                scenario_id: scenario.scenario_id,
                step_id: step.id,
                tool_name: step.tool,
                action_raw: step.action,
                authorization: {
                    outcome: authOutcome,
                    reason_class: AUTH_REASON_BY_OUTCOME[authOutcome]
                },
                payload: {
                    args: step.args,
                    profile: context.profile,
                    requested_terminal_surface: surfaceResolution.requested_surface,
                    selected_terminal_surface: surfaceResolution.selected_surface,
                    selected_surface_reason: surfaceResolution.selection_reason
                }
            });

            if (step.tool === 'memory_plan' && step.action === 'run_build_script') {
                events.push({
                    event_type: 'build_script_resolved',
                    timestamp_ms: timestamp + 1,
                    scenario_id: scenario.scenario_id,
                    step_id: step.id,
                    payload: {
                        selected_terminal_surface: surfaceResolution.selected_surface,
                        requested_terminal_surface: surfaceResolution.requested_surface,
                        selected_surface_reason: surfaceResolution.selection_reason,
                        source_tool: 'memory_plan.run_build_script'
                    }
                });

                events.push({
                    event_type: 'tool_call',
                    timestamp_ms: timestamp + 2,
                    scenario_id: scenario.scenario_id,
                    step_id: `${step.id ?? 'step'}_launch`,
                    tool_name: surfaceResolution.selected_surface,
                    action_raw: surfaceResolution.selected_surface === 'memory_terminal_interactive' ? 'execute' : 'run',
                    authorization: {
                        outcome: authOutcome,
                        reason_class: AUTH_REASON_BY_OUTCOME[authOutcome]
                    },
                    payload: {
                        source_tool: 'memory_plan.run_build_script',
                        launch_surface: surfaceResolution.selected_surface,
                        requested_terminal_surface: surfaceResolution.requested_surface
                    }
                });
            }

            if (step.tool === 'memory_agent' && (step.action === 'handoff' || step.action === 'complete')) {
                events.push({
                    event_type: step.action,
                    timestamp_ms: timestamp + 1,
                    scenario_id: scenario.scenario_id,
                    step_id: step.id,
                    payload: {
                        to_agent: step.args?.to_agent,
                        from_agent: step.args?.from_agent
                    }
                });
            }

            if (step.tool === 'memory_plan' && step.action === 'confirm') {
                events.push({
                    event_type: 'confirmation',
                    timestamp_ms: timestamp + 1,
                    scenario_id: scenario.scenario_id,
                    step_id: step.id
                });
            }

            if (step.tool === 'memory_steps' && step.action === 'update') {
                events.push({
                    event_type: 'plan_step_update',
                    timestamp_ms: timestamp + 1,
                    scenario_id: scenario.scenario_id,
                    step_id: step.id
                });
            }
        }
    }

    for (const signature of scenario.expectations.success_signature.must_include) {
        timestamp += 10;
        events.push({
            event_type: 'outcome',
            timestamp_ms: timestamp,
            scenario_id: scenario.scenario_id,
            success_signature: signature,
            phase: 'final'
        });
    }

    return events;
}
