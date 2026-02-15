/**
 * Context Command Handlers — Handles /context slash command for the @memory chat participant.
 *
 * Subcommands:
 *   /context                        — Show workspace info, codebase profile, context sections, knowledge summary
 *   /context set {key} {value}      — Set a workspace context section summary
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import { withProgress } from './ChatResponseHelpers';

// ── Types ──────────────────────────────────────────────────────────────

/** Workspace info returned from MCP server */
interface WorkspaceInfo {
    workspace_id: string;
    workspace_path: string;
    codebase_profile?: {
        languages?: string[];
        frameworks?: string[];
        file_count?: number;
    };
}

/** Workspace context response shape */
interface WorkspaceContextResponse {
    sections?: Record<string, {
        summary?: string;
        items?: Array<{ title: string; description?: string; links?: string[] }>;
    }>;
    updated_at?: string;
}

/** Knowledge file metadata */
interface KnowledgeFileMeta {
    slug: string;
    title: string;
    category: string;
    updated_at?: string;
}

// ── Section label mapping ──────────────────────────────────────────────

const SECTION_LABELS: Record<string, string> = {
    project_details: 'Project Details',
    purpose: 'Purpose',
    dependencies: 'Dependencies',
    modules: 'Modules',
    test_confirmations: 'Test Confirmations',
    dev_patterns: 'Dev Patterns',
    resources: 'Resources',
};

function formatSectionLabel(key: string): string {
    if (SECTION_LABELS[key]) { return SECTION_LABELS[key]; }
    return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /context command. Called from ChatParticipant.
 */
export async function handleContextCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'context' } };
    }

    // Check for /context set subcommand
    const prompt = request.prompt.trim();
    if (prompt.toLowerCase().startsWith('set ')) {
        return await handleContextSetSubcommand(prompt.slice(4).trim(), response, mcpBridge, workspaceId);
    }

    response.markdown('🔍 **Gathering workspace context...**\n\n');
    try {
        const result = await withProgress(response, 'Loading workspace info...', async () =>
            mcpBridge.callTool<WorkspaceInfo>(
                'memory_workspace',
                { action: 'info', workspace_id: workspaceId }
            )
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
        response.markdown(`**Workspace ID**: \`${workspaceId}\`\n`);
    }

    // Fetch workspace context sections
    try {
        const contextResult = await withProgress(response, 'Loading workspace context...', async () =>
            mcpBridge.callTool<WorkspaceContextResponse>(
                'memory_context',
                { action: 'workspace_get', workspace_id: workspaceId }
            )
        );

        const sections = contextResult?.sections;
        if (sections && Object.keys(sections).length > 0) {
            response.markdown('\n## Workspace Context\n\n');

            if (contextResult.updated_at) {
                response.markdown(`*Last updated: ${new Date(contextResult.updated_at).toLocaleString()}*\n\n`);
            }

            for (const [key, section] of Object.entries(sections)) {
                const itemCount = section.items?.length ?? 0;
                const hasSummary = !!section.summary?.trim();

                if (!hasSummary && itemCount === 0) { continue; }

                response.markdown(`### ${formatSectionLabel(key)}\n\n`);

                if (hasSummary) {
                    response.markdown(`${section.summary}\n\n`);
                }

                if (itemCount > 0) {
                    response.markdown(`*${itemCount} item${itemCount > 1 ? 's' : ''}*\n\n`);
                }
            }
        } else {
            response.markdown('\n*No workspace context sections configured yet.*\n');
        }
    } catch {
        // Non-fatal: workspace context may not exist yet
    }

    // Fetch knowledge files summary
    try {
        const knowledgeResult = await withProgress(response, 'Listing knowledge files...', async () =>
            mcpBridge.callTool<{ files: KnowledgeFileMeta[] }>(
                'memory_context',
                { action: 'knowledge_list', workspace_id: workspaceId }
            )
        );

        const files = knowledgeResult?.files ?? [];
        if (files.length > 0) {
            response.markdown('\n## Knowledge Files\n\n');
            response.markdown(`**${files.length}** file${files.length > 1 ? 's' : ''} available:\n\n`);

            for (const f of files) {
                response.markdown(`- **${f.title}** (${f.category}) — \`${f.slug}\`\n`);
            }

            response.markdown('\nUse `/knowledge show {slug}` to view details.\n');
        }
    } catch {
        // Non-fatal: knowledge files may not exist yet
    }

    return { metadata: { command: 'context' } };
}

// ── Sub-handler ────────────────────────────────────────────────────────

/** Handle /context set {section_key} {content} */
async function handleContextSetSubcommand(
    args: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string,
): Promise<vscode.ChatResult> {
    // Parse: first word is section key, rest is content
    const spaceIdx = args.indexOf(' ');
    if (spaceIdx === -1 || !args.trim()) {
        response.markdown('⚠️ Usage: `/context set {section_key} {content}`\n\n');
        response.markdown('Example: `/context set project_details This is a TypeScript MCP server…`\n\n');
        response.markdown('**Available section keys**: `project_details`, `purpose`, `dependencies`, `modules`, `test_confirmations`, `dev_patterns`, `resources`, or any custom key.\n');
        return { metadata: { command: 'context', action: 'set' } };
    }

    const sectionKey = args.slice(0, spaceIdx).trim();
    const content = args.slice(spaceIdx + 1).trim();

    if (!content) {
        response.markdown('⚠️ Please provide content after the section key.\n');
        return { metadata: { command: 'context', action: 'set' } };
    }

    try {
        await withProgress(response, `Updating ${formatSectionLabel(sectionKey)}...`, async () =>
            mcpBridge.callTool(
                'memory_context',
                {
                    action: 'workspace_update',
                    workspace_id: workspaceId,
                    type: sectionKey,
                    data: { summary: content },
                }
            )
        );

        response.markdown(`✅ **${formatSectionLabel(sectionKey)}** updated.\n\n`);
        response.markdown(`> ${content.length > 200 ? content.slice(0, 200) + '…' : content}\n`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`⚠️ Failed to update context section: ${msg}\n`);
    }

    return { metadata: { command: 'context', action: 'set', sectionKey } };
}
