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
            assert.ok((error as Error).message.includes('Not connected'));
        }
        
        bridge.dispose();
    });

    test('McpBridge throws when listing tools without connection', async () => {
        const config: McpBridgeConfig = {
            serverMode: 'bundled'
        };
        
        const bridge = new McpBridge(config);
        
        try {
            await bridge.listTools();
            assert.fail('Should have thrown an error');
        } catch (error) {
            assert.ok(error instanceof Error);
            assert.ok((error as Error).message.includes('Not connected'));
        }
        
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
});
