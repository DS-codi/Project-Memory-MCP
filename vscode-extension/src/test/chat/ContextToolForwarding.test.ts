import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('vscode', () => {
    class LanguageModelTextPart {
        value: string;
        text: string;

        constructor(value: string) {
            this.value = value;
            this.text = value;
        }
    }

    class LanguageModelToolResult {
        content: unknown[];

        constructor(content: unknown[]) {
            this.content = content;
        }
    }

    class CancellationTokenSource {
        token = {};
    }

    return {
        LanguageModelTextPart,
        LanguageModelToolResult,
        CancellationTokenSource,
    };
});

import * as vscode from 'vscode';
import { handleContextTool, type ContextToolInput } from '../../chat/tools/context-tool';

function parseToolResult(result: vscode.LanguageModelToolResult): Record<string, unknown> {
    const part = result.content[0] as unknown as { value?: string; text?: string };
    const raw = part.value ?? part.text ?? '{}';
    return JSON.parse(raw) as Record<string, unknown>;
}

function createContext(calls: Array<{ tool: string; args: Record<string, unknown> }>) {
    return {
        mcpBridge: {
            isConnected: () => true,
            callTool: async (tool: string, args: Record<string, unknown>) => {
                calls.push({ tool, args });
                return { success: true, data: { echoed: args } };
            }
        },
        ensureWorkspace: async () => 'ws_test_context_tool',
        setWorkspaceId: () => undefined
    } as unknown as Parameters<typeof handleContextTool>[2];
}

describe('ContextTool forwarding', () => {
    const token = new vscode.CancellationTokenSource().token;

    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('forwards search payload to memory_context with pass-through fields', async () => {
        const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

        const result = await handleContextTool(
            {
                input: {
                    action: 'search',
                    planId: 'plan_ctx_1',
                    query: 'agent',
                    scope: 'workspace',
                    types: ['research', 'architecture'],
                    limit: 3,
                } as ContextToolInput
            } as vscode.LanguageModelToolInvocationOptions<ContextToolInput>,
            token,
            createContext(calls)
        );

        const parsed = parseToolResult(result);
        expect(parsed.success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].tool).toBe('memory_context');
        expect(calls[0].args).toEqual({
            action: 'search',
            workspace_id: 'ws_test_context_tool',
            plan_id: 'plan_ctx_1',
            query: 'agent',
            scope: 'workspace',
            types: ['research', 'architecture'],
            limit: 3,
        });
    });

    it('forwards pull payload including selectors to memory_context', async () => {
        const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

        const result = await handleContextTool(
            {
                input: {
                    action: 'pull',
                    planId: 'plan_ctx_2',
                    query: 'alpha',
                    scope: 'all',
                    types: ['research'],
                    selectors: [{ id: 'ctx-2' }, { index: 1 }],
                    limit: 5,
                } as ContextToolInput
            } as vscode.LanguageModelToolInvocationOptions<ContextToolInput>,
            token,
            createContext(calls)
        );

        const parsed = parseToolResult(result);
        expect(parsed.success).toBe(true);
        expect(calls).toHaveLength(1);
        expect(calls[0].tool).toBe('memory_context');
        expect(calls[0].args).toEqual({
            action: 'pull',
            workspace_id: 'ws_test_context_tool',
            plan_id: 'plan_ctx_2',
            query: 'alpha',
            scope: 'all',
            types: ['research'],
            selectors: [{ id: 'ctx-2' }, { index: 1 }],
            limit: 5,
        });
    });

    it('rejects search for plan scope when planId is omitted', async () => {
        const calls: Array<{ tool: string; args: Record<string, unknown> }> = [];

        const result = await handleContextTool(
            {
                input: {
                    action: 'search',
                    query: 'agent'
                } as ContextToolInput
            } as vscode.LanguageModelToolInvocationOptions<ContextToolInput>,
            token,
            createContext(calls)
        );

        const parsed = parseToolResult(result);
        expect(parsed.success).toBe(false);
        expect(String(parsed.error ?? '')).toContain('planId is required');
        expect(calls).toHaveLength(0);
    });
});
