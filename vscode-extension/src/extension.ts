/**
 * Project Memory Dashboard - VS Code Extension
 * 
 * Provides a visual dashboard for the Project Memory MCP server,
 * allowing users to monitor agent workflows, plans, and handoffs.
 */

import * as vscode from 'vscode';
import { DashboardViewProvider } from './providers/DashboardViewProvider';
import { AgentWatcher } from './watchers/AgentWatcher';
import { CopilotFileWatcher } from './watchers/CopilotFileWatcher';
import { StatusBarManager } from './ui/StatusBarManager';
import { ServerManager } from './server/ServerManager';
import { DefaultDeployer } from './deployer/DefaultDeployer';
import { DashboardPanel } from './ui/DashboardPanel';
import { McpBridge, ChatParticipant, ToolProvider } from './chat';

let dashboardProvider: DashboardViewProvider;
let agentWatcher: AgentWatcher;
let copilotFileWatcher: CopilotFileWatcher;
let statusBarManager: StatusBarManager;
let serverManager: ServerManager;
let defaultDeployer: DefaultDeployer;

// Chat integration components
let mcpBridge: McpBridge | null = null;
let chatParticipant: ChatParticipant | null = null;
let toolProvider: ToolProvider | null = null;

/**
 * Show an information message if notifications are enabled
 */
function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

export function activate(context: vscode.ExtensionContext) {
    console.log('Project Memory Dashboard extension activating...');

    // Get configuration
    const config = vscode.workspace.getConfiguration('projectMemory');
    const dataRoot = config.get<string>('dataRoot') || getDefaultDataRoot();
    const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
    const promptsRoot = config.get<string>('promptsRoot');
    const instructionsRoot = config.get<string>('instructionsRoot');
    const serverPort = config.get<number>('serverPort') || 3001;
    const wsPort = config.get<number>('wsPort') || 3002;
    const autoStartServer = config.get<boolean>('autoStartServer') ?? true;
    const defaultAgents = config.get<string[]>('defaultAgents') || [];
    const defaultInstructions = config.get<string[]>('defaultInstructions') || [];
    const autoDeployOnWorkspaceOpen = config.get<boolean>('autoDeployOnWorkspaceOpen') ?? false;

    // Initialize the default deployer
    defaultDeployer = new DefaultDeployer({
        agentsRoot,
        instructionsRoot: instructionsRoot || getDefaultInstructionsRoot(),
        defaultAgents,
        defaultInstructions,
    });

    // Auto-deploy on workspace open if enabled
    if (autoDeployOnWorkspaceOpen && vscode.workspace.workspaceFolders?.[0]) {
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        defaultDeployer.deployToWorkspace(workspacePath).then(result => {
            if (result.agents.length > 0 || result.instructions.length > 0) {
                notify(
                    `Deployed ${result.agents.length} agents and ${result.instructions.length} instructions`
                );
            }
        });
    }

    // Initialize and start the dashboard server
    serverManager = new ServerManager({
        dataRoot,
        agentsRoot,
        promptsRoot,
        instructionsRoot,
        serverPort,
        wsPort,
    });
    context.subscriptions.push(serverManager);

    // Auto-start server if configured (frontend is started on-demand only)
    if (autoStartServer) {
        serverManager.start().then(async success => {
            if (success) {
                if (serverManager.isExternalServer) {
                    notify('Connected to existing Project Memory server');
                } else {
                    notify('Project Memory API server started');
                }
                // Frontend is now started on-demand when "Open Full Dashboard" is clicked
            } else {
                vscode.window.showWarningMessage(
                    'Failed to start Project Memory server. Click to view logs.',
                    'View Logs'
                ).then(selection => {
                    if (selection === 'View Logs') {
                        serverManager.showLogs();
                    }
                });
            }
        });
    }

    // ========== Chat Integration Setup ==========
    initializeChatIntegration(context, config, dataRoot);

    // Create dashboard view provider
    dashboardProvider = new DashboardViewProvider(context.extensionUri, dataRoot, agentsRoot);

    // Register webview provider
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'projectMemory.dashboardView',
            dashboardProvider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true
                }
            }
        )
    );

    // Register commands
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showDashboard', () => {
            vscode.commands.executeCommand('workbench.view.extension.projectMemory');
        }),

        vscode.commands.registerCommand('projectMemory.openDashboardPanel', async (url?: string) => {
            // First check if API server is running
            if (!serverManager.isRunning) {
                const startServer = await vscode.window.showWarningMessage(
                    'Project Memory server is not running. Start it first?',
                    'Start Server', 'Cancel'
                );
                if (startServer !== 'Start Server') return;
                
                const success = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Starting Project Memory server...',
                    cancellable: false
                }, async () => {
                    return await serverManager.start();
                });
                
                if (!success) {
                    vscode.window.showErrorMessage('Failed to start server. Check logs for details.');
                    serverManager.showLogs();
                    return;
                }
            }

            // Start frontend on-demand if not already running
            if (!serverManager.isFrontendRunning) {
                const success = await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Starting dashboard frontend...',
                    cancellable: false
                }, async () => {
                    return await serverManager.startFrontend();
                });
                
                if (!success) {
                    vscode.window.showErrorMessage('Failed to start dashboard frontend. Check server logs.');
                    serverManager.showLogs();
                    return;
                }
            }
            
            const dashboardUrl = url || 'http://localhost:5173';
            DashboardPanel.createOrShow(context.extensionUri, dashboardUrl);
        }),

        // Server management commands
        vscode.commands.registerCommand('projectMemory.toggleServer', async () => {
            if (serverManager.isRunning) {
                await serverManager.stopFrontend();
                await serverManager.stop();
                notify('Project Memory server stopped');
            } else {
                const success = await serverManager.start();
                if (success) {
                    notify('Project Memory server started');
                } else {
                    vscode.window.showErrorMessage('Failed to start Project Memory server');
                }
            }
        }),

        vscode.commands.registerCommand('projectMemory.startServer', async () => {
            if (serverManager.isRunning) {
                notify('Server is already running');
                return;
            }
            const success = await serverManager.start();
            if (success) {
                notify('Project Memory server started');
            } else {
                vscode.window.showErrorMessage('Failed to start server. Check logs for details.');
                serverManager.showLogs();
            }
        }),

        vscode.commands.registerCommand('projectMemory.stopServer', async () => {
            await serverManager.stopFrontend();
            await serverManager.stop();
            notify('Project Memory server stopped');
        }),

        vscode.commands.registerCommand('projectMemory.restartServer', async () => {
            notify('Restarting Project Memory server...');
            await serverManager.stopFrontend();
            const success = await serverManager.restart();
            if (success) {
                notify('Project Memory server restarted');
            } else {
                vscode.window.showErrorMessage('Failed to restart server');
            }
        }),

        vscode.commands.registerCommand('projectMemory.showServerLogs', () => {
            serverManager.showLogs();
        }),

        vscode.commands.registerCommand('projectMemory.openSettings', async () => {
            // Show a menu to configure defaults
            const config = vscode.workspace.getConfiguration('projectMemory');
            const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
            const instructionsRoot = config.get<string>('instructionsRoot') || getDefaultInstructionsRoot();
            const promptsRoot = config.get<string>('promptsRoot') || getDefaultPromptsRoot();
            
            const choice = await vscode.window.showQuickPick([
                { label: '$(person) Configure Default Agents', description: 'Select which agents to deploy by default', value: 'agents' },
                { label: '$(book) Configure Default Instructions', description: 'Select which instructions to deploy by default', value: 'instructions' },
                { label: '$(file) Configure Default Prompts', description: 'Select which prompts to deploy by default', value: 'prompts' },
                { label: '$(gear) Open All Settings', description: 'Open VS Code settings for Project Memory', value: 'settings' }
            ], {
                placeHolder: 'What would you like to configure?'
            });

            if (!choice) return;

            const fs = require('fs');

            if (choice.value === 'settings') {
                vscode.commands.executeCommand('workbench.action.openSettings', '@ext:project-memory.project-memory-dashboard');
                return;
            }

            if (choice.value === 'agents' && agentsRoot) {
                try {
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
                        notify(`✅ Updated default agents (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read agents: ${error}`);
                }
            }

            if (choice.value === 'instructions' && instructionsRoot) {
                try {
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
                        notify(`✅ Updated default instructions (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read instructions: ${error}`);
                }
            }

            if (choice.value === 'prompts' && promptsRoot) {
                try {
                    const allPromptFiles = fs.readdirSync(promptsRoot)
                        .filter((f: string) => f.endsWith('.prompt.md'))
                        .map((f: string) => f.replace('.prompt.md', ''));
                    
                    const currentDefaults = config.get<string[]>('defaultPrompts') || [];
                    
                    const items: vscode.QuickPickItem[] = allPromptFiles.map((name: string) => ({
                        label: name,
                        picked: currentDefaults.length === 0 || currentDefaults.includes(name)
                    }));

                    const selected = await vscode.window.showQuickPick(items, {
                        canPickMany: true,
                        placeHolder: 'Select default prompts (these will be pre-selected when deploying)',
                        title: 'Configure Default Prompts'
                    });

                    if (selected) {
                        await config.update('defaultPrompts', selected.map(s => s.label), vscode.ConfigurationTarget.Global);
                        notify(`✅ Updated default prompts (${selected.length} selected)`);
                    }
                } catch (error) {
                    vscode.window.showErrorMessage(`Failed to read prompts: ${error}`);
                }
            }
        }),

        vscode.commands.registerCommand('projectMemory.createPlan', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            // First ask if user wants to brainstorm or create directly
            const approach = await vscode.window.showQuickPick(
                [
                    { label: '🧠 Brainstorm First', description: 'Explore ideas with an AI agent before creating a formal plan', value: 'brainstorm' },
                    { label: '📝 Create Plan Directly', description: 'Create a formal plan with title, description, and category', value: 'create' }
                ],
                { placeHolder: 'How would you like to start?' }
            );

            if (!approach) return;

            if (approach.value === 'brainstorm') {
                // Open a chat with the brainstorm agent
                const initialPrompt = await vscode.window.showInputBox({
                    prompt: 'What would you like to brainstorm?',
                    placeHolder: 'Describe the feature, problem, or idea you want to explore...',
                    validateInput: (value) => value.trim() ? null : 'Please enter a description'
                });

                if (!initialPrompt) return;

                // Try to open chat with brainstorm agent
                try {
                    await vscode.commands.executeCommand('workbench.action.chat.open', {
                        query: `@brainstorm ${initialPrompt}`
                    });
                } catch {
                    // Fallback: show the prompt to copy
                    const result = await vscode.window.showInformationMessage(
                        'Open GitHub Copilot Chat and use @brainstorm agent with your prompt.',
                        'Copy Prompt'
                    );
                    if (result === 'Copy Prompt') {
                        await vscode.env.clipboard.writeText(`@brainstorm ${initialPrompt}`);
                        notify('Prompt copied to clipboard');
                    }
                }
                return;
            }

            // Direct plan creation flow
            const title = await vscode.window.showInputBox({
                prompt: 'Enter plan title',
                placeHolder: 'My new feature...',
                validateInput: (value) => value.trim() ? null : 'Title is required'
            });

            if (!title) return;

            const description = await vscode.window.showInputBox({
                prompt: 'Enter plan description',
                placeHolder: 'Describe what this plan will accomplish, the goals, and any context...',
                validateInput: (value) => value.trim().length >= 10 ? null : 'Please provide at least a brief description (10+ characters)'
            });

            if (!description) return;

            const category = await vscode.window.showQuickPick(
                [
                    { label: '✨ Feature', description: 'New functionality or capability', value: 'feature' },
                    { label: '🐛 Bug', description: 'Fix for an existing issue', value: 'bug' },
                    { label: '🔄 Change', description: 'Modification to existing behavior', value: 'change' },
                    { label: '🔍 Analysis', description: 'Investigation or research task', value: 'analysis' },
                    { label: '🐞 Debug', description: 'Debugging session for an issue', value: 'debug' },
                    { label: '♻️ Refactor', description: 'Code improvement without behavior change', value: 'refactor' },
                    { label: '📚 Documentation', description: 'Documentation updates', value: 'documentation' }
                ],
                { placeHolder: 'Select plan category' }
            );

            if (!category) return;

            const priority = await vscode.window.showQuickPick(
                [
                    { label: '🔴 Critical', description: 'Urgent - needs immediate attention', value: 'critical' },
                    { label: '🟠 High', description: 'Important - should be done soon', value: 'high' },
                    { label: '🟡 Medium', description: 'Normal priority', value: 'medium' },
                    { label: '🟢 Low', description: 'Nice to have - when time permits', value: 'low' }
                ],
                { placeHolder: 'Select priority level' }
            );

            if (!priority) return;

            // Call API to create plan
            const workspacePath = workspaceFolders[0].uri.fsPath;
            const name = require('path').basename(workspacePath).toLowerCase().replace(/[^a-z0-9]/g, '_').substring(0, 20);
            const hash = require('crypto').createHash('md5').update(workspacePath).digest('hex').substring(0, 12);
            const workspaceId = `${name}-${hash}`;

            try {
                const response = await fetch(`http://localhost:${serverPort}/api/plans`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        workspaceId,
                        title,
                        description,
                        category: category.value,
                        priority: priority.value
                    })
                });

                if (response.ok) {
                    const data = await response.json();
                    notify(`Plan created: ${title}`, 'Open Dashboard').then(selection => {
                        if (selection === 'Open Dashboard') {
                            vscode.commands.executeCommand('projectMemory.openDashboardPanel', 
                                `http://localhost:5173/workspace/${workspaceId}/plan/${data.planId}`);
                        }
                    });
                } else {
                    const error = await response.text();
                    vscode.window.showErrorMessage(`Failed to create plan: ${error}`);
                }
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to create plan: ${error}`);
            }
        }),

        vscode.commands.registerCommand('projectMemory.deployAgents', async () => {
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            const config = vscode.workspace.getConfiguration('projectMemory');
            const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
            const defaultAgents = config.get<string[]>('defaultAgents') || [];
            
            if (!agentsRoot) {
                vscode.window.showErrorMessage('Agents root not configured. Set projectMemory.agentsRoot in settings.');
                return;
            }

            const workspacePath = workspaceFolders[0].uri.fsPath;
            const fs = require('fs');
            const path = require('path');
            
            try {
                // Get list of all agent files
                const allAgentFiles = fs.readdirSync(agentsRoot)
                    .filter((f: string) => f.endsWith('.agent.md'));
                
                if (allAgentFiles.length === 0) {
                    vscode.window.showWarningMessage('No agent files found in agents root');
                    return;
                }

                // Create quick pick items with pre-selection based on defaults
                const items: vscode.QuickPickItem[] = allAgentFiles.map((f: string) => {
                    const name = f.replace('.agent.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultAgents.length === 0 || defaultAgents.includes(name)
                    };
                });

                // Show multi-select quick pick
                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select agents to deploy',
                    title: 'Deploy Agents'
                });

                if (!selectedItems || selectedItems.length === 0) {
                    return; // User cancelled or selected nothing
                }

                // Create target directory
                const targetDir = path.join(workspacePath, '.github', 'agents');
                fs.mkdirSync(targetDir, { recursive: true });

                // Copy selected agent files
                let copiedCount = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.agent.md`;
                    const sourcePath = path.join(agentsRoot, file);
                    const targetPath = path.join(targetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    copiedCount++;
                }

                // Update the sidebar to show success
                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { 
                        type: 'agents',
                        count: copiedCount,
                        targetDir 
                    }
                });

                notify(
                    `✅ Deployed ${copiedCount} agent(s) to ${path.relative(workspacePath, targetDir)}`,
                    'Open Folder'
                ).then(selection => {
                    if (selection === 'Open Folder') {
                        vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(targetDir));
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
            const fs = require('fs');
            const path = require('path');
            
            try {
                // Get list of all prompt files
                const allPromptFiles = fs.readdirSync(promptsRoot)
                    .filter((f: string) => f.endsWith('.prompt.md'));
                
                if (allPromptFiles.length === 0) {
                    vscode.window.showWarningMessage('No prompt files found in prompts root');
                    return;
                }

                // Create quick pick items with pre-selection based on defaults
                const items: vscode.QuickPickItem[] = allPromptFiles.map((f: string) => {
                    const name = f.replace('.prompt.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultPrompts.length === 0 || defaultPrompts.includes(name)
                    };
                });

                // Show multi-select quick pick
                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select prompts to deploy',
                    title: 'Deploy Prompts'
                });

                if (!selectedItems || selectedItems.length === 0) {
                    return; // User cancelled or selected nothing
                }

                // Create target directory
                const targetDir = path.join(workspacePath, '.github', 'prompts');
                fs.mkdirSync(targetDir, { recursive: true });

                // Copy selected prompt files
                let copiedCount = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.prompt.md`;
                    const sourcePath = path.join(promptsRoot, file);
                    const targetPath = path.join(targetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    copiedCount++;
                }

                // Update the sidebar to show success
                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { 
                        type: 'prompts',
                        count: copiedCount,
                        targetDir 
                    }
                });

                notify(
                    `✅ Deployed ${copiedCount} prompt(s) to ${path.relative(workspacePath, targetDir)}`,
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
            const fs = require('fs');
            const path = require('path');
            
            try {
                // Get list of all instruction files
                const allInstructionFiles = fs.readdirSync(instructionsRoot)
                    .filter((f: string) => f.endsWith('.instructions.md'));
                
                if (allInstructionFiles.length === 0) {
                    vscode.window.showWarningMessage('No instruction files found in instructions root');
                    return;
                }

                // Create quick pick items with pre-selection based on defaults
                const items: vscode.QuickPickItem[] = allInstructionFiles.map((f: string) => {
                    const name = f.replace('.instructions.md', '');
                    return {
                        label: name,
                        description: f,
                        picked: defaultInstructions.length === 0 || defaultInstructions.includes(name)
                    };
                });

                // Show multi-select quick pick
                const selectedItems = await vscode.window.showQuickPick(items, {
                    canPickMany: true,
                    placeHolder: 'Select instructions to deploy',
                    title: 'Deploy Instructions'
                });

                if (!selectedItems || selectedItems.length === 0) {
                    return; // User cancelled or selected nothing
                }

                // Create target directory
                const targetDir = path.join(workspacePath, '.github', 'instructions');
                fs.mkdirSync(targetDir, { recursive: true });

                // Copy selected instruction files
                let copiedCount = 0;
                for (const item of selectedItems) {
                    const file = `${item.label}.instructions.md`;
                    const sourcePath = path.join(instructionsRoot, file);
                    const targetPath = path.join(targetDir, file);
                    fs.copyFileSync(sourcePath, targetPath);
                    copiedCount++;
                }

                // Update the sidebar to show success
                dashboardProvider.postMessage({
                    type: 'deploymentComplete',
                    data: { 
                        type: 'instructions',
                        count: copiedCount,
                        targetDir 
                    }
                });

                notify(
                    `✅ Deployed ${copiedCount} instruction(s) to ${path.relative(workspacePath, targetDir)}`,
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
        }),

        vscode.commands.registerCommand('projectMemory.openAgentFile', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
            
            if (!agentsRoot) {
                vscode.window.showErrorMessage('Agents root not configured');
                return;
            }

            const fs = require('fs');
            const path = require('path');
            
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

            const fs = require('fs');
            const path = require('path');
            
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

        vscode.commands.registerCommand('projectMemory.refreshData', () => {
            dashboardProvider.postMessage({ type: 'refresh' });
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
            } catch (error) {
                vscode.window.showErrorMessage(`Failed to open file: ${filePath}`);
            }
        }),

        // Add to Plan command - context menu for files
        vscode.commands.registerCommand('projectMemory.addToPlan', async (uri?: vscode.Uri) => {
            // Get the file path from context or active editor
            let filePath: string | undefined;
            let selectedText: string | undefined;
            let lineNumber: number | undefined;

            if (uri) {
                // Called from explorer context menu
                filePath = uri.fsPath;
            } else {
                // Called from editor context menu or command palette
                const editor = vscode.window.activeTextEditor;
                if (editor) {
                    filePath = editor.document.uri.fsPath;
                    const selection = editor.selection;
                    if (!selection.isEmpty) {
                        selectedText = editor.document.getText(selection);
                        lineNumber = selection.start.line + 1;
                    }
                }
            }

            if (!filePath) {
                vscode.window.showErrorMessage('No file selected');
                return;
            }

            // Get available workspaces and plans
            const workspaceFolders = vscode.workspace.workspaceFolders;
            if (!workspaceFolders) {
                vscode.window.showErrorMessage('No workspace folder open');
                return;
            }

            // Ask user for step description
            const stepTask = await vscode.window.showInputBox({
                prompt: 'Describe the step/task for this file',
                placeHolder: 'e.g., Review and update authentication logic',
                value: selectedText ? `Review: ${selectedText.substring(0, 50)}...` : `Work on ${require('path').basename(filePath)}`,
            });

            if (!stepTask) {
                return; // User cancelled
            }

            // Ask for phase
            const phase = await vscode.window.showQuickPick(
                ['implementation', 'review', 'testing', 'documentation', 'refactor', 'bugfix'],
                { placeHolder: 'Select the phase for this step' }
            );

            if (!phase) {
                return; // User cancelled
            }

            // Send to dashboard to add to active plan
            dashboardProvider.postMessage({
                type: 'addStepToPlan',
                data: {
                    task: stepTask,
                    phase: phase,
                    file: filePath,
                    line: lineNumber,
                    notes: selectedText ? `Selected code:\n\`\`\`\n${selectedText.substring(0, 500)}\n\`\`\`` : undefined,
                }
            });

            notify(`Added step to plan: "${stepTask}"`);
        })
    );

    // Initialize agent watcher for hot-reload
    if (agentsRoot) {
        agentWatcher = new AgentWatcher(agentsRoot, config.get<boolean>('autoDeployAgents') || false);
        agentWatcher.start();
        context.subscriptions.push({
            dispose: () => agentWatcher.stop()
        });
    }

    // Initialize Copilot file watcher for prompts and instructions
    copilotFileWatcher = new CopilotFileWatcher({
        agentsRoot,
        promptsRoot,
        instructionsRoot,
        autoDeploy: config.get<boolean>('autoDeployAgents') || false
    });
    copilotFileWatcher.start();
    
    // Listen for file changes and update status bar
    copilotFileWatcher.onFileChanged((type, filePath, action) => {
        if (action === 'change') {
            statusBarManager.showTemporaryMessage(`${type} updated`);
        }
    });
    
    context.subscriptions.push({
        dispose: () => copilotFileWatcher.stop()
    });

    // Initialize status bar
    statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('projectMemory')) {
                const newConfig = vscode.workspace.getConfiguration('projectMemory');
                dashboardProvider.updateConfig(
                    newConfig.get<string>('dataRoot') || getDefaultDataRoot(),
                    newConfig.get<string>('agentsRoot') || getDefaultAgentsRoot()
                );
            }
        })
    );

    console.log('Project Memory Dashboard extension activated');
}

export async function deactivate() {
    console.log('Project Memory Dashboard extension deactivating...');
    
    // Dispose chat integration components
    if (mcpBridge) {
        await mcpBridge.disconnect();
        mcpBridge.dispose();
        mcpBridge = null;
    }
    if (chatParticipant) {
        chatParticipant.dispose();
        chatParticipant = null;
    }
    if (toolProvider) {
        toolProvider.dispose();
        toolProvider = null;
    }
    
    // Dispose dashboard provider listeners
    if (dashboardProvider) {
        dashboardProvider.dispose();
    }
    
    // Stop watchers
    if (agentWatcher) {
        agentWatcher.stop();
    }
    if (copilotFileWatcher) {
        copilotFileWatcher.stop();
    }
    
    // Stop both servers gracefully
    if (serverManager) {
        await serverManager.stopFrontend();
        await serverManager.stop();
    }
    
    console.log('Project Memory Dashboard extension deactivated');
}

function getDefaultDataRoot(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        return vscode.Uri.joinPath(workspaceFolders[0].uri, 'data').fsPath;
    }
    return '';
}

function getDefaultAgentsRoot(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        return vscode.Uri.joinPath(workspaceFolders[0].uri, 'agents').fsPath;
    }
    return '';
}

function getDefaultInstructionsRoot(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        return vscode.Uri.joinPath(workspaceFolders[0].uri, 'instructions').fsPath;
    }
    return '';
}

function getDefaultPromptsRoot(): string {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders) {
        return vscode.Uri.joinPath(workspaceFolders[0].uri, 'prompts').fsPath;
    }
    return '';
}

/**
 * Initialize Chat Integration (Copilot Chat participant and LM Tools)
 */
function initializeChatIntegration(
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration,
    dataRoot: string
): void {
    // Get chat-specific configuration
    const serverMode = config.get<'bundled' | 'podman' | 'external'>('chat.serverMode') || 'bundled';
    const podmanImage = config.get<string>('chat.podmanImage') || 'project-memory-mcp:latest';
    const externalServerPath = config.get<string>('chat.externalServerPath') || '';
    const autoConnect = config.get<boolean>('chat.autoConnect') ?? true;

    // Create MCP Bridge
    mcpBridge = new McpBridge({
        serverMode,
        podmanImage,
        externalServerPath,
        dataRoot
    });
    context.subscriptions.push(mcpBridge);

    // Listen for connection state changes
    mcpBridge.onConnectionChange((connected) => {
        if (connected) {
            // Reset workspace in chat components when reconnected
            chatParticipant?.resetWorkspace();
            toolProvider?.resetWorkspace();
        }
    });

    // Create Chat Participant
    chatParticipant = new ChatParticipant(mcpBridge);
    context.subscriptions.push(chatParticipant);

    // Create Tool Provider
    toolProvider = new ToolProvider(mcpBridge);
    context.subscriptions.push(toolProvider);

    // Register reconnect command
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.chat.reconnect', async () => {
            if (!mcpBridge) {
                vscode.window.showErrorMessage('MCP Bridge not initialized');
                return;
            }

            try {
                await vscode.window.withProgress({
                    location: vscode.ProgressLocation.Notification,
                    title: 'Reconnecting to MCP server...',
                    cancellable: false
                }, async () => {
                    await mcpBridge!.reconnect();
                });

                notify('Connected to MCP server');
            } catch (error) {
                const message = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(`Failed to connect: ${message}`);
                mcpBridge.showLogs();
            }
        })
    );

    // Auto-connect if configured
    if (autoConnect) {
        mcpBridge.connect().then(() => {
            console.log('MCP Bridge connected');
        }).catch((error) => {
            console.warn('MCP Bridge auto-connect failed:', error);
            // Don't show error on auto-connect failure - user can manually reconnect
        });
    }

    // Listen for configuration changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('projectMemory.chat')) {
                // Notify user that restart may be needed for some settings
                notify(
                    'Chat configuration changed. Some changes may require reconnecting.',
                    'Reconnect'
                ).then(selection => {
                    if (selection === 'Reconnect') {
                        vscode.commands.executeCommand('projectMemory.chat.reconnect');
                    }
                });
            }
        })
    );

    // Listen for workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            // Reset workspace ID when folders change
            chatParticipant?.resetWorkspace();
            toolProvider?.resetWorkspace();
        })
    );

    console.log('Chat integration initialized');
}
