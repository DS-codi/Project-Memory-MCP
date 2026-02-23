/**
 * Shared utility functions for the Project Memory extension.
 */

import * as vscode from 'vscode';
import { resolveWorkspaceIdentity } from './workspace-identity';

/**
 * Show an information message if notifications are enabled.
 */
export function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemoryDev');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

/**
 * Register a workspace with the dashboard server API.
 * Returns the workspace ID on success, or null on failure.
 */
export async function registerWorkspace(serverPort: number, workspacePath: string): Promise<string | null> {
    try {
        const identity = resolveWorkspaceIdentity(workspacePath);
        const effectivePath = identity ? identity.projectPath : workspacePath;

        const response = await fetch(`http://localhost:${serverPort}/api/workspaces/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace_path: effectivePath })
        });

        if (!response.ok) {
            return null;
        }

        const data: any = await response.json();
        const workspace = data.workspace as { workspace_id?: string; id?: string } | undefined;
        return workspace?.workspace_id || workspace?.id || null;
    } catch {
        return null;
    }
}
