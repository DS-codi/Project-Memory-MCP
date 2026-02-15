/**
 * Miscellaneous Command Handlers — Handles /handoff, /status, /deploy,
 * /diagnostics, and the default (no-command) route for the @memory chat participant.
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import { createPlanIdCommandLink, createTrustedMarkdown, withProgress } from './ChatResponseHelpers';

// ── Helpers ────────────────────────────────────────────────────────────

function getStatusEmoji(status?: string): string {
    switch (status) {
        case 'active': return '🔵';
        case 'completed': return '✅';
        case 'archived': return '📦';
        case 'blocked': return '🔴';
        default: return '⚪';
    }
}

const KNOWN_AGENT_TYPES = [
    'Coordinator',
    'Researcher',
    'Architect',
    'Executor',
    'Reviewer',
    'Tester',
    'Archivist',
    'Analyst',
    'Brainstorm',
    'Runner',
    'Revisionist',
    'Worker',
    'Cognition',
    'Builder',
    'TDDDriver',
] as const;

function canonicalizeAgentType(agentToken: string): string {
    const normalized = agentToken.trim();
    const match = KNOWN_AGENT_TYPES.find(agent => agent.toLowerCase() === normalized.toLowerCase());
    return match ?? normalized;
}

function parseHandoffInput(prompt: string): {
    targetAgent?: string;
    planId?: string;
    summary?: string;
    error?: string;
} {
    const tokens = prompt.split(/\s+/).map(token => token.trim()).filter(Boolean);

    while (tokens.length > 0 && /^\/?handoff$/i.test(tokens[0])) {
        tokens.shift();
    }

    if (tokens.length < 2) {
        return { error: '⚠️ Please provide both agent type and plan ID.\nExample: `/handoff Executor plan_abc123`' };
    }

    const rawTargetAgent = tokens[0];
    if (rawTargetAgent.startsWith('/')) {
        return { error: '⚠️ Invalid agent type. Use an agent name like `Coordinator`, `Executor`, or `Reviewer`.' };
    }

    return {
        targetAgent: canonicalizeAgentType(rawTargetAgent),
        planId: tokens[1],
        summary: tokens.slice(2).join(' ') || 'Handoff from chat'
    };
}

// ── /handoff ───────────────────────────────────────────────────────────

/**
 * Handle the /handoff command — execute agent handoffs.
 */
export async function handleHandoffCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
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
        response.markdown('- `Reviewer` - Build verification + code review\n');
        response.markdown('- `Tester` - Writes and runs tests\n');
        response.markdown('- `Archivist` - Finalizes and archives\n');
        response.markdown('- `Analyst` - Deep investigation and analysis\n');
        response.markdown('- `Brainstorm` - Explore and refine ideas\n');
        response.markdown('- `Runner` - Quick tasks and exploration\n');
        return { metadata: { command: 'handoff', action: 'help' } };
    }

    const parsed = parseHandoffInput(prompt);
    if (parsed.error || !parsed.targetAgent || !parsed.planId) {
        response.markdown(parsed.error ?? '⚠️ Invalid handoff command.');
        return { metadata: { command: 'handoff', action: 'validate' } };
    }

    const targetAgent = parsed.targetAgent;
    const planId = parsed.planId;
    const summary = parsed.summary ?? 'Handoff from chat';

    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'handoff', action: 'execute' } };
    }

    response.markdown(`🔄 Initiating handoff to **${targetAgent}**...\n\n`);

    try {
        const result = await withProgress(response, 'Recording handoff...', async () =>
            mcpBridge.callTool<{ warning?: string }>('memory_agent', {
                action: 'handoff',
                workspace_id: workspaceId,
                plan_id: planId,
                from_agent: 'User',
                to_agent: targetAgent,
                summary
            })
        );

        response.markdown(`✅ **Handoff recorded!**\n\n`);
        response.markdown(`Plan \`${planId}\` handoff to **${targetAgent}** has been recorded.\n`);
        if (result?.warning) {
            response.markdown(`\n⚠️ ${result.warning}\n`);
        }
    } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        response.markdown(`❌ Handoff failed: ${errorMessage}`);
    }

    return { metadata: { command: 'handoff', action: 'execute', targetAgent, planId } };
}

// ── /status ────────────────────────────────────────────────────────────

/**
 * Handle the /status command — show current plan progress.
 */
export async function handleStatusCommand(
    _request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'status', action: 'show' } };
    }

    let mostActivePlan: { planId: string; title: string } | undefined;

    response.markdown('📊 **Project Memory Status**\n\n');
    response.progress('Checking MCP connection...');

    // Check MCP connection
    const connected = mcpBridge.isConnected();
    response.markdown(`**MCP Server**: ${connected ? '🟢 Connected' : '🔴 Disconnected'}\n`);
    response.markdown(`**Workspace ID**: \`${workspaceId}\`\n\n`);

    // Get active plans
    try {
        const result = await withProgress(response, 'Listing plans...', async () =>
            mcpBridge.callTool<{
                active_plans: Array<{
                    plan_id?: string;
                    id?: string;
                    title: string;
                    status?: string;
                    done_steps?: number;
                    total_steps?: number;
                    progress?: { done?: number; total?: number };
                }>;
            }>('memory_plan', { action: 'list', workspace_id: workspaceId })
        );

        const plans = result.active_plans || [];
        const activePlans = plans.filter(p => p.status !== 'archived');

        response.markdown(`## Active Plans (${activePlans.length})\n\n`);

        if (activePlans.length === 0) {
            response.markdown('No active plans.\n');
        } else {
            const prioritizedPlans = [...activePlans].sort((left, right) => {
                const leftStatus = left.status === 'active' ? 1 : 0;
                const rightStatus = right.status === 'active' ? 1 : 0;
                if (leftStatus !== rightStatus) {
                    return rightStatus - leftStatus;
                }

                const leftDone = left.done_steps ?? left.progress?.done ?? 0;
                const rightDone = right.done_steps ?? right.progress?.done ?? 0;
                return rightDone - leftDone;
            });

            const topPlan = prioritizedPlans[0];
            const topPlanId = topPlan?.plan_id || topPlan?.id;
            if (topPlan && topPlanId) {
                mostActivePlan = { planId: topPlanId, title: topPlan.title };
            }

            for (const plan of activePlans) {
                const statusEmoji = getStatusEmoji(plan.status);
                const doneSteps = plan.done_steps ?? plan.progress?.done ?? 0;
                const totalSteps = plan.total_steps ?? plan.progress?.total ?? 0;
                const planId = plan.plan_id || plan.id;
                const planSuffix = planId
                    ? ` (${createPlanIdCommandLink(planId)})`
                    : '';

                response.markdown(
                    createTrustedMarkdown(
                        `${statusEmoji} **${plan.title}**${planSuffix}\n`,
                        ['projectMemory.showPlanInChat']
                    )
                );
                if (totalSteps > 0) {
                    response.markdown(`   Progress: ${doneSteps}/${totalSteps} steps\n`);
                }
            }
        }
    } catch (error) {
        response.markdown('Could not retrieve plan status.\n');
    }

    return {
        metadata: {
            command: 'status',
            action: 'show',
            planId: mostActivePlan?.planId,
            mostActivePlanTitle: mostActivePlan?.title
        }
    };
}

// ── /deploy ────────────────────────────────────────────────────────────

/**
 * Handle the /deploy command — trigger deployment of agents, skills, or instructions.
 */
export async function handleDeployCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.trim().toLowerCase();

    if (!prompt) {
        response.markdown('🚀 **Deploy Command**\n\n');
        response.markdown('Usage: `/deploy <target>`\n\n');
        response.markdown('**Targets:**\n');
        response.markdown('- `agents` — Copy agent files to the open workspace\n');
        response.markdown('- `skills` — Copy skill files to the open workspace\n');
        response.markdown('- `instructions` — Copy instruction files to the open workspace\n');
        response.markdown('- `all` — Deploy agents, skills, and instructions\n');
        return { metadata: { command: 'deploy', action: 'help' } };
    }

    const cmdMap: Record<string, string> = {
        agents: 'projectMemory.deployAgents',
        skills: 'projectMemory.deploySkills',
        instructions: 'projectMemory.deployInstructions',
        all: 'projectMemory.deployCopilotConfig'
    };

    const cmd = cmdMap[prompt];
    if (!cmd) {
        response.markdown(`⚠️ Unknown deploy target: **${prompt}**\n\nUse: agents, skills, instructions, or all`);
        return { metadata: { command: 'deploy', action: 'validate' } };
    }

    response.markdown(`🚀 Running **deploy ${prompt}**...\n`);
    try {
        await vscode.commands.executeCommand(cmd);
        response.markdown(`\n✅ Deploy ${prompt} command executed.`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`\n❌ Deploy failed: ${msg}`);
    }

    return { metadata: { command: 'deploy', action: 'run', target: prompt } };
}

// ── /diagnostics ───────────────────────────────────────────────────────

/**
 * Handle the /diagnostics command — run system diagnostics and show health report.
 */
export async function handleDiagnosticsCommand(
    _request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
): Promise<vscode.ChatResult> {
    response.markdown('🔍 **Running diagnostics...**\n\n');

    try {
        // Execute the existing diagnostics command which writes to an output channel
        await vscode.commands.executeCommand('projectMemory.showDiagnostics');
        response.markdown('✅ Diagnostics report written to the **Project Memory Diagnostics** output channel.\n\n');

        // Also provide inline summary by probing the MCP server
        if (mcpBridge.isConnected()) {
            try {
                const start = Date.now();
                const wsResult = await withProgress(response, 'Listing workspaces...', async () =>
                    mcpBridge.callTool<{
                        workspaces?: unknown[];
                    }>('memory_workspace', { action: 'list' })
                );
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

    return { metadata: { command: 'diagnostics', action: 'run' } };
}

// ── default (no command) ───────────────────────────────────────────────

/**
 * Handle requests with no slash command — show help or intelligently route.
 */
export async function handleDefaultCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.trim();

    if (!prompt) {
        response.markdown('👋 **Welcome to Project Memory!**\n\n');
        response.markdown('I can help you manage project plans and agent workflows.\n\n');
        response.markdown('**Available commands:**\n');
        response.markdown('- `/plan` - View, create, or manage plans\n');
        response.markdown('- `/context` - Get workspace context and codebase profile\n');
        response.markdown('- `/context set {key} {value}` - Set a context section\n');
        response.markdown('- `/knowledge` - Manage workspace knowledge files\n');
        response.markdown('- `/handoff` - Execute agent handoffs\n');
        response.markdown('- `/status` - Show current plan progress\n');
        response.markdown('- `/deploy` - Deploy agents, skills, or instructions\n');
        response.markdown('- `/diagnostics` - Run system health diagnostics\n');
        response.markdown('\nOr just ask me about your project!');
        return { metadata: { command: 'help', action: 'show' } };
    }

    // Try to intelligently route the request
    if (prompt.toLowerCase().includes('plan') || prompt.toLowerCase().includes('create')) {
        response.markdown(`I can help you with plans!\n\n`);
        response.markdown(`Try using the \`/plan\` command:\n`);
        response.markdown(`- \`/plan list\` to see existing plans\n`);
        response.markdown(`- \`/plan create ${prompt}\` to create a new plan\n`);
    } else if (prompt.toLowerCase().includes('status') || prompt.toLowerCase().includes('progress')) {
        return await handleStatusCommand(request, response, token, mcpBridge, workspaceId);
    } else {
        response.markdown(`I understand you want to: **${prompt}**\n\n`);
        response.markdown(`Here's what I can help with:\n`);
        response.markdown(`- Use \`/plan create ${prompt}\` to create a plan for this\n`);
        response.markdown(`- Use \`/status\` to check current progress\n`);
        response.markdown(`- Use \`/context\` to get workspace information\n`);
    }

    return { metadata: { command: 'default', action: 'route' } };
}
