/**
 * Chat Participant - Provides @memory chat participant for Copilot Chat
 *
 * Enables conversational access to Project Memory features through
 * slash commands like /plan, /context, /handoff, /status, /deploy,
 * /diagnostics, and /knowledge.
 *
 * Command implementations are split into focused modules:
 * - {@link ChatPlanCommands}     — /plan
 * - {@link ChatContextCommands}  — /context
 * - {@link ChatMiscCommands}     — /handoff, /status, /deploy, /diagnostics, default
 * - {@link KnowledgeCommandHandler} — /knowledge
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import { resolveWorkspaceIdentity } from '../utils/workspace-identity';
import { handleKnowledgeCommand } from './KnowledgeCommandHandler';
import { handlePlanCommand } from './ChatPlanCommands';
import { handleContextCommand } from './ChatContextCommands';
import {
    handleHandoffCommand,
    handleStatusCommand,
    handleDeployCommand,
    handleDiagnosticsCommand,
    handleDefaultCommand,
} from './ChatMiscCommands';

/**
 * Chat Participant class for @memory
 */
export class ChatParticipant implements vscode.Disposable {
    private participant: vscode.ChatParticipant;
    private mcpBridge: McpBridge;
    private workspaceId: string | null = null;

    constructor(mcpBridge: McpBridge) {
        this.mcpBridge = mcpBridge;

        // Create the chat participant
        this.participant = vscode.chat.createChatParticipant(
            'project-memory.memory',
            this.handleRequest.bind(this)
        );

        this.participant.iconPath = new vscode.ThemeIcon('book');

        // Register follow-up provider
        this.participant.followupProvider = {
            provideFollowups: this.provideFollowups.bind(this)
        };
    }

    /**
     * Handle chat requests — routes to the appropriate command module.
     */
    private async handleRequest(
        request: vscode.ChatRequest,
        _context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        // Check MCP connection
        if (!this.mcpBridge.isConnected()) {
            response.markdown('⚠️ **Not connected to MCP server**\n\nUse the "Project Memory: Reconnect Chat to MCP Server" command to reconnect.');
            return { metadata: { command: 'error' } };
        }

        // Ensure workspace is registered
        await this.ensureWorkspaceRegistered(response);

        try {
            // Route to appropriate command handler
            switch (request.command) {
                case 'plan':
                    return await handlePlanCommand(request, response, token, this.mcpBridge, this.workspaceId);
                case 'context':
                    return await handleContextCommand(request, response, token, this.mcpBridge, this.workspaceId);
                case 'handoff':
                    return await handleHandoffCommand(request, response, token, this.mcpBridge, this.workspaceId);
                case 'status':
                    return await handleStatusCommand(request, response, token, this.mcpBridge, this.workspaceId);
                case 'deploy':
                    return await handleDeployCommand(request, response, token);
                case 'diagnostics':
                    return await handleDiagnosticsCommand(request, response, token, this.mcpBridge);
                case 'knowledge':
                    return await handleKnowledgeCommand(request, response, token, this.mcpBridge, this.workspaceId);
                default:
                    return await handleDefaultCommand(request, response, token, this.mcpBridge, this.workspaceId);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.markdown(`❌ **Error**: ${errorMessage}`);
            return { metadata: { command: 'error' } };
        }
    }

    /**
     * Ensure the current workspace is registered with the MCP server
     */
    private async ensureWorkspaceRegistered(response: vscode.ChatResponseStream): Promise<void> {
        if (this.workspaceId) return;

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            response.markdown('⚠️ No workspace folder open. Please open a folder first.\n');
            return;
        }

        // Check if MCP is connected
        if (!this.mcpBridge.isConnected()) {
            response.markdown('⚠️ MCP server not connected. Click the MCP status bar item to reconnect.\n');
            return;
        }

        try {
            // Check identity file to resolve the actual project path
            const identity = resolveWorkspaceIdentity(workspaceFolder.uri.fsPath);
            const effectivePath = identity ? identity.projectPath : workspaceFolder.uri.fsPath;
            console.log(`Registering workspace: ${effectivePath}` + (identity ? ` (resolved from identity)` : ''));

            const result = await this.mcpBridge.callTool<{
                workspace_id: string;
            }>(
                'memory_workspace',
                { action: 'register', workspace_path: effectivePath }
            );

            console.log(`Register workspace result: ${JSON.stringify(result)}`);

            if (result.workspace_id) {
                this.workspaceId = result.workspace_id;
                console.log(`Workspace registered: ${this.workspaceId}`);
            } else {
                console.error('Unexpected response format:', result);
                response.markdown(`⚠️ Unexpected response from MCP server. Check console for details.\n`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to register workspace:', error);
            response.markdown(`⚠️ Failed to register workspace: ${errorMessage}\n`);
        }
    }

    /**
     * Provide follow-up suggestions based on the last command result.
     */
    private provideFollowups(
        result: vscode.ChatResult,
        _context: vscode.ChatContext,
        _token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.ChatFollowup[]> {
        const metadata = result.metadata as Record<string, unknown> | undefined;
        const command = metadata?.command;

        const followups: vscode.ChatFollowup[] = [];

        switch (command) {
            case 'plan':
                if (metadata?.action === 'created' && metadata?.planId) {
                    followups.push({
                        prompt: `/plan show ${metadata.planId}`,
                        label: 'View plan details',
                        command: 'plan'
                    });
                }
                followups.push({
                    prompt: '/status',
                    label: 'Check status',
                    command: 'status'
                });
                break;

            case 'status':
                followups.push({
                    prompt: '/plan list',
                    label: 'List all plans',
                    command: 'plan'
                });
                break;

            case 'help':
            case 'default':
                followups.push({
                    prompt: '/plan list',
                    label: 'List plans',
                    command: 'plan'
                });
                followups.push({
                    prompt: '/status',
                    label: 'Check status',
                    command: 'status'
                });
                followups.push({
                    prompt: '/diagnostics',
                    label: 'Run diagnostics',
                    command: 'diagnostics'
                });
                break;
        }

        return followups;
    }

    /**
     * Reset workspace ID (useful when workspace changes)
     */
    resetWorkspace(): void {
        this.workspaceId = null;
    }

    /**
     * Dispose of resources
     */
    dispose(): void {
        this.participant.dispose();
    }
}
