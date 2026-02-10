/**
 * Steps Tool Handler — memory_steps language model tool
 *
 * Actions: update, batch_update, add, insert, delete, reorder, move, replace
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

interface StepDef {
    phase: string;
    task: string;
    status?: string;
    type?: string;
    assignee?: string;
    requires_validation?: boolean;
    notes?: string;
}

export interface StepsToolInput {
    action: 'update' | 'batch_update' | 'add' | 'insert' | 'delete' | 'reorder' | 'move' | 'replace';
    planId: string;
    // update
    stepIndex?: number;
    status?: string;
    notes?: string;
    // batch_update
    updates?: Array<{ step_index: number; status: string; notes?: string }>;
    // add
    newSteps?: StepDef[];
    // insert
    atIndex?: number;
    step?: StepDef;
    // reorder
    direction?: 'up' | 'down';
    // move
    fromIndex?: number;
    toIndex?: number;
    // replace
    replacementSteps?: StepDef[];
}

export async function handleStepsTool(
    options: vscode.LanguageModelToolInvocationOptions<StepsToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        const workspaceId = await ctx.ensureWorkspace();
        const input = options.input;

        if (!input.planId) {
            return errorResult('planId is required');
        }

        let result: unknown;

        switch (input.action) {
            case 'update': {
                if (input.stepIndex === undefined || !input.status) {
                    return errorResult('stepIndex and status are required for update');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'update',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    step_index: input.stepIndex,
                    status: input.status,
                    notes: input.notes
                });
                break;
            }

            case 'batch_update': {
                if (!input.updates || input.updates.length === 0) {
                    return errorResult('updates array is required for batch_update');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'batch_update',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    updates: input.updates
                });
                break;
            }

            case 'add': {
                if (!input.newSteps || input.newSteps.length === 0) {
                    return errorResult('newSteps array is required for add');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'add',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    steps: input.newSteps.map(s => ({ ...s, status: s.status || 'pending' }))
                });
                break;
            }

            case 'insert': {
                if (input.atIndex === undefined || !input.step) {
                    return errorResult('atIndex and step are required for insert');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'insert',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    at_index: input.atIndex,
                    step: { ...input.step, status: input.step.status || 'pending' }
                });
                break;
            }

            case 'delete': {
                if (input.stepIndex === undefined) {
                    return errorResult('stepIndex is required for delete');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'delete',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    step_index: input.stepIndex
                });
                break;
            }

            case 'reorder': {
                if (input.stepIndex === undefined || !input.direction) {
                    return errorResult('stepIndex and direction are required for reorder');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'reorder',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    step_index: input.stepIndex,
                    direction: input.direction
                });
                break;
            }

            case 'move': {
                if (input.fromIndex === undefined || input.toIndex === undefined) {
                    return errorResult('fromIndex and toIndex are required for move');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'move',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    from_index: input.fromIndex,
                    to_index: input.toIndex
                });
                break;
            }

            case 'replace': {
                if (!input.replacementSteps) {
                    return errorResult('replacementSteps array is required for replace');
                }
                result = await ctx.mcpBridge.callTool('memory_steps', {
                    action: 'replace',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    replacement_steps: input.replacementSteps.map(s => ({
                        ...s,
                        status: s.status || 'pending'
                    }))
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
