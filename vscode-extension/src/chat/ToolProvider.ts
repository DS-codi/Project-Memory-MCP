/**
 * Tool Provider - Consolidated Language Model Tools for Copilot Chat
 * 
 * Registers 3 unified tools that Copilot can autonomously invoke:
 * 1. memory_plan - Plan operations (list, get, create, update)
 * 2. memory_steps - Step management (update, batch_update)
 * 3. memory_context - Context and notes (add_note, get_briefing)
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';

/**
 * Plan state structure
 */
interface PlanState {
    plan_id: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
    steps?: Array<{
        index: number;
        phase: string;
        task: string;
        status: string;
    }>;
}

/**
 * Plan summary for list operations
 */
interface PlanSummary {
    plan_id: string;
    title: string;
    status?: string;
    category?: string;
    priority?: string;
    progress?: string;
    created_at?: string;
}

/**
 * Tool Provider class that registers consolidated Language Model Tools
 */
export class ToolProvider implements vscode.Disposable {
    private mcpBridge: McpBridge;
    private workspaceId: string | null = null;
    private disposables: vscode.Disposable[] = [];

    constructor(mcpBridge: McpBridge) {
        this.mcpBridge = mcpBridge;
        this.registerTools();
    }

    /**
     * Register all language model tools
     */
    private registerTools(): void {
        // TOOL 1: memory_plan
        // Actions: list, get, create, archive
        this.disposables.push(
            vscode.lm.registerTool('memory_plan', {
                invoke: async (options, token) => {
                    return await this.handlePlan(
                        options as vscode.LanguageModelToolInvocationOptions<{
                            action: 'list' | 'get' | 'create' | 'archive';
                            planId?: string;
                            title?: string;
                            description?: string;
                            category?: string;
                            priority?: string;
                            includeArchived?: boolean;
                        }>,
                        token
                    );
                }
            })
        );

        // TOOL 2: memory_steps
        // Actions: update, batch_update, add
        this.disposables.push(
            vscode.lm.registerTool('memory_steps', {
                invoke: async (options, token) => {
                    return await this.handleSteps(
                        options as vscode.LanguageModelToolInvocationOptions<{
                            action: 'update' | 'batch_update' | 'add';
                            planId: string;
                            stepIndex?: number;
                            status?: string;
                            notes?: string;
                            updates?: Array<{ step_index: number; status: string; notes?: string }>;
                            newSteps?: Array<{ phase: string; task: string; status?: string }>;
                        }>,
                        token
                    );
                }
            })
        );

        // TOOL 3: memory_context
        // Actions: add_note, briefing, handoff
        this.disposables.push(
            vscode.lm.registerTool('memory_context', {
                invoke: async (options, token) => {
                    return await this.handleContext(
                        options as vscode.LanguageModelToolInvocationOptions<{
                            action: 'add_note' | 'briefing' | 'handoff' | 'workspace';
                            planId?: string;
                            note?: string;
                            noteType?: 'info' | 'warning' | 'instruction';
                            targetAgent?: string;
                            reason?: string;
                        }>,
                        token
                    );
                }
            })
        );
    }

    /**
     * Ensure workspace is registered
     */
    private async ensureWorkspace(): Promise<string> {
        if (this.workspaceId) {
            return this.workspaceId;
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            throw new Error('No workspace folder open');
        }

        const result = await this.mcpBridge.callTool<{ workspace_id: string }>(
            'memory_workspace',
            { action: 'register', workspace_path: workspaceFolder.uri.fsPath }
        );

        this.workspaceId = result.workspace_id;
        return this.workspaceId;
    }

    /**
     * Handle memory_plan tool invocation
     */
    private async handlePlan(
        options: vscode.LanguageModelToolInvocationOptions<{
            action: 'list' | 'get' | 'create' | 'archive';
            planId?: string;
            title?: string;
            description?: string;
            category?: string;
            priority?: string;
            includeArchived?: boolean;
        }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        try {
            if (!this.mcpBridge.isConnected()) {
                return this.errorResult('MCP server not connected');
            }

            const workspaceId = await this.ensureWorkspace();
            const { action, planId, title, description, category, priority, includeArchived } = options.input;

            let result: unknown;

            switch (action) {
                case 'list':
                    const listResult = await this.mcpBridge.callTool<{
                        active_plans: PlanSummary[];
                        archived_plans?: string[];
                        total: number;
                    }>('memory_plan', {
                        action: 'list',
                        workspace_id: workspaceId,
                        include_archived: includeArchived
                    });
                    result = {
                        workspace_id: workspaceId,
                        plans: listResult.active_plans || [],
                        total: (listResult.active_plans || []).length,
                        message: (listResult.active_plans || []).length > 0
                            ? `Found ${(listResult.active_plans || []).length} plan(s)`
                            : 'No plans found. Use action "create" to create one.'
                    };
                    break;

                case 'get':
                    if (!planId) {
                        return this.errorResult('planId is required for get action');
                    }
                    result = await this.mcpBridge.callTool<PlanState>('memory_plan', {
                        action: 'get',
                        workspace_id: workspaceId,
                        plan_id: planId
                    });
                    break;

                case 'create':
                    if (!title || !description) {
                        return this.errorResult('title and description are required for create action');
                    }
                    result = await this.mcpBridge.callTool<PlanState>('memory_plan', {
                        action: 'create',
                        workspace_id: workspaceId,
                        title,
                        description,
                        category: category || 'feature',
                        priority: priority || 'medium'
                    });
                    break;

                case 'archive':
                    if (!planId) {
                        return this.errorResult('planId is required for archive action');
                    }
                    result = await this.mcpBridge.callTool('memory_plan', {
                        action: 'archive',
                        workspace_id: workspaceId,
                        plan_id: planId
                    });
                    break;

                default:
                    return this.errorResult(`Unknown action: ${action}`);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
            ]);
        } catch (error) {
            return this.errorResult(error);
        }
    }

    /**
     * Handle memory_steps tool invocation
     */
    private async handleSteps(
        options: vscode.LanguageModelToolInvocationOptions<{
            action: 'update' | 'batch_update' | 'add';
            planId: string;
            stepIndex?: number;
            status?: string;
            notes?: string;
            updates?: Array<{ step_index: number; status: string; notes?: string }>;
            newSteps?: Array<{ phase: string; task: string; status?: string }>;
        }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        try {
            if (!this.mcpBridge.isConnected()) {
                return this.errorResult('MCP server not connected');
            }

            const workspaceId = await this.ensureWorkspace();
            const { action, planId, stepIndex, status, notes, updates, newSteps } = options.input;

            if (!planId) {
                return this.errorResult('planId is required');
            }

            let result: unknown;

            switch (action) {
                case 'update':
                    if (stepIndex === undefined || !status) {
                        return this.errorResult('stepIndex and status are required for update action');
                    }
                    result = await this.mcpBridge.callTool('memory_steps', {
                        action: 'update',
                        workspace_id: workspaceId,
                        plan_id: planId,
                        step_index: stepIndex,
                        status,
                        notes
                    });
                    break;

                case 'batch_update':
                    if (!updates || updates.length === 0) {
                        return this.errorResult('updates array is required for batch_update action');
                    }
                    result = await this.mcpBridge.callTool('memory_steps', {
                        action: 'batch_update',
                        workspace_id: workspaceId,
                        plan_id: planId,
                        updates
                    });
                    break;

                case 'add':
                    if (!newSteps || newSteps.length === 0) {
                        return this.errorResult('newSteps array is required for add action');
                    }
                    result = await this.mcpBridge.callTool('memory_steps', {
                        action: 'add',
                        workspace_id: workspaceId,
                        plan_id: planId,
                        steps: newSteps.map(s => ({
                            ...s,
                            status: s.status || 'pending'
                        }))
                    });
                    break;

                default:
                    return this.errorResult(`Unknown action: ${action}`);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
            ]);
        } catch (error) {
            return this.errorResult(error);
        }
    }

    /**
     * Handle memory_context tool invocation
     */
    private async handleContext(
        options: vscode.LanguageModelToolInvocationOptions<{
            action: 'add_note' | 'briefing' | 'handoff' | 'workspace';
            planId?: string;
            note?: string;
            noteType?: 'info' | 'warning' | 'instruction';
            targetAgent?: string;
            reason?: string;
        }>,
        token: vscode.CancellationToken
    ): Promise<vscode.LanguageModelToolResult> {
        try {
            if (!this.mcpBridge.isConnected()) {
                return this.errorResult('MCP server not connected');
            }

            const workspaceId = await this.ensureWorkspace();
            const { action, planId, note, noteType, targetAgent, reason } = options.input;

            let result: unknown;

            switch (action) {
                case 'add_note':
                    if (!planId || !note) {
                        return this.errorResult('planId and note are required for add_note action');
                    }
                    result = await this.mcpBridge.callTool('memory_plan', {
                        action: 'add_note',
                        workspace_id: workspaceId,
                        plan_id: planId,
                        note,
                        note_type: noteType || 'info'
                    });
                    break;

                case 'briefing':
                    if (!planId) {
                        return this.errorResult('planId is required for briefing action');
                    }
                    result = await this.mcpBridge.callTool('memory_agent', {
                        action: 'get_briefing',
                        workspace_id: workspaceId,
                        plan_id: planId
                    });
                    break;

                case 'handoff':
                    if (!planId || !targetAgent || !reason) {
                        return this.errorResult('planId, targetAgent, and reason are required for handoff action');
                    }
                    result = await this.mcpBridge.callTool('memory_agent', {
                        action: 'handoff',
                        workspace_id: workspaceId,
                        plan_id: planId,
                        to_agent: targetAgent,
                        reason
                    });
                    break;

                case 'workspace':
                    // Get workspace info including codebase profile
                    result = await this.mcpBridge.callTool('memory_workspace', {
                        action: 'info',
                        workspace_id: workspaceId
                    });
                    break;

                default:
                    return this.errorResult(`Unknown action: ${action}`);
            }

            return new vscode.LanguageModelToolResult([
                new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
            ]);
        } catch (error) {
            return this.errorResult(error);
        }
    }

    /**
     * Create error result
     */
    private errorResult(error: unknown): vscode.LanguageModelToolResult {
        const message = error instanceof Error ? error.message : String(error);
        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify({
                success: false,
                error: message
            }))
        ]);
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
