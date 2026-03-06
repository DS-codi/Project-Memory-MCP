import * as assert from 'assert';
import {
    CHAT_SECTION_KEY,
    IMPORTANT_SECTION_KEY,
    buildSessionDigest,
    buildUpdatedSections,
    resolveToolNameFromList,
    type TranscriptEntry,
} from '../../chat/store-chat-details-participant';

suite('StoreChatDetailsParticipant helpers', () => {
    test('buildSessionDigest extracts useful signals from transcript', () => {
        const transcript: TranscriptEntry[] = [
            {
                role: 'user',
                content: 'i wanna create /store-chat-details and keep old commands out of vscode-extension/src/extension.ts',
            },
            {
                role: 'assistant',
                content: 'We will only add /store-chat-details and avoid plan/context legacy commands.',
            },
            {
                role: 'assistant',
                content: 'Run npm run compile in vscode-extension and then run .\\run-tests.ps1 -Component Extension.',
            },
            {
                role: 'assistant',
                content: 'TypeScript error TS2304: Cannot find name ChatParticipant.',
            },
        ];

        const digest = buildSessionDigest(transcript, '2026-03-07T00:00:00.000Z');

        assert.strictEqual(digest.totalTurns, 4);
        assert.ok(digest.userIntents.length > 0, 'Expected at least one user intent');
        assert.ok(digest.commandSnippets.some((entry) => /npm run compile/i.test(entry)));
        assert.ok(digest.fileReferences.some((entry) => /vscode-extension\/src\/extension\.ts/i.test(entry)));
        assert.ok(digest.errorSignals.some((entry) => /TS2304/i.test(entry)));
    });

    test('buildUpdatedSections preserves existing sections and appends important context', () => {
        const digest = buildSessionDigest(
            [
                { role: 'user', content: 'Please store useful context from this session.' },
                { role: 'assistant', content: 'Will do. Constraint: only one slash command should exist.' },
            ],
            '2026-03-07T01:00:00.000Z'
        );

        const existingSections = {
            project_details: {
                summary: 'Existing project details',
            },
            important_context: {
                summary: 'Existing important summary',
                items: [
                    {
                        title: 'Prior insight',
                        description: 'Keep this item',
                    },
                ],
            },
        };

        const merged = buildUpdatedSections(existingSections, digest);

        assert.ok(merged.project_details, 'Existing non-chat sections should be preserved');
        assert.ok(merged[CHAT_SECTION_KEY], 'Detailed chat section should be added');
        assert.ok(merged[IMPORTANT_SECTION_KEY], 'Important context section should be present');

        const importantItems = merged[IMPORTANT_SECTION_KEY].items ?? [];
        assert.ok(importantItems.length >= 2, 'Important context should include the new synthesis and existing item');
        assert.ok(/Chat synthesis/.test(importantItems[0].title));
        assert.strictEqual(importantItems[1].title, 'Prior insight');
    });

    test('resolveToolNameFromList accepts both direct and prefixed MCP names', () => {
        const toolNames = [
            'something_else',
            'mcp_project-memor_memory_workspace',
            'mcp_project-memor_memory_context',
        ];

        const workspaceTool = resolveToolNameFromList(toolNames, ['memory_workspace']);
        const contextTool = resolveToolNameFromList(toolNames, ['memory_context']);

        assert.strictEqual(workspaceTool, 'mcp_project-memor_memory_workspace');
        assert.strictEqual(contextTool, 'mcp_project-memor_memory_context');
    });
});
