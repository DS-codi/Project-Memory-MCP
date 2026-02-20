/**
 * Plan Tool Handler — memory_plan language model tool
 *
 * Actions: list, get, create, archive, update, find, set_goals,
 *          add_build_script, delete_build_script, add_note,
 *          create_program, add_plan_to_program, upgrade_to_program, list_program_plans,
 *          clone_plan, merge_plans, set_plan_dependencies, get_plan_dependencies,
 *          set_plan_priority, export_plan
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

export interface PlanToolInput {
    action: 'list' | 'get' | 'create' | 'archive' | 'update' | 'find'
        | 'set_goals' | 'add_build_script' | 'delete_build_script' | 'add_note'
        | 'create_program' | 'add_plan_to_program' | 'upgrade_to_program' | 'list_program_plans'
        | 'clone_plan' | 'merge_plans' | 'set_plan_dependencies' | 'get_plan_dependencies'
        | 'set_plan_priority' | 'export_plan';
    planId?: string;
    title?: string;
    description?: string;
    category?: string;
    priority?: string;
    template?: string;
    goals?: string[];
    success_criteria?: string[];
    includeArchived?: boolean;
    note?: string;
    noteType?: 'info' | 'warning' | 'instruction';
    // update
    steps?: Array<{ phase: string; task: string; status?: string; type?: string; assignee?: string }>;
    // build scripts
    scriptName?: string;
    scriptCommand?: string;
    scriptDescription?: string;
    scriptDirectory?: string;
    scriptId?: string;
    // program management
    programId?: string;
    sourcePlanIds?: string[];
    depends_on_plans?: string[];
    new_title?: string;
    move_steps_to_child?: boolean;
    child_plan_title?: string;
    archive_sources?: boolean;
}

export async function handlePlanTool(
    options: vscode.LanguageModelToolInvocationOptions<PlanToolInput>,
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
            case 'list': {
                const listResult = await ctx.mcpBridge.callTool<{
                    active_plans: unknown[];
                    total: number;
                }>('memory_plan', {
                    action: 'list',
                    workspace_id: workspaceId,
                    include_archived: input.includeArchived
                });
                const plans = listResult.active_plans || [];
                result = {
                    workspace_id: workspaceId,
                    plans,
                    total: plans.length,
                    message: plans.length > 0
                        ? `Found ${plans.length} plan(s)`
                        : 'No plans found. Use action "create" to create one.'
                };
                break;
            }

            case 'get': {
                if (!input.planId) return errorResult('planId is required for get');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'get',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'create': {
                if (!input.title || !input.description) {
                    return errorResult('title and description are required for create');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'create',
                    workspace_id: workspaceId,
                    title: input.title,
                    description: input.description,
                    category: input.category || 'feature',
                    priority: input.priority || 'medium',
                    template: input.template,
                    goals: input.goals,
                    success_criteria: input.success_criteria
                });
                break;
            }

            case 'archive': {
                if (!input.planId) return errorResult('planId is required for archive');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'archive',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'update': {
                if (!input.planId) return errorResult('planId is required for update');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'update',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    steps: input.steps
                });
                break;
            }

            case 'find': {
                if (!input.planId) return errorResult('planId is required for find');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'find',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'set_goals': {
                if (!input.planId) return errorResult('planId is required for set_goals');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'set_goals',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    goals: input.goals,
                    success_criteria: input.success_criteria
                });
                break;
            }

            case 'add_build_script': {
                if (!input.planId || !input.scriptName || !input.scriptCommand) {
                    return errorResult('planId, scriptName, scriptCommand are required');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'add_build_script',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    script_name: input.scriptName,
                    script_command: input.scriptCommand,
                    script_description: input.scriptDescription,
                    script_directory: input.scriptDirectory
                });
                break;
            }

            case 'delete_build_script': {
                if (!input.planId || !input.scriptId) {
                    return errorResult('planId and scriptId are required');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'delete_build_script',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    script_id: input.scriptId
                });
                break;
            }

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

            // ── Program management ───────────────────────────────────

            case 'create_program': {
                if (!input.title || !input.description) {
                    return errorResult('title and description are required for create_program');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'create_program',
                    workspace_id: workspaceId,
                    title: input.title,
                    description: input.description,
                    category: input.category,
                    priority: input.priority
                });
                break;
            }

            case 'add_plan_to_program': {
                if (!input.planId || !input.programId) {
                    return errorResult('planId and programId are required for add_plan_to_program');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'add_plan_to_program',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    program_id: input.programId
                });
                break;
            }

            case 'upgrade_to_program': {
                if (!input.planId) return errorResult('planId is required for upgrade_to_program');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'upgrade_to_program',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    move_steps_to_child: input.move_steps_to_child,
                    child_plan_title: input.child_plan_title
                });
                break;
            }

            case 'list_program_plans': {
                if (!input.programId) return errorResult('programId is required for list_program_plans');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'list_program_plans',
                    workspace_id: workspaceId,
                    program_id: input.programId
                });
                break;
            }

            case 'clone_plan': {
                if (!input.planId) return errorResult('planId is required for clone_plan');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'clone_plan',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    new_title: input.new_title
                });
                break;
            }

            case 'merge_plans': {
                if (!input.planId || !input.sourcePlanIds?.length) {
                    return errorResult('planId (target) and sourcePlanIds are required for merge_plans');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'merge_plans',
                    workspace_id: workspaceId,
                    target_plan_id: input.planId,
                    source_plan_ids: input.sourcePlanIds,
                    archive_sources: input.archive_sources
                });
                break;
            }

            case 'set_plan_dependencies': {
                if (!input.planId) return errorResult('planId is required for set_plan_dependencies');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'set_plan_dependencies',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    depends_on_plans: input.depends_on_plans
                });
                break;
            }

            case 'get_plan_dependencies': {
                if (!input.planId) return errorResult('planId is required for get_plan_dependencies');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'get_plan_dependencies',
                    workspace_id: workspaceId,
                    plan_id: input.planId
                });
                break;
            }

            case 'set_plan_priority': {
                if (!input.planId || !input.priority) {
                    return errorResult('planId and priority are required for set_plan_priority');
                }
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'set_plan_priority',
                    workspace_id: workspaceId,
                    plan_id: input.planId,
                    priority: input.priority
                });
                break;
            }

            case 'export_plan': {
                if (!input.planId) return errorResult('planId is required for export_plan');
                result = await ctx.mcpBridge.callTool('memory_plan', {
                    action: 'export_plan',
                    workspace_id: workspaceId,
                    plan_id: input.planId
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
