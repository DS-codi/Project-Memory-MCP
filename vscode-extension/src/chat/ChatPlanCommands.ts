/**
 * Plan Command Handlers — Handles /plan slash command for the @memory chat participant.
 *
 * Subcommands:
 *   /plan              — Show usage / list plans
 *   /plan list         — List all plans in the workspace
 *   /plan create <t>   — Create a new plan with the given title
 *   /plan show <id>    — Show details of a specific plan
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';

// ── Types ──────────────────────────────────────────────────────────────

/** Plan state returned from MCP server */
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

function getStepStatusEmoji(status?: string): string {
    switch (status) {
        case 'done': return '✅';
        case 'active': return '🔄';
        case 'blocked': return '🔴';
        default: return '⬜';
    }
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /plan command. Called from ChatParticipant.
 */
export async function handlePlanCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    const prompt = request.prompt.trim();

    if (!prompt || prompt === 'list') {
        return await listPlans(response, mcpBridge, workspaceId);
    }

    if (prompt.startsWith('create ')) {
        return await createPlan(prompt.substring(7), response, mcpBridge, workspaceId);
    }

    if (prompt.startsWith('show ')) {
        const planId = prompt.substring(5).trim();
        return await showPlan(planId, response, mcpBridge, workspaceId);
    }

    // Default: show usage hints
    response.markdown('📋 **Plan Commands**\n\n');
    response.markdown('- `/plan list` - List all plans in this workspace\n');
    response.markdown('- `/plan create <title>` - Create a new plan\n');
    response.markdown('- `/plan show <plan-id>` - Show plan details\n');
    response.markdown('\nOr just describe what you want to do and I\'ll help create a plan.');

    return { metadata: { command: 'plan' } };
}

// ── Sub-handlers ───────────────────────────────────────────────────────

/** List all plans in the workspace */
async function listPlans(
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'plan' } };
    }

    response.progress('Fetching plans...');

    const result = await mcpBridge.callTool<{
        active_plans: Array<{
            plan_id?: string;
            id?: string;
            title: string;
            status?: string;
            category?: string;
        }>;
    }>('memory_plan', { action: 'list', workspace_id: workspaceId });

    const plans = result.active_plans || [];

    if (plans.length === 0) {
        response.markdown('📋 **No plans found**\n\nUse `/plan create <title>` to create a new plan.');
        return { metadata: { command: 'plan' } };
    }

    response.markdown(`📋 **Plans in this workspace** (${plans.length})\n\n`);

    for (const plan of plans) {
        const statusEmoji = getStatusEmoji(plan.status);
        const planId = plan.plan_id || plan.id || 'unknown';
        response.markdown(`${statusEmoji} **${plan.title}** \`${planId}\`\n`);
        if (plan.category) {
            response.markdown(`   Category: ${plan.category}\n`);
        }
    }

    return { metadata: { command: 'plan', plans: plans.length } };
}

/** Create a new plan */
async function createPlan(
    description: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'plan' } };
    }

    response.markdown(`🔄 Creating plan: **${description}**...\n\n`);

    const result = await mcpBridge.callTool<PlanState>(
        'memory_plan',
        {
            action: 'create',
            workspace_id: workspaceId,
            title: description,
            description: description,
            category: 'feature'
        }
    );

    const planId = result.plan_id || result.id || 'unknown';
    response.markdown(`✅ **Plan created!**\n\n`);
    response.markdown(`- **ID**: \`${planId}\`\n`);
    response.markdown(`- **Title**: ${result.title}\n`);
    response.markdown(`\nUse \`/plan show ${planId}\` to see details.`);

    return { metadata: { command: 'plan', action: 'created', planId } };
}

/** Show details of a specific plan */
async function showPlan(
    planId: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'plan' } };
    }

    const result = await mcpBridge.callTool<PlanState>(
        'memory_plan',
        {
            action: 'get',
            workspace_id: workspaceId,
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
            const emoji = getStepStatusEmoji(step.status);
            response.markdown(`${emoji} **${step.phase}**: ${step.task}\n`);
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
