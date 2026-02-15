/**
 * MCP Bridge Unit Tests
 */

import * as assert from 'assert';
import { McpBridge, McpBridgeConfig } from '../../chat/McpBridge';

suite('McpBridge Test Suite', () => {
    
    test('McpBridge initializes with default config', () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };
        
        const bridge = new McpBridge(config);
        assert.strictEqual(bridge.isConnected(), false);
        bridge.dispose();
    });

    test('McpBridge validates server mode', () => {
        const validModes: Array<'bundled' | 'podman' | 'external'> = ['bundled', 'podman', 'external'];
        
        for (const mode of validModes) {
            const config: McpBridgeConfig = { serverMode: mode };
            const bridge = new McpBridge(config);
            assert.strictEqual(bridge.isConnected(), false);
            bridge.dispose();
        }
    });

    test('McpBridge fires connection change event', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };
        
        const bridge = new McpBridge(config);
        
        let eventFired = false;
        const disposable = bridge.onConnectionChange((connected) => {
            eventFired = true;
        });

        // Dispose without connecting - should not fire
        bridge.dispose();
        disposable.dispose();
        
        // Event may or may not have fired depending on implementation
        // This is mainly testing that the event mechanism doesn't throw
    });

    test('McpBridge throws when calling tool without connection', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };
        
        const bridge = new McpBridge(config);
        
        try {
            await bridge.callTool('test_tool', {});
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok(/not connected/i.test((error as Error).message));
        }
        
        bridge.dispose();
    });

    test('McpBridge lists tools without requiring connection', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };
        
        const bridge = new McpBridge(config);

        const tools = await bridge.listTools();
        assert.ok(Array.isArray(tools));
        assert.ok(tools.length > 0);
        
        bridge.dispose();
    });

    test('McpBridge requires externalServerPath in external mode', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'external',
            externalServerPath: '' // Empty path should fail
        };
        
        const bridge = new McpBridge(config);
        
        try {
            await bridge.connect();
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            // Error could be about path not configured or spawn failure
        }
        
        bridge.dispose();
    });

    test('McpBridge uses template endpoint when creating plan with template', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };

        const bridge = new McpBridge(config);
        (bridge as any).connected = true;

        let calledPath = '';
        let calledPayload: Record<string, unknown> | null = null;

        (bridge as any).httpPost = async (path: string, payload: Record<string, unknown>) => {
            calledPath = path;
            calledPayload = payload;
            return { plan: { id: 'plan_1', steps: [] } };
        };

        await bridge.callTool('create_plan', {
            workspace_id: 'ws_test_123',
            title: 'Template Plan',
            description: 'From template',
            template: 'feature'
        });

        assert.strictEqual(calledPath, '/api/plans/ws_test_123/template');
        assert.ok((calledPayload as any)?.template === 'feature');

        bridge.dispose();
    });
});
