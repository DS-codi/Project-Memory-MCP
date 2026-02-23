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
import * as path from 'path';
import * as fs from 'fs';
import { McpBridge } from './McpBridge';
import { createCommandLink, createPlanIdCommandLink, createTrustedMarkdown, renderFileReferences, renderPlanActionButtons, renderStepCommandLinks, withProgress } from './ChatResponseHelpers';

// ── Types ──────────────────────────────────────────────────────────────

/** Plan state returned from MCP server */
interface PlanState {
    plan_id?: string;
    program_id?: string;
    is_program?: boolean;
    child_plan_ids?: string[];
    depends_on_plans?: string[];
    recommended_next_agent?: string;
    id?: string;
    title: string;
    description?: string;
    category?: string;
    priority?: string;
    status?: string;
    steps?: Array<{
        index?: number;
        phase: string;
        task: string;
        status: string;
        notes?: string;
        requires_confirmation?: boolean;
        requires_user_confirmation?: boolean;
    }>;
    confirmation_state?: {
        phases?: Record<string, unknown>;
        steps?: Record<string, unknown>;
    };
    lineage?: Array<{
        agent_type: string;
        started_at: string;
        summary?: string;
        files_modified?: string[];
        data?: {
            files_modified?: string[];
        };
        artifacts?: string[];
    }> | {
        recent?: Array<{
            agent_type: string;
            started_at: string;
            summary?: string;
            files_modified?: string[];
            data?: {
                files_modified?: string[];
            };
            artifacts?: string[];
        }>;
    };
    agent_sessions?: {
        recent?: Array<{
            files_modified?: string[];
            files_created?: string[];
            artifacts?: string[];
            data?: {
                files_modified?: string[];
                files_created?: string[];
                artifacts?: string[];
            };
        }>;
    } | Array<{
        files_modified?: string[];
        files_created?: string[];
        artifacts?: string[];
        data?: {
            files_modified?: string[];
            files_created?: string[];
            artifacts?: string[];
        };
    }>;
}

interface StepCounts {
    pending: number;
    active: number;
    done: number;
    blocked: number;
}

interface ProgramChildPlanSummary {
    plan_id: string;
    title: string;
    status?: string;
    depends_on_plans?: string[];
}

interface ProgramPlansResult {
    child_plans?: ProgramChildPlanSummary[];
}

interface BuildScriptSummary {
    id?: string;
    name?: string;
    description?: string;
    command?: string;
    directory?: string;
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

function extractFilePaths(text: string): string[] {
    const pathPattern = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\w.-]+[\\/])[\w./\\-]*[\w-]\.[A-Za-z0-9]+/g;
    return text.match(pathPattern) ?? [];
}

function toWorkspaceAbsolutePath(filePath: string, workspaceRootOverride?: string): string {
    const trimmed = filePath.trim();
    if (trimmed.length === 0) {
        return trimmed;
    }

    if (path.isAbsolute(trimmed)) {
        return trimmed;
    }

    const workspaceRoot = workspaceRootOverride ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspaceRoot) {
        return trimmed;
    }

    return path.join(workspaceRoot, trimmed.replace(/^\.\//, ''));
}

function collectLineageEntries(lineage?: PlanState['lineage']): Array<{
    agent_type: string;
    started_at: string;
    summary?: string;
    files_modified?: string[];
    data?: { files_modified?: string[] };
    artifacts?: string[];
}> {
    if (!lineage) {
        return [];
    }

    if (Array.isArray(lineage)) {
        return lineage;
    }

    return Array.isArray(lineage.recent) ? lineage.recent : [];
}

function collectAgentSessionArtifactFiles(plan: PlanState): string[] {
    const recentSessions = Array.isArray(plan.agent_sessions)
        ? plan.agent_sessions
        : (plan.agent_sessions?.recent ?? []);

    return Array.from(
        new Set(
            recentSessions.flatMap((session) => [
                ...(session.files_modified ?? []),
                ...(session.files_created ?? []),
                ...(session.artifacts ?? []),
                ...(session.data?.files_modified ?? []),
                ...(session.data?.files_created ?? []),
                ...(session.data?.artifacts ?? []),
            ])
        )
    );
}

function inferWorkspaceRootForArtifacts(artifactPaths: string[]): string | undefined {
    const configuredRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    const firstRelativeArtifact = artifactPaths
        .map((value) => value.trim())
        .find((value) => value.length > 0 && !path.isAbsolute(value));

    if (configuredRoot) {
        if (!firstRelativeArtifact) {
            return configuredRoot;
        }

        const firstSegment = firstRelativeArtifact.split(/[\\/]/).find((segment) => segment.length > 0);
        if (firstSegment && path.basename(configuredRoot) === firstSegment) {
            return path.dirname(configuredRoot);
        }

        return configuredRoot;
    }

    const cwd = process.cwd();

    if (!firstRelativeArtifact) {
        return cwd;
    }

    const firstSegment = firstRelativeArtifact.split(/[\\/]/).find((segment) => segment.length > 0);
    if (firstSegment) {
        const cwdSegments = cwd.split(/[\\/]/).filter((segment) => segment.length > 0);
        const segmentIndex = cwdSegments.lastIndexOf(firstSegment);
        if (segmentIndex >= 0) {
            const rootPrefix = cwd.startsWith(path.sep) ? path.sep : '';
            const parentSegments = cwdSegments.slice(0, segmentIndex);
            const parentPath = `${rootPrefix}${parentSegments.join(path.sep)}`;
            if (parentPath.length > 0) {
                return parentPath;
            }
            return path.parse(cwd).root;
        }

        if (firstSegment === path.basename(cwd)) {
            return path.dirname(cwd);
        }

        try {
            const childDirectories = fs.readdirSync(cwd, { withFileTypes: true })
                .filter((entry) => entry.isDirectory())
                .map((entry) => path.join(cwd, entry.name));

            const containingRoots = childDirectories.filter((directoryPath) =>
                fs.existsSync(path.join(directoryPath, firstSegment))
            );

            if (containingRoots.length === 1) {
                return containingRoots[0];
            }
        } catch {
        }
    }

    return cwd;
}

function insertFileTreeNode(nodes: vscode.ChatResponseFileTree[], segments: string[]): void {
    if (segments.length === 0) {
        return;
    }

    const [name, ...rest] = segments;
    if (!name) {
        return;
    }

    let node = nodes.find((entry) => entry.name === name);
    if (!node) {
        node = { name };
        nodes.push(node);
    }

    if (rest.length === 0) {
        return;
    }

    if (!node.children) {
        node.children = [];
    }

    insertFileTreeNode(node.children, rest);
}

function buildFileTree(relativePaths: string[]): vscode.ChatResponseFileTree[] {
    const root: vscode.ChatResponseFileTree[] = [];
    for (const relativePath of relativePaths) {
        const segments = relativePath.split('/').filter((segment) => segment.length > 0);
        insertFileTreeNode(root, segments);
    }
    return root;
}

function toWorkspaceRelativePath(filePath: string, workspaceRoot: string): string {
    const relativePath = path.relative(workspaceRoot, filePath);
    return relativePath.split(path.sep).join('/');
}

function renderSummaryWithAnchors(response: vscode.ChatResponseStream, summary: string): void {
    const pattern = /(?:[A-Za-z]:[\\/]|\.{1,2}[\\/]|[\w.-]+[\\/])[\w./\\-]*[\w-]\.[A-Za-z0-9]+/g;
    const matches = Array.from(summary.matchAll(pattern));

    if (matches.length === 0) {
        response.markdown(`  ${summary}\n`);
        return;
    }

    response.markdown('  ');
    let lastIndex = 0;

    for (const match of matches) {
        const rawPath = match[0];
        const index = match.index ?? 0;
        const leadingText = summary.slice(lastIndex, index);
        if (leadingText.length > 0) {
            response.markdown(leadingText);
        }

        response.anchor(vscode.Uri.file(toWorkspaceAbsolutePath(rawPath)), rawPath);
        lastIndex = index + rawPath.length;
    }

    const trailingText = summary.slice(lastIndex);
    if (trailingText.length > 0) {
        response.markdown(trailingText);
    }

    response.markdown('\n');
}

function getStepCounts(steps?: PlanState['steps']): StepCounts {
    const counts: StepCounts = {
        pending: 0,
        active: 0,
        done: 0,
        blocked: 0,
    };

    if (!steps) {
        return counts;
    }

    for (const step of steps) {
        if (step.status === 'pending') {
            counts.pending += 1;
        } else if (step.status === 'active') {
            counts.active += 1;
        } else if (step.status === 'done' || step.status === 'completed') {
            counts.done += 1;
        } else if (step.status === 'blocked') {
            counts.blocked += 1;
        }
    }

    return counts;
}

function hasScopeEscalationHandoff(lineage: PlanState['lineage']): boolean {
    const entries = collectLineageEntries(lineage);
    return entries.some((entry) => {
        const summary = entry.summary ?? '';
        return /scope[-\s]?escalation/i.test(summary);
    });
}

function isConfirmationEntryApproved(entry: unknown): boolean {
    if (entry === true) {
        return true;
    }

    if (!entry || typeof entry !== 'object') {
        return false;
    }

    const record = entry as Record<string, unknown>;
    if (record.confirmed === true) {
        return true;
    }
    if (record.is_confirmed === true) {
        return true;
    }
    if (typeof record.status === 'string' && record.status.toLowerCase() === 'confirmed') {
        return true;
    }

    return false;
}

function buildAgentLaunchPrompt(agentName: string, workspaceId: string, planId: string): string {
    return `Continue as ${agentName} for this plan context.\n\nPlan context:\n- workspace_id: ${workspaceId}\n- plan_id: ${planId}`;
}

function buildResearchFurtherPrompt(workspaceId: string, planId: string): string {
    return [
        'Continue as Researcher to deepen and validate the Architect output for this plan.',
        '',
        'Focus:',
        '- Identify missing constraints, dependencies, and edge cases',
        '- Propose concrete follow-up research tasks that reduce implementation risk',
        '',
        'Plan context:',
        `- workspace_id: ${workspaceId}`,
        `- plan_id: ${planId}`,
    ].join('\n');
}

function renderPlanHelp(response: vscode.ChatResponseStream): void {
    response.markdown('📘 **Plan Command Reference**\n\n');
    response.markdown('### Commands\n\n');
    response.markdown('- `/plan list` — List all plans in this workspace\n');
    response.markdown('- `/plan show <plan-id>` — Show detailed plan state and actions\n');
    response.markdown('- `/plan create <title>` — Create a new feature plan\n');
    response.markdown('- `/plan scripts [plan-id]` — List registered build scripts and run them\n');
    response.markdown('- `/plan help` — Show this command reference\n');

    response.markdown('\n### Usage Examples\n\n');
    response.markdown('- `/plan list`\n');
    response.markdown('- `/plan show plan_abc123_def456`\n');
    response.markdown('- `/plan create Add interactive terminal support`\n');
    response.markdown('- `/plan scripts`\n');
    response.markdown('- `/plan help`\n');

    response.markdown('\n### Try It\n\n');
    response.button({
        command: 'workbench.action.chat.open',
        title: 'Try /plan list',
        arguments: [{ query: '@memory /plan list' }]
    });
    response.button({
        command: 'workbench.action.chat.open',
        title: 'Try /plan show',
        arguments: [{ query: '@memory /plan show plan_abc123_def456' }]
    });
    response.button({
        command: 'workbench.action.chat.open',
        title: 'Try /plan create',
        arguments: [{ query: '@memory /plan create Add robust followup suggestions' }]
    });
    response.button({
        command: 'workbench.action.chat.open',
        title: 'Try /plan scripts',
        arguments: [{ query: '@memory /plan scripts' }]
    });
    response.button({
        command: 'workbench.action.chat.open',
        title: 'Try /plan help',
        arguments: [{ query: '@memory /plan help' }]
    });
}

function renderOpenInDashboardButton(
    response: vscode.ChatResponseStream,
    workspaceId: string | null,
    planId?: string
): void {
    response.button({
        command: 'projectMemoryDev.openPlanInDashboard',
        title: 'Open in Dashboard',
        arguments: [workspaceId ?? undefined, planId]
    });
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

    if (prompt === 'help') {
        renderPlanHelp(response);
        renderOpenInDashboardButton(response, workspaceId);
        return { metadata: { command: 'plan', action: 'help' } };
    }

    if (!prompt || prompt === 'list') {
        return await listPlans(response, mcpBridge, workspaceId);
    }

    if (prompt === 'scripts' || prompt.startsWith('scripts ')) {
        const rawPlanId = prompt.substring('scripts'.length).trim();
        const scopedPlanId = rawPlanId.length > 0 ? rawPlanId : undefined;
        return await listBuildScripts(response, mcpBridge, workspaceId, scopedPlanId);
    }

    if (prompt.startsWith('create ')) {
        return await createPlan(prompt.substring(7), response, mcpBridge, workspaceId);
    }

    if (prompt.startsWith('show ')) {
        const showArgs = prompt.substring(5).trim();
        const noteMatch = showArgs.match(/--research-note\s+(.+)$/);
        const researchNote = noteMatch?.[1]?.trim().replace(/^['"]|['"]$/g, '');
        const planId = noteMatch
            ? showArgs.slice(0, showArgs.length - noteMatch[0].length).trim()
            : showArgs;
        return await showPlan(planId, response, mcpBridge, workspaceId, researchNote);
    }

    // Default: show usage hints
    renderPlanHelp(response);

    return { metadata: { command: 'plan', action: 'help' } };
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
        return { metadata: { command: 'plan', action: 'list' } };
    }

    const result = await withProgress(response, 'Listing plans...', async () =>
        mcpBridge.callTool<{
            active_plans: Array<{
                plan_id?: string;
                id?: string;
                title: string;
                status?: string;
                category?: string;
            }>;
        }>('memory_plan', { action: 'list', workspace_id: workspaceId })
    );

    const plans = result.active_plans || [];

    if (plans.length === 0) {
        response.markdown('📋 **No plans found**\n\nUse `/plan create <title>` to create a new plan.');
        return { metadata: { command: 'plan', action: 'list' } };
    }

    response.markdown(`📋 **Plans in this workspace** (${plans.length})\n\n`);

    for (const plan of plans) {
        const statusEmoji = getStatusEmoji(plan.status);
        const planId = plan.plan_id || plan.id || 'unknown';
        const linkedPlanId = createPlanIdCommandLink(planId);
        response.markdown(
            createTrustedMarkdown(
                `${statusEmoji} **${plan.title}** (${linkedPlanId})\n`,
                ['projectMemoryDev.showPlanInChat']
            )
        );
        if (plan.category) {
            response.markdown(`   Category: ${plan.category}\n`);
        }
        response.button({
            command: 'projectMemoryDev.showPlanInChat',
            title: 'View Details',
            arguments: [planId]
        });
    }

    response.button({
        command: 'workbench.action.chat.open',
        title: 'Refresh',
        arguments: [{ query: '@memory /plan list' }]
    });

    renderOpenInDashboardButton(response, workspaceId);

    return { metadata: { command: 'plan', action: 'list', plans: plans.length } };
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
        return { metadata: { command: 'plan', action: 'create' } };
    }

    response.markdown(`🔄 Creating plan: **${description}**...\n\n`);

    const result = await withProgress(response, 'Creating plan...', async () =>
        mcpBridge.callTool<PlanState>(
            'memory_plan',
            {
                action: 'create',
                workspace_id: workspaceId,
                title: description,
                description: description,
                category: 'feature'
            }
        )
    );

    const planId = result.plan_id || result.id || 'unknown';
    response.markdown(`✅ **Plan created!**\n\n`);
    response.markdown(`- **ID**: \`${planId}\`\n`);
    response.markdown(`- **Title**: ${result.title}\n`);
    response.markdown(`\nUse \`/plan show ${planId}\` to see details.`);
    response.button({
        command: 'projectMemoryDev.showPlanInChat',
        title: 'View Plan Details',
        arguments: [planId]
    });
    renderOpenInDashboardButton(response, workspaceId, planId);

    return {
        metadata: {
            command: 'plan',
            action: 'create',
            planId,
            programId: result.program_id,
            hasScripts: false,
            recommendedAgent: 'Architect'
        }
    };
}

/** List registered build scripts and provide Run buttons */
async function listBuildScripts(
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string | null,
    planId?: string,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'plan', action: 'scripts', hasScripts: false } };
    }

    const payload: Record<string, unknown> = {
        action: 'list_build_scripts',
        workspace_id: workspaceId,
    };

    if (planId) {
        payload.plan_id = planId;
    }

    const scriptsResult = await withProgress(response, 'Loading build scripts...', async () =>
        mcpBridge.callTool<{ scripts?: BuildScriptSummary[] } | BuildScriptSummary[]>('memory_plan', payload)
    );

    const scripts = Array.isArray(scriptsResult)
        ? scriptsResult
        : scriptsResult.scripts ?? [];

    if (scripts.length === 0) {
        response.markdown('🧰 **No build scripts found.**\n\nUse registered build scripts to expose Run buttons in chat.');
        return {
            metadata: {
                command: 'plan',
                action: 'scripts',
                planId,
                hasScripts: false,
            }
        };
    }

    response.markdown(`🧰 **Registered Build Scripts** (${scripts.length})\n\n`);
    if (planId) {
        response.markdown(`Scoped to plan: \`${planId}\`\n\n`);
    }

    for (const script of scripts) {
        const scriptId = script.id ?? '';
        const scriptName = script.name ?? 'Unnamed script';
        response.markdown(`- **${scriptName}**\n`);
        response.markdown(`  - Command: \`${script.command ?? 'N/A'}\`\n`);
        response.markdown(`  - Directory: \`${script.directory ?? 'N/A'}\`\n`);
        if (script.description) {
            response.markdown(`  - Description: ${script.description}\n`);
        }

        if (scriptId.length > 0) {
            response.button({
                command: 'projectMemoryDev.runBuildScript',
                title: `Run ${scriptName}`,
                arguments: [scriptId, planId]
            });
        }
    }

    renderOpenInDashboardButton(response, workspaceId, planId);

    return {
        metadata: {
            command: 'plan',
            action: 'scripts',
            planId,
            hasScripts: true,
            scriptCount: scripts.length,
        }
    };
}

/** Show details of a specific plan */
async function showPlan(
    planId: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string | null,
    selectedResearchNote?: string,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'plan', action: 'show' } };
    }

    const result = await withProgress(response, 'Loading plan details...', async () =>
        mcpBridge.callTool<PlanState>(
            'memory_plan',
            {
                action: 'get',
                workspace_id: workspaceId,
                plan_id: planId
            }
        )
    );

    const resolvedPlanId = result.plan_id || result.id || planId;
    const isProgramView = result.is_program === true || (result.child_plan_ids?.length ?? 0) > 0;

    if (isProgramView) {
        response.markdown(`# 📦 ${result.title}\n\n`);
        response.markdown('**Type**: Integrated Program\n');
    } else {
        response.markdown(`# 📋 ${result.title}\n\n`);
    }
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
        const indexedSteps = result.steps.map((step, index) => ({
            index: typeof step.index === 'number' ? step.index : index,
            phase: step.phase,
            task: step.task,
            status: step.status,
        }));

        renderStepCommandLinks(response, indexedSteps, resolvedPlanId);
    }

    const noteFiles = (result.steps ?? [])
        .flatMap((step) => extractFilePaths(step.notes ?? ''))
        .map((filePath) => toWorkspaceAbsolutePath(filePath));

    const handoffFiles = collectLineageEntries(result.lineage)
        .flatMap((entry) => [
            ...(entry.files_modified ?? []),
            ...(entry.data?.files_modified ?? []),
        ])
        .map((filePath) => toWorkspaceAbsolutePath(filePath));

    const sessionArtifactFiles = collectAgentSessionArtifactFiles(result);
    const workspaceRoot = inferWorkspaceRootForArtifacts(sessionArtifactFiles);
    if (workspaceRoot) {
        const inferredArtifactFiles = sessionArtifactFiles
            .map((filePath) => toWorkspaceAbsolutePath(filePath, workspaceRoot))
            .filter((filePath) => path.isAbsolute(filePath))
            .map((filePath) => ({
                absolutePath: filePath,
                relativePath: toWorkspaceRelativePath(filePath, workspaceRoot),
            }))
            .filter((item) => item.relativePath.length > 0 && !item.relativePath.startsWith('..'));

        const fallbackRelativeArtifactFiles = sessionArtifactFiles
            .map((filePath) => filePath.trim())
            .filter((filePath) => filePath.length > 0 && !path.isAbsolute(filePath))
            .map((filePath) => filePath.replace(/\\/g, '/').replace(/^\.\//, ''));

        const relativeArtifactFiles = inferredArtifactFiles.length > 0
            ? inferredArtifactFiles.map((item) => item.relativePath)
            : fallbackRelativeArtifactFiles;

        if (relativeArtifactFiles.length > 0) {
            response.markdown('\n## Plan Artifacts\n\n');
            response.filetree(
                buildFileTree(relativeArtifactFiles),
                vscode.Uri.file(workspaceRoot)
            );
        }
    }

    const summaryFiles = collectLineageEntries(result.lineage)
        .flatMap((entry) => extractFilePaths(entry.summary ?? ''))
        .map((filePath) => toWorkspaceAbsolutePath(filePath));

    const linkedFiles = Array.from(new Set([...noteFiles, ...handoffFiles, ...summaryFiles, ...sessionArtifactFiles]));
    renderFileReferences(response, linkedFiles);

    let researchNotes: string[] = [];
    try {
        const listed = await withProgress(response, 'Listing research notes...', async () =>
            mcpBridge.callTool<string[] | { notes?: string[] }>('memory_context', {
                action: 'list_research',
                workspace_id: workspaceId,
                plan_id: resolvedPlanId
            })
        );
        researchNotes = Array.isArray(listed) ? listed : listed.notes ?? [];
    } catch {
        researchNotes = [];
    }

    if (researchNotes.length > 0) {
        const noteLinks = researchNotes
            .map((note) => `- [${note}](${createCommandLink('projectMemoryDev.showPlanInChat', [resolvedPlanId, note])})`)
            .join('\n');

        response.markdown(
            createTrustedMarkdown(
                `\n## Research Notes\n\n${noteLinks}\n`,
                ['projectMemoryDev.showPlanInChat']
            )
        );
    }

    if (selectedResearchNote) {
        let noteContent: unknown;
        try {
            noteContent = await withProgress(response, 'Loading research note...', async () =>
                mcpBridge.callTool<unknown>('memory_context', {
                    action: 'get',
                    workspace_id: workspaceId,
                    plan_id: resolvedPlanId,
                    type: `research_notes/${selectedResearchNote}`
                })
            );
        } catch {
            noteContent = await withProgress(response, 'Loading research note...', async () =>
                mcpBridge.callTool<unknown>('memory_context', {
                    action: 'get',
                    workspace_id: workspaceId,
                    plan_id: resolvedPlanId,
                    type: 'research'
                })
            );
        }

        const inlineContent = typeof noteContent === 'string'
            ? noteContent
            : JSON.stringify(noteContent, null, 2);

        response.markdown(`\n## Research Note: ${selectedResearchNote}\n\n`);
        response.markdown(`\n\`\`\`markdown\n${inlineContent}\n\`\`\`\n`);
    }

    // Show lineage/history
    const lineageEntries = collectLineageEntries(result.lineage);
    if (lineageEntries.length > 0) {
        response.markdown('\n## Agent History\n\n');
        for (const session of lineageEntries) {
            response.markdown(`- **${session.agent_type}** (${session.started_at})\n`);
            if (session.summary) {
                renderSummaryWithAnchors(response, session.summary);
            }
        }

        const hasArchitectOutput = lineageEntries.some((entry) => {
            if (entry.agent_type !== 'Architect') {
                return false;
            }

            return typeof entry.summary === 'string' && entry.summary.trim().length > 0;
        });

        if (hasArchitectOutput) {
            response.markdown('\n### Architect Suggestions\n\n');
            response.button({
                command: 'projectMemoryDev.launchAgentChat',
                title: 'Research Further',
                arguments: [
                    'Researcher',
                    buildResearchFurtherPrompt(workspaceId, resolvedPlanId),
                    {
                        workspace_id: workspaceId,
                        plan_id: resolvedPlanId,
                    }
                ]
            });
            response.button({
                command: 'projectMemoryDev.addStepToPlan',
                title: 'Add Step',
                arguments: [resolvedPlanId]
            });
        }
    }

    let hasBuildScripts = false;
    try {
        const scriptsResult = await withProgress(response, 'Checking build scripts...', async () =>
            mcpBridge.callTool<{ scripts?: unknown[] } | unknown[]>(
                'memory_plan',
                {
                    action: 'list_build_scripts',
                    workspace_id: workspaceId,
                    plan_id: resolvedPlanId
                }
            )
        );

        const scripts = Array.isArray(scriptsResult)
            ? scriptsResult
            : scriptsResult?.scripts ?? [];

        hasBuildScripts = scripts.length > 0;
    } catch {
        hasBuildScripts = false;
    }

    response.markdown('\n## Actions\n\n');
    renderPlanActionButtons(response, resolvedPlanId, {
        showArchive: true,
        showRunBuild: hasBuildScripts,
        showAddStep: true,
        showOpenDashboard: true
    }, workspaceId);

    const blockedSteps = (result.steps ?? [])
        .map((step, index) => ({
            index: typeof step.index === 'number' ? step.index : index,
            task: step.task,
            status: step.status,
        }))
        .filter((step) => step.status === 'blocked');

    if (blockedSteps.length > 0) {
        response.markdown('\n### Blocked Step Actions\n\n');
        for (const step of blockedSteps) {
            response.button({
                command: 'projectMemoryDev.createDedicatedPlan',
                title: `Create Dedicated Plan (Step ${step.index + 1})`,
                arguments: [resolvedPlanId, step.index]
            });
        }
    }

    if (hasScopeEscalationHandoff(result.lineage)) {
        const fallbackStepIndex = blockedSteps[0]?.index;
        response.button({
            command: 'projectMemoryDev.createDedicatedPlan',
            title: 'Create Dedicated Plan (Scope Escalation)',
            arguments: typeof fallbackStepIndex === 'number'
                ? [resolvedPlanId, fallbackStepIndex]
                : [resolvedPlanId]
        });
    }

    const pendingStepApprovals = (result.steps ?? [])
        .map((step, index) => ({
            index: typeof step.index === 'number' ? step.index : index,
            phase: step.phase,
            requiresApproval: step.requires_confirmation === true || step.requires_user_confirmation === true,
        }))
        .filter((step) => step.requiresApproval)
        .filter((step) => {
            const stepConfirmations = result.confirmation_state?.steps ?? {};
            const direct = stepConfirmations[String(step.index)];
            const displayNumber = stepConfirmations[String(step.index + 1)];
            return !isConfirmationEntryApproved(direct) && !isConfirmationEntryApproved(displayNumber);
        });

    const pendingPhaseApprovals = Array.from(new Set(
        pendingStepApprovals
            .map((step) => step.phase?.trim())
            .filter((phase): phase is string => Boolean(phase && phase.length > 0))
    )).filter((phase) => {
        const phaseConfirmation = result.confirmation_state?.phases?.[phase];
        return !isConfirmationEntryApproved(phaseConfirmation);
    });

    if (pendingStepApprovals.length > 0 || pendingPhaseApprovals.length > 0) {
        response.markdown('\n### Approval Actions\n\n');

        for (const step of pendingStepApprovals) {
            response.button({
                command: 'projectMemoryDev.confirmPlanStep',
                title: `Approve Step ${step.index + 1}`,
                arguments: [resolvedPlanId, step.index]
            });
        }

        for (const phase of pendingPhaseApprovals) {
            response.button({
                command: 'projectMemoryDev.confirmPlanPhase',
                title: `Approve Phase: ${phase}`,
                arguments: [resolvedPlanId, phase]
            });
        }
    }

    if (result.recommended_next_agent) {
        response.button({
            command: 'projectMemoryDev.launchAgentChat',
            title: `Launch ${result.recommended_next_agent}`,
            arguments: [
                result.recommended_next_agent,
                buildAgentLaunchPrompt(result.recommended_next_agent, workspaceId, resolvedPlanId),
                {
                    workspace_id: workspaceId,
                    plan_id: resolvedPlanId,
                }
            ]
        });
    }

    if (isProgramView) {
        try {
            const childPlansResult = await withProgress(response, 'Checking child plans...', async () =>
                mcpBridge.callTool<ProgramPlansResult>('memory_plan', {
                    action: 'list_program_plans',
                    workspace_id: workspaceId,
                    program_id: resolvedPlanId,
                })
            );

            const independentChildren = (childPlansResult.child_plans ?? []).filter((child) =>
                (child.depends_on_plans ?? []).length === 0
            );

            const childActions: Array<{ planId: string; title: string; agent?: string }> = [];
            for (const child of independentChildren) {
                try {
                    const childPlan = await mcpBridge.callTool<PlanState>('memory_plan', {
                        action: 'get',
                        workspace_id: workspaceId,
                        plan_id: child.plan_id,
                    });

                    const childAgent = childPlan.recommended_next_agent;
                    const childPlanId = childPlan.plan_id || childPlan.id || child.plan_id;
                    if (childPlanId) {
                        childActions.push({
                            planId: childPlanId,
                            title: childPlan.title || child.title,
                            agent: childAgent,
                        });
                    }
                } catch {
                    continue;
                }
            }

            if (childActions.length > 0) {
                response.markdown('\n### Child Plan Actions\n\n');
                response.markdown('Use these actions to open or launch independent child plans directly from this program view.\n\n');

                for (const child of childActions) {
                    response.button({
                        command: 'projectMemoryDev.showPlanInChat',
                        title: `Open ${child.title}`,
                        arguments: [child.planId]
                    });

                    if (!child.agent) {
                        continue;
                    }

                    response.button({
                        command: 'projectMemoryDev.launchAgentChat',
                        title: `Launch ${child.agent} (${child.title})`,
                        arguments: [
                            child.agent,
                            buildAgentLaunchPrompt(child.agent, workspaceId, child.planId),
                            {
                                workspace_id: workspaceId,
                                plan_id: child.planId,
                            }
                        ]
                    });
                }
            }
        } catch {
        }
    }

    const stepCounts = getStepCounts(result.steps);
    const recommendedAgent = result.recommended_next_agent;

    return {
        metadata: {
            command: 'plan',
            action: 'show',
            planId: resolvedPlanId,
            programId: result.program_id,
            stepCounts,
            recommendedAgent,
            hasScripts: hasBuildScripts
        }
    };
}
