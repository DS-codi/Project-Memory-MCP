/**
 * Terminal Tool Handlers
 *
 * 1) Canonical MCP interactive terminal contract (`memory_terminal_interactive`)
 *    routed through the MCP bridge.
 * 2) VS Code host terminal management contract (`memory_terminal_vscode`)
 *    for visible terminal create/send/close/list operations.
 */

import * as vscode from 'vscode';
import { randomUUID } from 'crypto';
import { getContainerMode, shouldUseContainer } from '../../server/ContainerDetection';
import type { ToolContext } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type RuntimeAdapterOverride = 'local' | 'bundled' | 'container_bridge' | 'auto';

export interface CanonicalTerminalToolInput {
    action: 'execute' | 'read_output' | 'terminate' | 'list' | 'run' | 'kill' | 'send' | 'close' | 'create';
    invocation?: {
        mode?: 'interactive' | 'headless';
        intent?: 'open_only' | 'execute_command';
    };
    correlation?: {
        request_id?: string;
        trace_id?: string;
        client_request_id?: string;
    };
    runtime?: {
        workspace_id?: string;
        cwd?: string;
        timeout_ms?: number;
        adapter_override?: RuntimeAdapterOverride;
    };
    execution?: {
        command?: string;
        args?: string[];
        env?: Record<string, string>;
    };
    target?: {
        session_id?: string;
        terminal_id?: string;
    };
    compat?: {
        legacy_action?: 'run' | 'kill' | 'send' | 'close' | 'create' | 'list';
        caller_surface?: 'server' | 'extension' | 'dashboard' | 'chat_button';
    };

    command?: string;
    args?: string[];
    cwd?: string;
    timeout?: number;
    timeout_ms?: number;
    workspace_id?: string;
    session_id?: string;
    terminal_id?: string;
    env?: Record<string, string>;
}

export interface VsCodeTerminalToolInput {
    action: 'create' | 'send' | 'close' | 'list';
    terminal_id?: string;
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
    command?: string;
    workspace_id?: string;
}

async function resolveAdapterOverride(ctx: ToolContext): Promise<RuntimeAdapterOverride> {
    const configuredMode = getContainerMode();
    if (configuredMode === 'container') {
        return 'container_bridge';
    }
    if (configuredMode === 'local') {
        return ctx.mcpBridge.getServerMode() === 'bundled' ? 'bundled' : 'local';
    }

    try {
        const detected = await shouldUseContainer();
        if (detected.useContainer) {
            return 'container_bridge';
        }
    } catch {
        // fall through to server-mode mapping
    }

    return ctx.mcpBridge.getServerMode() === 'bundled' ? 'bundled' : 'local';
}

function workspaceCwdFallback(): string | undefined {
    return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

async function buildCanonicalPayload(
    input: CanonicalTerminalToolInput,
    ctx: ToolContext
): Promise<Record<string, unknown>> {
    const ensuredWorkspaceId = input.runtime?.workspace_id || input.workspace_id || await ctx.ensureWorkspace();
    const adapterOverride = input.runtime?.adapter_override ?? await resolveAdapterOverride(ctx);
    const timeoutMs = input.runtime?.timeout_ms ?? input.timeout_ms ?? input.timeout ?? 30000;
    const defaultCommand = input.execution?.command ?? input.command;
    const defaultArgs = input.execution?.args ?? input.args;
    const defaultEnv = input.execution?.env ?? input.env;

    const resolvedMode = input.invocation?.mode
        ?? ((input.action === 'create' || input.action === 'send') ? 'interactive' : 'headless');
    const resolvedIntent = input.invocation?.intent
        ?? ((input.action === 'create') ? 'open_only' : 'execute_command');

    return {
        action: input.action,
        invocation: {
            mode: resolvedMode,
            intent: resolvedIntent,
        },
        correlation: {
            request_id: input.correlation?.request_id ?? `req_${randomUUID()}`,
            trace_id: input.correlation?.trace_id ?? `trace_${randomUUID()}`,
            ...(input.correlation?.client_request_id ? { client_request_id: input.correlation.client_request_id } : {}),
        },
        runtime: {
            workspace_id: ensuredWorkspaceId,
            cwd: input.runtime?.cwd ?? input.cwd ?? workspaceCwdFallback(),
            timeout_ms: timeoutMs,
            adapter_override: adapterOverride,
        },
        ...(defaultCommand || defaultArgs || defaultEnv
            ? {
                execution: {
                    ...(defaultCommand ? { command: defaultCommand } : {}),
                    ...(defaultArgs ? { args: defaultArgs } : {}),
                    ...(defaultEnv ? { env: defaultEnv } : {}),
                }
            }
            : {}),
        ...((input.target?.session_id || input.target?.terminal_id || input.session_id || input.terminal_id)
            ? {
                target: {
                    ...(input.target?.session_id || input.session_id
                        ? { session_id: input.target?.session_id ?? input.session_id }
                        : {}),
                    ...(input.target?.terminal_id || input.terminal_id
                        ? { terminal_id: input.target?.terminal_id ?? input.terminal_id }
                        : {}),
                }
            }
            : {}),
        compat: {
            legacy_action: input.compat?.legacy_action,
            caller_surface: input.compat?.caller_surface ?? 'extension',
        },
    };
}

export async function handleCanonicalInteractiveTerminalTool(
    options: vscode.LanguageModelToolInvocationOptions<CanonicalTerminalToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return errorResult('MCP server not connected');
        }

        const payload = await buildCanonicalPayload(options.input, ctx);
        const result = await ctx.mcpBridge.callTool<unknown>('memory_terminal_interactive', payload);

        return new vscode.LanguageModelToolResult([
            new vscode.LanguageModelTextPart(JSON.stringify(result, null, 2))
        ]);
    } catch (error) {
        return errorResult(error);
    }
}

interface TrackedTerminal {
    terminal: vscode.Terminal;
    name: string;
    cwd?: string;
    createdAt: string;
}

// ---------------------------------------------------------------------------
// Destructive command keywords (mirrored from server-side terminal-auth.ts)
// ---------------------------------------------------------------------------

const DESTRUCTIVE_KEYWORDS = [
    'rm ', 'rm\t', 'rmdir',
    'del ', 'del\t',
    'format ',
    'drop ', 'truncate ',
    'Remove-Item', 'Clear-Content',
    'shutdown', 'reboot',
    'mkfs', 'dd ',
];

function isDestructiveCommand(command: string): { match: boolean; keyword?: string } {
    const lower = command.toLowerCase();
    for (const kw of DESTRUCTIVE_KEYWORDS) {
        if (lower.includes(kw.toLowerCase())) {
            return { match: true, keyword: kw.trim() };
        }
    }
    return { match: false };
}

// ---------------------------------------------------------------------------
// Terminal tracking — module-level state
// ---------------------------------------------------------------------------

const trackedTerminals = new Map<string, TrackedTerminal>();
let nextId = 1;
let disposalListener: vscode.Disposable | undefined;

function generateTerminalId(name: string): string {
    return `term_${nextId++}_${name.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 30)}`;
}

/**
 * Ensure we listen for terminal close events to clean up the tracking map.
 * Called lazily on first tool invocation.
 */
function ensureDisposalListener(): void {
    if (disposalListener) { return; }
    disposalListener = vscode.window.onDidCloseTerminal((closed) => {
        for (const [id, entry] of trackedTerminals.entries()) {
            if (entry.terminal === closed) {
                trackedTerminals.delete(id);
                break;
            }
        }
    });
}

// ---------------------------------------------------------------------------
// Allowlist helpers
// ---------------------------------------------------------------------------

interface AllowlistEntry {
    pattern: string;
}

/**
 * Fetch the workspace allowlist from the MCP server.
 * Returns null if the bridge is not connected (graceful degradation).
 */
async function fetchAllowlist(
    ctx: ToolContext,
    workspaceId: string
): Promise<string[] | null> {
    try {
        if (!ctx.mcpBridge.isConnected()) {
            return null;
        }
        const result = await ctx.mcpBridge.callTool<{ allowlist?: (string | AllowlistEntry)[] }>(
            'memory_terminal',
            { action: 'get_allowlist', workspace_id: workspaceId }
        );
        if (result?.allowlist && Array.isArray(result.allowlist)) {
            return result.allowlist.map((e) =>
                typeof e === 'string' ? e : e.pattern
            );
        }
        return [];
    } catch {
        // Graceful degradation — if we can't reach the server, skip the check
        return null;
    }
}

/**
 * Check whether a command matches any allowlist pattern.
 * Patterns use simple glob-like matching: `*` matches any sequence.
 */
function matchesAllowlist(command: string, patterns: string[]): boolean {
    for (const pattern of patterns) {
        const regex = new RegExp(
            '^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$',
            'i'
        );
        if (regex.test(command)) {
            return true;
        }
    }
    return false;
}

// ---------------------------------------------------------------------------
// Action handlers
// ---------------------------------------------------------------------------

function handleCreate(input: VsCodeTerminalToolInput): vscode.LanguageModelToolResult {
    const termName = input.name || `PM Terminal ${nextId}`;
    const termOptions: vscode.TerminalOptions = { name: termName };

    if (input.cwd) {
        termOptions.cwd = input.cwd;
    }
    if (input.env) {
        termOptions.env = input.env;
    }

    const terminal = vscode.window.createTerminal(termOptions);
    terminal.show();

    const termId = generateTerminalId(termName);
    trackedTerminals.set(termId, {
        terminal,
        name: termName,
        cwd: input.cwd,
        createdAt: new Date().toISOString(),
    });

    return successResult({
        terminal_id: termId,
        name: termName,
        cwd: input.cwd ?? 'default',
        status: 'created',
        note: 'Terminal is now visible in VS Code. Use the "send" action to execute commands.',
    });
}

async function handleSend(
    input: VsCodeTerminalToolInput,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    const { terminal_id, command, workspace_id } = input;

    if (!terminal_id) {
        return errorResult('terminal_id is required for the "send" action');
    }
    if (!command) {
        return errorResult('command is required for the "send" action');
    }

    const entry = trackedTerminals.get(terminal_id);
    if (!entry) {
        return errorResult(
            `Terminal "${terminal_id}" not found. It may have been closed. Use "list" to see open terminals.`
        );
    }

    // --- Safety: destructive keyword check ---
    const destructive = isDestructiveCommand(command);
    if (destructive.match) {
        return errorResult(
            `BLOCKED: Command contains destructive keyword "${destructive.keyword}". ` +
            `This command is blocked for safety. Modify the command to remove destructive operations.`
        );
    }

    // --- Allowlist check ---
    let allowlistWarning: string | undefined;
    if (workspace_id) {
        const allowlist = await fetchAllowlist(ctx, workspace_id);
        if (allowlist === null) {
            allowlistWarning =
                'MCP server not connected — skipping allowlist check. Command sent without verification.';
        } else if (!matchesAllowlist(command, allowlist)) {
            allowlistWarning =
                'Command is not on the workspace allowlist. Proceeding since this is an interactive terminal the user can see.';
        }
        // If on allowlist — no warning needed
    } else {
        allowlistWarning =
            'No workspace_id provided — skipping allowlist check. Provide workspace_id for safety verification.';
    }

    // Send the command to the terminal
    entry.terminal.sendText(command);
    entry.terminal.show();

    const result: Record<string, unknown> = {
        terminal_id,
        command_sent: command,
        status: 'sent',
        note: 'Command sent to the visible terminal. The user can see the output directly.',
    };

    if (allowlistWarning) {
        result.warning = allowlistWarning;
    }

    return successResult(result);
}

function handleClose(input: VsCodeTerminalToolInput): vscode.LanguageModelToolResult {
    const { terminal_id } = input;

    if (!terminal_id) {
        return errorResult('terminal_id is required for the "close" action');
    }

    const entry = trackedTerminals.get(terminal_id);
    if (!entry) {
        return errorResult(
            `Terminal "${terminal_id}" not found. It may have already been closed.`
        );
    }

    entry.terminal.dispose();
    trackedTerminals.delete(terminal_id);

    return successResult({
        terminal_id,
        status: 'closed',
    });
}

function handleList(): vscode.LanguageModelToolResult {
    const terminals: Record<string, unknown>[] = [];

    for (const [id, entry] of trackedTerminals.entries()) {
        terminals.push({
            terminal_id: id,
            name: entry.name,
            cwd: entry.cwd ?? 'default',
            created_at: entry.createdAt,
        });
    }

    return successResult({
        terminals,
        count: terminals.length,
    });
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

export async function handleVsCodeTerminalTool(
    options: vscode.LanguageModelToolInvocationOptions<VsCodeTerminalToolInput>,
    _token: vscode.CancellationToken,
    ctx: ToolContext
): Promise<vscode.LanguageModelToolResult> {
    ensureDisposalListener();

    try {
        const { action } = options.input;

        switch (action) {
            case 'create':
                return handleCreate(options.input);

            case 'send':
                return await handleSend(options.input, ctx);

            case 'close':
                return handleClose(options.input);

            case 'list':
                return handleList();

            default:
                return errorResult(`Unknown action: ${action}`);
        }
    } catch (error) {
        return errorResult(error);
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function successResult(data: Record<string, unknown>): vscode.LanguageModelToolResult {
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: true, ...data }, null, 2))
    ]);
}

function errorResult(error: unknown): vscode.LanguageModelToolResult {
    const message = error instanceof Error ? error.message : String(error);
    return new vscode.LanguageModelToolResult([
        new vscode.LanguageModelTextPart(JSON.stringify({ success: false, error: message }))
    ]);
}

/**
 * Dispose the terminal close listener. Call from extension deactivate if needed.
 */
export function disposeTerminalTracking(): void {
    disposalListener?.dispose();
    disposalListener = undefined;
    for (const entry of trackedTerminals.values()) {
        entry.terminal.dispose();
    }
    trackedTerminals.clear();
}
