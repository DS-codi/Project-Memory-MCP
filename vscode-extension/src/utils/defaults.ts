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

export function getDefaultAgentsRoot(): string {
    return resolveDefaultPath('agents');
}

export function getDefaultInstructionsRoot(): string {
    return resolveDefaultPath('instructions');
}

export function getDefaultPromptsRoot(): string {
    return resolveDefaultPath('prompts');
}

/**
 * Skills root resolution with system-wide fallback.
 * Unlike agents/instructions (which users configure via agentsRoot/instructionsRoot),
 * skillsRoot is often left unset. When unset, derive from the same parent directory
 * as an already-configured agentsRoot or instructionsRoot so skills resolve to the
 * shared MCP project directory in every workspace — not the current workspace.
 */
export function getDefaultSkillsRoot(): string {
    const config = vscode.workspace.getConfiguration('projectMemory');

    // 1. Explicit skillsRoot setting
    const explicit = config.get<string>('skillsRoot');
    if (explicit) { return explicit; }

    // 2. Explicit globalSkillsRoot fallback
    const global = config.get<string>('globalSkillsRoot');
    if (global) { return global; }

    // 3. Derive as sibling of agentsRoot (agents/ → skills/)
    const agentsRoot = config.get<string>('agentsRoot');
    if (agentsRoot) {
        return path.join(path.dirname(agentsRoot), 'skills');
    }

    // 4. Derive as sibling of instructionsRoot
    const instructionsRoot = config.get<string>('instructionsRoot');
    if (instructionsRoot) {
        return path.join(path.dirname(instructionsRoot), 'skills');
    }

    // 5. Final fallback: workspace-relative
    return resolveDefaultPath('skills');
}
