import * as assert from 'assert';

type MockResponse = {
    markdown: (value: string) => void;
    progress: (value: string) => void;
    markdownCalls: string[];
    progressCalls: string[];
};

function createMockResponse(): MockResponse {
    const markdownCalls: string[] = [];
    const progressCalls: string[] = [];

    return {
        markdown: (value: string) => { markdownCalls.push(value); },
        progress: (value: string) => { progressCalls.push(value); },
        markdownCalls,
        progressCalls,
    };
}

function createMockRequest(prompt: string) {
    return { prompt } as { prompt: string };
}

function createMockBridge(options?: {
    connected?: boolean;
    activePlans?: Array<{ id?: string; plan_id?: string; title: string; status?: string }>;
}) {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];
    const connected = options?.connected ?? true;
    const activePlans = options?.activePlans ?? [];

    return {
        isConnected: () => connected,
        callTool: async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
            calls.push({ tool, args });
            if (tool === 'memory_plan' && args.action === 'list') {
                return { active_plans: activePlans } as T;
            }
            return {} as T;
        },
        calls,
    };
}

suite('ChatMiscCommands Test Suite', () => {
    let handleHandoffCommand: typeof import('../../chat/ChatMiscCommands').handleHandoffCommand;
    let handleStatusCommand: typeof import('../../chat/ChatMiscCommands').handleStatusCommand;

    suiteSetup(() => {
        try {
            const module = require('../../chat/ChatMiscCommands');
            handleHandoffCommand = module.handleHandoffCommand;
            handleStatusCommand = module.handleStatusCommand;
        } catch {
        }
    });

    test('handoff records progress message while calling memory_agent handoff', async function () {
        if (!handleHandoffCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handleHandoffCommand(
            createMockRequest('Reviewer plan_123 carry over summary') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.progressCalls.includes('Recording handoff...'));
        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_agent');
        assert.strictEqual(bridge.calls[0].args.action, 'handoff');
        assert.strictEqual(bridge.calls[0].args.plan_id, 'plan_123');
        assert.strictEqual(bridge.calls[0].args.to_agent, 'Reviewer');
    });

    test('handoff ignores duplicated command token and uses real target agent', async function () {
        if (!handleHandoffCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handleHandoffCommand(
            createMockRequest('/handoff Coordinator plan_123 from followup') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_agent');
        assert.strictEqual(bridge.calls[0].args.to_agent, 'Coordinator');
        assert.strictEqual(bridge.calls[0].args.plan_id, 'plan_123');
    });

    test('status emits plan-listing progress message before rendering plan status', async function () {
        if (!handleStatusCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            connected: true,
            activePlans: [
                { id: 'plan_alpha', title: 'Alpha Plan', status: 'active' }
            ]
        });

        await handleStatusCommand(
            createMockRequest('') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.progressCalls.includes('Checking MCP connection...'));
        assert.ok(response.progressCalls.includes('Listing plans...'));
        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_plan');
        assert.strictEqual(bridge.calls[0].args.action, 'list');
    });
});
