/**
 * Workspace management commands: migrate, settings, open files.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { ConnectionManager } from '../server/ConnectionManager';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { notify } from '../utils/helpers';
import { getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultSkillsRoot } from '../utils/defaults';
import { resolveSkillsSourceRoot, buildMissingSkillsSourceWarning } from '../utils/skillsSourceRoot';

export function registerWorkspaceCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    dashboardProvider: DashboardViewProvider
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.migrateWorkspace', async () => {
            vscode.window.showInformationMessage(
                'Workspace migration is now handled via the MCP server directly. ' +
                'Use the memory_workspace(action: "migrate") tool through a Copilot chat or MCP client.',
                'OK'
            );
        }),

        vscode.commands.registerCommand('projectMemory.openSettings', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
            const skillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();

            const choice = await vscode.window.showQuickPick([
                { label: '$(person) Configure Default Agents', description: 'Select which agents to deploy by default', value: 'agents' },
                { label: '$(book) Configure Default Instructions', description: 'Select which instructions to deploy by default', value: 'instructions' },
                { label: '$(star) Configure Default Skills', description: 'Select which skills to deploy by default', value: 'skills' },
                { label: '$(gear) Open All Settings', description: 'Open VS Code settings for Project Memory', value: 'settings' }
            ], {
                placeHolder: 'What would you like to configure?'
            });

            if (!choice) return;

            if (choice.value === 'settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', '@ext:project-memory.project-memory-dashboard');
                return;
            }

            if (choice.value === 'agents' && agentsRoot) {
                try {
                    if (!fs.existsSync(agentsRoot)) {
                        vscode.window.showWarningMessage(`Agents root not found: ${agentsRoot}`);
                        return;
                    }
                    const allAgentFiles = fs.readdirSync(agentsRoot)
                        .filter((f: string) => f.endsWith('.agent.md'))
                        .map((f: string) => f.replace('.agent.md', ''));

                    const currentDefaults = config.get<string[]>('defaultAgents') || [];

                    const items: vscode.QuickPickItem[] = allAgentFiles.map((name: string) => ({
                        label: name,
                        picked: currentDefaults.length === 0 || currentDefaults.includes(name)
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        canPickMany: true,
                        placeHolder: 'Select default agents (these will be pre-selected when deploying)',
                        title: 'Configure Default Agents'
                    });

                    if (selected) {
                        await config.update('defaultAgents', selected.map(s => s.label), vscode.ConfigurationTarget.Global);
                        notify(`Updated default agents (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read agents: ${error}`);
                }
            }

            if (choice.value === 'instructions' && instructionsRoot) {
                try {
                    if (!fs.existsSync(instructionsRoot)) {
                        vscode.window.showWarningMessage(`Instructions root not found: ${instructionsRoot}`);
                        return;
                    }
                    const allInstructionFiles = fs.readdirSync(instructionsRoot)
                        .filter((f: string) => f.endsWith('.instructions.md'))
                        .map((f: string) => f.replace('.instructions.md', ''));

                    const currentDefaults = config.get<string[]>('defaultInstructions') || [];

                    const items: vscode.QuickPickItem[] = allInstructionFiles.map((name: string) => ({
                        label: name,
                        picked: currentDefaults.length === 0 || currentDefaults.includes(name)
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        canPickMany: true,
                        placeHolder: 'Select default instructions (these will be pre-selected when deploying)',
                        title: 'Configure Default Instructions'
                    });

                    if (selected) {
                        await config.update('defaultInstructions', selected.map(s => s.label), vscode.ConfigurationTarget.Global);
                        notify(`Updated default instructions (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read instructions: ${error}`);
                }
            }

            if (choice.value === 'skills' && skillsRoot) {
                try {
                    const globalSkillsRoot = config.get<string>('globalSkillsRoot');
                    const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? '';
                    const skillsResolution = resolveSkillsSourceRoot(skillsRoot, workspacePath, fs.existsSync, [globalSkillsRoot]);
                    if (!skillsResolution.root) {
                        vscode.window.showWarningMessage(buildMissingSkillsSourceWarning(workspacePath, skillsResolution.checkedPaths));
                        return;
                    }
                    const resolvedSkillsRoot = skillsResolution.root;

                    const allSkillDirs = fs.readdirSync(resolvedSkillsRoot)
                        .filter((f: string) => {
                            const skillPath = path.join(resolvedSkillsRoot, f, 'SKILL.md');
                            return fs.existsSync(skillPath);
                        });

                    const currentDefaults = config.get<string[]>('defaultSkills') || [];

                    const items: vscode.QuickPickItem[] = allSkillDirs.map((name: string) => ({
                        label: name,
                        picked: currentDefaults.length === 0 || currentDefaults.includes(name)
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        canPickMany: true,
                        placeHolder: 'Select default skills (these will be pre-selected when deploying)',
                        title: 'Configure Default Skills'
                    });

                    if (selected) {
                        await config.update('defaultSkills', selected.map(s => s.label), vscode.ConfigurationTarget.Global);
                        notify(`Updated default skills (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read skills: ${error}`);
                }
            }
        }),

        vscode.commands.registerCommand('projectMemory.openAgentFile', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();

            if (!agentsRoot) {
                vscode.window.showErrorMessage('Agents root not configured');
                return;
            }

            try {
                const files = fs.readdirSync(agentsRoot)
                    .filter((f: string) => f.endsWith('.agent.md'));

                const selected = await vscode.window.showQuickPick(files, {
                    placeHolder: 'Select an agent file to open'
                });

                if (selected) {
                    const filePath = path.join(agentsRoot, selected);
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list agent files: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.openPromptFile', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const promptsRoot = config.get<string>('promptsRoot');

            if (!promptsRoot) {
                vscode.window.showErrorMessage('Prompts root not configured. Set projectMemory.promptsRoot in settings.');
                return;
            }

            try {
                const files = fs.readdirSync(promptsRoot)
                    .filter((f: string) => f.endsWith('.prompt.md'));

                const selected = await vscode.window.showQuickPick(files, {
                    placeHolder: 'Select a prompt file to open'
                });

                if (selected) {
                    const filePath = path.join(promptsRoot, selected);
                    const doc = await vscode.workspace.openTextDocument(filePath);
                    await vscode.window.showTextDocument(doc);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list prompt files: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.showCopilotStatus', () => {
            dashboardProvider.postMessage({ type: 'showCopilotStatus' });
            vscode.commands.executeCommand('workbench.view.extension.projectMemory');
        }),

        vscode.commands.registerCommand('projectMemory.openFile', async (filePath: string, line?: number) => {
            try {
                const document = await vscode.workspace.openTextDocument(filePath);
                const editor = await vscode.window.showTextDocument(document);
                if (line !== undefined) {
                    const position = new vscode.Position(line - 1, 0);
                    editor.selection = new vscode.Selection(position, position);
                    editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
                }
            } catch {
                vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
            }
        })
    );
}
