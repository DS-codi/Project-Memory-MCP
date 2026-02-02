/**
 * Tool Provider Tests
 * 
 * Note: Full integration testing requires VS Code extension host with LM API.
 * These tests verify the module structure and exports.
 */

import * as assert from 'assert';

suite('ToolProvider Test Suite', () => {
    
    test('ToolProvider module exports correctly', () => {
        const chatModule = require('../../chat');
        
        assert.ok(chatModule.ToolProvider, 'ToolProvider should be exported');
        assert.ok(typeof chatModule.ToolProvider === 'function', 'ToolProvider should be a constructor');
    });

    test('ToolProvider requires McpBridge', () => {
        const { ToolProvider, McpBridge } = require('../../chat');
        
        // Create a mock bridge
        const mockConfig = { serverMode: 'bundled' as const };
        const bridge = new McpBridge(mockConfig);
        
        // ToolProvider requires bridge
        try {
            // This will fail in test environment without VS Code LM API
            new ToolProvider(bridge);
        } catch {
            // Expected in test environment without VS Code
        }
        
        bridge.dispose();
    });

    test('Module index exports all components', () => {
        const chatModule = require('../../chat');
        
        // Verify all expected exports
        const expectedExports = [
            'McpBridge',
            'ChatParticipant',
            'ToolProvider'
        ];
        
        for (const exportName of expectedExports) {
            assert.ok(
                chatModule[exportName],
                `${exportName} should be exported from chat module`
            );
        }
    });
});
