/**
 * Deployment commands: deploy agents, prompts, instructions, copilot config, defaults.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { DefaultDeployer } from '../deployer/DefaultDeployer';
import { notify } from '../utils/helpers';
import { getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultPromptsRoot } from '../utils/defaults';

export function registerDeployCommands(
    context: vscode.ExtensionContext,
    dashboardProvider: DashboardViewProvider,
    defaultDeployer: DefaultDeployer
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.deployAgents', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const configuredAgentsRoot = config.get<string>('agentsRoot');
            const agentsRoot = configuredAgentsRoot || getDefaultAgentsRoot();
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
            const defaultAgents = config.get<string[]>('defaultAgents') || [];
            const defaultInstructions = config.get<string[]>('defaultInstructions') || [];

            if (!agentsRoot) {
                vscode.window.showErrorMessage('Agents root not configured. Set projectMemory.agentsRoot in settings.');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;

            try {
                const allAgentFiles = fs.readdirSync(agentsRoot)
                    .filter((f: string) => f.endsWith('.agent.md'));

                if (allAgentFiles.length === 0) {
                    vscode.window.showWarningMessage('No agent files found in agents root');
                    return;
                }

                const items: vscode.QuickPickItem[] = allAgentFiles.map((f: string) => {
                    const name = f.replace('.agent.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultAgents.length === 0 || defaultAgents.includes(name)
                    };
                });

                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select agents to deploy',
                    title: 'Deploy Agents'
                });

                if (!selectedItems || selectedItems.length === 0) return;

                const agentsTargetDir = path.join(workspacePath, '.github', 'agents');
                fs.mkdirSync(agentsTargetDir, { recursive: true });

                let agentsCopied = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.agent.md`;
                    const sourcePath = path.join(agentsRoot, file);
                    const targetPath = path.join(agentsTargetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    agentsCopied++;
                }

                let instructionsCopied = 0;
                if (instructionsRoot && defaultInstructions.length > 0) {
                    const instructionsTargetDir = path.join(workspacePath, '.github', 'instructions');
                    fs.mkdirSync(instructionsTargetDir, { recursive: true });

                    for (const instructionName of defaultInstructions) {
                        const sourceFile = `${instructionName}.instructions.md`;
                        const sourcePath = path.join(instructionsRoot, sourceFile);
                        const targetPath = path.join(instructionsTargetDir, sourceFile);

                        if (fs.existsSync(sourcePath)) {
                            fs.copyFileSync(sourcePath, targetPath);
                            instructionsCopied++;
                        }
                    }
                }

                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: {
                        type: 'agents',
                        count: agentsCopied,
                        instructionsCount: instructionsCopied,
                        targetDir: agentsTargetDir
                    }
                });

                const message = instructionsCopied > 0
                    ? `Deployed ${agentsCopied} agent(s) and ${instructionsCopied} instruction(s)`
                    : `Deployed ${agentsCopied} agent(s)`;

                notify(message, 'Open Folder').then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(agentsTargetDir));
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to deploy agents: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployPrompts', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const promptsRoot = config.get<string>('promptsRoot') || getDefaultPromptsRoot();
            const defaultPrompts = config.get<string[]>('defaultPrompts') || [];

            if (!promptsRoot) {
                vscode.window.showErrorMessage('Prompts root not configured. Set projectMemory.promptsRoot in settings.');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;

            try {
                const allPromptFiles = fs.readdirSync(promptsRoot)
                    .filter((f: string) => f.endsWith('.prompt.md'));

                if (allPromptFiles.length === 0) {
                    vscode.window.showWarningMessage('No prompt files found in prompts root');
                    return;
                }

                const items: vscode.QuickPickItem[] = allPromptFiles.map((f: string) => {
                    const name = f.replace('.prompt.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultPrompts.length === 0 || defaultPrompts.includes(name)
                    };
                });

                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select prompts to deploy',
                    title: 'Deploy Prompts'
                });

                if (!selectedItems || selectedItems.length === 0) return;

                const targetDir = path.join(workspacePath, '.github', 'prompts');
                fs.mkdirSync(targetDir, { recursive: true });

                let copiedCount = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.prompt.md`;
                    const sourcePath = path.join(promptsRoot, file);
                    const targetPath = path.join(targetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    copiedCount++;
                }

                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { type: 'prompts', count: copiedCount, targetDir }
                });

                notify(
                    `Deployed ${copiedCount} prompt(s) to ${path.relative(workspacePath, targetDir)}`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to deploy prompts: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployInstructions', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
            const defaultInstructions = config.get<string[]>('defaultInstructions') || [];

            if (!instructionsRoot) {
                vscode.window.showErrorMessage('Instructions root not configured. Set projectMemory.instructionsRoot in settings.');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;

            try {
                const allInstructionFiles = fs.readdirSync(instructionsRoot)
                    .filter((f: string) => f.endsWith('.instructions.md'));

                if (allInstructionFiles.length === 0) {
                    vscode.window.showWarningMessage('No instruction files found in instructions root');
                    return;
                }

                const items: vscode.QuickPickItem[] = allInstructionFiles.map((f: string) => {
                    const name = f.replace('.instructions.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultInstructions.length === 0 || defaultInstructions.includes(name)
                    };
                });

                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select instructions to deploy',
                    title: 'Deploy Instructions'
                });

                if (!selectedItems || selectedItems.length === 0) return;

                const targetDir = path.join(workspacePath, '.github', 'instructions');
                fs.mkdirSync(targetDir, { recursive: true });

                let copiedCount = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.instructions.md`;
                    const sourcePath = path.join(instructionsRoot, file);
                    const targetPath = path.join(targetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    copiedCount++;
                }

                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { type: 'instructions', count: copiedCount, targetDir }
                });

                notify(
                    `Deployed ${copiedCount} instruction(s) to ${path.relative(workspacePath, targetDir)}`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to deploy instructions: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployCopilotConfig', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Deploy all Copilot config (agents, prompts, instructions)?'
            });

            if (confirm === 'Yes') {
                dashboardProvider.postMessage({
                    type: 'deployAllCopilotConfig',
                    data: { workspacePath: workspaceFolders[0].uri.fsPath }
                });
                notify('Deploying all Copilot configuration...');
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployDefaults', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const plan = defaultDeployer.getDeploymentPlan();
            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Deploy ${plan.agents.length} agents and ${plan.instructions.length} instructions?`
            });

            if (confirm === 'Yes') {
                const result = await defaultDeployer.deployToWorkspace(workspaceFolders[0].uri.fsPath);
                notify(
                    `Deployed ${result.agents.length} agents and ${result.instructions.length} instructions`
                );
            }
        }),

        vscode.commands.registerCommand('projectMemory.updateDefaults', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const result = await defaultDeployer.updateWorkspace(workspaceFolders[0].uri.fsPath);
            if (result.updated.length > 0 || result.added.length > 0) {
                notify(
                    `Updated ${result.updated.length} files, added ${result.added.length} new files`
                );
            } else {
                notify('All files are up to date');
            }
        })
    );
}
