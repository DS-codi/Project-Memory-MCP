/**
 * Chat Participant Tests
 * 
 * Note: Full integration testing requires VS Code extension host.
 * These tests verify the module structure and exports.
 */

import * as assert from 'assert';

suite('ChatParticipant Test Suite', () => {
    
    test('ChatParticipant module exports correctly', () => {
        // Import the module to verify it compiles and exports
        const chatModule = require('../../chat');
        
        assert.ok(chatModule.ChatParticipant, 'ChatParticipant should be exported');
        assert.ok(typeof chatModule.ChatParticipant === 'function', 'ChatParticipant should be a constructor');
    });

    test('ChatParticipant requires McpBridge', () => {
        const { ChatParticipant, McpBridge } = require('../../chat');
        
        // Create a mock bridge
        const mockConfig = { serverMode: 'bundled' as const };
        const bridge = new McpBridge(mockConfig);
        
        const participant = new ChatParticipant(bridge, { registerWithVscode: false });
        participant.dispose();
        bridge.dispose();
    });
});
