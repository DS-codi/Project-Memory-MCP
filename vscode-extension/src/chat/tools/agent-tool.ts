/**
 * Agent Tool Handler — memory_agent language model tool
 *
 * Actions: init, complete, handoff, validate, list, get_instructions
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';
import type { SessionEntry } from '../orchestration/session-types';

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

        if ((action as string) === 'spawn') {
            return errorResult(
                'memory_agent(action="spawn") is no longer supported. Use memory_session(action="prep") for context preparation, then invoke native runSubagent for execution.'
            );
        }

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

                // Check for orphaned sessions after init
                if (ctx.sessionRegistry) {
                    const orphanedSessions = detectOrphanedSessions(
                        ctx.sessionRegistry,
                        workspaceId,
                        planId
                    );

                    if (orphanedSessions.length > 0) {
                        // Add orphaned session warnings to result
                        const resultObj = result as any;
                        if (resultObj.data) {
                            resultObj.data.orphaned_sessions = orphanedSessions;
                            resultObj.data.orphaned_session_warning = 
                                `Found ${orphanedSessions.length} orphaned subagent session(s) from previous runs. These sessions were marked as completed.`;
                        }

                        // Auto-cleanup: mark orphaned sessions as completed
                        for (const orphaned of orphanedSessions) {
                            await ctx.sessionRegistry.markCompleted(
                                orphaned.workspaceId,
                                orphaned.planId,
                                orphaned.sessionId,
                                'orphaned_auto_cleanup'
                            );
                        }
                    }
                }
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
                // Mark the corresponding session as completed in the local registry
                if (ctx.sessionRegistry && planId) {
                    const planSessions = ctx.sessionRegistry.getByPlan(workspaceId, planId);
                    const activeSession = planSessions.find(
                        s =>
                            s.agentType === agentType &&
                            (s.status === 'active' || s.status === 'stopping')
                    );
                    if (activeSession) {
                        await ctx.sessionRegistry.markCompleted(
                            activeSession.workspaceId,
                            activeSession.planId,
                            activeSession.sessionId
                        );
                    }
                }
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

/**
 * Detect orphaned sessions (active but stale) for a given workspace/plan
 * Stale = no tool calls in last 10 minutes
 */
function detectOrphanedSessions(
    registry: NonNullable<ToolContext['sessionRegistry']>,
    workspaceId: string,
    planId: string
): Array<Pick<SessionEntry, 'sessionId' | 'workspaceId' | 'planId' | 'agentType' | 'startedAt' | 'lastToolCall'>> {
    const STALE_THRESHOLD_MS = 10 * 60 * 1000; // 10 minutes
    const now = Date.now();
    const orphaned: Array<any> = [];

    const sessions = registry.getByPlan(workspaceId, planId);
    for (const session of sessions) {
        if (session.status !== 'active') continue;

        // Check if stale (no recent tool calls)
        const lastCallTime = session.lastToolCall
            ? new Date(session.lastToolCall.timestamp).getTime()
            : new Date(session.startedAt).getTime();

        const age = now - lastCallTime;
        if (age > STALE_THRESHOLD_MS) {
            orphaned.push({
                sessionId: session.sessionId,
                workspaceId: session.workspaceId,
                planId: session.planId,
                agentType: session.agentType,
                startedAt: session.startedAt,
                lastToolCall: session.lastToolCall
            });
        }
    }

    return orphaned;
}
