/**
 * Knowledge Command Handler - Handles /knowledge slash command for the @memory chat participant.
 *
 * Subcommands:
 *   /knowledge list                — List all knowledge files
 *   /knowledge show {slug}         — Display a specific knowledge file
 *   /knowledge add {slug} {content}— Create a new knowledge file
 *   /knowledge delete {slug}       — Delete a knowledge file
 */

import * as vscode from 'vscode';
import { McpBridge } from './McpBridge';
import { withProgress } from './ChatResponseHelpers';

// ── Types ──────────────────────────────────────────────────────────────

interface KnowledgeFileMeta {
    slug: string;
    title: string;
    category: string;
    tags?: string[];
    created_at?: string;
    updated_at?: string;
    created_by_agent?: string;
    created_by_plan?: string;
}

interface KnowledgeFile extends KnowledgeFileMeta {
    content: string;
}

interface KnowledgeListResult {
    files: KnowledgeFileMeta[];
}

interface KnowledgeGetResult {
    file: KnowledgeFile;
}

interface KnowledgeStoreResult {
    slug: string;
    title: string;
    category: string;
    message?: string;
}

interface KnowledgeDeleteResult {
    slug: string;
    message?: string;
}

// Valid categories (keep in sync with server knowledge.tools.ts)
const VALID_CATEGORIES = ['schema', 'config', 'limitation', 'plan-summary', 'reference', 'convention'] as const;

// Category badge display
const CATEGORY_LABELS: Record<string, string> = {
    'schema': '📐 Schema',
    'config': '⚙️ Config',
    'limitation': '⚠️ Limitation',
    'plan-summary': '📋 Plan Summary',
    'reference': '📖 Reference',
    'convention': '📏 Convention',
};

// ── Handler ────────────────────────────────────────────────────────────

/**
 * Handle the /knowledge command. Called from ChatParticipant.
 */
export async function handleKnowledgeCommand(
    request: vscode.ChatRequest,
    response: vscode.ChatResponseStream,
    _token: vscode.CancellationToken,
    mcpBridge: McpBridge,
    workspaceId: string | null,
): Promise<vscode.ChatResult> {
    if (!workspaceId) {
        response.markdown('⚠️ Workspace not registered.');
        return { metadata: { command: 'knowledge' } };
    }

    const prompt = request.prompt.trim();

    // Parse subcommand
    const parts = prompt.split(/\s+/);
    const subcommand = parts[0]?.toLowerCase() ?? '';

    switch (subcommand) {
        case 'list':
            return await handleList(response, mcpBridge, workspaceId);
        case 'show':
            return await handleShow(parts[1], response, mcpBridge, workspaceId);
        case 'add':
            return await handleAdd(parts, prompt, response, mcpBridge, workspaceId);
        case 'delete':
            return await handleDelete(parts[1], response, mcpBridge, workspaceId);
        default:
            return showUsage(response);
    }
}

// ── Subcommands ────────────────────────────────────────────────────────

/**
 * /knowledge list — list all available knowledge files
 */
async function handleList(
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string,
): Promise<vscode.ChatResult> {
    response.markdown('📚 **Knowledge Files**\n\n');
    try {
        const result = await withProgress(response, 'Listing knowledge files...', async () =>
            mcpBridge.callTool<KnowledgeListResult>(
                'memory_context',
                { action: 'knowledge_list', workspace_id: workspaceId },
            )
        );

        const files = result?.files ?? [];

        if (files.length === 0) {
            response.markdown('*No knowledge files yet.* Use `/knowledge add {slug}` to create one.\n');
            return { metadata: { command: 'knowledge', action: 'list' } };
        }

        response.markdown(`**${files.length}** file${files.length > 1 ? 's' : ''} available:\n\n`);

        for (const f of files) {
            const badge = CATEGORY_LABELS[f.category] ?? f.category;
            const updated = f.updated_at
                ? ` — updated ${new Date(f.updated_at).toLocaleDateString()}`
                : '';
            response.markdown(`- **${f.title}** (${badge}) \`${f.slug}\`${updated}\n`);
        }

        response.markdown('\nUse `/knowledge show {slug}` to view a file.\n');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`⚠️ Failed to list knowledge files: ${msg}\n`);
    }

    return { metadata: { command: 'knowledge', action: 'list' } };
}

/**
 * /knowledge show {slug} — display a specific knowledge file
 */
async function handleShow(
    slug: string | undefined,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string,
): Promise<vscode.ChatResult> {
    if (!slug) {
        response.markdown('⚠️ Please provide a slug: `/knowledge show {slug}`\n');
        return { metadata: { command: 'knowledge', action: 'show' } };
    }

    try {
        const result = await withProgress(response, `Loading knowledge file "${slug}"...`, async () =>
            mcpBridge.callTool<KnowledgeGetResult>(
                'memory_context',
                { action: 'knowledge_get', workspace_id: workspaceId, slug },
            )
        );

        const file = result?.file;
        if (!file) {
            response.markdown(`⚠️ Knowledge file \`${slug}\` not found.\n`);
            return { metadata: { command: 'knowledge', action: 'show' } };
        }

        const badge = CATEGORY_LABELS[file.category] ?? file.category;
        response.markdown(`# ${file.title}\n\n`);
        response.markdown(`**Category**: ${badge}  \n`);
        if (file.tags && file.tags.length > 0) {
            response.markdown(`**Tags**: ${file.tags.join(', ')}  \n`);
        }
        if (file.updated_at) {
            response.markdown(`**Updated**: ${new Date(file.updated_at).toLocaleString()}  \n`);
        }
        if (file.created_by_agent) {
            response.markdown(`**Created by**: ${file.created_by_agent}  \n`);
        }
        response.markdown('\n---\n\n');
        response.markdown(file.content + '\n');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`⚠️ Failed to load knowledge file: ${msg}\n`);
    }

    return { metadata: { command: 'knowledge', action: 'show', slug } };
}

/**
 * /knowledge add {slug} {content}
 *
 * Minimal form: `/knowledge add my-slug Some content here…`
 * The slug is the first arg, everything after is content.
 * Title defaults to the slug (user can edit via dashboard).
 */
async function handleAdd(
    parts: string[],
    fullPrompt: string,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string,
): Promise<vscode.ChatResult> {
    const slug = parts[1];
    if (!slug) {
        response.markdown('⚠️ Usage: `/knowledge add {slug} {content}`\n\n');
        response.markdown('Example: `/knowledge add api-notes # API Notes\\nThe API uses REST…`\n');
        return { metadata: { command: 'knowledge', action: 'add' } };
    }

    // Content is everything after "add {slug} "
    const afterSlug = fullPrompt.indexOf(slug) + slug.length;
    const content = fullPrompt.slice(afterSlug).trim();

    if (!content) {
        response.markdown('⚠️ Please provide content after the slug.\n\n');
        response.markdown('Example: `/knowledge add api-notes # API Notes\\nThe API uses REST…`\n');
        return { metadata: { command: 'knowledge', action: 'add' } };
    }

    // Derive a title from the slug
    const title = slug
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());

    try {
        const result = await withProgress(response, `Creating knowledge file "${slug}"...`, async () =>
            mcpBridge.callTool<KnowledgeStoreResult>(
                'memory_context',
                {
                    action: 'knowledge_store',
                    workspace_id: workspaceId,
                    slug,
                    title,
                    content,
                    category: 'reference', // default category
                },
            )
        );

        response.markdown(`✅ Knowledge file created: **${result.title ?? title}** (\`${result.slug ?? slug}\`)\n\n`);
        response.markdown(`Category: ${CATEGORY_LABELS[result.category ?? 'reference'] ?? result.category}\n\n`);
        response.markdown('Use `/knowledge show ' + (result.slug ?? slug) + '` to view it, or edit via the dashboard.\n');
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`⚠️ Failed to create knowledge file: ${msg}\n`);
    }

    return { metadata: { command: 'knowledge', action: 'add', slug } };
}

/**
 * /knowledge delete {slug} — delete a knowledge file
 */
async function handleDelete(
    slug: string | undefined,
    response: vscode.ChatResponseStream,
    mcpBridge: McpBridge,
    workspaceId: string,
): Promise<vscode.ChatResult> {
    if (!slug) {
        response.markdown('⚠️ Please provide a slug: `/knowledge delete {slug}`\n');
        return { metadata: { command: 'knowledge', action: 'delete' } };
    }

    try {
        await withProgress(response, `Deleting knowledge file "${slug}"...`, async () =>
            mcpBridge.callTool<KnowledgeDeleteResult>(
                'memory_context',
                { action: 'knowledge_delete', workspace_id: workspaceId, slug },
            )
        );

        response.markdown(`🗑️ Knowledge file \`${slug}\` deleted.\n`);
    } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        response.markdown(`⚠️ Failed to delete knowledge file: ${msg}\n`);
    }

    return { metadata: { command: 'knowledge', action: 'delete', slug } };
}

// ── Usage ──────────────────────────────────────────────────────────────

function showUsage(response: vscode.ChatResponseStream): vscode.ChatResult {
    response.markdown('📚 **Knowledge Commands**\n\n');
    response.markdown('- `/knowledge list` — List all knowledge files\n');
    response.markdown('- `/knowledge show {slug}` — View a knowledge file\n');
    response.markdown('- `/knowledge add {slug} {content}` — Create a new knowledge file\n');
    response.markdown('- `/knowledge delete {slug}` — Delete a knowledge file\n');
    response.markdown('\nKnowledge files store persistent reference material for your workspace — ');
    response.markdown('schemas, conventions, limitations, config notes, and plan summaries.\n');
    return { metadata: { command: 'knowledge', action: 'help' } };
}
