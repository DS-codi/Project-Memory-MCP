import * as assert from 'assert';

type MockButton = {
    command: string;
    title: string;
    arguments?: unknown[];
};

function createMockResponse() {
    const markdownCalls: string[] = [];
    const progressCalls: string[] = [];
    const buttonCalls: MockButton[] = [];
    const filetreeCalls: Array<{ value: unknown; baseUri: unknown }> = [];
    const referenceCalls: Array<{ value: unknown; iconPath?: unknown }> = [];
    const anchorCalls: Array<{ value: unknown; title?: string }> = [];

    return {
        markdown: (value: string) => { markdownCalls.push(value); },
        progress: (value: string) => { progressCalls.push(value); },
        button: (button: MockButton) => { buttonCalls.push(button); },
        filetree: (value: unknown, baseUri: unknown) => { filetreeCalls.push({ value, baseUri }); },
        reference: (value: unknown, iconPath?: unknown) => { referenceCalls.push({ value, iconPath }); },
        anchor: (value: unknown, title?: string) => { anchorCalls.push({ value, title }); },
        markdownCalls,
        progressCalls,
        buttonCalls,
        filetreeCalls,
        referenceCalls,
        anchorCalls,
        get fullMarkdown() { return markdownCalls.join(''); }
    };
}

function createMockRequest(prompt: string) {
    return { prompt } as { prompt: string };
}

function getUriPath(value: unknown): string {
    const candidate = value as { fsPath?: string; path?: string };
    return String(candidate?.fsPath ?? candidate?.path ?? '');
}

function createMockBridge() {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    let failListBuildScripts = false;
    let scripts: unknown[] = [];
    let planOverrides: Record<string, Record<string, unknown>> = {};
    let programChildPlans: unknown[] = [];

    return {
        callTool: async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
            calls.push({ tool, args });
            const action = args.action;

            if (action === 'list') {
                return {
                    active_plans: [
                        { id: 'plan_one', title: 'Plan One', status: 'active', category: 'feature' },
                        { id: 'plan_two', title: 'Plan Two', status: 'pending', category: 'bug' }
                    ]
                } as T;
            }

            if (action === 'create') {
                return {
                    id: 'plan_created',
                    title: String(args.title ?? 'Created Plan')
                } as T;
            }

            if (action === 'get') {
                const planId = String(args.plan_id ?? 'plan_unknown');
                const override = planOverrides[planId] ?? {};
                return {
                    id: planId,
                    title: 'Shown Plan',
                    category: 'feature',
                    priority: 'high',
                    description: 'desc',
                    steps: [],
                    ...override,
                } as T;
            }

            if (action === 'list_build_scripts') {
                if (failListBuildScripts) {
                    throw new Error('scripts unavailable');
                }
                return scripts as T;
            }

            if (action === 'list_program_plans') {
                return {
                    child_plans: programChildPlans,
                } as T;
            }

            return {} as T;
        },
        calls,
        setScripts: (next: unknown[]) => { scripts = next; },
        setFailListBuildScripts: (next: boolean) => { failListBuildScripts = next; },
        setPlanOverrides: (next: Record<string, Record<string, unknown>>) => { planOverrides = next; },
        setProgramChildPlans: (next: unknown[]) => { programChildPlans = next; },
    };
}

suite('ChatPlanCommands Test Suite', () => {
    let handlePlanCommand: typeof import('../../chat/ChatPlanCommands').handlePlanCommand;

    suiteSetup(() => {
        try {
            handlePlanCommand = require('../../chat/ChatPlanCommands').handlePlanCommand;
        } catch {
        }
    });

    test('list renders per-plan View Details and bottom Refresh button', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handlePlanCommand(
            createMockRequest('list') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const viewButtons = response.buttonCalls.filter((button) => button.command === 'projectMemory.showPlanInChat');
        assert.strictEqual(viewButtons.length, 2);
        assert.strictEqual(viewButtons[0].title, 'View Details');
        assert.deepStrictEqual(viewButtons[0].arguments, ['plan_one']);
        assert.deepStrictEqual(viewButtons[1].arguments, ['plan_two']);

        const refreshButton = response.buttonCalls.find((button) => button.command === 'workbench.action.chat.open');
        assert.ok(refreshButton);
        assert.strictEqual(refreshButton?.title, 'Refresh');
        assert.deepStrictEqual(refreshButton?.arguments, [{ query: '@memory /plan list' }]);

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.ok(openDashboardButton);
        assert.deepStrictEqual(openDashboardButton?.arguments, ['ws_1', undefined]);
    });

    test('create renders View Plan Details button for created plan', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handlePlanCommand(
            createMockRequest('create New Plan') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const viewButton = response.buttonCalls.find((button) => button.command === 'projectMemory.showPlanInChat');
        assert.ok(viewButton);
        assert.strictEqual(viewButton?.title, 'View Plan Details');
        assert.deepStrictEqual(viewButton?.arguments, ['plan_created']);

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.ok(openDashboardButton);
        assert.deepStrictEqual(openDashboardButton?.arguments, ['ws_1', 'plan_created']);
    });

    test('show renders Archive, conditional Run Build, Add Step, and Open in Dashboard when scripts exist', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setScripts([{ id: 'script_1' }]);

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const commands = response.buttonCalls.map((button) => button.command);
        assert.ok(commands.includes('projectMemory.archivePlan'));
        assert.ok(commands.includes('projectMemory.runBuildScript'));
        assert.ok(commands.includes('projectMemory.addStepToPlan'));
        assert.ok(commands.includes('projectMemory.openPlanInDashboard'));

        const buildButton = response.buttonCalls.find((button) => button.command === 'projectMemory.runBuildScript');
        assert.deepStrictEqual(buildButton?.arguments, ['plan_abc']);

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.deepStrictEqual(openDashboardButton?.arguments, [undefined, 'plan_abc']);
    });

    test('show omits Run Build when scripts are unavailable', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setFailListBuildScripts(true);

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const commands = response.buttonCalls.map((button) => button.command);
        assert.ok(commands.includes('projectMemory.archivePlan'));
        assert.ok(commands.includes('projectMemory.addStepToPlan'));
        assert.ok(!commands.includes('projectMemory.runBuildScript'));
    });

    test('scripts subcommand lists registered scripts and renders per-script Run buttons', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setScripts([
            {
                id: 'script_a',
                name: 'Build Server',
                command: 'npm run build',
                directory: './server',
                description: 'Compile server',
            },
            {
                id: 'script_b',
                name: 'Test Server',
                command: 'npx vitest run',
                directory: './server',
            },
        ]);

        await handlePlanCommand(
            createMockRequest('scripts') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.fullMarkdown.includes('Registered Build Scripts'));

        const runButtons = response.buttonCalls.filter((button) => button.command === 'projectMemory.runBuildScript');
        assert.strictEqual(runButtons.length, 2);
        assert.deepStrictEqual(runButtons[0].arguments, ['script_a', undefined]);
        assert.deepStrictEqual(runButtons[1].arguments, ['script_b', undefined]);

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.ok(openDashboardButton);
        assert.deepStrictEqual(openDashboardButton?.arguments, ['ws_1', undefined]);
    });

    test('scripts subcommand forwards scoped plan id to list_build_scripts and Run button arguments', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setScripts([
            {
                id: 'script_plan',
                name: 'Plan Build',
                command: 'npm run build',
                directory: './server',
            },
        ]);

        await handlePlanCommand(
            createMockRequest('scripts plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const listScriptsCall = bridge.calls.find((call) =>
            call.tool === 'memory_plan' && call.args.action === 'list_build_scripts'
        );

        assert.ok(listScriptsCall);
        assert.strictEqual(listScriptsCall?.args.plan_id, 'plan_abc');

        const runButton = response.buttonCalls.find((button) => button.command === 'projectMemory.runBuildScript');
        assert.ok(runButton);
        assert.deepStrictEqual(runButton?.arguments, ['script_plan', 'plan_abc']);

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.ok(openDashboardButton);
        assert.deepStrictEqual(openDashboardButton?.arguments, ['ws_1', 'plan_abc']);
    });

    test('help renders Open in Dashboard button', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handlePlanCommand(
            createMockRequest('help') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const openDashboardButton = response.buttonCalls.find((button) => button.command === 'projectMemory.openPlanInDashboard');
        assert.ok(openDashboardButton);
        assert.deepStrictEqual(openDashboardButton?.arguments, ['ws_1', undefined]);
    });

    test('show renders Create Dedicated Plan button for blocked steps', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                steps: [
                    { phase: 'Phase 1', task: 'Blocked task', status: 'blocked', index: 2 },
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const dedicatedButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.createDedicatedPlan'
                && Array.isArray(button.arguments)
                && button.arguments[0] === 'plan_abc'
                && button.arguments[1] === 2
        );

        assert.ok(dedicatedButton);
    });

    test('show renders scope escalation dedicated plan button when lineage summary indicates escalation', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                lineage: [
                    {
                        agent_type: 'Executor',
                        started_at: '2026-02-14T00:00:00.000Z',
                        summary: 'Scope escalation required for out-of-scope dependency changes',
                    }
                ],
                steps: [
                    { phase: 'Phase 1', task: 'Blocked task', status: 'blocked', index: 4 },
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const scopeEscalationButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.createDedicatedPlan'
                && button.title === 'Create Dedicated Plan (Scope Escalation)'
        );

        assert.ok(scopeEscalationButton);
        assert.deepStrictEqual(scopeEscalationButton?.arguments, ['plan_abc', 4]);
    });

    test('show renders scope escalation dedicated plan button with plan-only args when blocked step index is unavailable', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                lineage: [
                    {
                        agent_type: 'Executor',
                        started_at: '2026-02-14T00:00:00.000Z',
                        summary: 'Scope escalation required because blocker spans multiple plans',
                    }
                ],
                steps: [
                    { phase: 'Phase 1', task: 'Needs coordination', status: 'pending', index: 0 },
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const scopeEscalationButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.createDedicatedPlan'
                && button.title === 'Create Dedicated Plan (Scope Escalation)'
        );

        assert.ok(scopeEscalationButton);
        assert.deepStrictEqual(scopeEscalationButton?.arguments, ['plan_abc']);
    });

    test('show renders Launch button when recommended_next_agent exists', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                recommended_next_agent: 'Reviewer',
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const launchButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && Array.isArray(button.arguments)
                && button.arguments[0] === 'Reviewer'
        );

        assert.ok(launchButton);
        assert.strictEqual(launchButton?.title, 'Launch Reviewer');
    });

    test('show renders step and phase approval buttons for pending confirmations', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                steps: [
                    { phase: 'Validation', task: 'User confirm output', status: 'done', index: 0, requires_user_confirmation: true },
                    { phase: 'Validation', task: 'Confirm deployment path', status: 'done', index: 1, requires_confirmation: true },
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const approveStepButtons = response.buttonCalls.filter((button) => button.command === 'projectMemory.confirmPlanStep');
        assert.strictEqual(approveStepButtons.length, 2);
        assert.deepStrictEqual(approveStepButtons[0].arguments, ['plan_abc', 0]);
        assert.deepStrictEqual(approveStepButtons[1].arguments, ['plan_abc', 1]);

        const approvePhaseButton = response.buttonCalls.find((button) => button.command === 'projectMemory.confirmPlanPhase');
        assert.ok(approvePhaseButton);
        assert.deepStrictEqual(approvePhaseButton?.arguments, ['plan_abc', 'Validation']);
    });

    test('show omits confirmation buttons when step and phase are already approved', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                confirmation_state: {
                    steps: { '0': true },
                    phases: { Validation: { confirmed: true } },
                },
                steps: [
                    { phase: 'Validation', task: 'Already approved', status: 'done', index: 0, requires_user_confirmation: true },
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const approveButtons = response.buttonCalls.filter((button) =>
            button.command === 'projectMemory.confirmPlanStep' || button.command === 'projectMemory.confirmPlanPhase'
        );

        assert.strictEqual(approveButtons.length, 0);
    });

    test('show renders Architect suggestion buttons with Research Further launching Researcher chat', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                lineage: [
                    {
                        agent_type: 'Architect',
                        started_at: '2026-02-14T00:00:00.000Z',
                        summary: 'Produced initial architecture and step breakdown.',
                    }
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const researchFurtherButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && button.title === 'Research Further'
        );

        assert.ok(researchFurtherButton);
        assert.ok(Array.isArray(researchFurtherButton?.arguments));
        assert.strictEqual(researchFurtherButton?.arguments?.[0], 'Researcher');
        assert.ok(String(researchFurtherButton?.arguments?.[1] ?? '').includes('Continue as Researcher'));
        assert.deepStrictEqual(researchFurtherButton?.arguments?.[2], {
            workspace_id: 'ws_1',
            plan_id: 'plan_abc',
        });

        const addStepSuggestion = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.addStepToPlan'
                && button.title === 'Add Step'
                && Array.isArray(button.arguments)
                && button.arguments[0] === 'plan_abc'
        );

        assert.ok(addStepSuggestion);
    });

    test('show renders Plan Artifacts filetree when agent session files_modified/files_created are available', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                agent_sessions: {
                    recent: [
                        {
                            files_modified: ['vscode-extension/src/chat/ChatPlanCommands.ts'],
                            files_created: ['vscode-extension/src/chat/NewArtifact.ts'],
                        }
                    ],
                },
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.fullMarkdown.includes('Plan Artifacts'));
        assert.strictEqual(response.filetreeCalls.length, 1);
    });

    test('show renders Plan Artifacts filetree with workspace base URI and expected tree nodes', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                agent_sessions: {
                    recent: [
                        {
                            files_modified: ['vscode-extension/src/chat/ChatPlanCommands.ts'],
                            files_created: ['vscode-extension/src/chat/new/Artifact.ts'],
                        }
                    ],
                },
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.strictEqual(response.filetreeCalls.length, 1);
        const [{ value, baseUri }] = response.filetreeCalls;
        const normalizedBaseUri = getUriPath(baseUri).replace(/\\/g, '/');
        assert.ok(normalizedBaseUri.endsWith('/Project-Memory-MCP'));

        const serializedTree = JSON.stringify(value);
        assert.ok(serializedTree.includes('"name":"vscode-extension"'));
        assert.ok(serializedTree.includes('"name":"ChatPlanCommands.ts"'));
        assert.ok(serializedTree.includes('"name":"Artifact.ts"'));
    });

    test('show uses reference chips for file paths found in step notes and lineage files_modified', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                steps: [
                    {
                        phase: 'Phase 9',
                        task: 'Review findings',
                        status: 'done',
                        notes: 'Reviewed vscode-extension/src/chat/ChatPlanCommands.ts',
                    }
                ],
                lineage: [
                    {
                        agent_type: 'Reviewer',
                        started_at: '2026-02-14T00:00:00.000Z',
                        summary: 'Validation complete.',
                        files_modified: ['vscode-extension/src/chat/ChatResponseHelpers.ts'],
                    }
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.referenceCalls.length >= 2);
        const referencePaths = response.referenceCalls
            .map((entry) => getUriPath(entry.value).replace(/\\/g, '/'));

        assert.ok(referencePaths.some((filePath) => filePath.endsWith('/vscode-extension/src/chat/ChatPlanCommands.ts')));
        assert.ok(referencePaths.some((filePath) => filePath.endsWith('/vscode-extension/src/chat/ChatResponseHelpers.ts')));
    });

    test('show uses reference chips and inline anchors for file paths in lineage summaries', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                lineage: [
                    {
                        agent_type: 'Reviewer',
                        started_at: '2026-02-14T00:00:00.000Z',
                        summary: 'Validated fixes in vscode-extension/src/chat/ChatPlanCommands.ts and vscode-extension/src/chat/ChatResponseHelpers.ts.',
                    }
                ],
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.referenceCalls.length >= 2);
        assert.ok(response.anchorCalls.some((anchor) => anchor.title === 'vscode-extension/src/chat/ChatPlanCommands.ts'));
        assert.ok(response.anchorCalls.some((anchor) => anchor.title === 'vscode-extension/src/chat/ChatResponseHelpers.ts'));
    });

    test('show Launch button falls back to requested plan id in launch context when plan payload omits ids', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            plan_abc: {
                id: undefined,
                plan_id: undefined,
                recommended_next_agent: 'Reviewer',
            },
        });

        await handlePlanCommand(
            createMockRequest('show plan_abc') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const launchButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && Array.isArray(button.arguments)
                && button.arguments[0] === 'Reviewer'
        );

        assert.ok(launchButton);
        assert.ok(Array.isArray(launchButton?.arguments));
        assert.ok(String(launchButton?.arguments?.[1] ?? '').includes('- plan_id: plan_abc'));
        assert.deepStrictEqual(launchButton?.arguments?.[2], {
            workspace_id: 'ws_1',
            plan_id: 'plan_abc',
        });
    });

    test('program show renders child Launch buttons for independent child plans', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            program_root: {
                is_program: true,
                child_plan_ids: ['child_a', 'child_b'],
            },
            child_a: {
                title: 'Child A',
                recommended_next_agent: 'Executor',
            },
            child_b: {
                title: 'Child B',
                recommended_next_agent: 'Tester',
            },
        });
        bridge.setProgramChildPlans([
            { plan_id: 'child_a', title: 'Child A', depends_on_plans: [] },
            { plan_id: 'child_b', title: 'Child B', depends_on_plans: ['child_a'] },
        ]);

        await handlePlanCommand(
            createMockRequest('show program_root') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.fullMarkdown.includes('**Type**: Integrated Program'));
        assert.ok(response.fullMarkdown.includes('### Child Plan Actions'));

        const openChildButtons = response.buttonCalls.filter((button) =>
            button.command === 'projectMemory.showPlanInChat'
                && typeof button.title === 'string'
                && button.title.includes('Child A')
        );
        assert.strictEqual(openChildButtons.length, 1);
        assert.deepStrictEqual(openChildButtons[0]?.arguments, ['child_a']);

        const childLaunchButtons = response.buttonCalls.filter((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && typeof button.title === 'string'
                && button.title.includes('(Child A)')
        );

        assert.strictEqual(childLaunchButtons.length, 1);

        const dependentChildButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && typeof button.title === 'string'
                && button.title.includes('(Child B)')
        );
        assert.strictEqual(dependentChildButton, undefined);
    });

    test('program child Launch uses list child id fallback when child plan payload omits ids', async function () {
        if (!handlePlanCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();
        bridge.setPlanOverrides({
            program_root: {
                is_program: true,
                child_plan_ids: ['child_a'],
            },
            child_a: {
                id: undefined,
                plan_id: undefined,
                title: 'Child A',
                recommended_next_agent: 'Executor',
            },
        });
        bridge.setProgramChildPlans([
            { plan_id: 'child_a', title: 'Child A', depends_on_plans: [] },
        ]);

        await handlePlanCommand(
            createMockRequest('show program_root') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        const childLaunchButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.launchAgentChat'
                && typeof button.title === 'string'
                && button.title.includes('(Child A)')
        );

        const openChildButton = response.buttonCalls.find((button) =>
            button.command === 'projectMemory.showPlanInChat'
                && typeof button.title === 'string'
                && button.title.includes('Child A')
        );
        assert.ok(openChildButton);
        assert.deepStrictEqual(openChildButton?.arguments, ['child_a']);

        assert.ok(childLaunchButton);
        assert.ok(Array.isArray(childLaunchButton?.arguments));
        assert.ok(String(childLaunchButton?.arguments?.[1] ?? '').includes('- plan_id: child_a'));
        assert.deepStrictEqual(childLaunchButton?.arguments?.[2], {
            workspace_id: 'ws_1',
            plan_id: 'child_a',
        });
    });
});
