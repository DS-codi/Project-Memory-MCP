/**
 * KnowledgeCommandHandler Tests
 *
 * Tests the /knowledge command handler's parsing logic, subcommand routing,
 * MCP tool call arguments, and response rendering.
 *
 * The handler is a standalone exported function with injected dependencies
 * (response, mcpBridge, workspaceId), so we can test it with lightweight mocks.
 */

import * as assert from 'assert';

// ── Mock Factories ─────────────────────────────────────────────────────

/** Collects all markdown/progress calls for assertion */
function createMockResponse() {
    const markdownCalls: string[] = [];
    const progressCalls: string[] = [];

    return {
        markdown: (text: string) => { markdownCalls.push(text); },
        progress: (text: string) => { progressCalls.push(text); },
        markdownCalls,
        progressCalls,
        /** Joined markdown output for substring assertions */
        get fullMarkdown() { return markdownCalls.join(''); },
    };
}

/** Mock McpBridge that records calls and returns canned responses */
function createMockBridge(responses: Record<string, unknown> = {}) {
    const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

    return {
        callTool: async <T>(tool: string, args: Record<string, unknown>): Promise<T> => {
            calls.push({ tool, args });
            const key = args.action as string;
            if (responses[key] !== undefined) {
                return responses[key] as T;
            }
            return {} as T;
        },
        calls,
    };
}

function createMockRequest(prompt: string) {
    return { prompt } as { prompt: string };
}

const CANCEL_TOKEN = {} as { isCancellationRequested: boolean };

suite('KnowledgeCommandHandler Test Suite', () => {

    // Lazy-load to avoid require-time VS Code dependency issues
    let handleKnowledgeCommand: typeof import('../../chat/KnowledgeCommandHandler').handleKnowledgeCommand;

    suiteSetup(() => {
        try {
            handleKnowledgeCommand = require('../../chat/KnowledgeCommandHandler').handleKnowledgeCommand;
        } catch {
            // VS Code API not available — tests will be skipped
        }
    });

    // ── No Workspace ──────────────────────────────────────────────────

    test('returns warning when workspaceId is null', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            null,
        );

        assert.ok(response.fullMarkdown.includes('Workspace not registered'));
        assert.deepStrictEqual(result.metadata, { command: 'knowledge' });
        assert.strictEqual(bridge.calls.length, 0, 'No MCP call should be made');
    });

    // ── Usage / Help ──────────────────────────────────────────────────

    test('shows usage when no subcommand given (empty prompt)', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-123',
        );

        assert.ok(response.fullMarkdown.includes('Knowledge Commands'));
        assert.ok(response.fullMarkdown.includes('/knowledge list'));
        assert.ok(response.fullMarkdown.includes('/knowledge show'));
        assert.ok(response.fullMarkdown.includes('/knowledge add'));
        assert.ok(response.fullMarkdown.includes('/knowledge delete'));
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'help' });
    });

    test('shows usage for unknown subcommand', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('foobar') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-123',
        );

        assert.ok(response.fullMarkdown.includes('Knowledge Commands'));
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'help' });
    });

    // ── /knowledge list ───────────────────────────────────────────────

    test('list calls MCP with correct action and workspace_id', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_list: { files: [] },
        });

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-abc',
        );

        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_context');
        assert.strictEqual(bridge.calls[0].args.action, 'knowledge_list');
        assert.strictEqual(bridge.calls[0].args.workspace_id, 'ws-abc');
    });

    test('list shows empty-state message when no files', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({ knowledge_list: { files: [] } });

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('No knowledge files yet'));
    });

    test('list renders files with title, category badge, slug, and date', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_list: {
                files: [
                    { slug: 'db-schema', title: 'DB Schema', category: 'schema', updated_at: '2026-01-01T00:00:00Z' },
                    { slug: 'api-limits', title: 'API Limits', category: 'limitation' },
                ],
            },
        });

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('**2** files available'));
        assert.ok(response.fullMarkdown.includes('**DB Schema**'));
        assert.ok(response.fullMarkdown.includes('`db-schema`'));
        assert.ok(response.fullMarkdown.includes('📐 Schema'));
        assert.ok(response.fullMarkdown.includes('**API Limits**'));
        assert.ok(response.fullMarkdown.includes('⚠️ Limitation'));
        assert.ok(response.fullMarkdown.includes('/knowledge show {slug}'));
    });

    test('list handles single file grammatically (no plural)', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_list: {
                files: [{ slug: 'one', title: 'One', category: 'reference' }],
            },
        });

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        // "1 file available" not "1 files available"
        assert.ok(response.fullMarkdown.includes('**1** file available'));
        assert.ok(!response.fullMarkdown.includes('**1** files available'));
    });

    test('list handles MCP error gracefully', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = {
            callTool: async () => { throw new Error('connection timeout'); },
            calls: [],
        };

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Failed to list knowledge files'));
        assert.ok(response.fullMarkdown.includes('connection timeout'));
    });

    // ── /knowledge show ───────────────────────────────────────────────

    test('show requires a slug argument', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('show') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Please provide a slug'));
        assert.strictEqual(bridge.calls.length, 0);
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'show' });
    });

    test('show calls MCP with correct slug and renders content', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_get: {
                file: {
                    slug: 'db-schema',
                    title: 'Database Schema',
                    category: 'schema',
                    content: '## Users Table\n\nid, name, email',
                    tags: ['database', 'postgres'],
                    updated_at: '2026-02-01T12:00:00Z',
                    created_by_agent: 'Archivist',
                },
            },
        });

        const result = await handleKnowledgeCommand(
            createMockRequest('show db-schema') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.strictEqual(bridge.calls[0].args.slug, 'db-schema');
        assert.ok(response.fullMarkdown.includes('# Database Schema'));
        assert.ok(response.fullMarkdown.includes('📐 Schema'));
        assert.ok(response.fullMarkdown.includes('database, postgres'));
        assert.ok(response.fullMarkdown.includes('Archivist'));
        assert.ok(response.fullMarkdown.includes('## Users Table'));
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'show', slug: 'db-schema' });
    });

    test('show handles not-found (null file)', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({ knowledge_get: { file: null } });

        await handleKnowledgeCommand(
            createMockRequest('show nonexistent') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('not found'));
    });

    test('show handles MCP error gracefully', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = {
            callTool: async () => { throw new Error('server unavailable'); },
            calls: [],
        };

        await handleKnowledgeCommand(
            createMockRequest('show some-slug') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Failed to load knowledge file'));
        assert.ok(response.fullMarkdown.includes('server unavailable'));
    });

    test('show renders file without optional fields (no tags, no agent, no date)', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_get: {
                file: {
                    slug: 'minimal',
                    title: 'Minimal File',
                    category: 'reference',
                    content: 'Just content.',
                },
            },
        });

        await handleKnowledgeCommand(
            createMockRequest('show minimal') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('# Minimal File'));
        assert.ok(response.fullMarkdown.includes('Just content.'));
        // Should NOT contain tags/agent/date lines
        assert.ok(!response.fullMarkdown.includes('**Tags**'));
        assert.ok(!response.fullMarkdown.includes('**Created by**'));
        assert.ok(!response.fullMarkdown.includes('**Updated**'));
    });

    // ── /knowledge add ────────────────────────────────────────────────

    test('add requires slug argument', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('add') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Usage'));
        assert.strictEqual(bridge.calls.length, 0);
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'add' });
    });

    test('add requires content after slug', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        await handleKnowledgeCommand(
            createMockRequest('add my-slug') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('provide content'));
        assert.strictEqual(bridge.calls.length, 0);
    });

    test('add derives title from slug (hyphen-to-space, title-case)', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_store: { slug: 'api-rate-limits', title: 'Api Rate Limits', category: 'reference' },
        });

        await handleKnowledgeCommand(
            createMockRequest('add api-rate-limits Some content here') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        // The MCP call should include the derived title
        const storeCall = bridge.calls[0];
        assert.strictEqual(storeCall.args.title, 'Api Rate Limits');
        assert.strictEqual(storeCall.args.category, 'reference');
    });

    test('add extracts content after slug correctly', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_store: { slug: 'my-notes', title: 'My Notes', category: 'reference' },
        });

        await handleKnowledgeCommand(
            createMockRequest('add my-notes # Title\nLine 1\nLine 2') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        const storeCall = bridge.calls[0];
        assert.strictEqual(storeCall.args.content, '# Title\nLine 1\nLine 2');
        assert.strictEqual(storeCall.args.slug, 'my-notes');
    });

    test('add calls MCP knowledge_store with correct args', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_store: { slug: 'test-file', title: 'Test File', category: 'reference' },
        });

        await handleKnowledgeCommand(
            createMockRequest('add test-file Hello world') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-42',
        );

        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_context');
        assert.strictEqual(bridge.calls[0].args.action, 'knowledge_store');
        assert.strictEqual(bridge.calls[0].args.workspace_id, 'ws-42');
        assert.strictEqual(bridge.calls[0].args.slug, 'test-file');
        assert.strictEqual(bridge.calls[0].args.content, 'Hello world');
    });

    test('add shows confirmation with title and slug', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_store: { slug: 'my-doc', title: 'My Doc', category: 'reference' },
        });

        await handleKnowledgeCommand(
            createMockRequest('add my-doc Some stuff') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Knowledge file created'));
        assert.ok(response.fullMarkdown.includes('My Doc'));
        assert.ok(response.fullMarkdown.includes('my-doc'));
    });

    test('add handles MCP error gracefully', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = {
            callTool: async () => { throw new Error('disk full'); },
            calls: [],
        };

        await handleKnowledgeCommand(
            createMockRequest('add test-slug content here') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Failed to create knowledge file'));
        assert.ok(response.fullMarkdown.includes('disk full'));
    });

    // ── /knowledge delete ─────────────────────────────────────────────

    test('delete requires a slug argument', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge();

        const result = await handleKnowledgeCommand(
            createMockRequest('delete') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Please provide a slug'));
        assert.strictEqual(bridge.calls.length, 0);
        assert.deepStrictEqual(result.metadata, { command: 'knowledge', action: 'delete' });
    });

    test('delete calls MCP with correct action and slug', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_delete: { slug: 'old-notes', message: 'Deleted' },
        });

        await handleKnowledgeCommand(
            createMockRequest('delete old-notes') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-77',
        );

        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].tool, 'memory_context');
        assert.strictEqual(bridge.calls[0].args.action, 'knowledge_delete');
        assert.strictEqual(bridge.calls[0].args.slug, 'old-notes');
        assert.strictEqual(bridge.calls[0].args.workspace_id, 'ws-77');
    });

    test('delete shows confirmation', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_delete: { slug: 'doomed', message: 'ok' },
        });

        await handleKnowledgeCommand(
            createMockRequest('delete doomed') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('deleted'));
        assert.ok(response.fullMarkdown.includes('doomed'));
    });

    test('delete handles MCP error gracefully', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = {
            callTool: async () => { throw new Error('not found'); },
            calls: [],
        };

        await handleKnowledgeCommand(
            createMockRequest('delete missing-slug') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('Failed to delete knowledge file'));
        assert.ok(response.fullMarkdown.includes('not found'));
    });

    // ── CATEGORY_LABELS mapping ───────────────────────────────────────

    test('list uses correct badge for each known category', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const categories = [
            { category: 'schema', badge: '📐 Schema' },
            { category: 'config', badge: '⚙️ Config' },
            { category: 'limitation', badge: '⚠️ Limitation' },
            { category: 'plan-summary', badge: '📋 Plan Summary' },
            { category: 'reference', badge: '📖 Reference' },
            { category: 'convention', badge: '📏 Convention' },
        ];

        for (const { category, badge } of categories) {
            const response = createMockResponse();
            const bridge = createMockBridge({
                knowledge_list: {
                    files: [{ slug: 'x', title: 'X', category }],
                },
            });

            await handleKnowledgeCommand(
                createMockRequest('list') as any,
                response as any,
                CANCEL_TOKEN as any,
                bridge as any,
                'ws-1',
            );

            assert.ok(
                response.fullMarkdown.includes(badge),
                `Expected badge "${badge}" for category "${category}". Got: ${response.fullMarkdown}`,
            );
        }
    });

    test('list falls back to raw category for unknown category', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({
            knowledge_list: {
                files: [{ slug: 'x', title: 'X', category: 'custom-category' }],
            },
        });

        await handleKnowledgeCommand(
            createMockRequest('list') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        assert.ok(response.fullMarkdown.includes('custom-category'));
    });

    // ── Subcommand case insensitivity ─────────────────────────────────

    test('subcommand parsing is case-insensitive', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const response = createMockResponse();
        const bridge = createMockBridge({ knowledge_list: { files: [] } });

        await handleKnowledgeCommand(
            createMockRequest('LIST') as any,
            response as any,
            CANCEL_TOKEN as any,
            bridge as any,
            'ws-1',
        );

        // Should have called knowledge_list, not shown usage
        assert.strictEqual(bridge.calls.length, 1);
        assert.strictEqual(bridge.calls[0].args.action, 'knowledge_list');
    });

    // ── Metadata in results ───────────────────────────────────────────

    test('each subcommand returns correct metadata', async function () {
        if (!handleKnowledgeCommand) { this.skip(); return; }

        const bridge = createMockBridge({
            knowledge_list: { files: [] },
            knowledge_get: { file: { slug: 's', title: 'T', category: 'reference', content: '' } },
            knowledge_store: { slug: 's', title: 'T', category: 'reference' },
            knowledge_delete: { slug: 's' },
        });

        const listResult = await handleKnowledgeCommand(
            createMockRequest('list') as any, createMockResponse() as any, CANCEL_TOKEN as any, bridge as any, 'ws-1');
        assert.deepStrictEqual(listResult.metadata, { command: 'knowledge', action: 'list' });

        const showResult = await handleKnowledgeCommand(
            createMockRequest('show s') as any, createMockResponse() as any, CANCEL_TOKEN as any, bridge as any, 'ws-1');
        assert.deepStrictEqual(showResult.metadata, { command: 'knowledge', action: 'show', slug: 's' });

        const addResult = await handleKnowledgeCommand(
            createMockRequest('add s content') as any, createMockResponse() as any, CANCEL_TOKEN as any, bridge as any, 'ws-1');
        assert.deepStrictEqual(addResult.metadata, { command: 'knowledge', action: 'add', slug: 's' });

        const deleteResult = await handleKnowledgeCommand(
            createMockRequest('delete s') as any, createMockResponse() as any, CANCEL_TOKEN as any, bridge as any, 'ws-1');
        assert.deepStrictEqual(deleteResult.metadata, { command: 'knowledge', action: 'delete', slug: 's' });
    });
});
