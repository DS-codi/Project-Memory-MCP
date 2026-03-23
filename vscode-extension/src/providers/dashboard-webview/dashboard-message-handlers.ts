/**
 * Dashboard message handlers for skills and instructions management.
 *
 * These functions handle webview → extension messages for listing and
 * syncing skills and instructions into the workspace.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { getDefaultSkillsRoot, getDefaultInstructionsRoot } from '../../utils/defaults';
import { notificationsEnabled } from '../../utils/helpers';
import { buildMissingSkillsSourceWarning, resolveSkillsSourceRoot } from '../../utils/skillsSourceRoot';

/** Message posting interface (subset of DashboardViewProvider) */
export interface MessagePoster {
    postMessage(message: { type: string; data?: unknown }): void;
}

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (notificationsEnabled(config)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

// --- Skills handlers ---

/** List available skills and whether a workspace-local copy exists */
export function handleGetSkills(poster: MessagePoster): void {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
        const globalSkillsRoot = config.get<string>('globalSkillsRoot');
        const sourceResolution = resolveSkillsSourceRoot(
            configuredSkillsRoot,
            workspacePath ?? process.cwd(),
            fs.existsSync,
            [globalSkillsRoot]
        );

        if (!sourceResolution.root) {
            poster.postMessage({ type: 'skillsList', data: { skills: [] } });
            return;
        }

        const skillsRoot = sourceResolution.root;
        const skills = fs.readdirSync(skillsRoot)
            .filter((dir: string) => {
                const skillFile = path.join(skillsRoot, dir, 'SKILL.md');
                return fs.existsSync(skillFile);
            })
            .map((dir: string) => {
                let description = '';
                try {
                    const content = fs.readFileSync(path.join(skillsRoot, dir, 'SKILL.md'), 'utf-8');
                    const match = content.match(/^description:\s*(.+)$/m);
                    if (match) { description = match[1].substring(0, 120); }
                } catch { /* ignore */ }

                let workspaceLocal = false;
                if (workspacePath) {
                    const deployedPath = path.join(workspacePath, '.github', 'skills', dir, 'SKILL.md');
                    workspaceLocal = fs.existsSync(deployedPath);
                }

                return { name: dir, description, deployed: workspaceLocal, workspaceLocal };
            });

        poster.postMessage({ type: 'skillsList', data: { skills } });
    } catch (error) {
        console.error('Failed to list skills:', error);
        poster.postMessage({ type: 'skillsList', data: { skills: [] } });
    }
}

/** Sync a single skill into the workspace-local .github surface */
export function handleDeploySkill(poster: MessagePoster, data: { skillName: string }): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = vscode.workspace.getConfiguration('projectMemory');
    const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
    const globalSkillsRoot = config.get<string>('globalSkillsRoot');
    const sourceResolution = resolveSkillsSourceRoot(
        configuredSkillsRoot,
        workspacePath,
        fs.existsSync,
        [globalSkillsRoot]
    );
    if (!sourceResolution.root) {
        vscode.window.showWarningMessage(buildMissingSkillsSourceWarning(workspacePath, sourceResolution.checkedPaths));
        return;
    }
    const skillsRoot = sourceResolution.root;

    try {
        const sourceDir = path.join(skillsRoot, data.skillName);
        if (!fs.existsSync(sourceDir)) {
            vscode.window.showWarningMessage(`Skill "${data.skillName}" not found in source root.`);
            return;
        }
        const destDir = path.join(workspacePath, '.github', 'skills', data.skillName);
        const existingSkillFile = path.join(destDir, 'SKILL.md');
        const hadWorkspaceCopy = fs.existsSync(existingSkillFile);
        fs.mkdirSync(destDir, { recursive: true });

        const files = fs.readdirSync(sourceDir);
        for (const file of files) {
            const srcFile = path.join(sourceDir, file);
            if (fs.statSync(srcFile).isFile()) {
                fs.copyFileSync(srcFile, path.join(destDir, file));
            }
        }

        notify(`${hadWorkspaceCopy ? 'Synced' : 'Added'} skill "${data.skillName}" in workspace .github/skills`);
        handleGetSkills(poster); // Refresh the list
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy skill: ${error}`);
    }
}

// --- Instructions handlers ---

/** List available instructions and whether a workspace-local copy exists */
export function handleGetInstructions(poster: MessagePoster): void {
    try {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
        if (!instructionsRoot || !fs.existsSync(instructionsRoot)) {
            poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
            return;
        }

        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const instructions = fs.readdirSync(instructionsRoot)
            .filter((f: string) => f.endsWith('.instructions.md'))
            .map((f: string) => {
                const name = f.replace('.instructions.md', '');
                let workspaceLocal = false;
                if (workspacePath) {
                    const deployedPath = path.join(workspacePath, '.github', 'instructions', f);
                    workspaceLocal = fs.existsSync(deployedPath);
                }
                return { name, fileName: f, deployed: workspaceLocal, workspaceLocal };
            });

        poster.postMessage({ type: 'instructionsList', data: { instructions } });
    } catch (error) {
        console.error('Failed to list instructions:', error);
        poster.postMessage({ type: 'instructionsList', data: { instructions: [] } });
    }
}

/** Sync a single instruction into the workspace-local .github surface */
export function handleDeployInstruction(poster: MessagePoster, data: { instructionName: string }): void {
    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (!workspacePath) {
        vscode.window.showErrorMessage('No workspace folder open');
        return;
    }

    const config = vscode.workspace.getConfiguration('projectMemory');
    const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
    if (!instructionsRoot) {
        vscode.window.showErrorMessage('Instructions root not configured');
        return;
    }

    try {
        const fileName = `${data.instructionName}.instructions.md`;
        const sourcePath = path.join(instructionsRoot, fileName);
        const targetDir = path.join(workspacePath, '.github', 'instructions');
        const targetPath = path.join(targetDir, fileName);
        const hadWorkspaceCopy = fs.existsSync(targetPath);
        fs.mkdirSync(targetDir, { recursive: true });
        fs.copyFileSync(sourcePath, targetPath);

        notify(`${hadWorkspaceCopy ? 'Synced' : 'Added'} instruction "${data.instructionName}" in workspace .github/instructions`);
        handleGetInstructions(poster); // Refresh the list
    } catch (error) {
        vscode.window.showErrorMessage(`Failed to deploy instruction: ${error}`);
    }
}

// --- Sessions handlers removed (Plan 01: Extension Strip-Down) ---
// Session management functions (handleGetSessions, handleStopSession,
// handleInjectSession, handleClearAllSessions, handleForceCloseSession,
// syncServerSessions) have been archived to src/_archive/chat/orchestration/.
// The SessionInterceptRegistry is no longer used by the extension.
