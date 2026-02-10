/**
 * Agent Tool Handler — memory_agent language model tool
 *
 * Actions: init, complete, handoff, validate, list, get_instructions
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

export interface AgentToolInput {
    action: 'init' | 'complete' | 'handoff' | 'validate' | 'list' | 'get_instructions';
    planId?: string;
    agentType?: string;
    fromAgent?: string;
    toAgent?: string;
    reason?: string;
    summary?: string;
    artifacts?: Record<string, unknown>;
    taskDescription?: string;
}

export async function handleAgentTool(
    options: vscode.LanguageModelToolInvocationOptions<AgentToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        const workspaceId = await ctx.ensureWorkspace();
        const { action, planId, agentType, fromAgent, toAgent, reason, summary, artifacts, taskDescription } = options.input;

        let result: unknown;

        switch (action) {
            case 'init': {
                if (!planId || !agentType) {
                    return errorResult('planId and agentType are required for init');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'init',
                    workspace_id: workspaceId,
                    plan_id: planId,
                    agent_type: agentType,
                    task_description: taskDescription
                });
                break;
            }

            case 'complete': {
                if (!planId || !agentType) {
                    return errorResult('planId and agentType are required for complete');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'complete',
                    workspace_id: workspaceId,
                    plan_id: planId,
                    agent_type: agentType,
                    summary,
                    artifacts
                });
                break;
            }

            case 'handoff': {
                if (!planId || !toAgent) {
                    return errorResult('planId and toAgent are required for handoff');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'handoff',
                    workspace_id: workspaceId,
                    plan_id: planId,
                    from_agent: fromAgent || 'User',
                    to_agent: toAgent,
                    reason: reason || summary || 'Handoff via chat tool',
                    summary,
                    artifacts
                });
                break;
            }

            case 'validate': {
                if (!agentType) {
                    return errorResult('agentType is required for validate');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'validate',
                    workspace_id: workspaceId,
                    plan_id: planId,
                    agent_type: agentType,
                    task_description: taskDescription
                });
                break;
            }

            case 'list': {
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'list',
                    workspace_id: workspaceId,
                    plan_id: planId
                });
                break;
            }

            case 'get_instructions': {
                if (!agentType) {
                    return errorResult('agentType is required for get_instructions');
                }
                result = await ctx.mcpBridge.callTool('memory_agent', {
                    action: 'get_instructions',
                    workspace_id: workspaceId,
                    agent_type: agentType
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
