import * as assert from 'assert';
import {
    extractWorkspaceIdFromRegisterResponse,
    resolveWorkspaceIdFromWorkspaceList,
} from '../../chat/workspaceRegistration';

suite('workspaceRegistration', () => {
    suite('extractWorkspaceIdFromRegisterResponse', () => {
        test('parses top-level workspace_id', () => {
            const result = extractWorkspaceIdFromRegisterResponse({ workspace_id: 'ws-1' });
            assert.strictEqual(result, 'ws-1');
        });

        test('parses nested data.workspace_id', () => {
            const result = extractWorkspaceIdFromRegisterResponse({ data: { workspace_id: 'ws-2' } });
            assert.strictEqual(result, 'ws-2');
        });

        test('parses nested data.workspace.workspace_id', () => {
            const result = extractWorkspaceIdFromRegisterResponse({ data: { workspace: { workspace_id: 'ws-3' } } });
            assert.strictEqual(result, 'ws-3');
        });

        test('parses deeply wrapped payload variants', () => {
            const result = extractWorkspaceIdFromRegisterResponse({
                success: true,
                data: {
                    result: {
                        payload: {
                            workspace: {
                                workspace_id: 'ws-4'
                            }
                        }
                    }
                }
            });

            assert.strictEqual(result, 'ws-4');
        });
    });

    suite('resolveWorkspaceIdFromWorkspaceList', () => {
        test('resolves by exact path match', () => {
            const listPayload = {
                workspaces: [
                    { workspace_id: 'ws-target', path: 'C:\\Repo\\Project' },
                    { workspace_id: 'ws-other', path: 'C:\\Repo\\Other' },
                ]
            };

            const resolved = resolveWorkspaceIdFromWorkspaceList(listPayload, 'C:\\Repo\\Project');
            assert.strictEqual(resolved, 'ws-target');
        });

        test('resolves by normalized path equivalence', () => {
            const listPayload = {
                data: {
                    workspaces: [
                        { workspace_id: 'ws-normalized', path: 'c:/repo/project/' },
                    ]
                }
            };

            const resolved = resolveWorkspaceIdFromWorkspaceList(listPayload, 'C:\\Repo\\Project');
            assert.strictEqual(resolved, 'ws-normalized');
        });

        test('resolves by parent-child overlap when opened at parent folder', () => {
            const listPayload = {
                data: {
                    data: {
                        workspaces: [
                            { workspace_id: 'ws-canonical-child', path: 'C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP' },
                        ]
                    }
                }
            };

            const resolved = resolveWorkspaceIdFromWorkspaceList(
                listPayload,
                'C:\\Users\\User\\Project_Memory_MCP',
                'C:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP'
            );
            assert.strictEqual(resolved, 'ws-canonical-child');
        });

        test('uses legacy alias id if canonical key is absent', () => {
            const listPayload = {
                workspaces: [
                    {
                        legacy_workspace_id: 'ws-legacy',
                        workspace_path: 'C:\\Repo\\Project'
                    }
                ]
            };

            const resolved = resolveWorkspaceIdFromWorkspaceList(listPayload, 'C:\\Repo\\Project');
            assert.strictEqual(resolved, 'ws-legacy');
        });

        test('returns undefined when no match exists', () => {
            const listPayload = {
                workspaces: [
                    { workspace_id: 'ws-other', path: 'C:\\Repo\\Other' }
                ]
            };

            const resolved = resolveWorkspaceIdFromWorkspaceList(listPayload, 'C:\\Repo\\Project');
            assert.strictEqual(resolved, undefined);
        });
    });
});
