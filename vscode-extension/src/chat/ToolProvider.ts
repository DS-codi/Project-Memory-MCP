/**
 * Tool Provider - Registers language model tools for Copilot Chat
 *
 * Delegates to individual tool handlers in ./tools/:
 *   1. memory_workspace             - Workspace management
 *   2. memory_agent                 - Agent lifecycle & handoffs
 *   3. memory_plan                  - Plan operations
 *   4. memory_steps                 - Step management
 *   5. memory_context               - Context, notes, research, briefings
 *   6. memory_session               - Session management + spawn context preparation
 *
 * @see ./tools/ for individual handler implementations
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import type { SessionInterceptRegistry } from './orchestration/session-intercept-registry';
import { interceptToolResponse } from './orchestration/tool-response-interceptor';
import {
    handleWorkspaceTool,
    handleAgentTool,
    handlePlanTool,
    handleStepsTool,
    handleContextTool,
    handleSpawnAgentTool,
    type ToolContext
} from './tools';

/**
 * Tool Provider class that registers consolidated Language Model Tools
 */
export class ToolProvider implements vscode.Disposable {
    private mcpBridge: McpBridge;
    private workspaceId: string | null = null;
    private disposables: vscode.Disposable[] = [];
    private ctx: ToolContext;
    private sessionRegistry?: SessionInterceptRegistry;

    constructor(
        mcpBridge: McpBridge,
        options?: { registerTools?: boolean; sessionRegistry?: SessionInterceptRegistry }
    ) {
        this.mcpBridge = mcpBridge;
        this.sessionRegistry = options?.sessionRegistry;
        const registerTools = options?.registerTools ?? true;

        // Build shared context for tool handlers
        this.ctx = {
            mcpBridge: this.mcpBridge,
            ensureWorkspace: () => this.ensureWorkspace(),
            setWorkspaceId: (id: string) => { this.workspaceId = id; },
            sessionRegistry: this.sessionRegistry
        };

        if (registerTools) {
            this.registerTools();
        }
    }

    public resetWorkspace(): void {
        this.workspaceId = null;
    }

    /**
     * Wrap tool invoke to detect and process session tracking
     */
    private async wrapInvoke<T>(
        handler: (options: vscode.LanguageModelToolInvocationOptions<T>, token: vscode.CancellationToken, ctx: ToolContext) => Promise<vscode.LanguageModelToolResult>,
        options: vscode.LanguageModelToolInvocationOptions<T>,
        token: vscode.CancellationToken,
        toolName: string
    ): Promise<vscode.LanguageModelToolResult> {
        const input = options.input as Record<string, unknown>;
        const sessionId = typeof input._session_id === 'string' ? input._session_id : undefined;
        
        // Strip _session_id meta-field before passing to handler
        if (sessionId) {
            delete input._session_id;
        }

        // Call the original handler
        const result = await handler(options as vscode.LanguageModelToolInvocationOptions<T>, token, this.ctx);

        // If session tracking is active, route through interceptor
        if (sessionId && this.sessionRegistry) {
            return interceptToolResponse(this.sessionRegistry, sessionId, toolName, result);
        }

        return result;
    }

    private registerTools(): void {
        // 1. memory_workspace
        this.disposables.push(
            vscode.lm.registerTool('memory_workspace', {
                invoke: (options, token) => this.wrapInvoke(handleWorkspaceTool, options, token, 'memory_workspace')
            })
        );

        // 2. memory_agent
        this.disposables.push(
            vscode.lm.registerTool('memory_agent', {
                invoke: (options, token) => this.wrapInvoke(handleAgentTool, options, token, 'memory_agent')
            })
        );

        // 3. memory_plan
        this.disposables.push(
            vscode.lm.registerTool('memory_plan', {
                invoke: (options, token) => this.wrapInvoke(handlePlanTool, options, token, 'memory_plan')
            })
        );

        // 4. memory_steps
        this.disposables.push(
            vscode.lm.registerTool('memory_steps', {
                invoke: (options, token) => this.wrapInvoke(handleStepsTool, options, token, 'memory_steps')
            })
        );

        // 5. memory_context
        this.disposables.push(
            vscode.lm.registerTool('memory_context', {
                invoke: (options, token) => this.wrapInvoke(handleContextTool, options, token, 'memory_context')
            })
        );

        // 6. memory_session (session management + spawn prep)
        this.disposables.push(
            vscode.lm.registerTool('memory_session', {
                invoke: (options, token) => this.wrapInvoke(handleSpawnAgentTool, options, token, 'memory_session')
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
