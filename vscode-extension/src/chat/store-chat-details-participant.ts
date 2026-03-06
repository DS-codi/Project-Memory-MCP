import * as vscode from 'vscode';

export const STORE_CHAT_PARTICIPANT_ID = 'project-memory.memory';
export const STORE_CHAT_COMMAND = 'store-chat-details';
export const CHAT_SECTION_KEY = 'chat_session_details';
export const IMPORTANT_SECTION_KEY = 'important_context';

interface WorkspaceContextSectionItem {
    title: string;
    description?: string;
    links?: string[];
}

interface WorkspaceContextSection {
    summary?: string;
    items?: WorkspaceContextSectionItem[];
}

interface WorkspaceContextResponse {
    context?: {
        sections?: Record<string, WorkspaceContextSection>;
        name?: string;
    };
}

const WORKSPACE_TOOL_CANDIDATES = ['memory_workspace', 'mcp_project-memor_memory_workspace'];
const CONTEXT_TOOL_CANDIDATES = ['memory_context', 'mcp_project-memor_memory_context'];

type JsonRecord = Record<string, unknown>;

export interface TranscriptEntry {
    role: 'user' | 'assistant';
    content: string;
}

interface SessionDigest {
    generatedAt: string;
    totalTurns: number;
    userTurnCount: number;
    assistantTurnCount: number;
    synopsis: string;
    userIntents: string[];
    assistantHighlights: string[];
    decisionsAndConstraints: string[];
    actionItems: string[];
    fileReferences: string[];
    commandSnippets: string[];
    errorSignals: string[];
    timeline: string[];
}

function toIsoTimestamp(value: Date = new Date()): string {
    return value.toISOString();
}

function truncate(value: string, maxLength: number): string {
    if (value.length <= maxLength) {
        return value;
    }

    return `${value.slice(0, maxLength - 3).trimEnd()}...`;
}

function normalizeMarkdownToText(markdown: string): string {
    if (!markdown.trim()) {
        return '';
    }

    return markdown
        .replace(/```[\s\S]*?```/g, (block) => block.replace(/```/g, ''))
        .replace(/`([^`]+)`/g, '$1')
        .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
        .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
        .replace(/[>#*_~]+/g, ' ')
        .replace(/\r/g, '')
        .replace(/\n{2,}/g, '\n')
        .replace(/[ \t]{2,}/g, ' ')
        .trim();
}

function splitNonEmptyLines(value: string): string[] {
    return value
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
}

function dedupeKeepOrder(values: string[], maxItems: number): string[] {
    const seen = new Set<string>();
    const results: string[] = [];

    for (const value of values) {
        const key = value.toLowerCase();
        if (seen.has(key)) {
            continue;
        }

        seen.add(key);
        results.push(value);

        if (results.length >= maxItems) {
            break;
        }
    }

    return results;
}

function firstSentence(value: string): string {
    const sentence = value
        .split(/(?<=[.!?])\s+/)
        .map((part) => part.trim())
        .find((part) => part.length > 0);

    return sentence ? truncate(sentence, 220) : truncate(value.trim(), 220);
}

function listToBulletText(values: string[]): string {
    if (values.length === 0) {
        return '- None detected';
    }

    return values.map((value) => `- ${value}`).join('\n');
}

function countFileTreeNodes(nodes: readonly vscode.ChatResponseFileTree[]): number {
    let count = 0;

    for (const node of nodes) {
        count += 1;
        if (Array.isArray(node.children) && node.children.length > 0) {
            count += countFileTreeNodes(node.children);
        }
    }

    return count;
}

function responsePartToText(
    part: vscode.ChatResponseMarkdownPart
        | vscode.ChatResponseFileTreePart
        | vscode.ChatResponseAnchorPart
        | vscode.ChatResponseCommandButtonPart
): string {
    if (part instanceof vscode.ChatResponseMarkdownPart) {
        return normalizeMarkdownToText(part.value.value);
    }

    if (part instanceof vscode.ChatResponseFileTreePart) {
        const nodes = countFileTreeNodes(part.value);
        return `Shared file tree with ${nodes} entries under ${part.baseUri.fsPath}`;
    }

    if (part instanceof vscode.ChatResponseAnchorPart) {
        const target = part.value instanceof vscode.Uri
            ? part.value.fsPath || part.value.toString(true)
            : part.value.uri.fsPath;
        return part.title ? `Referenced: ${part.title} (${target})` : `Referenced: ${target}`;
    }

    if (part instanceof vscode.ChatResponseCommandButtonPart) {
        const args = Array.isArray(part.value.arguments)
            ? ` ${JSON.stringify(part.value.arguments)}`
            : '';
        return `Suggested command: ${part.value.command}${args}`;
    }

    return '';
}

function isRequestTurn(turn: vscode.ChatRequestTurn | vscode.ChatResponseTurn): turn is vscode.ChatRequestTurn {
    return typeof (turn as vscode.ChatRequestTurn).prompt === 'string';
}

export function buildTranscriptEntries(
    history: readonly (vscode.ChatRequestTurn | vscode.ChatResponseTurn)[],
    currentPrompt: string
): TranscriptEntry[] {
    const entries: TranscriptEntry[] = [];

    for (const turn of history) {
        if (isRequestTurn(turn)) {
            const prompt = normalizeMarkdownToText(turn.prompt);
            if (prompt.length > 0) {
                entries.push({ role: 'user', content: truncate(prompt, 1600) });
            }
            continue;
        }

        const responseText = turn.response
            .map((part) => responsePartToText(part))
            .map((value) => value.trim())
            .filter((value) => value.length > 0)
            .join('\n');

        if (responseText.length > 0) {
            entries.push({ role: 'assistant', content: truncate(responseText, 2400) });
        }
    }

    const trimmedPrompt = normalizeMarkdownToText(currentPrompt);
    if (trimmedPrompt.length > 0) {
        entries.push({ role: 'user', content: truncate(trimmedPrompt, 1600) });
    }

    return entries;
}

function extractFileReferences(text: string): string[] {
    const fileRegex = /\b(?:[A-Za-z]:\\|\.{1,2}[\\/])?[A-Za-z0-9._\-/\\]+\.(?:ts|tsx|js|jsx|json|md|yaml|yml|ps1|rs|py|toml|css|html|sql)\b/g;
    const matches = text.match(fileRegex) ?? [];

    return dedupeKeepOrder(
        matches
            .map((match) => match.replace(/\\/g, '/'))
            .map((match) => truncate(match, 200)),
        16
    );
}

function extractCommandSnippets(text: string): string[] {
    const commandLike = new Set<string>();
    const inlineCodeRegex = /`([^`\n]+)`/g;
    let inlineMatch: RegExpExecArray | null;

    while ((inlineMatch = inlineCodeRegex.exec(text)) !== null) {
        const candidate = inlineMatch[1].trim();
        if (/^(?:\.?[\\/])?(?:install\.ps1|run-tests\.ps1|npm|npx|pnpm|yarn|git|cargo|python|node|pwsh|powershell)\b/i.test(candidate)) {
            commandLike.add(truncate(candidate, 200));
        }
    }

    const lineCommandRegex = /(?:^|\s)(?:\.?[\\/])?(?:install\.ps1|run-tests\.ps1|npm|npx|pnpm|yarn|git|cargo|python|node|pwsh|powershell)\s+[^\r\n]+/gim;
    const lineMatches = text.match(lineCommandRegex) ?? [];

    for (const match of lineMatches) {
        commandLike.add(truncate(match.trim(), 200));
    }

    return dedupeKeepOrder(Array.from(commandLike), 16);
}

function extractSignalLines(text: string, signalRegex: RegExp, limit: number): string[] {
    const lines = splitNonEmptyLines(text);
    const matches = lines
        .filter((line) => signalRegex.test(line))
        .map((line) => truncate(line, 220));

    return dedupeKeepOrder(matches, limit);
}

export function buildSessionDigest(entries: readonly TranscriptEntry[], generatedAt: string = toIsoTimestamp()): SessionDigest {
    const userEntries = entries.filter((entry) => entry.role === 'user').map((entry) => entry.content);
    const assistantEntries = entries.filter((entry) => entry.role === 'assistant').map((entry) => entry.content);

    const userIntents = dedupeKeepOrder(userEntries.map((content) => firstSentence(content)), 10);
    const assistantHighlights = dedupeKeepOrder(assistantEntries.map((content) => firstSentence(content)), 10);

    const combinedText = entries.map((entry) => entry.content).join('\n');

    const decisionsAndConstraints = extractSignalLines(
        combinedText,
        /(decide|decision|agreed|chosen|must|should not|do not|only|constraint|avoid|required)/i,
        12
    );

    const actionItems = extractSignalLines(
        userEntries.join('\n'),
        /(need|needs|want|wanna|please|todo|next|add|fix|implement|create|update|reintroduce)/i,
        12
    );

    const errorSignals = extractSignalLines(
        combinedText,
        /(error|failed|failure|exception|timeout|not found|blocked|exit code)/i,
        12
    );

    const fileReferences = extractFileReferences(combinedText);
    const commandSnippets = extractCommandSnippets(combinedText);

    const synopsisParts: string[] = [];
    if (userIntents.length > 0) {
        synopsisParts.push(`User intent: ${userIntents[0]}`);
    }
    if (assistantHighlights.length > 0) {
        synopsisParts.push(`Assistant outcome: ${assistantHighlights[0]}`);
    }
    if (decisionsAndConstraints.length > 0) {
        synopsisParts.push(`Key constraint: ${decisionsAndConstraints[0]}`);
    }

    const synopsis = synopsisParts.length > 0
        ? synopsisParts.join(' | ')
        : 'Session recorded without enough textual turns to infer a detailed synopsis.';

    const timeline = entries
        .slice(-16)
        .map((entry, index) => {
            const roleLabel = entry.role === 'user' ? 'USER' : 'ASSISTANT';
            return `${index + 1}. [${roleLabel}] ${truncate(entry.content.replace(/\s+/g, ' ').trim(), 260)}`;
        });

    return {
        generatedAt,
        totalTurns: entries.length,
        userTurnCount: userEntries.length,
        assistantTurnCount: assistantEntries.length,
        synopsis,
        userIntents,
        assistantHighlights,
        decisionsAndConstraints,
        actionItems,
        fileReferences,
        commandSnippets,
        errorSignals,
        timeline,
    };
}

function normalizeSectionItem(item: unknown): WorkspaceContextSectionItem | null {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
        return null;
    }

    const candidate = item as Record<string, unknown>;
    if (typeof candidate.title !== 'string' || candidate.title.trim().length === 0) {
        return null;
    }

    return {
        title: candidate.title.trim(),
        ...(typeof candidate.description === 'string' ? { description: candidate.description } : {}),
        ...(Array.isArray(candidate.links)
            ? {
                links: candidate.links
                    .filter((value): value is string => typeof value === 'string' && value.trim().length > 0)
                    .slice(0, 8),
            }
            : {}),
    };
}

function normalizeSections(
    sections: Record<string, WorkspaceContextSection> | undefined
): Record<string, WorkspaceContextSection> {
    if (!sections || typeof sections !== 'object') {
        return {};
    }

    const normalized: Record<string, WorkspaceContextSection> = {};

    for (const [key, value] of Object.entries(sections)) {
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            continue;
        }

        const items = Array.isArray(value.items)
            ? value.items
                .map((item) => normalizeSectionItem(item))
                .filter((item): item is WorkspaceContextSectionItem => item !== null)
            : undefined;

        normalized[key] = {
            ...(typeof value.summary === 'string' ? { summary: value.summary } : {}),
            ...(items && items.length > 0 ? { items } : {}),
        };
    }

    return normalized;
}

function buildDetailedChatSection(digest: SessionDigest): WorkspaceContextSection {
    const items: WorkspaceContextSectionItem[] = [
        {
            title: 'Session synopsis',
            description: digest.synopsis,
        },
        {
            title: 'Session metrics',
            description: [
                `Generated at: ${digest.generatedAt}`,
                `Total turns analyzed: ${digest.totalTurns}`,
                `User turns: ${digest.userTurnCount}`,
                `Assistant turns: ${digest.assistantTurnCount}`,
            ].join('\n'),
        },
        {
            title: 'User intents',
            description: listToBulletText(digest.userIntents),
        },
        {
            title: 'Assistant highlights',
            description: listToBulletText(digest.assistantHighlights),
        },
        {
            title: 'Decisions and constraints',
            description: listToBulletText(digest.decisionsAndConstraints),
        },
        {
            title: 'Action items',
            description: listToBulletText(digest.actionItems),
        },
        {
            title: 'Referenced files',
            description: listToBulletText(digest.fileReferences),
        },
        {
            title: 'Command snippets',
            description: listToBulletText(digest.commandSnippets),
        },
        {
            title: 'Errors and blockers',
            description: listToBulletText(digest.errorSignals),
        },
        {
            title: 'Timeline digest',
            description: listToBulletText(digest.timeline),
        },
    ];

    return {
        summary: truncate(
            `Detailed chat session summary stored at ${digest.generatedAt}. ` +
            `Turns analyzed: ${digest.totalTurns}. ` +
            `Primary synopsis: ${digest.synopsis}`,
            900
        ),
        items,
    };
}

function buildImportantContextSection(
    existing: WorkspaceContextSection | undefined,
    digest: SessionDigest
): WorkspaceContextSection {
    const existingItems = Array.isArray(existing?.items)
        ? existing.items
            .map((item) => normalizeSectionItem(item))
            .filter((item): item is WorkspaceContextSectionItem => item !== null)
        : [];

    const highlightSegments = [
        digest.userIntents[0],
        digest.decisionsAndConstraints[0],
        digest.actionItems[0],
    ].filter((value): value is string => typeof value === 'string' && value.length > 0);

    const newItem: WorkspaceContextSectionItem = {
        title: `Chat synthesis ${digest.generatedAt}`,
        description: highlightSegments.length > 0
            ? truncate(highlightSegments.join(' | '), 500)
            : truncate(digest.synopsis, 500),
    };

    return {
        summary: truncate(
            `High-value context extracted from chat sessions. Last update: ${digest.generatedAt}.`,
            400
        ),
        items: [newItem, ...existingItems].slice(0, 24),
    };
}

export function buildUpdatedSections(
    existingSections: Record<string, WorkspaceContextSection> | undefined,
    digest: SessionDigest
): Record<string, WorkspaceContextSection> {
    const normalized = normalizeSections(existingSections);

    return {
        ...normalized,
        [CHAT_SECTION_KEY]: buildDetailedChatSection(digest),
        [IMPORTANT_SECTION_KEY]: buildImportantContextSection(normalized[IMPORTANT_SECTION_KEY], digest),
    };
}

function throwIfCancelled(token: vscode.CancellationToken): void {
    if (token.isCancellationRequested) {
        throw new Error('Chat details storage was cancelled.');
    }
}

function getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function asRecord(value: unknown): JsonRecord | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return null;
    }

    return value as JsonRecord;
}

function tryParseJson(value: string): unknown | undefined {
    const trimmed = value.trim();
    if (!trimmed) {
        return undefined;
    }

    try {
        return JSON.parse(trimmed);
    } catch {
        return undefined;
    }
}

function decodeDataPart(part: vscode.LanguageModelDataPart): unknown {
    const decoded = new TextDecoder().decode(part.data);
    const mime = part.mimeType.toLowerCase();

    if (mime.includes('json')) {
        return tryParseJson(decoded) ?? decoded;
    }

    return decoded;
}

function extractToolPayload(result: vscode.LanguageModelToolResult): JsonRecord | null {
    const objectCandidates: JsonRecord[] = [];
    const textCandidates: string[] = [];

    for (const part of result.content) {
        if (part instanceof vscode.LanguageModelDataPart) {
            const decoded = decodeDataPart(part);
            const record = asRecord(decoded);
            if (record) {
                objectCandidates.push(record);
            } else if (typeof decoded === 'string') {
                textCandidates.push(decoded);
            }
            continue;
        }

        if (part instanceof vscode.LanguageModelTextPart) {
            textCandidates.push(part.value);
            continue;
        }

        const recordPart = asRecord(part);
        if (recordPart) {
            objectCandidates.push(recordPart);

            const maybeValue = recordPart.value;
            if (typeof maybeValue === 'string') {
                textCandidates.push(maybeValue);
            }
        }
    }

    if (objectCandidates.length > 0) {
        return objectCandidates[0];
    }

    for (const text of textCandidates) {
        const parsed = tryParseJson(text);
        const record = asRecord(parsed);
        if (record) {
            return record;
        }
    }

    const combined = textCandidates.join('\n').trim();
    const combinedParsed = tryParseJson(combined);
    return asRecord(combinedParsed);
}

function unwrapDataChain(payload: JsonRecord): JsonRecord[] {
    const chain: JsonRecord[] = [payload];
    let current: JsonRecord | null = payload;

    for (let depth = 0; depth < 4; depth += 1) {
        const nextRecord: JsonRecord | null = current ? asRecord(current['data']) : null;
        if (!nextRecord) {
            break;
        }

        chain.push(nextRecord);
        current = nextRecord;
    }

    return chain;
}

function findWorkspaceIdInPayload(payload: JsonRecord): string | null {
    const queue: unknown[] = [payload];
    const visited = new Set<unknown>();

    while (queue.length > 0) {
        const current = queue.shift();
        if (!current || typeof current !== 'object' || visited.has(current)) {
            continue;
        }

        visited.add(current);
        const record = current as JsonRecord;

        const explicitId = record.workspace_id;
        if (typeof explicitId === 'string' && explicitId.trim().length > 0) {
            return explicitId;
        }

        const nestedWorkspace = asRecord(record.workspace);
        if (nestedWorkspace) {
            queue.push(nestedWorkspace);
        }

        if (
            typeof record.id === 'string' &&
            (typeof record.workspace_path === 'string' || typeof record.path === 'string')
        ) {
            return record.id;
        }

        for (const value of Object.values(record)) {
            if (value && typeof value === 'object') {
                queue.push(value);
            }
        }
    }

    return null;
}

function extractWorkspaceContext(payload: JsonRecord): WorkspaceContextResponse['context'] | undefined {
    const chain = unwrapDataChain(payload);

    for (const record of chain) {
        const directContext = asRecord(record.context);
        if (directContext) {
            return {
                sections: normalizeSections(asRecord(directContext.sections) as Record<string, WorkspaceContextSection> | undefined),
                ...(typeof directContext.name === 'string' ? { name: directContext.name } : {}),
            };
        }

        if (record.sections && typeof record.sections === 'object' && !Array.isArray(record.sections)) {
            return {
                sections: normalizeSections(record.sections as Record<string, WorkspaceContextSection>),
                ...(typeof record.name === 'string' ? { name: record.name } : {}),
            };
        }
    }

    return undefined;
}

function isMissingWorkspaceContextError(message: string): boolean {
    return /workspace context not found|context not found|not found for/i.test(message);
}

export function resolveToolNameFromList(
    toolNames: readonly string[],
    candidates: readonly string[]
): string | null {
    const lowerNames = toolNames.map((name) => name.toLowerCase());
    const lowerCandidates = candidates.map((name) => name.toLowerCase());

    for (const candidate of lowerCandidates) {
        const exactIndex = lowerNames.findIndex((name) => name === candidate);
        if (exactIndex >= 0) {
            return toolNames[exactIndex];
        }
    }

    for (const candidate of lowerCandidates) {
        const suffixIndex = lowerNames.findIndex((name) => name.endsWith(candidate));
        if (suffixIndex >= 0) {
            return toolNames[suffixIndex];
        }
    }

    return null;
}

async function invokeMemoryTool(
    toolName: string,
    input: JsonRecord,
    token: vscode.CancellationToken
): Promise<JsonRecord> {
    const result = await vscode.lm.invokeTool(
        toolName,
        {
            toolInvocationToken: undefined,
            input,
        },
        token,
    );

    const payload = extractToolPayload(result);
    if (!payload) {
        throw new Error(`Tool ${toolName} returned an unparsable payload.`);
    }

    if (payload.success === false) {
        throw new Error(`${toolName}: ${String(payload.error ?? 'Unknown error')}`);
    }

    if (payload.success !== true && typeof payload.error === 'string') {
        throw new Error(`${toolName}: ${payload.error}`);
    }

    return payload;
}

function resolveProjectMemoryTools(): { workspaceToolName: string; contextToolName: string } {
    const toolNames = vscode.lm.tools.map((tool) => tool.name);
    const workspaceToolName = resolveToolNameFromList(toolNames, WORKSPACE_TOOL_CANDIDATES);
    const contextToolName = resolveToolNameFromList(toolNames, CONTEXT_TOOL_CANDIDATES);

    if (!workspaceToolName || !contextToolName) {
        const availablePreview = toolNames.slice(0, 20).join(', ');
        throw new Error(
            `Required Project Memory tools are not available in this chat session. ` +
            `Needed: memory_workspace + memory_context. Available: ${availablePreview || 'none'}`
        );
    }

    return { workspaceToolName, contextToolName };
}

function renderResultMarkdown(workspaceId: string, digest: SessionDigest, verifiedDbReadback: boolean): string {
    const topInsights = dedupeKeepOrder(
        [
            ...digest.userIntents.slice(0, 2),
            ...digest.decisionsAndConstraints.slice(0, 2),
            ...digest.actionItems.slice(0, 2),
        ].map((value) => truncate(value, 180)),
        6
    );

    const lines = [
        'Stored detailed chat session summary to Project Memory workspace context.',
        '',
        `- Workspace ID: \`${workspaceId}\``,
        `- DB-backed context confirmed: ${verifiedDbReadback ? 'yes' : 'no'}`,
        `- Turns analyzed: ${digest.totalTurns} (${digest.userTurnCount} user, ${digest.assistantTurnCount} assistant)`,
        `- Updated sections: \`${CHAT_SECTION_KEY}\`, \`${IMPORTANT_SECTION_KEY}\``,
        '',
        'Top extracted insights:',
        topInsights.length > 0 ? listToBulletText(topInsights) : '- No strong signals extracted from this session.',
    ];

    return lines.join('\n');
}

class StoreChatDetailsParticipant implements vscode.Disposable {
    private readonly participant: vscode.ChatParticipant;

    constructor() {
        this.participant = vscode.chat.createChatParticipant(
            STORE_CHAT_PARTICIPANT_ID,
            this.handleRequest.bind(this)
        );
        this.participant.iconPath = new vscode.ThemeIcon('book');
    }

    dispose(): void {
        this.participant.dispose();
    }

    private async handleRequest(
        request: vscode.ChatRequest,
        context: vscode.ChatContext,
        response: vscode.ChatResponseStream,
        token: vscode.CancellationToken
    ): Promise<vscode.ChatResult> {
        if (request.command !== STORE_CHAT_COMMAND) {
            response.markdown('Use `/store-chat-details` to summarize this chat session and persist the result to workspace context.');
            return { metadata: { command: request.command ?? 'unknown' } };
        }

        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            response.markdown('Cannot store chat details because no workspace folder is open.');
            return {
                errorDetails: {
                    message: 'Open a workspace folder before running /store-chat-details.',
                },
                metadata: { command: STORE_CHAT_COMMAND },
            };
        }

        try {
            throwIfCancelled(token);
            response.progress('Resolving Project Memory tool surface...');

            const { workspaceToolName, contextToolName } = resolveProjectMemoryTools();

            throwIfCancelled(token);
            response.progress('Registering workspace via memory_workspace...');

            const registerPayload = await invokeMemoryTool(
                workspaceToolName,
                {
                    action: 'register',
                    workspace_path: workspaceFolder.uri.fsPath,
                },
                token,
            );

            const workspaceId = findWorkspaceIdInPayload(registerPayload);
            if (!workspaceId) {
                throw new Error(`Could not resolve workspace_id from ${workspaceToolName} response.`);
            }

            throwIfCancelled(token);
            response.progress('Analyzing chat session history...');

            const transcript = buildTranscriptEntries(context.history, request.prompt);
            const digest = buildSessionDigest(transcript, toIsoTimestamp());

            throwIfCancelled(token);
            response.progress('Loading existing workspace context via memory_context...');

            let existingContext: WorkspaceContextResponse['context'] | undefined;
            let contextExists = false;

            try {
                const getPayload = await invokeMemoryTool(
                    contextToolName,
                    {
                        action: 'workspace_get',
                        workspace_id: workspaceId,
                    },
                    token,
                );
                existingContext = extractWorkspaceContext(getPayload);
                contextExists = Boolean(existingContext?.sections);
            } catch (error) {
                const message = getErrorMessage(error);
                if (!isMissingWorkspaceContextError(message)) {
                    throw error;
                }
            }

            const mergedSections = buildUpdatedSections(existingContext?.sections, digest);

            throwIfCancelled(token);
            response.progress('Saving detailed summary via memory_context...');

            const savePayload: JsonRecord = {
                action: contextExists ? 'workspace_update' : 'workspace_set',
                workspace_id: workspaceId,
                data: {
                    name: existingContext?.name || workspaceFolder.name,
                    sections: mergedSections,
                },
            };

            try {
                await invokeMemoryTool(contextToolName, savePayload, token);
            } catch (error) {
                // If context was deleted between get and update, retry as set.
                if (!contextExists || !isMissingWorkspaceContextError(getErrorMessage(error))) {
                    throw error;
                }

                await invokeMemoryTool(
                    contextToolName,
                    {
                        action: 'workspace_set',
                        workspace_id: workspaceId,
                        data: {
                            name: existingContext?.name || workspaceFolder.name,
                            sections: mergedSections,
                        },
                    },
                    token,
                );
            }

            throwIfCancelled(token);
            response.progress('Verifying persisted workspace context...');

            const verificationPayload = await invokeMemoryTool(
                contextToolName,
                {
                    action: 'workspace_get',
                    workspace_id: workspaceId,
                },
                token,
            );

            const verificationContext = extractWorkspaceContext(verificationPayload);
            const persistedSection = verificationContext?.sections?.[CHAT_SECTION_KEY];
            const verifiedDbReadback = Boolean(persistedSection);

            if (!persistedSection) {
                throw new Error('Workspace context save did not include chat_session_details on readback.');
            }

            response.markdown(renderResultMarkdown(workspaceId, digest, verifiedDbReadback));

            return {
                metadata: {
                    command: STORE_CHAT_COMMAND,
                    workspaceId,
                    turnsAnalyzed: digest.totalTurns,
                    storedSections: [CHAT_SECTION_KEY, IMPORTANT_SECTION_KEY],
                    verifiedDbReadback,
                },
            };
        } catch (error) {
            const message = getErrorMessage(error);
            response.markdown(`Failed to store chat details: ${message}`);

            return {
                errorDetails: {
                    message,
                },
                metadata: {
                    command: STORE_CHAT_COMMAND,
                    failed: true,
                },
            };
        }
    }
}

export function registerStoreChatDetailsParticipant(
    context: vscode.ExtensionContext
): void {
    context.subscriptions.push(new StoreChatDetailsParticipant());
}
