/**
 * Shared utility functions for the Project Memory extension.
 */

import * as vscode from 'vscode';
import { resolveWorkspaceIdentity } from './workspace-identity';

function readExplicitBoolean(config: vscode.WorkspaceConfiguration, key: string): boolean | undefined {
    const inspected = config.inspect<boolean>(key);
    const candidates = [
        inspected?.workspaceFolderValue,
        inspected?.workspaceValue,
        inspected?.globalValue,
    ];

    return candidates.find((value): value is boolean => typeof value === 'boolean');
}

/**
 * Return whether extension toasts should be displayed.
 *
 * `projectMemory.notifications.enabled` is canonical. We keep
 * `projectMemory.showNotifications` as a legacy fallback only.
 */
export function notificationsEnabled(
    config: vscode.WorkspaceConfiguration = vscode.workspace.getConfiguration('projectMemory')
): boolean {
    const explicitCanonical = readExplicitBoolean(config, 'notifications.enabled');
    if (explicitCanonical !== undefined) {
        return explicitCanonical;
    }

    const explicitLegacy = readExplicitBoolean(config, 'showNotifications');
    if (explicitLegacy !== undefined) {
        return explicitLegacy;
    }

    return config.get<boolean>('notifications.enabled', true);
}

/**
 * Show an information message if notifications are enabled.
 */
export function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (notificationsEnabled(config)) {
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
