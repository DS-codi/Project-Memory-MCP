/**
 * Workspace Tool Handler — memory_workspace language model tool
 *
 * Actions: register, list, info, reindex
 */

import * as vscode from 'vscode';
import { McpBridge } from '../McpBridge';
import type { ToolContext } from './types';

export interface WorkspaceToolInput {
    action: 'register' | 'list' | 'info' | 'reindex' | 'set_display_name';
    workspacePath?: string;
    workspaceId?: string;
    displayName?: string;
    display_name?: string;
}

export async function handleWorkspaceTool(
    options: vscode.LanguageModelToolInvocationOptions<WorkspaceToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        const { action, workspacePath, workspaceId: inputWsId, displayName, display_name } = options.input;
        let result: unknown;

        switch (action) {
            case 'register': {
                const wsPath = workspacePath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                if (!wsPath) {
                    return errorResult('No workspace path provided and no workspace folder open');
                }
                const reg = await ctx.mcpBridge.callTool<{ workspace_id: string }>(
                    'memory_workspace',
                    { action: 'register', workspace_path: wsPath }
                );
                ctx.setWorkspaceId(reg.workspace_id);
                result = reg;
                break;
            }

            case 'list':
                result = await ctx.mcpBridge.callTool('memory_workspace', { action: 'list' });
                break;

            case 'info': {
                const wsId = inputWsId ?? (await ctx.ensureWorkspace());
                result = await ctx.mcpBridge.callTool('memory_workspace', {
                    action: 'info',
                    workspace_id: wsId
                });
                break;
            }

            case 'reindex': {
                const wsId = inputWsId ?? (await ctx.ensureWorkspace());
                result = await ctx.mcpBridge.callTool('memory_workspace', {
                    action: 'reindex',
                    workspace_id: wsId
                });
                break;
            }

            case 'set_display_name': {
                const wsId = inputWsId ?? (await ctx.ensureWorkspace());
                const nextDisplayName = displayName ?? display_name;
                if (typeof nextDisplayName !== 'string' || !nextDisplayName.trim()) {
                    return errorResult('displayName is required for action: set_display_name');
                }
                result = await ctx.mcpBridge.callTool('memory_workspace', {
                    action: 'set_display_name',
                    workspace_id: wsId,
                    display_name: nextDisplayName
                });
                break;
            }

            default:
                return errorResult(`Unknown action: ${action}`);
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
