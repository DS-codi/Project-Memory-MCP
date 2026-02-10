/**
 * Default path resolution for Project Memory data directories.
 * Resolves workspace-relative paths using workspace identity when available.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { resolveWorkspaceIdentity } from './workspace-identity';

function resolveDefaultPath(subdir: string): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        const identity = resolveWorkspaceIdentity(workspaceFolders[0].uri.fsPath);
        if (identity) {
            return path.join(identity.projectPath, subdir);
        }
        return vscode.Uri.joinPath(workspaceFolders[0].uri, subdir).fsPath;
    }
    return '';
}

export function getDefaultDataRoot(): string {
    return resolveDefaultPath('data');
}

export function getDefaultAgentsRoot(): string {
    return resolveDefaultPath('agents');
}

export function getDefaultInstructionsRoot(): string {
    return resolveDefaultPath('instructions');
}

export function getDefaultPromptsRoot(): string {
    return resolveDefaultPath('prompts');
}
