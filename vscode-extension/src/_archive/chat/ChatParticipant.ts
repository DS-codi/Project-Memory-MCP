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
import {
    extractWorkspaceIdFromRegisterResponse,
    resolveWorkspaceIdFromWorkspaceList,
} from './workspaceRegistration';
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

interface StepCountsMetadata {
    pending?: number;
    active?: number;
    done?: number;
    blocked?: number;
}

interface ChatResultMetadata {
    command?: string;
    action?: string;
    planId?: string;
    recommendedAgent?: string;
    stepCounts?: StepCountsMetadata;
    hasScripts?: boolean;
}

/**
 * Chat Participant class for @memory
 */
export class ChatParticipant implements vscode.Disposable {
    private participant: {
        dispose(): void;
        iconPath?: vscode.ThemeIcon;
        followupProvider?: vscode.ChatFollowupProvider;
    };
    private mcpBridge: McpBridge;
    private workspaceId: string | null = null;

    constructor(mcpBridge: McpBridge, options?: { registerWithVscode?: boolean }) {
        this.mcpBridge = mcpBridge;
        const registerWithVscode = options?.registerWithVscode ?? true;

        if (registerWithVscode) {
            this.participant = vscode.chat.createChatParticipant(
                'project-memory.memory',
                this.handleRequest.bind(this)
            );
            this.participant.iconPath = new vscode.ThemeIcon('book');
            this.participant.followupProvider = {
                provideFollowups: this.provideFollowups.bind(this)
            };
        } else {
            this.participant = { dispose: () => { /* no-op for tests */ } };
        }
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

            const parsedWorkspaceId = extractWorkspaceIdFromRegisterResponse(result);
            if (parsedWorkspaceId) {
                this.workspaceId = parsedWorkspaceId;
                console.log(`Workspace registered: ${this.workspaceId}`);
            } else {
                const listResult = await this.mcpBridge.callTool<unknown>('memory_workspace', { action: 'list' });
                const fallbackWorkspaceId = resolveWorkspaceIdFromWorkspaceList(
                    listResult,
                    workspaceFolder.uri.fsPath,
                    effectivePath
                );

                if (fallbackWorkspaceId) {
                    this.workspaceId = fallbackWorkspaceId;
                    console.log(`Workspace resolved from list fallback: ${this.workspaceId}`);
                } else {
                    console.error('Unexpected response format:', result);
                    console.error('Workspace list fallback also failed:', listResult);
                    response.markdown(`⚠️ Unexpected response from MCP server. Check console for details.\n`);
                }
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
        const metadata = result.metadata as ChatResultMetadata | undefined;
        const command = metadata?.command;

        const followups: vscode.ChatFollowup[] = [];

        switch (command) {
            case 'plan':
                if (metadata?.action === 'show' && metadata?.planId) {
                    followups.push({
                        prompt: `Archivist ${metadata.planId} Archive requested from /plan show`,
                        label: 'Archive Plan',
                        command: 'handoff'
                    });
                    followups.push({
                        prompt: `Add step to plan ${metadata.planId}: `,
                        label: 'Add Step',
                        command: 'plan'
                    });

                    if (metadata.recommendedAgent) {
                        followups.push({
                            prompt: `${metadata.recommendedAgent} ${metadata.planId} Launch requested from /plan show`,
                            label: `Launch ${metadata.recommendedAgent}`,
                            command: 'handoff'
                        });
                    } else {
                        const hasBlocked = (metadata.stepCounts?.blocked ?? 0) > 0;
                        if (hasBlocked) {
                            followups.push({
                                prompt: `Revisionist ${metadata.planId} Resolve blocked plan steps`,
                                label: 'Launch Revisionist',
                                command: 'handoff'
                            });
                        }
                    }
                }

                if (metadata?.action === 'create' && metadata?.planId) {
                    followups.push({
                        prompt: `/plan show ${metadata.planId}`,
                        label: 'View plan details',
                        command: 'plan'
                    });
                    followups.push({
                        prompt: `Architect ${metadata.planId} Initial architecture assignment`,
                        label: 'Assign Architect',
                        command: 'handoff'
                    });
                }
                if (followups.length === 0) {
                    followups.push({
                        prompt: '/status',
                        label: 'Check status',
                        command: 'status'
                    });
                }
                break;

            case 'status':
                if (metadata?.planId) {
                    followups.push({
                        prompt: `/plan show ${metadata.planId}`,
                        label: 'View most-active plan',
                        command: 'plan'
                    });
                } else {
                    followups.push({
                        prompt: '/plan list',
                        label: 'List all plans',
                        command: 'plan'
                    });
                }
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
