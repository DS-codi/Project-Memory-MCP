/**
 * Tool Provider - Registers all 5 language model tools for Copilot Chat
 *
 * Delegates to individual tool handlers in ./tools/:
 *   1. memory_workspace - Workspace management
 *   2. memory_agent     - Agent lifecycle & handoffs
 *   3. memory_plan      - Plan operations
 *   4. memory_steps     - Step management
 *   5. memory_context   - Context, notes, research, briefings
 *
 * @see ./tools/ for individual handler implementations
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import {
    handleWorkspaceTool,
    handleAgentTool,
    handlePlanTool,
    handleStepsTool,
    handleContextTool,
    type ToolContext
} from './tools';

/**
 * Tool Provider class that registers all 5 consolidated Language Model Tools
 */
export class ToolProvider implements vscode.Disposable {
    private mcpBridge: McpBridge;
    private workspaceId: string | null = null;
    private disposables: vscode.Disposable[] = [];
    private ctx: ToolContext;

    constructor(mcpBridge: McpBridge) {
        this.mcpBridge = mcpBridge;

        // Build shared context for tool handlers
        this.ctx = {
            mcpBridge: this.mcpBridge,
            ensureWorkspace: () => this.ensureWorkspace(),
            setWorkspaceId: (id: string) => { this.workspaceId = id; }
        };

        this.registerTools();
    }

    public resetWorkspace(): void {
        this.workspaceId = null;
    }

    private registerTools(): void {
        // 1. memory_workspace
        this.disposables.push(
            vscode.lm.registerTool('memory_workspace', {
                invoke: (options, token) => handleWorkspaceTool(options as never, token, this.ctx)
            })
        );

        // 2. memory_agent
        this.disposables.push(
            vscode.lm.registerTool('memory_agent', {
                invoke: (options, token) => handleAgentTool(options as never, token, this.ctx)
            })
        );

        // 3. memory_plan
        this.disposables.push(
            vscode.lm.registerTool('memory_plan', {
                invoke: (options, token) => handlePlanTool(options as never, token, this.ctx)
            })
        );

        // 4. memory_steps
        this.disposables.push(
            vscode.lm.registerTool('memory_steps', {
                invoke: (options, token) => handleStepsTool(options as never, token, this.ctx)
            })
        );

        // 5. memory_context
        this.disposables.push(
            vscode.lm.registerTool('memory_context', {
                invoke: (options, token) => handleContextTool(options as never, token, this.ctx)
            })
        );
    }

    /**
     * Ensure workspace is registered; returns workspace ID.
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

    dispose(): void {
        this.disposables.forEach(d => d.dispose());
        this.disposables = [];
    }
}
