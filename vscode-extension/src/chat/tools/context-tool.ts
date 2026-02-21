/**
 * Context Tool Handler — memory_context language model tool
 *
 * Actions: add_note, briefing, handoff, workspace, store, get,
 *          store_initial, list, list_research, append_research,
 *          batch_store, workspace_get, workspace_set, workspace_update, workspace_delete
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

export interface ContextToolInput {
    action: 'add_note' | 'briefing' | 'handoff' | 'workspace' | 'store' | 'get'
        | 'store_initial' | 'list' | 'list_research' | 'append_research'
        | 'batch_store' | 'workspace_get' | 'workspace_set' | 'workspace_update' | 'workspace_delete'
        | 'search' | 'pull';
    planId?: string;
    // add_note
    note?: string;
    noteType?: 'info' | 'warning' | 'instruction';
    // handoff
    targetAgent?: string;
    reason?: string;
    // store/get
    type?: string;
    data?: Record<string, unknown>;
    // store_initial
    userRequest?: string;
    filesMentioned?: string[];
    fileContents?: Record<string, string>;
    requirements?: string[];
    constraints?: string[];
    examples?: string[];
    conversationContext?: string;
    additionalNotes?: string;
    // append_research
    filename?: string;
    content?: string;
    // batch_store
    items?: Array<{ type: string; data: Record<string, unknown> }>;
    // search/pull
    query?: string;
    scope?: 'plan' | 'workspace' | 'program' | 'all';
    types?: string[];
    selectors?: Array<Record<string, unknown>>;
    limit?: number;
}

export async function handleContextTool(
    options: vscode.LanguageModelToolInvocationOptions<ContextToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        const workspaceId = await ctx.ensureWorkspace();
        const input = options.input;
        let result: unknown;

        switch (input.action) {
            case 'add_note': {
                if (!input.planId || !input.note) {
                    return errorResult('planId and note are required for add_note');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'add_note',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    note: input.note,
                    note_type: input.noteType || 'info'
                });
                break;
            }

            case 'briefing': {
                if (!input.planId) return errorResult('planId is required for briefing');
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'get_briefing',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'handoff': {
                if (!input.planId || !input.targetAgent || !input.reason) {
                    return errorResult('planId, targetAgent, and reason are required for handoff');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'handoff',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    from_agent: 'User',
                    to_agent: input.targetAgent,
                    reason: input.reason
                });
                break;
            }

            case 'workspace': {
                result = await ctx.mcpBridge.callTool('memory_workspace', {
                    action: 'info',
                    workspace_id: workspaceId
                });
                break;
            }

            case 'store': {
                if (!input.planId || !input.type || !input.data) {
                    return errorResult('planId, type, and data are required for store');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'store',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    type: input.type,
                    data: input.data
                });
                break;
            }

            case 'get': {
                if (!input.planId || !input.type) {
                    return errorResult('planId and type are required for get');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'get',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    type: input.type
                });
                break;
            }

            case 'store_initial': {
                if (!input.planId || !input.userRequest) {
                    return errorResult('planId and userRequest are required for store_initial');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'store_initial',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    user_request: input.userRequest,
                    files_mentioned: input.filesMentioned,
                    file_contents: input.fileContents,
                    requirements: input.requirements,
                    constraints: input.constraints,
                    examples: input.examples,
                    conversation_context: input.conversationContext,
                    additional_notes: input.additionalNotes
                });
                break;
            }

            case 'list': {
                if (!input.planId) return errorResult('planId is required for list');
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'list',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'list_research': {
                if (!input.planId) return errorResult('planId is required for list_research');
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'list_research',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'append_research': {
                if (!input.planId || !input.filename || !input.content) {
                    return errorResult('planId, filename, and content are required for append_research');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'append_research',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    filename: input.filename,
                    content: input.content
                });
                break;
            }

            case 'batch_store': {
                if (!input.planId || !input.items || input.items.length === 0) {
                    return errorResult('planId and items array are required for batch_store');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'batch_store',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    items: input.items
                });
                break;
            }

            case 'search': {
                if ((input.scope === 'plan' || !input.scope) && !input.planId) {
                    return errorResult('planId is required when scope is plan (or omitted) for search');
                }
                if (input.types && !Array.isArray(input.types)) {
                    return errorResult('types must be an array when provided');
                }
                if (input.limit !== undefined && (!Number.isFinite(input.limit) || input.limit <= 0)) {
                    return errorResult('limit must be a positive number when provided');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'search',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    query: input.query,
                    scope: input.scope,
                    types: input.types,
                    limit: input.limit
                });
                break;
            }

            case 'pull': {
                if ((input.scope === 'plan' || !input.scope) && !input.planId) {
                    return errorResult('planId is required when scope is plan (or omitted) for pull');
                }
                if (input.types && !Array.isArray(input.types)) {
                    return errorResult('types must be an array when provided');
                }
                if (input.selectors && !Array.isArray(input.selectors)) {
                    return errorResult('selectors must be an array when provided');
                }
                if (input.limit !== undefined && (!Number.isFinite(input.limit) || input.limit <= 0)) {
                    return errorResult('limit must be a positive number when provided');
                }
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: 'pull',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    query: input.query,
                    scope: input.scope,
                    types: input.types,
                    selectors: input.selectors,
                    limit: input.limit
                });
                break;
            }

            case 'workspace_get':
            case 'workspace_delete': {
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: input.action,
                    workspace_id: workspaceId,
                    type: input.type
                });
                break;
            }

            case 'workspace_set':
            case 'workspace_update': {
                if (!input.type) return errorResult('type is required for workspace-scoped context');
                result = await ctx.mcpBridge.callTool('memory_context', {
                    action: input.action,
                    workspace_id: workspaceId,
                    type: input.type,
                    data: input.data
                });
                break;
            }

            default:
                return errorResult(`Unknown action: ${input.action}`);
        }

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

function errorResult(error: unknown): vscode.LanguageModelToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, error: message }))
    ]);
}
