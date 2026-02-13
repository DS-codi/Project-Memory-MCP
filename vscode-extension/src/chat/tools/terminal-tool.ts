/**
 * Interactive Terminal Tool Handler — memory_terminal_interactive language model tool
 *
 * Creates and manages real VS Code integrated terminals that the user can see
 * and interact with. Unlike the server-side `memory_terminal` (headless, allowlist-only),
 * this tool creates VISIBLE terminals on the host machine.
 *
 * Actions: create, send, close, list
 *
 * Safety: Destructive commands are always blocked. Non-allowlisted commands are
 * allowed with a warning (since the user can see the terminal).
 */

import * as vscode from 'vscode';
import type { ToolContext } from './types';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TerminalToolInput {
    action: 'create' | 'send' | 'close' | 'list';
    terminal_id?: string;
    name?: string;
    cwd?: string;
    env?: Record<string, string>;
    command?: string;
    workspace_id?: string;
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

function handleCreate(input: TerminalToolInput): vscode.LanguageModelToolResult {
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
    input: TerminalToolInput,
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

function handleClose(input: TerminalToolInput): vscode.LanguageModelToolResult {
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

export async function handleInteractiveTerminalTool(
    options: vscode.LanguageModelToolInvocationOptions<TerminalToolInput>,
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
