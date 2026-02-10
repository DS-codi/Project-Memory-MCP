/**
 * Project Memory Dashboard - VS Code Extension
 * 
 * Main entry point. Delegates to extracted command modules for a clean,
 * maintainable structure. Implements lazy server start (Phase 1.1/1.2):
 * the extension activates on startup but defers Express server spawn
 * until the first dashboard open, MCP tool call, or explicit command.
 */

import * as vscode from 'vscode';
import { DashboardViewProvider } from './providers/DashboardViewProvider';
import { AgentWatcher } from './watchers/AgentWatcher';
import { CopilotFileWatcher } from './watchers/CopilotFileWatcher';
import { StatusBarManager } from './ui/StatusBarManager';
import { ServerManager } from './server/ServerManager';
import { DefaultDeployer } from './deployer/DefaultDeployer';
import { McpBridge, ChatParticipant, ToolProvider } from './chat';
import { DiagnosticsService } from './services/DiagnosticsService';
import { notify } from './utils/helpers';
import { getDefaultDataRoot, getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultPromptsRoot } from './utils/defaults';
import { registerServerCommands, registerDeployCommands, registerPlanCommands, registerWorkspaceCommands } from './commands';

// --- Module-level state ---
let dashboardProvider: DashboardViewProvider;
let agentWatcher: AgentWatcher;
let copilotFileWatcher: CopilotFileWatcher;
let statusBarManager: StatusBarManager;
let serverManager: ServerManager;
let defaultDeployer: DefaultDeployer;
let diagnosticsService: DiagnosticsService;

// Chat integration components
let mcpBridge: McpBridge | null = null;
let chatParticipant: ChatParticipant | null = null;
let toolProvider: ToolProvider | null = null;

// Lazy server start state
let serverStartPromise: Promise<boolean> | null = null;

// --- Activation ---

export function activate(context: vscode.ExtensionContext) {
    console.log('Project Memory Dashboard extension activating...');

    // Read configuration
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

    // --- Initialize core services (lightweight, no I/O) ---

    defaultDeployer = new DefaultDeployer({
        agentsRoot,
        instructionsRoot: instructionsRoot || getDefaultInstructionsRoot(),
        defaultAgents,
        defaultInstructions,
    });

    serverManager = new ServerManager({
        dataRoot,
        agentsRoot,
        promptsRoot,
        instructionsRoot,
        serverPort,
        wsPort,
    });
    context.subscriptions.push(serverManager);

    dashboardProvider = new DashboardViewProvider(context.extensionUri, dataRoot, agentsRoot);

    // Lazy server start: when dashboard panel opens for the first time
    dashboardProvider.onFirstResolve(() => {
        ensureServerRunning();
    });

    statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);

    // --- Register webview provider ---
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'projectMemory.dashboardView',
            dashboardProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // --- Register all commands (no I/O, just registrations) ---
    const getServerPort = () => config.get<number>('serverPort') || 3001;

    registerServerCommands(context, serverManager, dashboardProvider, getServerPort);
    registerDeployCommands(context, dashboardProvider, defaultDeployer);
    registerPlanCommands(context, dashboardProvider, getServerPort);
    registerWorkspaceCommands(context, serverManager, dashboardProvider, () => mcpBridge);

    // --- Diagnostics service and command ---
    diagnosticsService = new DiagnosticsService(serverManager, () => mcpBridge, serverPort);
    context.subscriptions.push(diagnosticsService);

    // Start monitoring with 60s intervals (lightweight, non-blocking)
    diagnosticsService.startMonitoring(60_000);

    // Diagnostics status bar indicator
    const diagnosticsStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    diagnosticsStatusBar.command = 'projectMemory.showDiagnostics';
    diagnosticsStatusBar.text = '$(pulse) PM';
    diagnosticsStatusBar.tooltip = 'Project Memory: Click for diagnostics';
    diagnosticsStatusBar.show();
    context.subscriptions.push(diagnosticsStatusBar);

    diagnosticsService.onHealthChange(report => {
        const icons = { green: '$(check)', yellow: '$(warning)', red: '$(error)' };
        diagnosticsStatusBar.text = `${icons[report.health]} PM`;
        diagnosticsStatusBar.tooltip = report.issues.length > 0
            ? `Project Memory: ${report.issues.join('; ')}`
            : 'Project Memory: All systems healthy';
    });

    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showDiagnostics', async () => {
            const report = await diagnosticsService.runCheck();
            const channel = vscode.window.createOutputChannel('Project Memory Diagnostics');
            channel.clear();
            channel.appendLine(diagnosticsService.formatReport(report));
            channel.show();
        })
    );

    // --- Deferred heavy initialization ---
    // Auto-deploy on workspace open (if enabled — lightweight file copies)
    if (autoDeployOnWorkspaceOpen && vscode.workspace.workspaceFolders?.[0]) {
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        defaultDeployer.deployToWorkspace(workspacePath).then(result => {
            if (result.agents.length > 0 || result.instructions.length > 0) {
                notify(`Deployed ${result.agents.length} agents and ${result.instructions.length} instructions`);
            }
        });
    }

    // Server start: immediate only if autoStartServer is explicitly enabled;
    // otherwise the server starts lazily on first dashboard open or command
    if (autoStartServer && serverManager.hasServerDirectory()) {
        ensureServerRunning();
    }

    // Idle server timeout
    const idleTimeout = config.get<number>('idleServerTimeoutMinutes') || 0;
    if (idleTimeout > 0) {
        serverManager.startIdleMonitoring(idleTimeout);
    }

    // --- Chat integration (lightweight init, async connect) ---
    initializeChatIntegration(context, config, dataRoot);

    // --- File watchers (deferred to reduce activation overhead) ---
    setTimeout(() => {
        initializeWatchers(context, config, agentsRoot, promptsRoot, instructionsRoot);
    }, 2000);

    // --- Configuration change listener ---
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

// --- Deactivation ---

export async function deactivate() {
    console.log('Project Memory Dashboard extension deactivating...');

    // Dispose chat integration
    if (mcpBridge) {
        try {
            await mcpBridge.disconnect();
            mcpBridge.dispose();
        } catch (e) {
            console.error('Error disconnecting MCP bridge:', e);
        }
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

    // Dispose dashboard provider
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

    // Stop servers — ensure child process cleanup with timeout
    if (serverManager) {
        try {
            // Race against a 5s timeout to prevent hanging deactivation
            await Promise.race([
                (async () => {
                    await serverManager.stopFrontend();
                    await serverManager.stop();
                    await serverManager.forceStopOwnedServer();
                })(),
                new Promise<void>(resolve => setTimeout(resolve, 5000))
            ]);
        } catch (e) {
            console.error('Error stopping servers during deactivation:', e);
            // Last resort: force-stop owned server even if stop() failed
            try { await serverManager.forceStopOwnedServer(); } catch { /* ignore */ }
        }
    }

    console.log('Project Memory Dashboard extension deactivated');
}

// --- Private initialization helpers ---

/**
 * Ensures the Express server is running. Called lazily on first dashboard
 * panel open or explicit server command. Deduplicates concurrent calls.
 */
export async function ensureServerRunning(): Promise<boolean> {
    if (!serverManager) { return false; }
    if (serverManager.isRunning) { return true; }
    if (!serverManager.hasServerDirectory()) { return false; }

    // Deduplicate: if a start is already in progress, await it
    if (serverStartPromise) { return serverStartPromise; }

    serverStartPromise = serverManager.start().then(success => {
        serverStartPromise = null;
        if (success) {
            if (serverManager.isExternalServer) {
                notify('Connected to existing Project Memory server');
            } else {
                notify('Project Memory API server started');
            }
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
        return success;
    }).catch(err => {
        serverStartPromise = null;
        console.error('Server start failed:', err);
        return false;
    });

    return serverStartPromise;
}

function initializeChatIntegration(
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration,
    dataRoot: string
): void {
    const serverMode = config.get<'bundled' | 'podman' | 'external'>('chat.serverMode') || 'bundled';
    const podmanImage = config.get<string>('chat.podmanImage') || 'project-memory-mcp:latest';
    const externalServerPath = config.get<string>('chat.externalServerPath') || '';
    const autoConnect = config.get<boolean>('chat.autoConnect') ?? true;

    mcpBridge = new McpBridge({ serverMode, podmanImage, externalServerPath, dataRoot });
    context.subscriptions.push(mcpBridge);

    mcpBridge.onConnectionChange((connected) => {
        if (connected) {
            chatParticipant?.resetWorkspace();
            toolProvider?.resetWorkspace();
        }
    });

    chatParticipant = new ChatParticipant(mcpBridge);
    context.subscriptions.push(chatParticipant);

    toolProvider = new ToolProvider(mcpBridge);
    context.subscriptions.push(toolProvider);

    // Reconnect command
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

    // Auto-connect (async, non-blocking)
    if (autoConnect) {
        mcpBridge.connect().then(() => {
            console.log('MCP Bridge connected');
        }).catch((error) => {
            console.warn('MCP Bridge auto-connect failed:', error);
        });
    }

    // Listen for chat config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('projectMemory.chat')) {
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

    // Workspace folder changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeWorkspaceFolders(() => {
            chatParticipant?.resetWorkspace();
            toolProvider?.resetWorkspace();
        })
    );

    console.log('Chat integration initialized');
}

function initializeWatchers(
    context: vscode.ExtensionContext,
    config: vscode.WorkspaceConfiguration,
    agentsRoot: string,
    promptsRoot: string | undefined,
    instructionsRoot: string | undefined
): void {
    // Agent watcher — only watches agents/ directory
    if (agentsRoot) {
        agentWatcher = new AgentWatcher(agentsRoot, config.get<boolean>('autoDeployAgents') || false);
        agentWatcher.start();
        context.subscriptions.push({ dispose: () => agentWatcher.stop() });
    }

    // Copilot file watcher — watches agents, prompts, instructions
    copilotFileWatcher = new CopilotFileWatcher({
        agentsRoot,
        promptsRoot,
        instructionsRoot,
        autoDeploy: config.get<boolean>('autoDeployAgents') || false
    });
    copilotFileWatcher.start();

    copilotFileWatcher.onFileChanged((type, _filePath, action) => {
        if (action === 'change') {
            statusBarManager.showTemporaryMessage(`${type} updated`);
        }
    });

    context.subscriptions.push({ dispose: () => copilotFileWatcher.stop() });
}
