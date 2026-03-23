/**
 * Deployment commands: deploy agents, skills, instructions, copilot config, defaults.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { DefaultDeployer } from '../deployer/DefaultDeployer';
import { ConnectionManager, WorkspaceConfigSyncEntry, WorkspaceConfigSyncReport } from '../server/ConnectionManager';
import { resolveActiveWorkspaceId } from './workspace-commands';
import { notify } from '../utils/helpers';
import { getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultSkillsRoot } from '../utils/defaults';
import { buildMissingSkillsSourceWarning, resolveSkillsSourceRoot } from '../utils/skillsSourceRoot';
import { resolveDashboardPort } from '../utils/dashboard-port';

interface DbAgentEntry {
    name: string;
    content: string;
    is_permanent: boolean;
    updated_at: string;
}

export function registerDeployCommands(
    context: vscode.ExtensionContext,
    dashboardProvider: DashboardViewProvider,
    defaultDeployer: DefaultDeployer,
    connectionManager: ConnectionManager
): void {
    let syncReportChannel: vscode.OutputChannel | undefined;
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.deployAgents', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const config = vscode.workspace.getConfiguration('projectMemory');
            const dashboardPort = resolveDashboardPort(config);

            // --- Attempt to load agents from the MCP database via the dashboard API ---
            let dbAgents: DbAgentEntry[] = [];
            try {
                const response = await fetch(`http://localhost:${dashboardPort}/api/agents/db`);
                if (response.ok) {
                    const data = await response.json() as { agents: DbAgentEntry[] };
                    dbAgents = data.agents ?? [];
                }
            } catch {
                // Dashboard server not available — will fall back to filesystem
            }

            // --- Fallback: read .agent.md files from the configured agents root ---
            if (dbAgents.length === 0) {
                const configuredAgentsRoot = config.get<string>('agentsRoot');
                const agentsRoot = configuredAgentsRoot || getDefaultAgentsRoot();
                if (!agentsRoot) {
                    vscode.window.showErrorMessage(
                        'No agents found in database and agents root is not configured. Set projectMemory.agentsRoot in settings.'
                    );
                    return;
                }
                try {
                    const allAgentFiles = [
                            ...(fs.existsSync(path.join(agentsRoot, 'core')) ? fs.readdirSync(path.join(agentsRoot, 'core')).filter((f: string) => f.endsWith('.agent.md')).map((f: string) => path.join('core', f)) : []),
                            ...(fs.existsSync(path.join(agentsRoot, 'spoke')) ? fs.readdirSync(path.join(agentsRoot, 'spoke')).filter((f: string) => f.endsWith('.agent.md')).map((f: string) => path.join('spoke', f)) : []),
                            ...fs.readdirSync(agentsRoot).filter((f: string) => f.endsWith('.agent.md'))
                        ];
                    dbAgents = allAgentFiles.map((f: string) => ({
                        name: path.basename(f, '.agent.md'),
                        content: fs.readFileSync(path.join(agentsRoot, f), 'utf-8'),
                        is_permanent: false,
                        updated_at: '',
                    }));
                } catch {
                    vscode.window.showErrorMessage('Failed to load agents from the database or configured agents root.');
                    return;
                }
            }

            if (dbAgents.length === 0) {
                vscode.window.showWarningMessage('No agents found to deploy.');
                return;
            }

            const defaultAgents = config.get<string[]>('defaultAgents') || [];

            const items: vscode.QuickPickItem[] = dbAgents.map(a => {
                // Extract description from YAML frontmatter if present
                const descMatch = a.content.match(/^description:\s*['"]?(.+?)['"]?\s*$/m);
                const description = descMatch
                    ? descMatch[1].substring(0, 100)
                    : (a.is_permanent ? 'Hub agent' : '');
                return {
                    label: a.name,
                    description,
                    detail: a.is_permanent ? '$(star-full) Permanent hub agent' : undefined,
                    picked: defaultAgents.length === 0 || defaultAgents.includes(a.name) || a.is_permanent,
                };
            });

            const selectedItems = await vscode.window.showQuickPick(items, {
                canPickMany: true,
                placeHolder: 'Select agents to deploy to this workspace',
                title: 'Deploy Hub Agents from Database',
            });

            if (!selectedItems || selectedItems.length === 0) return;

            const agentsTargetDir = path.join(workspacePath, '.github', 'agents');
            fs.mkdirSync(agentsTargetDir, { recursive: true });

            let agentsCopied = 0;
            for (const item of selectedItems) {
                const agent = dbAgents.find(a => a.name === item.label);
                if (!agent) continue;
                const targetPath = path.join(agentsTargetDir, `${agent.name}.agent.md`);
                fs.writeFileSync(targetPath, agent.content, 'utf-8');
                agentsCopied++;
            }

            // Also deploy any default instructions alongside hub agents
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
            const defaultInstructions = config.get<string[]>('defaultInstructions') || [];
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
                    targetDir: agentsTargetDir,
                    source: 'database',
                },
            });

            const message = instructionsCopied > 0
                ? `Deployed ${agentsCopied} agent(s) and ${instructionsCopied} instruction(s) from database`
                : `Deployed ${agentsCopied} agent(s) from database`;

            notify(message, 'Open Folder').then(selection => {
                if (selection === 'Open Folder') {
                    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(agentsTargetDir));
                }
            });
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
        }),

        // ── One-click deploy with profile selection ───────────────────────────

        vscode.commands.registerCommand('projectMemory.deployWithProfile', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            type DeployProfile = { name: string; agents?: string[]; instructions?: string[]; skills?: string[] };
            const profiles = config.get<DeployProfile[]>('deployProfiles') ?? [];

            if (profiles.length === 0) {
                // Fall back to deploying defaults when no profiles are configured
                vscode.window.showInformationMessage(
                    'No deploy profiles configured. Deploying defaults. ' +
                    'Add profiles with projectMemory.deployProfiles.',
                    'Open Settings',
                ).then(choice => {
                    if (choice === 'Open Settings') {
                        vscode.commands.executeCommand('workbench.action.openSettings', 'projectMemory.deployProfiles');
                    }
                });
                vscode.commands.executeCommand('projectMemory.deployDefaults');
                return;
            }

            const items: vscode.QuickPickItem[] = profiles.map(p => ({
                label: p.name,
                description: [
                    p.agents?.length ? `${p.agents.length} agents` : '',
                    p.instructions?.length ? `${p.instructions.length} instructions` : '',
                    p.skills?.length ? `${p.skills.length} skills` : '',
                ].filter(Boolean).join(', ') || 'no items configured',
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a deploy profile',
                title: 'Deploy with Profile',
            });
            if (!selected) return;

            const profile = profiles.find(p => p.name === selected.label)!;
            const workspacePath = workspaceFolders[0].uri.fsPath;

            // Temporarily swap defaultDeployer config to the profile's items, run, restore
            const savedConfig = Object.assign({}, (defaultDeployer as unknown as { config: Record<string, unknown> }).config);
            defaultDeployer.updateConfig({
                defaultAgents: profile.agents ?? [],
                defaultInstructions: profile.instructions ?? [],
                defaultSkills: profile.skills ?? [],
            });

            let result: { agents: string[]; instructions: string[]; skills: string[] };
            try {
                result = await defaultDeployer.deployToWorkspace(workspacePath);
            } finally {
                // Restore original config
                defaultDeployer.updateConfig({
                    defaultAgents: savedConfig['defaultAgents'] as string[],
                    defaultInstructions: savedConfig['defaultInstructions'] as string[],
                    defaultSkills: savedConfig['defaultSkills'] as string[],
                });
            }

            notify(
                `Profile "${profile.name}" deployed: ` +
                `${result.agents.length} agents, ` +
                `${result.instructions.length} instructions, ` +
                `${result.skills.length} skills`,
            );
        }),

        // ── Deploy single agent file from explorer context menu ───────────────

        // ── Manual Remediation UX commands ───────────────────────────────────

        vscode.commands.registerCommand('projectMemory.showSyncReport', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const workspaceId = await resolveActiveWorkspaceId(connectionManager);
            if (!workspaceId) {
                vscode.window.showErrorMessage('No registered workspace found. Ensure the MCP server is running.');
                return;
            }

            let report: WorkspaceConfigSyncReport;
            try {
                report = await connectionManager.checkWorkspaceConfigSync(workspaceId);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to fetch sync report: ${error}`);
                return;
            }

            if (!syncReportChannel) {
                syncReportChannel = vscode.window.createOutputChannel('Project Memory Workspace Sync');
            }
            syncReportChannel.clear();
            syncReportChannel.appendLine('=== Project Memory Workspace Sync Report ===');
            syncReportChannel.appendLine(`Workspace: ${workspacePath}`);
            syncReportChannel.appendLine(`Mode: ${report.report_mode}`);
            syncReportChannel.appendLine('');

            const s = report.summary;
            syncReportChannel.appendLine(
                `Summary:  total=${s.total}  in_sync=${s.in_sync}  local_only=${s.local_only}` +
                `  db_only=${s.db_only}  content_mismatch=${s.content_mismatch}` +
                `  protected_drift=${s.protected_drift}  ignored_local=${s.ignored_local}` +
                `  import_candidate=${s.import_candidate}`
            );
            syncReportChannel.appendLine('');

            const allEntries: WorkspaceConfigSyncEntry[] = [...report.agents, ...report.instructions];
            const groups: Partial<Record<WorkspaceConfigSyncEntry['status'], WorkspaceConfigSyncEntry[]>> = {};
            for (const entry of allEntries) {
                const list = groups[entry.status] ?? (groups[entry.status] = []);
                list.push(entry);
            }

            const statusOrder: WorkspaceConfigSyncEntry['status'][] = [
                'protected_drift', 'content_mismatch', 'db_only', 'local_only',
                'import_candidate', 'in_sync', 'ignored_local',
            ];
            for (const status of statusOrder) {
                const entries = groups[status];
                if (!entries || entries.length === 0) { continue; }
                syncReportChannel.appendLine(`--- ${status.toUpperCase()} (${entries.length}) ---`);
                for (const entry of entries) {
                    syncReportChannel.appendLine(`  [${entry.kind}] ${entry.filename}`);
                    syncReportChannel.appendLine(`    Path:        ${entry.relative_path}`);
                    syncReportChannel.appendLine(`    Remediation: ${entry.remediation}`);
                }
                syncReportChannel.appendLine('');
            }

            syncReportChannel.show();
        }),

        vscode.commands.registerCommand('projectMemory.importContextFile', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspaceId = await resolveActiveWorkspaceId(connectionManager);
            if (!workspaceId) {
                vscode.window.showErrorMessage('No registered workspace found. Ensure the MCP server is running.');
                return;
            }

            let report: WorkspaceConfigSyncReport;
            try {
                report = await connectionManager.checkWorkspaceConfigSync(workspaceId);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to fetch sync report: ${error}`);
                return;
            }

            const candidates = [...report.agents, ...report.instructions]
                .filter((e): e is WorkspaceConfigSyncEntry => e.status === 'import_candidate');

            if (candidates.length === 0) {
                vscode.window.showInformationMessage('No import-eligible files found');
                return;
            }

            const items: vscode.QuickPickItem[] = candidates.map(e => ({
                label: e.filename,
                detail: e.relative_path,
                description: e.kind,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                placeHolder: 'Select a file to import into the database',
                title: 'Import Context File to Database',
            });
            if (!selected) { return; }

            const entry = candidates.find(
                e => e.filename === selected.label && e.relative_path === selected.detail
            );
            if (!entry) { return; }

            const confirmed = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Import ${entry.filename} to database?`,
            });
            if (confirmed !== 'Yes') { return; }

            try {
                await connectionManager.callTool('memory_workspace', {
                    action: 'import_context_file',
                    workspace_id: workspaceId,
                    relative_path: entry.relative_path,
                    confirm: true,
                    expected_kind: entry.kind,
                });
                notify(`Imported ${entry.filename} into the database`);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to import ${entry.filename}: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.redeployMandatoryFiles', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const workspaceId = await resolveActiveWorkspaceId(connectionManager);
            if (!workspaceId) {
                vscode.window.showErrorMessage('No registered workspace found. Ensure the MCP server is running.');
                return;
            }

            let report: WorkspaceConfigSyncReport;
            try {
                report = await connectionManager.checkWorkspaceConfigSync(workspaceId);
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to fetch sync report: ${error}`);
                return;
            }

            const driftEntries = [...report.agents, ...report.instructions]
                .filter((e): e is WorkspaceConfigSyncEntry => e.status === 'protected_drift');

            if (driftEntries.length === 0) {
                vscode.window.showInformationMessage('All mandatory PM-controlled files are in sync');
                return;
            }

            const items: vscode.QuickPickItem[] = driftEntries.map(e => ({
                label: e.filename,
                detail: e.relative_path,
                description: e.kind,
                picked: true,
            }));

            const selected = await vscode.window.showQuickPick(items, {
                canPickMany: true,
                placeHolder: 'Select files to redeploy from canonical seed',
                title: 'Redeploy Mandatory PM Files',
            });
            if (!selected || selected.length === 0) { return; }

            const confirmed = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: 'Redeploy selected files from canonical seed?',
            });
            if (confirmed !== 'Yes') { return; }

            const result = await defaultDeployer.updateWorkspace(workspacePath);
            if (result.updated.length > 0 || result.added.length > 0) {
                notify(`Redeployed: ${result.updated.length} updated, ${result.added.length} added`);
            } else {
                notify('Files redeployed successfully');
            }
        }),

        // ── Manifest enforcement: health check + cull + deploy mandatory ──

        vscode.commands.registerCommand('projectMemory.enforceManifest', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const report = defaultDeployer.healthCheck(workspacePath);

            if (report.healthy) {
                notify('Workspace is fully compliant with the context manifest');
                return;
            }

            // Build a human-readable summary
            const parts: string[] = [];
            if (report.missingMandatory.length > 0) {
                parts.push(`${report.missingMandatory.length} mandatory file(s) missing`);
            }
            if (report.cullTargets.length > 0) {
                parts.push(`${report.cullTargets.length} DB-only file(s) to cull`);
            }
            if (report.workspaceSpecific.length > 0) {
                parts.push(`${report.workspaceSpecific.length} workspace-specific file(s) preserved`);
            }

            const confirm = await vscode.window.showQuickPick(['Yes', 'No'], {
                placeHolder: `Enforce manifest? ${parts.join(', ')}`,
                title: 'Enforce Workspace Context Manifest',
            });
            if (confirm !== 'Yes') return;

            const result = await defaultDeployer.enforceManifest(workspacePath);

            const summary: string[] = [];
            if (result.deployed.length > 0) {
                summary.push(`deployed ${result.deployed.length}`);
            }
            if (result.culled.length > 0) {
                summary.push(`culled ${result.culled.length}`);
            }
            if (result.workspaceSpecific.length > 0) {
                summary.push(`${result.workspaceSpecific.length} workspace-specific preserved`);
            }
            notify(`Manifest enforced: ${summary.join(', ')}`);
        }),

        vscode.commands.registerCommand('projectMemory.manifestHealthCheck', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const report = defaultDeployer.healthCheck(workspacePath);

            if (!syncReportChannel) {
                syncReportChannel = vscode.window.createOutputChannel('Project Memory Workspace Sync');
            }
            syncReportChannel.clear();
            syncReportChannel.appendLine('=== Context Manifest Health Check ===');
            syncReportChannel.appendLine(`Workspace: ${workspacePath}`);
            syncReportChannel.appendLine(`Status: ${report.healthy ? 'HEALTHY' : 'ACTION REQUIRED'}`);
            syncReportChannel.appendLine('');

            if (report.missingMandatory.length > 0) {
                syncReportChannel.appendLine(`--- MISSING MANDATORY (${report.missingMandatory.length}) ---`);
                for (const m of report.missingMandatory) {
                    syncReportChannel.appendLine(`  [${m.kind}] ${m.name}`);
                }
                syncReportChannel.appendLine('');
            }

            if (report.cullTargets.length > 0) {
                syncReportChannel.appendLine(`--- CULL TARGETS (${report.cullTargets.length}) ---`);
                for (const c of report.cullTargets) {
                    syncReportChannel.appendLine(`  [${c.kind}] ${c.name}  →  ${c.path}`);
                }
                syncReportChannel.appendLine('');
            }

            if (report.workspaceSpecific.length > 0) {
                syncReportChannel.appendLine(`--- WORKSPACE-SPECIFIC (preserved) (${report.workspaceSpecific.length}) ---`);
                for (const ws of report.workspaceSpecific) {
                    syncReportChannel.appendLine(`  [${ws.kind}] ${ws.name}  →  ${ws.path}`);
                }
                syncReportChannel.appendLine('');
            }

            syncReportChannel.show();
        }),

        vscode.commands.registerCommand('projectMemory.deployAgentFileToWorkspace', async (uri?: vscode.Uri) => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            // If called without URI (command palette), prompt for a file
            let sourceUri = uri;
            if (!sourceUri) {
                const picked = await vscode.window.showOpenDialog({
                    canSelectMany: false,
                    filters: { 'Agent Files': ['md'] },
                    title: 'Select agent file to deploy',
                });
                if (!picked || picked.length === 0) return;
                sourceUri = picked[0];
            }

            const sourceFile = sourceUri.fsPath;
            const fileName = path.basename(sourceFile);

            if (!fileName.endsWith('.agent.md')) {
                vscode.window.showWarningMessage(`Not an agent file: ${fileName}`);
                return;
            }

            const targetDir = path.join(workspaceFolders[0].uri.fsPath, '.github', 'agents');
            fs.mkdirSync(targetDir, { recursive: true });
            const targetFile = path.join(targetDir, fileName);
            fs.copyFileSync(sourceFile, targetFile);

            notify(`Deployed ${fileName} to ${path.relative(workspaceFolders[0].uri.fsPath, targetFile)}`);
        })
    );
}
