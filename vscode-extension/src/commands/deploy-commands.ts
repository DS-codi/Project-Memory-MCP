/**
 * Deployment commands: deploy agents, skills, instructions, copilot config, defaults.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { DefaultDeployer } from '../deployer/DefaultDeployer';
import { notify } from '../utils/helpers';
import { getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultSkillsRoot } from '../utils/defaults';
import { buildMissingSkillsSourceWarning, resolveSkillsSourceRoot } from '../utils/skillsSourceRoot';

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

        vscode.commands.registerCommand('projectMemory.deploySkills', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
            const globalSkillsRoot = config.get<string>('globalSkillsRoot');

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const skillsSource = resolveSkillsSourceRoot(
                configuredSkillsRoot,
                workspacePath,
                fs.existsSync,
                [globalSkillsRoot]
            );

            if (!skillsSource.root) {
                const warningMsg = buildMissingSkillsSourceWarning(workspacePath, skillsSource.checkedPaths);
                console.warn('[PM Deploy Skills]', warningMsg);
                vscode.window.showWarningMessage(warningMsg);
                return;
            }

            const skillsSourceRoot = skillsSource.root;

            try {
                // Skills are subdirectories containing a SKILL.md file
                const allSkillDirs = fs.readdirSync(skillsSourceRoot)
                    .filter((f: string) => {
                        const skillPath = path.join(skillsSourceRoot, f, 'SKILL.md');
                        return fs.existsSync(skillPath);
                    });

                if (allSkillDirs.length === 0) {
                    vscode.window.showWarningMessage('No skill directories found in skills root');
                    return;
                }

                const items: vscode.QuickPickItem[] = allSkillDirs.map((dirName: string) => {
                    // Try to extract description from SKILL.md front matter
                    let description = dirName;
                    try {
                        const skillContent = fs.readFileSync(path.join(skillsSourceRoot, dirName, 'SKILL.md'), 'utf-8');
                        const descMatch = skillContent.match(/^description:\s*(.+)$/m);
                        if (descMatch) {
                            description = descMatch[1].substring(0, 80);
                        }
                    } catch { /* ignore read errors */ }
                    return {
                        label: dirName,
                        description,
                        picked: true
                    };
                });

                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select skills to deploy',
                    title: 'Deploy Skills'
                });

                if (!selectedItems || selectedItems.length === 0) return;

                const targetDir = path.join(workspacePath, '.github', 'skills');
                fs.mkdirSync(targetDir, { recursive: true });

                let copiedCount = 0;
                for (const item of selectedItems) {
                    const sourceDir = path.join(skillsSourceRoot, item.label);
                    const destDir = path.join(targetDir, item.label);
                    fs.mkdirSync(destDir, { recursive: true });
                    // Copy all files in the skill directory
                    const files = fs.readdirSync(sourceDir);
                    for (const file of files) {
                        const srcFile = path.join(sourceDir, file);
                        if (fs.statSync(srcFile).isFile()) {
                            fs.copyFileSync(srcFile, path.join(destDir, file));
                        }
                    }
                    copiedCount++;
                }

                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { type: 'skills', count: copiedCount, targetDir }
                });

                notify(
                    `Deployed ${copiedCount} skill(s) to ${path.relative(workspacePath, targetDir)}`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to deploy skills: ${error}`);
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

        vscode.commands.registerCommand('projectMemory.listSkills', async () => {
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
                vscode.window.showWarningMessage(
                    buildMissingSkillsSourceWarning(workspacePath ?? process.cwd(), sourceResolution.checkedPaths)
                );
                return;
            }

            const skillsRoot = sourceResolution.root;

            try {
                const skillDirs = fs.readdirSync(skillsRoot)
                    .filter((f: string) => {
                        const skillPath = path.join(skillsRoot, f, 'SKILL.md');
                        return fs.existsSync(skillPath);
                    });

                if (skillDirs.length === 0) {
                    vscode.window.showInformationMessage('No skills found in skills root.');
                    return;
                }

                const items: vscode.QuickPickItem[] = skillDirs.map((dirName: string) => {
                    let description = '';
                    try {
                        const content = fs.readFileSync(path.join(skillsRoot, dirName, 'SKILL.md'), 'utf-8');
                        const descMatch = content.match(/^description:\s*(.+)$/m);
                        if (descMatch) { description = descMatch[1].substring(0, 100); }
                    } catch { /* ignore */ }
                    return { label: dirName, description };
                });

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Available skills (select to open)',
                    title: 'Skills'
                });

                if (selected) {
                    const skillFile = path.join(skillsRoot, selected.label, 'SKILL.md');
                    if (fs.existsSync(skillFile)) {
                        const doc = await vscode.workspace.openTextDocument(skillFile);
                        await vscode.window.showTextDocument(doc);
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list skills: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deploySkill', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const configuredSkillsRoot = config.get<string>('skillsRoot') || getDefaultSkillsRoot();
            const globalSkillsRoot = config.get<string>('globalSkillsRoot');
            const sourceResolution = resolveSkillsSourceRoot(
                configuredSkillsRoot,
                workspaceFolders[0].uri.fsPath,
                fs.existsSync,
                [globalSkillsRoot]
            );

            if (!sourceResolution.root) {
                vscode.window.showWarningMessage(
                    buildMissingSkillsSourceWarning(workspaceFolders[0].uri.fsPath, sourceResolution.checkedPaths)
                );
                return;
            }

            const skillsRoot = sourceResolution.root;

            try {
                const skillDirs = fs.readdirSync(skillsRoot)
                    .filter((f: string) => {
                        const skillPath = path.join(skillsRoot, f, 'SKILL.md');
                        return fs.existsSync(skillPath);
                    });

                if (skillDirs.length === 0) {
                    vscode.window.showWarningMessage('No skill directories found in skills root');
                    return;
                }

                const items: vscode.QuickPickItem[] = skillDirs.map((dirName: string) => {
                    let description = '';
                    try {
                        const content = fs.readFileSync(path.join(skillsRoot, dirName, 'SKILL.md'), 'utf-8');
                        const descMatch = content.match(/^description:\s*(.+)$/m);
                        if (descMatch) { description = descMatch[1].substring(0, 80); }
                    } catch { /* ignore */ }
                    return { label: dirName, description };
                });

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Select a skill to deploy',
                    title: 'Deploy Skill'
                });

                if (!selected) return;

                const workspacePath = workspaceFolders[0].uri.fsPath;
                const sourceDir = path.join(skillsRoot, selected.label);
                const targetDir = path.join(workspacePath, '.github', 'skills', selected.label);
                fs.mkdirSync(targetDir, { recursive: true });

                const files = fs.readdirSync(sourceDir);
                for (const file of files) {
                    const srcFile = path.join(sourceDir, file);
                    if (fs.statSync(srcFile).isFile()) {
                        fs.copyFileSync(srcFile, path.join(targetDir, file));
                    }
                }

                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { type: 'skill', count: 1, targetDir }
                });

                notify(
                    `Deployed skill "${selected.label}" to ${path.relative(workspacePath, targetDir)}`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
                    }
                });
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to deploy skill: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.listInstructions', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();

            if (!instructionsRoot || !fs.existsSync(instructionsRoot)) {
                vscode.window.showWarningMessage('Instructions root not configured or does not exist. Set projectMemory.instructionsRoot in settings.');
                return;
            }

            try {
                const instructionFiles = fs.readdirSync(instructionsRoot)
                    .filter((f: string) => f.endsWith('.instructions.md'));

                if (instructionFiles.length === 0) {
                    vscode.window.showInformationMessage('No instruction files found.');
                    return;
                }

                const items: vscode.QuickPickItem[] = instructionFiles.map((f: string) => {
                    const name = f.replace('.instructions.md', '');
                    return { label: name, description: f };
                });

                const selected = await vscode.window.showQuickPick(items, {
                    placeHolder: 'Available instructions (select to open)',
                    title: 'Instructions'
                });

                if (selected) {
                    const filePath = path.join(instructionsRoot, `${selected.label}.instructions.md`);
                    if (fs.existsSync(filePath)) {
                        const doc = await vscode.workspace.openTextDocument(filePath);
                        await vscode.window.showTextDocument(doc);
                    }
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to list instructions: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployCopilotConfig', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Deploy all Copilot config (agents, skills, instructions)?'
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
            const parts: string[] = [];
            if (plan.agents.length > 0) { parts.push(`${plan.agents.length} agents`); }
            if (plan.instructions.length > 0) { parts.push(`${plan.instructions.length} instructions`); }
            if (plan.skills.length > 0) { parts.push(`${plan.skills.length} skills`); }
            const summary = parts.length > 0 ? parts.join(', ') : 'defaults';
            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Deploy ${summary}?`
            });

            if (confirm === 'Yes') {
                const result = await defaultDeployer.deployToWorkspace(workspaceFolders[0].uri.fsPath);
                notify(
                    `Deployed ${result.agents.length} agents, ${result.instructions.length} instructions, and ${result.skills.length} skills`
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
