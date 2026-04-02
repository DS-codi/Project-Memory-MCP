/**
 * Library view commands — Open in Dashboard, Open in Editor, Save, Copy Reference.
 */

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { LibraryTreeProvider, LibraryItem, LibraryKind, getTempFilePath } from '../providers/LibraryTreeProvider';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { resolveDashboardPort } from '../utils/dashboard-port';
import * as http from 'http';

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function apiPathFor(kind: LibraryKind, name: string): string {
    return `/api/${kind}/db/${encodeURIComponent(name)}`;
}

function putBodyFor(kind: LibraryKind, content: string): Record<string, unknown> {
    switch (kind) {
        case 'agents':       return { content };
        case 'skills':       return { content };
        case 'instructions': return { content };
    }
}

/** Fetch single record content from dashboard API. */
function fetchContent(port: number, kind: LibraryKind, name: string): Promise<string> {
    return new Promise((resolve, reject) => {
        const apiPath = apiPathFor(kind, name);
        const options: http.RequestOptions = {
            hostname: 'localhost',
            port,
            path: apiPath,
            method: 'GET',
            headers: { Accept: 'application/json' },
        };
        const req = http.request(options, res => {
            let body = '';
            res.on('data', (chunk: Buffer) => (body += chunk.toString()));
            res.on('end', () => {
                if (res.statusCode && res.statusCode >= 400) {
                    reject(new Error(`HTTP ${res.statusCode} for ${apiPath}`));
                    return;
                }
                try {
                    const data = JSON.parse(body) as Record<string, unknown>;
                    // Response shape: { agent: {...} } | { skill: {...} } | { instruction: {...} }
                    const singular = kind.slice(0, -1) as string; // 'agents' → 'agent' etc
                    // 'instructions' → 'instruction', not 'instruction' from slice
                    const record = (data[singular] ?? data) as Record<string, unknown>;
                    const content = (record['content'] ?? '') as string;
                    resolve(content);
                } catch {
                    reject(new Error(`Invalid JSON from ${apiPath}`));
                }
            });
        });
        req.on('error', reject);
        req.setTimeout(5000, () => {
            req.destroy();
            reject(new Error(`Timeout fetching ${apiPath}`));
        });
        req.end();
    });
}

/** Build a machine-readable reference string for agents to use. */
function buildReference(kind: LibraryKind, name: string): string {
    const toolMap: Record<LibraryKind, string> = {
        agents:       'memory_agent',
        skills:       'memory_agent',
        instructions: 'memory_instructions',
    };
    const actionMap: Record<LibraryKind, string> = {
        agents:       'get_agent',
        skills:       'get_skill',
        instructions: 'get_instruction',
    };
    const tool = toolMap[kind];
    const action = actionMap[kind];
    return `${tool}({"action":"${action}","name":"${name}"})`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Registration
// ─────────────────────────────────────────────────────────────────────────────

export function registerLibraryCommands(
    context: vscode.ExtensionContext,
    provider: LibraryTreeProvider,
    dashboardProvider: DashboardViewProvider,
): void {
    const getDashboardPort = () =>
        resolveDashboardPort(vscode.workspace.getConfiguration('projectMemory'));

    context.subscriptions.push(

        // ── Refresh ──────────────────────────────────────────────────────────
        vscode.commands.registerCommand('projectMemory.library.refresh', () => {
            provider.dashboardPort = getDashboardPort();
            provider.refresh();
        }),

        // ── Open in Dashboard ────────────────────────────────────────────────
        vscode.commands.registerCommand(
            'projectMemory.library.openInDashboard',
            (item: LibraryItem) => {
                if (!item) return;
                // Open the webview panel and post a navigate message so the
                // dashboard scrolls to the relevant library section/item.
                vscode.commands.executeCommand('projectMemory.openDashboardPanel').then(() => {
                    setTimeout(() => {
                        dashboardProvider.postMessage({
                            type: 'navigateLibrary',
                            data: { kind: item.libraryKind, name: item.record.name },
                        });
                    }, 300);
                });
            },
        ),

        // ── Open in Editor ───────────────────────────────────────────────────
        vscode.commands.registerCommand(
            'projectMemory.library.openInEditor',
            async (item: LibraryItem) => {
                if (!item) return;
                const port = getDashboardPort();
                try {
                    const content = await fetchContent(port, item.libraryKind, item.record.name);
                    const tempPath = getTempFilePath(item.libraryKind, item.record.name);

                    // Ensure temp directory exists
                    fs.mkdirSync(path.dirname(tempPath), { recursive: true });
                    fs.writeFileSync(tempPath, content, 'utf8');

                    const uri = vscode.Uri.file(tempPath);
                    const doc = await vscode.workspace.openTextDocument(uri);
                    await vscode.window.showTextDocument(doc, { preview: false });

                    // Update tree to show dirty state
                    provider.refreshKind(item.libraryKind);
                } catch (err) {
                    vscode.window.showErrorMessage(
                        `Failed to open ${item.record.name}: ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            },
        ),

        // ── Save ─────────────────────────────────────────────────────────────
        vscode.commands.registerCommand(
            'projectMemory.library.save',
            async (item: LibraryItem) => {
                if (!item) return;
                const tempPath = getTempFilePath(item.libraryKind, item.record.name);

                if (!fs.existsSync(tempPath)) {
                    vscode.window.showWarningMessage(
                        `No local draft found for "${item.record.name}". Open in Editor first.`,
                    );
                    return;
                }

                const content = fs.readFileSync(tempPath, 'utf8');
                const port = getDashboardPort();

                try {
                    await provider._put(
                        apiPathFor(item.libraryKind, item.record.name),
                        putBodyFor(item.libraryKind, content),
                    );

                    // Delete the local draft
                    fs.unlinkSync(tempPath);

                    // Invalidate cache and refresh
                    provider.refreshKind(item.libraryKind);

                    vscode.window.showInformationMessage(
                        `Saved "${item.record.name}" to ProjectMemory DB.`,
                    );
                } catch (err) {
                    vscode.window.showErrorMessage(
                        `Failed to save "${item.record.name}": ${err instanceof Error ? err.message : String(err)}`,
                    );
                }
            },
        ),

        // ── Copy Reference ───────────────────────────────────────────────────
        vscode.commands.registerCommand(
            'projectMemory.library.copyReference',
            async (item: LibraryItem) => {
                if (!item) return;
                const ref = buildReference(item.libraryKind, item.record.name);
                await vscode.env.clipboard.writeText(ref);
                vscode.window.showInformationMessage(
                    `Copied reference for "${item.record.name}" to clipboard.`,
                );
            },
        ),
    );
}
