import * as assert from 'assert';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { compareReplayRuns } from '../replay/core/Comparator';
import { evaluateReplayGate, evaluateReplayGateWithRetry, renderReplayGateSummaryMarkdown, toGitHubAnnotations } from '../replay/core/GateEvaluator';
import { expandReplayMatrixCells, parseReplayMatrixRunContract } from '../replay/core/MatrixContract';
import { resolveReplayArtifact } from '../replay/core/MigrationResolver';
import { buildReplayMatrixReport, evaluateReplayMatrixPromotable, scoreReplayMatrixCell } from '../replay/core/MatrixScoring';
import { normalizeTraceEvents } from '../replay/core/Normalize';
import { ReplayOrchestrator } from '../replay/core/ReplayOrchestrator';
import { renderReplayReportMarkdown, writeReplayReport } from '../replay/core/ReportWriter';
import { parseScenarioSuite } from '../replay/core/ScenarioSchema';
import {
    type ReplayComparatorProfile,
    type ReplayComparisonResult,
    type ReplayProfileArtifacts,
    type ReplayScenario,
    type ReplayTraceEvent
} from '../replay/core/types';

function createScenario(overrides: Partial<ReplayScenario> = {}): ReplayScenario {
    return {
        schema_version: '1.0',
        scenario_id: 'SCENARIO_A',
        title: 'Scenario A',
        intent: 'Validate comparator checks',
        driver: 'copilot-sdk',
        workspace: {
            workspace_path: '/workspace',
            workspace_id: 'workspace-1'
        },
        runtime: {
            mode: 'headless',
            terminal_surface: 'auto'
        },
        steps: [
            {
                kind: 'user',
                id: 'step_1',
                prompt: 'Run scenario'
            }
        ],
        expectations: {
            success_signature: {
                must_include: ['ALL_GOOD']
            },
            checks: [
                { id: 'TOOL_ORDER', type: 'tool_order', severity: 'high' },
                { id: 'AUTH', type: 'auth_outcome', severity: 'high' },
                { id: 'FLOW', type: 'flow', severity: 'high' },
                { id: 'SIGNATURE', type: 'success_signature', severity: 'medium' }
            ]
        },
        ...overrides
    };
}

function createProfile(overrides: Partial<ReplayComparatorProfile> = {}): ReplayComparatorProfile {
    return {
        profile_name: 'test-profile',
        tool_order: {
            strict_default: true,
            ignore_optional_tools: [],
            ...(overrides.tool_order ?? {})
        },
        authorization: {
            compare_reason_class: true,
            ...(overrides.authorization ?? {})
        },
        flow: {
            require_handoff_before_complete: true,
            require_confirmation_before_gated_updates: true,
            required_handoff_target: 'Coordinator',
            ...(overrides.flow ?? {})
        },
        success_signatures: {
            require_all: true,
            ...(overrides.success_signatures ?? {})
        }
    };
}

function createArtifacts(
    scenarioId: string,
    baselineEvents: ReplayTraceEvent[],
    candidateEvents: ReplayTraceEvent[]
): { baseline: ReplayProfileArtifacts; candidate: ReplayProfileArtifacts } {
    return {
        baseline: {
            profile: 'baseline',
            scenarios: [
                {
                    scenario_id: scenarioId,
                    profile: 'baseline',
                    raw_events: baselineEvents,
                    normalized_events: baselineEvents,
                    success: true
                }
            ]
        },
        candidate: {
            profile: 'candidate',
            scenarios: [
                {
                    scenario_id: scenarioId,
                    profile: 'candidate',
                    raw_events: candidateEvents,
                    normalized_events: candidateEvents,
                    success: true
                }
            ]
        }
    };
}

suite('Replay Scenario Schema', () => {
    test('parses and normalizes scenario IDs, defaults, and check fields', () => {
        const suiteResult = parseScenarioSuite({
            scenarios: [
                {
                    scenario_id: 'scenario one',
                    title: 'Scenario One',
                    intent: 'Validate parser defaults',
                    workspace: {
                        workspace_path: '/workspace',
                        workspace_id: 'workspace-1'
                    },
                    runtime: {
                        mode: 'headless',
                        terminal_surface: 'invalid-value'
                    },
                    tag_metadata: {
                        domain: 'auth-policy',
                        surface: 'memory-terminal',
                        risk: 'p0',
                        priority: 'high'
                    },
                    stabilization: {
                        fixture_seed: 42,
                        wait_budget_ms: 80
                    },
                    acceptance_thresholds: {
                        max_total_drifts: 0,
                        max_high_severity_drifts: 0
                    },
                    steps: [{ kind: 'wait', wait_ms: -5 }],
                    expectations: {
                        success_signature: {
                            must_include: ['PASS_SIGNATURE']
                        },
                        checks: [
                            {
                                type: 'flow',
                                severity: 'low'
                            }
                        ]
                    }
                }
            ]
        });

        assert.strictEqual(suiteResult.schema_version, '1.0');
        assert.strictEqual(suiteResult.scenarios.length, 1);

        const scenario = suiteResult.scenarios[0];
        assert.strictEqual(scenario.scenario_id, 'SCENARIO_ONE');
        assert.strictEqual(scenario.runtime.terminal_surface, 'auto');
        assert.strictEqual(scenario.steps[0].kind, 'wait');
        assert.strictEqual(scenario.steps[0].wait_ms, 80);
        assert.strictEqual(scenario.expectations.checks[0].id, 'CHECK_1');
        assert.strictEqual(scenario.expectations.checks[0].required, true);
        assert.strictEqual(scenario.tags?.includes('domain:auth-policy'), true);
        assert.strictEqual(scenario.tags?.includes('risk:p0'), true);
        assert.strictEqual(scenario.stabilization?.fixture_seed, 42);
        assert.strictEqual(scenario.acceptance_thresholds?.max_total_drifts, 0);
        assert.strictEqual(typeof scenario.scenario_digest, 'string');
        assert.strictEqual((scenario.scenario_digest ?? '').length, 64);

        const secondPass = parseScenarioSuite({
            scenarios: [
                {
                    scenario_id: 'scenario one',
                    title: 'Scenario One',
                    intent: 'Validate parser defaults',
                    workspace: {
                        workspace_path: '/workspace',
                        workspace_id: 'workspace-1'
                    },
                    runtime: {
                        mode: 'headless',
                        terminal_surface: 'invalid-value'
                    },
                    tag_metadata: {
                        domain: 'auth-policy',
                        surface: 'memory-terminal',
                        risk: 'p0',
                        priority: 'high'
                    },
                    stabilization: {
                        fixture_seed: 42,
                        wait_budget_ms: 80
                    },
                    acceptance_thresholds: {
                        max_total_drifts: 0,
                        max_high_severity_drifts: 0
                    },
                    steps: [{ kind: 'wait', wait_ms: -5 }],
                    expectations: {
                        success_signature: {
                            must_include: ['PASS_SIGNATURE']
                        },
                        checks: [
                            {
                                type: 'flow',
                                severity: 'low'
                            }
                        ]
                    }
                }
            ]
        });

        assert.strictEqual(secondPass.scenarios[0].scenario_digest, scenario.scenario_digest);
    });

    test('rejects invalid suites with duplicate normalized scenario IDs', () => {
        assert.throws(() => parseScenarioSuite({
            scenarios: [
                {
                    scenario_id: 'scenario-one',
                    title: 'Scenario One',
                    intent: 'first',
                    workspace: { workspace_path: '/a', workspace_id: 'w1' },
                    runtime: { mode: 'headless', terminal_surface: 'auto' },
                    steps: [{ kind: 'user', prompt: 'go' }],
                    expectations: { success_signature: { must_include: ['ok'] }, checks: [] }
                },
                {
                    scenario_id: 'SCENARIO_ONE',
                    title: 'Scenario Two',
                    intent: 'second',
                    workspace: { workspace_path: '/a', workspace_id: 'w1' },
                    runtime: { mode: 'headless', terminal_surface: 'auto' },
                    steps: [{ kind: 'user', prompt: 'go' }],
                    expectations: { success_signature: { must_include: ['ok'] }, checks: [] }
                }
            ]
        }), /duplicate scenario_id values found/i);
    });
});

suite('Replay Normalization', () => {
    test('normalizes deterministically and preserves cross-platform workspace-relative path parity', () => {
        const windowsEvent: ReplayTraceEvent = {
            scenario_id: 'SCENARIO_A',
            event_type: 'tool_call',
            timestamp_ms: 2000,
            action_raw: 'run',
            tool_name: ' memory_terminal ',
            payload: {
                command: 'cat C:\\repo\\src\\module.ts',
                session: 'sess_abcd1234'
            }
        };

        const posixEvent: ReplayTraceEvent = {
            scenario_id: 'SCENARIO_A',
            event_type: 'tool_call',
            timestamp_ms: 2000,
            action_raw: 'run',
            tool_name: ' memory_terminal ',
            payload: {
                command: 'cat /repo/src/module.ts',
                session: 'sess_abcd1234'
            }
        };

        const normalizedWindows = normalizeTraceEvents([windowsEvent], { workspacePath: 'C:\\repo' });
        const normalizedPosix = normalizeTraceEvents([posixEvent], { workspacePath: '/repo' });

        assert.strictEqual(normalizedWindows[0].timestamp_ms, 0);
        assert.strictEqual(normalizedWindows[0].action_canonical, 'execute');
        assert.strictEqual(normalizedWindows[0].tool_name, 'memory_terminal');

        const windowsPayload = normalizedWindows[0].payload as Record<string, unknown>;
        const posixPayload = normalizedPosix[0].payload as Record<string, unknown>;

        assert.strictEqual(windowsPayload.command, 'cat src/module.ts');
        assert.strictEqual(posixPayload.command, 'cat src/module.ts');
        assert.strictEqual(windowsPayload.session, '<ID>');
        assert.strictEqual(posixPayload.session, '<ID>');
    });
});

suite('Replay Comparator Rules', () => {
    test('flags strict-order drift when tool actions are reordered', () => {
        const scenario = createScenario();
        const baselineEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'run' },
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 1, tool_name: 'memory_terminal', action_raw: 'kill' }
        ];

        const candidateEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'kill' },
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 1, tool_name: 'memory_terminal', action_raw: 'run' }
        ];

        const { baseline, candidate } = createArtifacts(scenario.scenario_id, baselineEvents, candidateEvents);
        const result = compareReplayRuns([scenario], baseline, candidate, createProfile());

        const driftMessages = result.scenarios[0].drifts.map((drift) => drift.message);
        assert.ok(driftMessages.some((message) => message.includes('Tool call order drift detected')));
        assert.strictEqual(result.scenarios[0].drifts[0].category, 'tool_sequence');
        assert.strictEqual(result.scenarios[0].drifts[0].operator_bucket, 'blocker');
        assert.ok(result.scenarios[0].drifts[0].remediation?.recommended_actions?.length);
        assert.ok(result.scenarios[0].drifts[0].evidence?.fingerprint);
        assert.deepStrictEqual(result.scenarios[0].drifts[0].evidence?.artifact_refs, [
            'baseline.norm.json#scenario:SCENARIO_A',
            'candidate.norm.json#scenario:SCENARIO_A'
        ]);
        assert.strictEqual(result.scenarios[0].explainability_groups?.[0]?.category, 'tool_sequence');
        assert.strictEqual(result.summary.explainability_rollup?.by_category?.tool_sequence, 1);
        assert.strictEqual(result.passed, false);
    });

    test('applies profile ignore rules and still catches auth, flow, and signature drift', () => {
        const scenario = createScenario();
        const baselineEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'run' },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 1,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                authorization: { outcome: 'allowed', reason_class: 'policy_ok' }
            }
        ];

        const candidateEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'optional_tool', action_raw: 'noop' },
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 1, tool_name: 'memory_terminal', action_raw: 'run' },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 2,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                authorization: { outcome: 'blocked', reason_class: 'policy_block' }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'plan_step_update',
                timestamp_ms: 3
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'handoff',
                timestamp_ms: 4,
                payload: { to_agent: 'Reviewer' }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'complete',
                timestamp_ms: 5
            }
        ];

        const { baseline, candidate } = createArtifacts(scenario.scenario_id, baselineEvents, candidateEvents);
        const result = compareReplayRuns(
            [scenario],
            baseline,
            candidate,
            createProfile({
                tool_order: {
                    strict_default: true,
                    ignore_optional_tools: ['optional_tool']
                }
            })
        );

        const drifts = result.scenarios[0].drifts;
        const driftMessages = drifts.map((drift) => drift.message);

        assert.ok(driftMessages.some((message) => message.includes('Authorization outcome drift')));
        assert.ok(driftMessages.some((message) => message.includes('Authorization reason-class drift')));
        assert.ok(driftMessages.some((message) => message.includes('Plan step updates occurred without a confirmation event')));
        assert.ok(driftMessages.some((message) => message.includes('Unexpected handoff target')));
        assert.ok(driftMessages.some((message) => message.includes('Missing required success signatures')));
        assert.strictEqual(result.summary.failed_scenarios, 1);
    });

    test('derives stable explainability groups and operator-bucket rollups across mixed drift checks', () => {
        const scenario = createScenario();
        const baselineEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'run' },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 1,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                authorization: { outcome: 'allowed', reason_class: 'policy_ok' }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'complete',
                timestamp_ms: 2,
                success_signature: 'ALL_GOOD'
            }
        ];

        const candidateEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'kill' },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 1,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                authorization: { outcome: 'blocked', reason_class: 'policy_block' }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'plan_step_update',
                timestamp_ms: 3
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'handoff',
                timestamp_ms: 4,
                payload: { to_agent: 'Reviewer' }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'complete',
                timestamp_ms: 5
            }
        ];

        const { baseline, candidate } = createArtifacts(scenario.scenario_id, baselineEvents, candidateEvents);
        const result = compareReplayRuns([scenario], baseline, candidate, createProfile());
        const groups = result.scenarios[0].explainability_groups ?? [];

        assert.deepStrictEqual(groups.map((group) => group.category), [
            'flow_protocol',
            'authorization_policy',
            'tool_sequence',
            'success_signature'
        ]);

        const flowGroup = groups.find((group) => group.category === 'flow_protocol');
        const authGroup = groups.find((group) => group.category === 'authorization_policy');
        const toolGroup = groups.find((group) => group.category === 'tool_sequence');
        const signatureGroup = groups.find((group) => group.category === 'success_signature');

        assert.strictEqual(flowGroup?.actionable_bucket, 1);
        assert.strictEqual(flowGroup?.blocker_bucket, 1);
        assert.strictEqual(authGroup?.blocker_bucket, 2);
        assert.strictEqual(toolGroup?.blocker_bucket, 1);
        assert.strictEqual(signatureGroup?.actionable_bucket, 1);
        assert.strictEqual(result.summary.explainability_rollup?.by_operator_bucket?.blocker, 4);
        assert.strictEqual(result.summary.explainability_rollup?.by_operator_bucket?.actionable, 2);
    });

    test('adds threshold drift when scenario acceptance limits are exceeded', () => {
        const scenario = createScenario({
            acceptance_thresholds: {
                max_total_drifts: 0,
                max_high_severity_drifts: 0
            }
        });
        const baselineEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'run' }
        ];
        const candidateEvents: ReplayTraceEvent[] = [
            { scenario_id: scenario.scenario_id, event_type: 'tool_call', timestamp_ms: 0, tool_name: 'memory_terminal', action_raw: 'kill' }
        ];

        const { baseline, candidate } = createArtifacts(scenario.scenario_id, baselineEvents, candidateEvents);
        const result = compareReplayRuns([scenario], baseline, candidate, createProfile());
        const thresholdDrift = result.scenarios[0].drifts.find((drift) => drift.check_id === 'drift-threshold-total');

        assert.ok(thresholdDrift);
        assert.strictEqual(thresholdDrift?.severity, 'high');
        assert.ok(thresholdDrift?.message.includes('max_total_drifts'));
    });

    test('validates flow check expected selected terminal surface sequence using existing flow check type', () => {
        const scenario = createScenario({
            expectations: {
                success_signature: {
                    must_include: ['ALL_GOOD']
                },
                checks: [
                    {
                        id: 'FLOW_SURFACES',
                        type: 'flow',
                        severity: 'high',
                        strict_order: true,
                        metadata: {
                            expected_selected_surfaces: ['memory_terminal_interactive', 'memory_terminal']
                        }
                    }
                ]
            }
        });

        const baselineEvents: ReplayTraceEvent[] = [
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 0,
                tool_name: 'memory_terminal_interactive',
                action_raw: 'execute',
                payload: {
                    selected_terminal_surface: 'memory_terminal_interactive'
                }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 1,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                payload: {
                    selected_terminal_surface: 'memory_terminal'
                }
            }
        ];

        const candidateEvents: ReplayTraceEvent[] = [
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 0,
                tool_name: 'memory_terminal',
                action_raw: 'run',
                payload: {
                    selected_terminal_surface: 'memory_terminal'
                }
            },
            {
                scenario_id: scenario.scenario_id,
                event_type: 'tool_call',
                timestamp_ms: 1,
                tool_name: 'memory_terminal_interactive',
                action_raw: 'execute',
                payload: {
                    selected_terminal_surface: 'memory_terminal_interactive'
                }
            }
        ];

        const { baseline, candidate } = createArtifacts(scenario.scenario_id, baselineEvents, candidateEvents);
        const result = compareReplayRuns([scenario], baseline, candidate, createProfile());
        const flowDrift = result.scenarios[0].drifts.find((drift) => drift.check_id === 'FLOW_SURFACES');

        assert.ok(flowDrift);
        assert.ok(flowDrift?.message.includes('Selected terminal surface order'));
    });
});

suite('Replay Orchestrator Runner Mode', () => {
    let tempOutputRoot: string;

    setup(() => {
        tempOutputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-replay-orchestrator-test-'));
    });

    teardown(() => {
        fs.rmSync(tempOutputRoot, { recursive: true, force: true });
    });

    test('uses synthetic runner by default and models build-script launch surface deterministically', async () => {
        const scenario = createScenario({
            scenario_id: 'SC_ORCHESTRATOR_DEFAULT',
            runtime: { mode: 'headless', terminal_surface: 'auto' },
            steps: [
                { kind: 'user', id: 'step_1', prompt: 'Run build script flow' },
                { kind: 'tool', id: 'step_2', tool: 'memory_plan', action: 'run_build_script', expect_auth: 'allowed' }
            ],
            expectations: {
                success_signature: {
                    must_include: ['ALL_GOOD']
                },
                checks: []
            }
        });

        const orchestrator = new ReplayOrchestrator({ output_root: tempOutputRoot });
        const result = await orchestrator.capture('baseline', [scenario], 'default-mode');
        const events = result.profile.scenarios[0].raw_events;

        const buildScriptLaunch = events.find((event) => event.event_type === 'tool_call' && event.step_id === 'step_2_launch');
        assert.ok(buildScriptLaunch);
        assert.strictEqual(buildScriptLaunch?.tool_name, 'memory_terminal');
        assert.strictEqual((buildScriptLaunch?.payload as Record<string, unknown>)?.launch_surface, 'memory_terminal');
    });

    test('uses adapter runner when runner_mode is adapter and preserves synthetic default in other callers', async () => {
        const scenario = createScenario({
            scenario_id: 'SC_ORCHESTRATOR_ADAPTER',
            steps: [
                { kind: 'user', id: 'step_1', prompt: 'Adapter mode scenario' }
            ],
            expectations: {
                success_signature: {
                    must_include: ['ADAPTER_OK']
                },
                checks: []
            }
        });

        const orchestrator = new ReplayOrchestrator({
            output_root: tempOutputRoot,
            runner_mode: 'adapter',
            adapter_runner: async (inputScenario) => [
                {
                    scenario_id: inputScenario.scenario_id,
                    event_type: 'outcome',
                    timestamp_ms: 1,
                    success_signature: 'ADAPTER_OK',
                    phase: 'final'
                }
            ]
        });

        const result = await orchestrator.capture('candidate', [scenario], 'adapter-mode');
        const signatures = result.profile.scenarios[0].raw_events.map((event) => event.success_signature);
        assert.ok(signatures.includes('ADAPTER_OK'));
    });
});

suite('Replay Report Rendering', () => {
    let tempOutputRoot: string;

    setup(() => {
        tempOutputRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-replay-report-test-'));
    });

    teardown(() => {
        fs.rmSync(tempOutputRoot, { recursive: true, force: true });
    });

    test('renders markdown and writes JSON+Markdown report outputs with expected key fields', async () => {
        const comparison: ReplayComparisonResult = {
            generated_at: '2026-02-15T00:00:00.000Z',
            profile_name: 'default-replay-profile',
            passed: false,
            summary: {
                total_scenarios: 1,
                passed_scenarios: 0,
                failed_scenarios: 1,
                high_severity_drifts: 1,
                medium_severity_drifts: 0,
                low_severity_drifts: 0
            },
            scenarios: [
                {
                    scenario_id: 'SCENARIO_A',
                    passed: false,
                    checks_executed: ['TOOL_ORDER', 'AUTH'],
                    drifts: [
                        {
                            scenario_id: 'SCENARIO_A',
                            check_id: 'TOOL_ORDER',
                            severity: 'high',
                            message: 'Tool call order drift detected under strict ordering.'
                        }
                    ]
                }
            ]
        };

        const markdown = renderReplayReportMarkdown(comparison);
        assert.ok(markdown.includes('# Replay Drift Report'));
        assert.ok(markdown.includes('- Comparator profile: default-replay-profile'));
        assert.ok(markdown.includes('### SCENARIO_A — FAIL'));
        assert.ok(markdown.includes('[HIGH] TOOL_ORDER: Tool call order drift detected under strict ordering.'));
        assert.ok(!markdown.includes('## Explainability'));

        const output = await writeReplayReport(tempOutputRoot, comparison);
        assert.ok(fs.existsSync(output.comparison_json));
        assert.ok(fs.existsSync(output.report_markdown));

        const relativeOutput = await writeReplayReport(tempOutputRoot, comparison, path.dirname(tempOutputRoot));
        assert.strictEqual(relativeOutput.comparison_json, `${path.basename(tempOutputRoot)}/comparison.json`.replace(/\\/g, '/'));
        assert.strictEqual(relativeOutput.report_markdown, `${path.basename(tempOutputRoot)}/report.md`.replace(/\\/g, '/'));

        const comparisonRaw = fs.readFileSync(output.comparison_json, 'utf8');
        const reportRaw = fs.readFileSync(output.report_markdown, 'utf8');
        const parsed = JSON.parse(comparisonRaw) as ReplayComparisonResult;

        assert.strictEqual(parsed.profile_name, 'default-replay-profile');
        assert.strictEqual(parsed.summary.high_severity_drifts, 1);
        assert.ok(reportRaw.includes('## Summary'));
        assert.ok(reportRaw.includes('## Scenario Results'));
        assert.ok(!reportRaw.includes('## Explainability'));

        assert.ok(!Object.hasOwn(parsed.summary, 'explainability_rollup'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0], 'explainability_groups'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0].drifts[0], 'category'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0].drifts[0], 'confidence'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0].drifts[0], 'operator_bucket'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0].drifts[0], 'remediation'));
        assert.ok(!Object.hasOwn(parsed.scenarios[0].drifts[0], 'evidence'));
    });

    test('appends explainability markdown section only when explainability data is present', () => {
        const comparison: ReplayComparisonResult = {
            generated_at: '2026-02-15T00:00:00.000Z',
            profile_name: 'default-replay-profile',
            passed: false,
            summary: {
                total_scenarios: 1,
                passed_scenarios: 0,
                failed_scenarios: 1,
                high_severity_drifts: 1,
                medium_severity_drifts: 0,
                low_severity_drifts: 0,
                explainability_rollup: {
                    total_explained_drifts: 1,
                    by_category: {
                        tool_sequence: 1
                    },
                    by_confidence: {
                        high: 1
                    },
                    by_operator_bucket: {
                        blocker: 1
                    }
                }
            },
            scenarios: [
                {
                    scenario_id: 'SCENARIO_A',
                    passed: false,
                    checks_executed: ['TOOL_ORDER'],
                    explainability_groups: [
                        {
                            category: 'tool_sequence',
                            total_drifts: 1,
                            high_confidence: 1,
                            blocker_bucket: 1
                        }
                    ],
                    drifts: [
                        {
                            scenario_id: 'SCENARIO_A',
                            check_id: 'TOOL_ORDER',
                            severity: 'high',
                            message: 'Tool call order drift detected under strict ordering.',
                            category: 'tool_sequence',
                            confidence: 'high',
                            operator_bucket: 'blocker',
                            remediation: {
                                recommended_actions: ['Align tool invocation sequence with baseline ordering']
                            },
                            evidence: {
                                artifact_refs: ['comparison.json#scenario:SCENARIO_A'],
                                fingerprint: 'abc123'
                            }
                        }
                    ]
                }
            ]
        };

        const markdown = renderReplayReportMarkdown(comparison);
        assert.ok(markdown.includes('## Explainability'));
        assert.ok(markdown.includes('### Rollup'));
        assert.ok(markdown.includes('- By category: tool_sequence 1'));
        assert.ok(markdown.includes('- By confidence: high 1'));
        assert.ok(markdown.includes('- By operator bucket: blocker 1'));
        assert.ok(markdown.includes('### Group Summaries'));
        assert.ok(markdown.includes('### Top Actions'));
        assert.ok(markdown.includes('Align tool invocation sequence with baseline ordering (x1)'));
        assert.ok(markdown.includes('### Evidence Handles'));
        assert.ok(markdown.includes('fingerprint:abc123'));
    });
});

suite('Replay Gate Evaluator', () => {
    function createComparisonResult(overrides: Partial<ReplayComparisonResult> = {}): ReplayComparisonResult {
        return {
            generated_at: '2026-02-15T00:00:00.000Z',
            profile_name: 'default-replay-profile',
            passed: false,
            summary: {
                total_scenarios: 1,
                passed_scenarios: 0,
                failed_scenarios: 1,
                high_severity_drifts: 1,
                medium_severity_drifts: 0,
                low_severity_drifts: 0
            },
            scenarios: [
                {
                    scenario_id: 'SCENARIO_A',
                    passed: false,
                    checks_executed: ['TOOL_ORDER'],
                    drifts: [
                        {
                            scenario_id: 'SCENARIO_A',
                            check_id: 'TOOL_ORDER',
                            severity: 'high',
                            message: 'Tool call order drift detected under strict ordering.'
                        }
                    ]
                }
            ],
            ...overrides
        };
    }

    test('strict mode fails on replay drift and emits error annotations', () => {
        const comparison = createComparisonResult();
        const evaluation = evaluateReplayGate(comparison, 'strict');

        assert.strictEqual(evaluation.passed, false);
        assert.strictEqual(evaluation.status, 'FAIL');
        assert.strictEqual(evaluation.classification, 'deterministic_regression');
        assert.ok(evaluation.triage_labels.includes('deterministic-regression'));
        assert.strictEqual(evaluation.annotations.length, 1);
        assert.strictEqual(evaluation.annotations[0].level, 'error');
    });

    test('warn mode passes and emits warning annotations', () => {
        const comparison = createComparisonResult();
        const evaluation = evaluateReplayGate(comparison, 'warn');

        assert.strictEqual(evaluation.passed, true);
        assert.strictEqual(evaluation.status, 'WARN');
        assert.strictEqual(evaluation.classification, 'deterministic_regression');
        assert.strictEqual(evaluation.annotations.length, 1);
        assert.strictEqual(evaluation.annotations[0].level, 'warning');
    });

    test('propagates explainability rollup to gate output without changing classification labels', () => {
        const comparison = createComparisonResult({
            summary: {
                total_scenarios: 1,
                passed_scenarios: 0,
                failed_scenarios: 1,
                high_severity_drifts: 1,
                medium_severity_drifts: 0,
                low_severity_drifts: 0,
                explainability_rollup: {
                    total_explained_drifts: 1,
                    by_category: {
                        tool_sequence: 1
                    },
                    by_confidence: {
                        high: 1
                    },
                    by_operator_bucket: {
                        blocker: 1
                    }
                }
            }
        });

        const evaluation = evaluateReplayGate(comparison, 'warn');
        assert.strictEqual(evaluation.classification, 'deterministic_regression');
        assert.ok(evaluation.triage_labels.includes('deterministic-regression'));
        assert.strictEqual(evaluation.explainability_rollup?.total_explained_drifts, 1);
        assert.strictEqual(evaluation.explainability_rollup?.by_category?.tool_sequence, 1);
    });

    test('info mode passes and produces markdown summary plus notice annotations', () => {
        const comparison = createComparisonResult();
        const evaluation = evaluateReplayGate(comparison, 'info');
        const markdown = renderReplayGateSummaryMarkdown(evaluation);
        const annotations = toGitHubAnnotations(evaluation);

        assert.strictEqual(evaluation.passed, true);
        assert.strictEqual(evaluation.status, 'INFO');
        assert.ok(markdown.includes('## Replay Gate Summary'));
        assert.ok(markdown.includes('- Classification: deterministic_regression'));
        assert.ok(markdown.includes('- Mode: info'));
        assert.ok(annotations[0].startsWith('::notice title=Replay Gate (HIGH)::[deterministic_regression] SCENARIO_A TOOL_ORDER'));
        assert.ok(!annotations[0].includes('evidence_refs='));
        assert.ok(!annotations[0].includes('evidence_fingerprint='));
        assert.strictEqual(
            annotations[0],
            '::notice title=Replay Gate (HIGH)::[deterministic_regression] SCENARIO_A TOOL_ORDER Tool call order drift detected under strict ordering.'
        );
    });

    test('github annotations append optional evidence and fingerprint suffix tokens without changing prefix', () => {
        const comparison = createComparisonResult({
            scenarios: [
                {
                    scenario_id: 'SCENARIO_A',
                    passed: false,
                    checks_executed: ['TOOL_ORDER'],
                    drifts: [
                        {
                            scenario_id: 'SCENARIO_A',
                            check_id: 'TOOL_ORDER',
                            severity: 'high',
                            message: 'Tool call order drift detected under strict ordering.',
                            evidence: {
                                artifact_refs: ['comparison.json#scenario:SCENARIO_A', 'C:\\tmp\\gate-summary.json#L1'],
                                fingerprint: 'abc123'
                            }
                        }
                    ]
                }
            ]
        });
        const evaluation = evaluateReplayGate(comparison, 'warn');
        const annotations = toGitHubAnnotations(evaluation);

        assert.ok(annotations[0].startsWith('::warning title=Replay Gate (HIGH)::[deterministic_regression] SCENARIO_A TOOL_ORDER Tool call order drift detected under strict ordering.'));
        assert.ok(annotations[0].includes('[evidence_refs=comparison.json#scenario:SCENARIO_A|C:/tmp/gate-summary.json#L1 evidence_fingerprint=abc123]'));
    });

    test('strict mode retry-once classifies intermittent flake and passes with warn status', () => {
        const primary = createComparisonResult();
        const retry: ReplayComparisonResult = {
            ...primary,
            passed: true,
            summary: {
                ...primary.summary,
                passed_scenarios: 1,
                failed_scenarios: 0,
                high_severity_drifts: 0
            },
            scenarios: [
                {
                    ...primary.scenarios[0],
                    passed: true,
                    drifts: []
                }
            ]
        };

        const evaluation = evaluateReplayGateWithRetry(primary, retry, 'strict');
        assert.strictEqual(evaluation.passed, true);
        assert.strictEqual(evaluation.status, 'WARN');
        assert.strictEqual(evaluation.classification, 'intermittent_flake');
        assert.strictEqual(evaluation.retried, true);
        assert.ok(evaluation.triage_labels.includes('flake'));
    });
});

suite('Replay Migration Resolver', () => {
    let tempRoot: string;
    let goldensRoot: string;
    let legacyRunsRoot: string;

    setup(() => {
        tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-replay-migration-test-'));
        goldensRoot = path.join(tempRoot, 'goldens');
        legacyRunsRoot = path.join(tempRoot, 'legacy-runs');
        fs.mkdirSync(goldensRoot, { recursive: true });
        fs.mkdirSync(legacyRunsRoot, { recursive: true });
    });

    teardown(() => {
        fs.rmSync(tempRoot, { recursive: true, force: true });
    });

    test('prefers explicit file for baseline resolution when provided', async () => {
        const explicitBaseline = path.join(tempRoot, 'explicit-baseline.norm.json');
        fs.writeFileSync(explicitBaseline, '{"profile":"baseline","scenarios":[]}\n', 'utf8');

        const resolved = await resolveReplayArtifact({
            kind: 'baseline',
            explicit_file: explicitBaseline,
            goldens_root: goldensRoot,
            baseline_id: 'default',
            legacy_runs_root: legacyRunsRoot
        });

        assert.ok(resolved);
        assert.strictEqual(resolved?.source, 'explicit');
        assert.strictEqual(path.resolve(resolved?.file ?? ''), path.resolve(explicitBaseline));
    });

    test('resolves baseline from golden v1 store before legacy fallback', async () => {
        const goldenBaseline = path.join(goldensRoot, 'v1', 'default', 'baseline.norm.json');
        fs.mkdirSync(path.dirname(goldenBaseline), { recursive: true });
        fs.writeFileSync(goldenBaseline, '{"profile":"baseline","scenarios":[]}\n', 'utf8');

        const legacyRunDir = path.join(legacyRunsRoot, 'run-legacy-1');
        fs.mkdirSync(legacyRunDir, { recursive: true });
        fs.writeFileSync(path.join(legacyRunDir, 'baseline.norm.json'), '{"profile":"baseline","scenarios":[]}\n', 'utf8');

        const resolved = await resolveReplayArtifact({
            kind: 'baseline',
            goldens_root: goldensRoot,
            baseline_id: 'default',
            legacy_runs_root: legacyRunsRoot
        });

        assert.ok(resolved);
        assert.strictEqual(resolved?.source, 'golden_v1');
        assert.strictEqual(path.resolve(resolved?.file ?? ''), path.resolve(goldenBaseline));
    });

    test('resolves latest legacy run artifact when explicit and golden are absent', async () => {
        const olderRun = path.join(legacyRunsRoot, 'run-older');
        const newerRun = path.join(legacyRunsRoot, 'run-newer');
        fs.mkdirSync(olderRun, { recursive: true });
        fs.mkdirSync(newerRun, { recursive: true });

        const olderCandidate = path.join(olderRun, 'candidate.norm.json');
        const newerCandidate = path.join(newerRun, 'candidate.norm.json');

        fs.writeFileSync(olderCandidate, '{"profile":"candidate","scenarios":[]}\n', 'utf8');
        fs.writeFileSync(newerCandidate, '{"profile":"candidate","scenarios":[]}\n', 'utf8');

        const oldTimestamp = new Date('2024-01-01T00:00:00.000Z');
        const newTimestamp = new Date('2025-01-01T00:00:00.000Z');
        fs.utimesSync(olderRun, oldTimestamp, oldTimestamp);
        fs.utimesSync(newerRun, newTimestamp, newTimestamp);

        const resolved = await resolveReplayArtifact({
            kind: 'candidate',
            goldens_root: goldensRoot,
            baseline_id: 'default',
            legacy_runs_root: legacyRunsRoot
        });

        assert.ok(resolved);
        assert.strictEqual(resolved?.source, 'legacy_run');
        assert.strictEqual(path.resolve(resolved?.file ?? ''), path.resolve(newerCandidate));
        assert.strictEqual(path.resolve(resolved?.legacy_run_dir ?? ''), path.resolve(newerRun));
    });
});

suite('Replay Matrix Contract + Scoring', () => {
    test('parses matrix run-contract and expands deterministic matrix cells', () => {
        const contract = parseReplayMatrixRunContract({
            schema_version: 'replay-matrix-run-contract.v1',
            matrix_id: 'matrix-smoke',
            axes: {
                model_variants: [
                    { model_id: 'gpt-5.3-codex' },
                    { model_id: 'gpt-4.1' }
                ],
                comparator_profiles: [
                    { profile_id: 'default', profile_path: './config/default.profile.json' }
                ],
                scenario_tag_slices: [
                    { slice_id: 'p0-core', tags: ['risk:p0'], match: 'any', risk_tier: 'p0' },
                    { slice_id: 'p1-core', tags: ['risk:p1'], match: 'any', risk_tier: 'p1' }
                ],
                execution_surfaces: ['auto', 'memory_terminal', 'memory_terminal_interactive'],
                gate_modes: ['strict'],
                normalization_profiles: [
                    {
                        normalization_id: 'norm-default',
                        config: {
                            canonicalize_paths: true,
                            canonicalize_timestamps: true,
                            strip_nondeterministic_text: true,
                            mask_ids: true
                        }
                    }
                ]
            },
            controls: {
                determinism: {
                    fixed_tz: 'UTC',
                    fixed_locale: 'C.UTF-8',
                    normalization_required: true,
                    retry_once_classification: true,
                    fingerprint_stability_check: true
                }
            }
        });

        const cells = expandReplayMatrixCells(contract);
        assert.strictEqual(cells.length, 12);
        assert.ok(cells.some((cell) => cell.axes.execution_surface === 'memory_terminal_interactive'));
        assert.ok(cells.some((cell) => cell.axes.scenario_slice.risk_tier === 'p1'));
        assert.ok(cells.every((cell) => cell.cell_id.includes('__')));
    });

    test('computes WDS/SPR/ECI/BBR/CMS and non-promotable deterministic regression', () => {
        const scenario = createScenario({
            scenario_id: 'SC_MATRIX',
            expectations: {
                success_signature: {
                    must_include: ['OK']
                },
                checks: []
            }
        });

        const comparison: ReplayComparisonResult = {
            generated_at: new Date().toISOString(),
            profile_name: 'default',
            passed: false,
            scenarios: [
                {
                    scenario_id: 'SC_MATRIX',
                    passed: false,
                    checks_executed: ['CHECK_1'],
                    drifts: [
                        {
                            scenario_id: 'SC_MATRIX',
                            check_id: 'CHECK_1',
                            severity: 'high',
                            message: 'high drift',
                            category: 'tool_sequence',
                            confidence: 'high',
                            operator_bucket: 'blocker'
                        }
                    ]
                }
            ],
            summary: {
                total_scenarios: 1,
                passed_scenarios: 0,
                failed_scenarios: 1,
                high_severity_drifts: 1,
                medium_severity_drifts: 0,
                low_severity_drifts: 0,
                explainability_rollup: {
                    total_explained_drifts: 1,
                    by_category: {
                        tool_sequence: 1
                    },
                    by_confidence: {
                        high: 1
                    },
                    by_operator_bucket: {
                        blocker: 1
                    }
                }
            }
        };

        const gate = evaluateReplayGateWithRetry(comparison, undefined, 'strict');
        const score = scoreReplayMatrixCell(comparison, gate);

        assert.strictEqual(score.wds, 80);
        assert.strictEqual(score.spr, 0);
        assert.strictEqual(score.eci, 1);
        assert.strictEqual(score.bbr, 1);
        assert.strictEqual(score.deterministic_regression, true);

        const matrixContract = parseReplayMatrixRunContract({
            schema_version: 'replay-matrix-run-contract.v1',
            matrix_id: 'matrix-risk',
            axes: {
                model_variants: [{ model_id: 'gpt-5.3-codex' }],
                comparator_profiles: [{ profile_id: 'default', profile_path: './config/default.profile.json' }],
                scenario_tag_slices: [{ slice_id: 'p0', tags: ['risk:p0'], risk_tier: 'p0' }],
                execution_surfaces: ['auto'],
                gate_modes: ['strict'],
                normalization_profiles: [{ normalization_id: 'norm', config: {} }]
            },
            controls: {
                determinism: {
                    fixed_tz: 'UTC',
                    fixed_locale: 'C.UTF-8',
                    normalization_required: true,
                    retry_once_classification: true,
                    fingerprint_stability_check: true
                },
                risk_tiers: {
                    p0: {
                        max_high_severity_drifts: 0
                    }
                }
            }
        });

        const cell = {
            cell_id: 'cell-a',
            scenario_ids: [scenario.scenario_id],
            axes: {
                model_variant: matrixContract.axes.model_variants[0],
                comparator_profile: matrixContract.axes.comparator_profiles[0],
                scenario_slice: matrixContract.axes.scenario_tag_slices[0],
                execution_surface: 'auto' as const,
                gate_mode: 'strict' as const,
                normalization_profile: matrixContract.axes.normalization_profiles[0]
            },
            comparison,
            gate,
            score,
            promotable: true
        };

        const promotable = evaluateReplayMatrixPromotable(cell, matrixContract);
        assert.strictEqual(promotable, false);

        const report = buildReplayMatrixReport('matrix-risk', 'label-x', [{ ...cell, promotable }]);
        assert.strictEqual(report.total_cells, 1);
        assert.strictEqual(report.promotable_cells, 0);
        assert.strictEqual(report.deterministic_regressions, 1);
        assert.ok(report.axis_rollups.length > 0);
    });
});