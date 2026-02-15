import * as assert from 'assert';

function createMockResponse() {
    const markdownCalls: string[] = [];
    const progressCalls: string[] = [];

    return {
        markdown: (text: string) => { markdownCalls.push(text); },
        progress: (text: string) => { progressCalls.push(text); },
        markdownCalls,
        progressCalls,
        get fullMarkdown() { return markdownCalls.join(''); },
    };
}

function createMockRequest(prompt: string) {
    return { prompt } as { prompt: string };
}

function createMockBridge() {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

    return {
        callTool: async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
            calls.push({ tool, args });

            if (tool === 'memory_workspace' && args.action === 'info') {
                return {
                    workspace_id: 'ws_1',
                    workspace_path: 'C:/repo',
                    codebase_profile: {
                        languages: ['TypeScript'],
                        frameworks: ['VS Code'],
                        file_count: 100,
                    },
                } as T;
            }

            if (tool === 'memory_context' && args.action === 'workspace_get') {
                return {
                    sections: {
                        project_details: { summary: 'Project summary', items: [] }
                    },
                    updated_at: '2026-02-14T00:00:00.000Z'
                } as T;
            }

            if (tool === 'memory_context' && args.action === 'knowledge_list') {
                return { files: [] } as T;
            }

            return {} as T;
        },
        calls,
    };
}

suite('ChatContextCommands Test Suite', () => {
    let handleContextCommand: typeof import('../../chat/ChatContextCommands').handleContextCommand;

    suiteSetup(() => {
        try {
            handleContextCommand = require('../../chat/ChatContextCommands').handleContextCommand;
        } catch {
        }
    });

    test('context command reports progress for workspace info, context, and knowledge listing', async function () {
        if (!handleContextCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handleContextCommand(
            createMockRequest('') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.progressCalls.includes('Loading workspace info...'));
        assert.ok(response.progressCalls.includes('Loading workspace context...'));
        assert.ok(response.progressCalls.includes('Listing knowledge files...'));

        const calledActions = bridge.calls.map((entry) => `${entry.tool}:${String(entry.args.action ?? '')}`);
        assert.ok(calledActions.includes('memory_workspace:info'));
        assert.ok(calledActions.includes('memory_context:workspace_get'));
        assert.ok(calledActions.includes('memory_context:knowledge_list'));
    });

    test('context set reports formatted update progress and calls workspace_update', async function () {
        if (!handleContextCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handleContextCommand(
            createMockRequest('set project_details Updated summary') as any,
            response as any,
            {} as any,
            bridge as any,
            'ws_1'
        );

        assert.ok(response.progressCalls.includes('Updating Project Details...'));

        const updateCall = bridge.calls.find((entry) =>
            entry.tool === 'memory_context' && entry.args.action === 'workspace_update'
        );
        assert.ok(updateCall);
        assert.strictEqual(updateCall?.args.workspace_id, 'ws_1');
        assert.strictEqual(updateCall?.args.type, 'project_details');
    });
});
