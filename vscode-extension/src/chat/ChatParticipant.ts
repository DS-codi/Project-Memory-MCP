/**
 * Chat Participant - Provides @memory chat participant for Copilot Chat
 * 
 * Enables conversational access to Project Memory features through
 * slash commands like /plan, /context, /handoff, and /status
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import { resolveWorkspaceIdentity } from '../utils/workspace-identity';

/**
 * Plan state returned from MCP server
 */
interface PlanState {
    plan_id?: string;
    id?: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
    steps?: Array<{
        phase: string;
        task: string;
        status: string;
    }>;
    lineage?: Array<{
        agent_type: string;
        started_at: string;
        summary?: string;
    }>;
}

/**
 * Workspace info returned from MCP server
 */
interface WorkspaceInfo {
    workspace_id: string;
    workspace_path: string;
    codebase_profile?: {
        languages?: string[];
        frameworks?: string[];
        file_count?: number;
    };
}

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
     * Handle chat requests
     */
    private async handleRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
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
                    return await this.handlePlanCommand(request, response, token);
                case 'context':
                    return await this.handleContextCommand(request, response, token);
                case 'handoff':
                    return await this.handleHandoffCommand(request, response, token);
                case 'status':
                    return await this.handleStatusCommand(request, response, token);
                case 'deploy':
                    return await this.handleDeployCommand(request, response, token);
                case 'diagnostics':
                    return await this.handleDiagnosticsCommand(request, response, token);
                default:
                    return await this.handleDefaultCommand(request, response, token);
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
     * Handle /plan command - view, create, or manage plans
     */
    private async handlePlanCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.trim();

        if (!prompt || prompt === 'list') {
            // List all plans
            return await this.listPlans(response);
        }

        if (prompt.startsWith('create ')) {
            // Create a new plan
            return await this.createPlan(prompt.substring(7), response);
        }

        if (prompt.startsWith('show ')) {
            // Show specific plan
            const planId = prompt.substring(5).trim();
            return await this.showPlan(planId, response);
        }

        // Default: try to interpret as plan ID or create based on description
        response.markdown('📋 **Plan Commands**\n\n');
        response.markdown('- `/plan list` - List all plans in this workspace\n');
        response.markdown('- `/plan create <title>` - Create a new plan\n');
        response.markdown('- `/plan show <plan-id>` - Show plan details\n');
        response.markdown('\nOr just describe what you want to do and I\'ll help create a plan.');

        return { metadata: { command: 'plan' } };
    }

    /**
     * List all plans in the workspace
     */
    private async listPlans(response: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'plan' } };
        }

        response.progress('Fetching plans...');

        const result = await this.mcpBridge.callTool<{
            active_plans: Array<{
                plan_id?: string;
                id?: string;
                title: string;
                status?: string;
                category?: string;
            }>;
        }>('memory_plan', { action: 'list', workspace_id: this.workspaceId });

        const plans = result.active_plans || [];

        if (plans.length === 0) {
            response.markdown('📋 **No plans found**\n\nUse `/plan create <title>` to create a new plan.');
            return { metadata: { command: 'plan' } };
        }

        response.markdown(`📋 **Plans in this workspace** (${plans.length})\n\n`);
        
        for (const plan of plans) {
            const statusEmoji = this.getStatusEmoji(plan.status);
            const planId = plan.plan_id || plan.id || 'unknown';
            response.markdown(`${statusEmoji} **${plan.title}** \`${planId}\`\n`);
            if (plan.category) {
                response.markdown(`   Category: ${plan.category}\n`);
            }
        }

        return { metadata: { command: 'plan', plans: plans.length } };
    }

    /**
     * Create a new plan
     */
    private async createPlan(description: string, response: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'plan' } };
        }

        response.markdown(`🔄 Creating plan: **${description}**...\n\n`);

        const result = await this.mcpBridge.callTool<PlanState>(
            'memory_plan',
            {
                action: 'create',
                workspace_id: this.workspaceId,
                title: description,
                description: description,
                category: 'feature' // Default category
            }
        );

        const planId = result.plan_id || result.id || 'unknown';
        response.markdown(`✅ **Plan created!**\n\n`);
        response.markdown(`- **ID**: \`${planId}\`\n`);
        response.markdown(`- **Title**: ${result.title}\n`);
        response.markdown(`\nUse \`/plan show ${planId}\` to see details.`);

        return { metadata: { command: 'plan', action: 'created', planId } };
    }

    /**
     * Show details of a specific plan
     */
    private async showPlan(planId: string, response: vscode.ChatResponseStream): Promise<vscode.ChatResult> {
        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'plan' } };
        }

        const result = await this.mcpBridge.callTool<PlanState>(
            'memory_plan',
            {
                action: 'get',
                workspace_id: this.workspaceId,
                plan_id: planId
            }
        );

        const resolvedPlanId = result.plan_id || result.id || planId;
        response.markdown(`# 📋 ${result.title}\n\n`);
        response.markdown(`**ID**: \`${resolvedPlanId}\`\n`);
        
        if (result.category) {
            response.markdown(`**Category**: ${result.category}\n`);
        }
        if (result.priority) {
            response.markdown(`**Priority**: ${result.priority}\n`);
        }
        if (result.description) {
            response.markdown(`\n${result.description}\n`);
        }

        // Show steps
        if (result.steps && result.steps.length > 0) {
            response.markdown('\n## Steps\n\n');
            for (let i = 0; i < result.steps.length; i++) {
                const step = result.steps[i];
                const statusEmoji = this.getStepStatusEmoji(step.status);
                response.markdown(`${statusEmoji} **${step.phase}**: ${step.task}\n`);
            }
        }

        // Show lineage/history
        if (result.lineage && result.lineage.length > 0) {
            response.markdown('\n## Agent History\n\n');
            for (const session of result.lineage) {
                response.markdown(`- **${session.agent_type}** (${session.started_at})\n`);
                if (session.summary) {
                    response.markdown(`  ${session.summary}\n`);
                }
            }
        }

        return { metadata: { command: 'plan', action: 'show', planId } };
    }

    /**
     * Handle /context command - get workspace context
     */
    private async handleContextCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'context' } };
        }

        response.markdown('🔍 **Gathering workspace context...**\n\n');
        response.progress('Querying workspace info...');

        try {
            const result = await this.mcpBridge.callTool<WorkspaceInfo>(
                'memory_workspace',
                { action: 'info', workspace_id: this.workspaceId }
            );

            response.markdown(`## Workspace Information\n\n`);
            response.markdown(`**ID**: \`${result.workspace_id}\`\n`);
            response.markdown(`**Path**: \`${result.workspace_path}\`\n`);

            if (result.codebase_profile) {
                const profile = result.codebase_profile;
                response.markdown('\n## Codebase Profile\n\n');
                
                if (profile.languages && profile.languages.length > 0) {
                    response.markdown(`**Languages**: ${profile.languages.join(', ')}\n`);
                }
                if (profile.frameworks && profile.frameworks.length > 0) {
                    response.markdown(`**Frameworks**: ${profile.frameworks.join(', ')}\n`);
                }
                if (profile.file_count) {
                    response.markdown(`**Files**: ${profile.file_count}\n`);
                }
            }
        } catch (error) {
            response.markdown(`⚠️ Could not retrieve full context. Basic workspace info:\n\n`);
            response.markdown(`**Workspace ID**: \`${this.workspaceId}\`\n`);
        }

        return { metadata: { command: 'context' } };
    }

    /**
     * Handle /handoff command - execute agent handoffs
     */
    private async handleHandoffCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.trim();
        
        if (!prompt) {
            response.markdown('🤝 **Handoff Command**\n\n');
            response.markdown('Usage: `/handoff <agent-type> <plan-id> [summary]`\n\n');
            response.markdown('**Available agents:**\n');
            response.markdown('- `Coordinator` - Orchestrates the workflow\n');
            response.markdown('- `Researcher` - Gathers external information\n');
            response.markdown('- `Architect` - Creates implementation plans\n');
            response.markdown('- `Executor` - Implements the plan\n');
            response.markdown('- `Reviewer` - Validates completed work\n');
            response.markdown('- `Tester` - Writes and runs tests\n');
            response.markdown('- `Archivist` - Finalizes and archives\n');
            response.markdown('- `Analyst` - Deep investigation and analysis\n');
            response.markdown('- `Brainstorm` - Explore and refine ideas\n');
            response.markdown('- `Runner` - Quick tasks and exploration\n');
            response.markdown('- `Builder` - Build verification and diagnostics\n');
            return { metadata: { command: 'handoff' } };
        }

        const parts = prompt.split(' ');
        if (parts.length < 2) {
            response.markdown('⚠️ Please provide both agent type and plan ID.\n');
            response.markdown('Example: `/handoff Executor plan_abc123`');
            return { metadata: { command: 'handoff' } };
        }

        const targetAgent = parts[0];
        const planId = parts[1];
        const summary = parts.slice(2).join(' ') || 'Handoff from chat';

        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'handoff' } };
        }

        response.markdown(`🔄 Initiating handoff to **${targetAgent}**...\n\n`);

        try {
            const result = await this.mcpBridge.callTool<{ warning?: string }>('memory_agent', {
                action: 'handoff',
                workspace_id: this.workspaceId,
                plan_id: planId,
                from_agent: 'User',
                to_agent: targetAgent,
                summary
            });

            response.markdown(`✅ **Handoff recorded!**\n\n`);
            response.markdown(`Plan \`${planId}\` handoff to **${targetAgent}** has been recorded.\n`);
            if (result?.warning) {
                response.markdown(`\n⚠️ ${result.warning}\n`);
            }
        } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            response.markdown(`❌ Handoff failed: ${errorMessage}`);
        }

        return { metadata: { command: 'handoff', targetAgent, planId } };
    }

    /**
     * Handle /status command - show current plan progress
     */
    private async handleStatusCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        if (!this.workspaceId) {
            response.markdown('⚠️ Workspace not registered.');
            return { metadata: { command: 'status' } };
        }

        response.markdown('📊 **Project Memory Status**\n\n');
        response.progress('Checking MCP connection...');

        // Check MCP connection
        const connected = this.mcpBridge.isConnected();
        response.markdown(`**MCP Server**: ${connected ? '🟢 Connected' : '🔴 Disconnected'}\n`);
        response.markdown(`**Workspace ID**: \`${this.workspaceId}\`\n\n`);

        // Get active plans
        response.progress('Fetching plans...');
        try {
            const result = await this.mcpBridge.callTool<{
                active_plans: Array<{
                    plan_id?: string;
                    id?: string;
                    title: string;
                    status?: string;
                    done_steps?: number;
                    total_steps?: number;
                    progress?: { done?: number; total?: number };
                }>;
            }>('memory_plan', { action: 'list', workspace_id: this.workspaceId });

            const plans = result.active_plans || [];
            const activePlans = plans.filter(p => p.status !== 'archived');

            response.markdown(`## Active Plans (${activePlans.length})\n\n`);

            if (activePlans.length === 0) {
                response.markdown('No active plans.\n');
            } else {
                for (const plan of activePlans) {
                    const statusEmoji = this.getStatusEmoji(plan.status);
                    const doneSteps = plan.done_steps ?? plan.progress?.done ?? 0;
                    const totalSteps = plan.total_steps ?? plan.progress?.total ?? 0;
                    const planId = plan.plan_id || plan.id;
                    
                    response.markdown(`${statusEmoji} **${plan.title}**${planId ? ` (\`${planId}\`)` : ''}\n`);
                    if (totalSteps > 0) {
                        response.markdown(`   Progress: ${doneSteps}/${totalSteps} steps\n`);
                    }
                }
            }
        } catch (error) {
            response.markdown('Could not retrieve plan status.\n');
        }

        return { metadata: { command: 'status' } };
    }

    /**
     * Handle /deploy command — trigger deployment of agents, prompts, or instructions
     */
    private async handleDeployCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        _token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.trim().toLowerCase();

        if (!prompt) {
            response.markdown('🚀 **Deploy Command**\n\n');
            response.markdown('Usage: `/deploy <target>`\n\n');
            response.markdown('**Targets:**\n');
            response.markdown('- `agents` — Copy agent files to the open workspace\n');
            response.markdown('- `prompts` — Copy prompt files to the open workspace\n');
            response.markdown('- `instructions` — Copy instruction files to the open workspace\n');
            response.markdown('- `all` — Deploy agents, prompts, and instructions\n');
            return { metadata: { command: 'deploy' } };
        }

        const cmdMap: Record<string, string> = {
            agents: 'projectMemory.deployAgents',
            prompts: 'projectMemory.deployPrompts',
            instructions: 'projectMemory.deployInstructions',
            all: 'projectMemory.deployCopilotConfig'
        };

        const cmd = cmdMap[prompt];
        if (!cmd) {
            response.markdown(`⚠️ Unknown deploy target: **${prompt}**\n\nUse: agents, prompts, instructions, or all`);
            return { metadata: { command: 'deploy' } };
        }

        response.markdown(`🚀 Running **deploy ${prompt}**...\n`);
        try {
            await vscode.commands.executeCommand(cmd);
            response.markdown(`\n✅ Deploy ${prompt} command executed.`);
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            response.markdown(`\n❌ Deploy failed: ${msg}`);
        }

        return { metadata: { command: 'deploy', target: prompt } };
    }

    /**
     * Handle /diagnostics command — run system diagnostics and show health report
     */
    private async handleDiagnosticsCommand(
        _request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        _token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        response.markdown('🔍 **Running diagnostics...**\n\n');

        try {
            // Execute the existing diagnostics command which writes to an output channel
            await vscode.commands.executeCommand('projectMemory.showDiagnostics');
            response.markdown('✅ Diagnostics report written to the **Project Memory Diagnostics** output channel.\n\n');

            // Also provide inline summary by probing the MCP server
            if (this.mcpBridge.isConnected()) {
                try {
                    const start = Date.now();
                    const wsResult = await this.mcpBridge.callTool<{
                        workspaces?: unknown[];
                    }>('memory_workspace', { action: 'list' });
                    const probeMs = Date.now() - start;
                    const wsCount = Array.isArray(wsResult.workspaces) ? wsResult.workspaces.length : 0;

                    response.markdown('## Quick Summary\n\n');
                    response.markdown(`| Metric | Value |\n|--------|-------|\n`);
                    response.markdown(`| MCP Connection | 🟢 Connected |\n`);
                    response.markdown(`| MCP Response Time | ${probeMs}ms |\n`);
                    response.markdown(`| Workspaces | ${wsCount} |\n`);
                    response.markdown(`| Memory | ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1)} MB |\n`);
                } catch {
                    response.markdown('⚠️ Could not probe MCP server for summary.\n');
                }
            } else {
                response.markdown('⚠️ MCP server is **not connected**. Some diagnostics may be incomplete.\n');
            }
        } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            response.markdown(`❌ Diagnostics failed: ${msg}`);
        }

        return { metadata: { command: 'diagnostics' } };
    }

    /**
     * Handle default (no command) requests
     */
    private async handleDefaultCommand(
        request: vscode.ChatRequest,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        const prompt = request.prompt.trim();

        if (!prompt) {
            response.markdown('👋 **Welcome to Project Memory!**\n\n');
            response.markdown('I can help you manage project plans and agent workflows.\n\n');
            response.markdown('**Available commands:**\n');
            response.markdown('- `/plan` - View, create, or manage plans\n');
            response.markdown('- `/context` - Get workspace context and codebase profile\n');
            response.markdown('- `/handoff` - Execute agent handoffs\n');
            response.markdown('- `/status` - Show current plan progress\n');
            response.markdown('- `/deploy` - Deploy agents, prompts, or instructions\n');
            response.markdown('- `/diagnostics` - Run system health diagnostics\n');
            response.markdown('\nOr just ask me about your project!');
            return { metadata: { command: 'help' } };
        }

        // Try to intelligently route the request
        if (prompt.toLowerCase().includes('plan') || prompt.toLowerCase().includes('create')) {
            response.markdown(`I can help you with plans!\n\n`);
            response.markdown(`Try using the \`/plan\` command:\n`);
            response.markdown(`- \`/plan list\` to see existing plans\n`);
            response.markdown(`- \`/plan create ${prompt}\` to create a new plan\n`);
        } else if (prompt.toLowerCase().includes('status') || prompt.toLowerCase().includes('progress')) {
            return await this.handleStatusCommand(request, response, token);
        } else {
            response.markdown(`I understand you want to: **${prompt}**\n\n`);
            response.markdown(`Here's what I can help with:\n`);
            response.markdown(`- Use \`/plan create ${prompt}\` to create a plan for this\n`);
            response.markdown(`- Use \`/status\` to check current progress\n`);
            response.markdown(`- Use \`/context\` to get workspace information\n`);
        }

        return { metadata: { command: 'default' } };
    }

    /**
     * Provide follow-up suggestions
     */
    private provideFollowups(
        result: vscode.ChatResult,
        context: vscode.ChatContext,
        token: vscode.CancellationToken
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
     * Get emoji for plan status
     */
    private getStatusEmoji(status?: string): string {
        switch (status) {
            case 'active': return '🔵';
            case 'completed': return '✅';
            case 'archived': return '📦';
            case 'blocked': return '🔴';
            default: return '⚪';
        }
    }

    /**
     * Get emoji for step status
     */
    private getStepStatusEmoji(status?: string): string {
        switch (status) {
            case 'done': return '✅';
            case 'active': return '🔄';
            case 'blocked': return '🔴';
            default: return '⬜';
        }
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
