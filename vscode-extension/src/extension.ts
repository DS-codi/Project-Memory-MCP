/**
 * Project Memory Dashboard - VS Code Extension
 * 
 * Stripped-down entry point (Plan 01: Extension Strip-Down).
 * 
 * This extension is now a lightweight dashboard host + deployment helper.
 * All language-model tools, chat participants, MCP bridge HTTP transport,
 * session orchestration, and file watchers have been archived to src/_archive/.
 * 
 * Agents interact with the MCP server via MCP stdio transport (through the
 * supervisor), not through this extension.
 */

import * as vscode from 'vscode';
import * as path from 'path';
import { DashboardViewProvider } from './providers/DashboardViewProvider';
import { WorkspacePlanTreeProvider, StepItem } from './providers/WorkspacePlanTreeProvider';
import { DiagnosticsTreeProvider } from './providers/DiagnosticsTreeProvider';
import { StatusBarManager } from './ui/StatusBarManager';
import { EventSubscriptionService } from './services/EventSubscriptionService';
import { NotificationService } from './services/NotificationService';
import { ConnectionManager } from './server/ConnectionManager';
import { DefaultDeployer } from './deployer/DefaultDeployer';
import { DiagnosticsService } from './services/DiagnosticsService';
import { SupervisorHeartbeat } from './supervisor/SupervisorHeartbeat';
import { notify } from './utils/helpers';
import { getDefaultDataRoot, getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultSkillsRoot } from './utils/defaults';
import { clearIdentityCache } from './utils/workspace-identity';
import { registerServerCommands, registerDeployCommands, registerPlanCommands, registerWorkspaceCommands } from './commands';
import { readSupervisorSettings } from './supervisor/settings';
import { runSupervisorActivation } from './supervisor/activation';
import { enterDegradedMode, exitDegradedMode } from './supervisor/degraded';
import { detectSupervisor } from './supervisor/detect';
import { launchSupervisorDetached, launchSupervisorInTerminal, getSupervisorDirectory, openDirectoryInExplorer } from './supervisor/launcher';
import { SupervisorControlClient } from './supervisor/control-client';

// --- Module-level state ---
let dashboardProvider: DashboardViewProvider;
let statusBarManager: StatusBarManager;
let connectionManager: ConnectionManager;
let defaultDeployer: DefaultDeployer;
let diagnosticsService: DiagnosticsService;
let planTreeProvider: WorkspacePlanTreeProvider;
let diagnosticsTreeProvider: DiagnosticsTreeProvider;
let eventSubscriptionService: EventSubscriptionService;
let notificationService: NotificationService;

// Supervisor control client -- registers this window with the pool manager.
let supervisorClient: SupervisorControlClient | null = null;

// --- Activation ---

export function activate(context: vscode.ExtensionContext) {
    console.log('Project Memory Dashboard extension activating...');

    // Read configuration
    const config = vscode.workspace.getConfiguration('projectMemory');
    const dataRoot = config.get<string>('dataRoot') || getDefaultDataRoot();
    const agentsRoot = config.get<string>('agentsRoot') || getDefaultAgentsRoot();
    const promptsRoot = config.get<string>('promptsRoot');
    const instructionsRoot = config.get<string>('instructionsRoot');
    const dashboardPort = config.get<number>('serverPort') || 3001;
    const mcpPort = config.get<number>('mcpPort') || 3457;
    const defaultAgents = config.get<string[]>('defaultAgents') || [];
    const defaultInstructions = config.get<string[]>('defaultInstructions') || [];
    const autoDeployOnWorkspaceOpen = config.get<boolean>('autoDeployOnWorkspaceOpen') ?? false;
    const autoDeploySkills = config.get<boolean>('autoDeploySkills') ?? false;

    // --- Initialize core services (lightweight, no I/O) ---

    defaultDeployer = new DefaultDeployer({
        agentsRoot,
        instructionsRoot: instructionsRoot || getDefaultInstructionsRoot(),
        skillsRoot: getDefaultSkillsRoot(),
        defaultAgents,
        defaultInstructions,
        defaultSkills: config.get<string[]>('defaultSkills') || [],
    });

    connectionManager = new ConnectionManager({
        dashboardPort,
        mcpPort,
    });
    connectionManager.onConnected = () => {
        exitDegradedMode();
    };
    context.subscriptions.push(connectionManager);

    dashboardProvider = new DashboardViewProvider(context.extensionUri, dataRoot, agentsRoot);

    // When dashboard panel opens for the first time, try to detect services
    dashboardProvider.onFirstResolve(() => {
        detectAndPromptIfNeeded();
    });

    statusBarManager = new StatusBarManager();
    context.subscriptions.push(statusBarManager);

    // --- Event Subscription Service (live SSE feed from dashboard) ---
    eventSubscriptionService = new EventSubscriptionService(dashboardPort);
    context.subscriptions.push(eventSubscriptionService);
    // Wire live events to StatusBarManager, NotificationService, and TreeView
    statusBarManager.attach(eventSubscriptionService);
    notificationService = new NotificationService();
    notificationService.attach(eventSubscriptionService);
    context.subscriptions.push(notificationService);
    eventSubscriptionService.onPlanEvent(() => planTreeProvider?.refresh());
    eventSubscriptionService.onStepEvent(() => planTreeProvider?.refresh());
    eventSubscriptionService.onWorkspaceEvent(() => planTreeProvider?.refresh());

    // --- Register webview provider ---
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'projectMemory.dashboardView',
            dashboardProvider,
            { webviewOptions: { retainContextWhenHidden: true } }
        )
    );

    // --- Register all commands (no I/O, just registrations) ---
    const getDashboardPort = () => config.get<number>('serverPort') || 3001;

    // --- Register Plans TreeView ---
    planTreeProvider = new WorkspacePlanTreeProvider(dashboardPort);
    context.subscriptions.push(planTreeProvider);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('projectMemory.planExplorer', planTreeProvider),
        vscode.commands.registerCommand('projectMemory.planExplorer.refresh', () => {
            planTreeProvider.dashboardPort = getDashboardPort();
            planTreeProvider.refresh();
        }),
        vscode.commands.registerCommand('projectMemory.planExplorer.toggleArchived', () => {
            planTreeProvider.toggleArchived();
        }),
        vscode.commands.registerCommand('projectMemory.openPlanInDashboard', (_workspaceId: string, _planId: string, _planTitle: string) => {
            // Opens full-tab dashboard; deep-link plan navigation can be added later
            vscode.commands.executeCommand('projectMemory.openDashboardPanel');
        }),
        vscode.commands.registerCommand('projectMemory.goToStepFile', async (item: StepItem) => {
            if (!item?.fileRef) return;
            const { file, line } = item.fileRef;

            // Resolve the path: try absolute first, then relative to each workspace folder
            let uri: vscode.Uri | undefined;
            if (path.isAbsolute(file)) {
                uri = vscode.Uri.file(file);
            } else {
                for (const folder of vscode.workspace.workspaceFolders ?? []) {
                    const candidate = vscode.Uri.file(path.join(folder.uri.fsPath, file));
                    try {
                        await vscode.workspace.fs.stat(candidate);
                        uri = candidate;
                        break;
                    } catch { /* not found in this folder */ }
                }
            }

            if (!uri) {
                vscode.window.showWarningMessage(`File not found: ${file}`);
                return;
            }

            const doc = await vscode.workspace.openTextDocument(uri);
            const editor = await vscode.window.showTextDocument(doc);
            if (line !== undefined && line > 0) {
                const pos = new vscode.Position(line - 1, 0);
                editor.selection = new vscode.Selection(pos, pos);
                editor.revealRange(new vscode.Range(pos, pos), vscode.TextEditorRevealType.InCenter);
            }
        }),
    );

    registerServerCommands(context, connectionManager, dashboardProvider, getDashboardPort);
    registerDeployCommands(context, dashboardProvider, defaultDeployer);
    registerPlanCommands(context, dashboardProvider, getDashboardPort);
    registerWorkspaceCommands(context, connectionManager, dashboardProvider);

    // --- Diagnostics service and command ---
    diagnosticsService = new DiagnosticsService(connectionManager, dashboardPort);
    context.subscriptions.push(diagnosticsService);

    // Replace the old 60-second poll with a single shared SSE heartbeat.
    // All VS Code windows subscribe to the supervisor's broadcast; no per-instance polling.
    const supervisorHeartbeat = new SupervisorHeartbeat(
        mcpPort, // proxy port is also where /supervisor/heartbeat lives
        (msg) => console.log(msg),
    );
    supervisorHeartbeat.start();
    context.subscriptions.push(supervisorHeartbeat);
    diagnosticsService.attachHeartbeat(supervisorHeartbeat);

    // When the heartbeat is restored (reconnects after being lost), reset the
    // circuit breaker so ConnectionManager resumes polling dashboard/proxy.
    // Using onRestored (not onBeat) prevents an infinite reset loop that would
    // otherwise keep the circuit open on every heartbeat even when the dashboard
    // is permanently down.
    context.subscriptions.push(
        supervisorHeartbeat.onRestored(() => {
            connectionManager.resetCircuit();
        }),
    );

    // --- Deploy status bar button (shown when a workspace folder is open) ---
    if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
        const deployBtn = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 98);
        deployBtn.command = 'projectMemory.deployDefaults';
        deployBtn.text = '$(cloud-upload) Deploy';
        deployBtn.tooltip = 'Project Memory: Deploy default agents & instructions (right-click for profiles)';
        deployBtn.show();
        context.subscriptions.push(deployBtn);
    }

    // Diagnostics status bar indicator
    const diagnosticsStatusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 99);
    diagnosticsStatusBar.command = 'projectMemory.showDiagnostics';
    diagnosticsStatusBar.text = '$(pulse) PM';
    diagnosticsStatusBar.tooltip = 'Project Memory: Click for diagnostics';
    diagnosticsStatusBar.show();
    context.subscriptions.push(diagnosticsStatusBar);

    diagnosticsService.onHealthChange(report => {
        const icons: Record<string, string> = { green: '$(check)', yellow: '$(warning)', red: '$(error)' };
        diagnosticsStatusBar.text = `${icons[report.health]} PM`;
        diagnosticsStatusBar.tooltip = report.issues.length > 0
            ? `Project Memory: ${report.issues.join('; ')}`
            : 'Project Memory: All systems healthy';
        // Update diagnostics tree view
        if (diagnosticsTreeProvider) {
            diagnosticsTreeProvider.update(report);
        }
        // If the supervisor heartbeat is alive, the supervisor is reachable — exit
        // degraded mode automatically. This recovers from the case where the
        // supervisor was not running at extension activation (pipe probe failed →
        // enterDegradedMode) but started later and its heartbeat has now connected.
        // exitDegradedMode() is a no-op when degraded mode is not active.
        if (report.mcp.supervisorHeartbeat) {
            exitDegradedMode();
        }
    });

    // --- Diagnostics TreeView ---
    diagnosticsTreeProvider = new DiagnosticsTreeProvider();
    context.subscriptions.push(diagnosticsTreeProvider);
    context.subscriptions.push(
        vscode.window.registerTreeDataProvider('projectMemory.diagnosticsView', diagnosticsTreeProvider),
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showDiagnostics', () => {
            const report = diagnosticsService.runCheck();
            const channel = vscode.window.createOutputChannel('Project Memory Diagnostics');
            channel.clear();
            channel.appendLine(diagnosticsService.formatReport(report));
            channel.show();
        }),
        vscode.commands.registerCommand('projectMemory.runFullDiagnostic', () => {
            const report = diagnosticsService.runCheck();
            diagnosticsTreeProvider?.update(report);
            const channel = vscode.window.createOutputChannel('Project Memory Diagnostics');
            channel.clear();
            channel.appendLine(diagnosticsService.formatReport(report));
            channel.show();
        }),
        vscode.commands.registerCommand('projectMemory.diagnostics.copyValue', (value: string) => {
            vscode.env.clipboard.writeText(value).then(() => {
                vscode.window.setStatusBarMessage(`$(clippy) Copied: ${value}`, 2000);
            });
        }),
    );

    // --- Deferred heavy initialization ---
    // Auto-deploy on workspace open (if enabled -- lightweight file copies)
    if (autoDeployOnWorkspaceOpen && vscode.workspace.workspaceFolders?.[0]) {
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        defaultDeployer.deployToWorkspace(workspacePath).then(result => {
            if (result.agents.length > 0 || result.instructions.length > 0 || result.skills.length > 0) {
                notify(`Deployed ${result.agents.length} agents, ${result.instructions.length} instructions, and ${result.skills.length} skills`);
            }
        });
    } else if (autoDeploySkills && !autoDeployOnWorkspaceOpen && vscode.workspace.workspaceFolders?.[0]) {
        // Skills-only auto-deploy when full auto-deploy is disabled
        const workspacePath = vscode.workspace.workspaceFolders[0].uri.fsPath;
        const skillsTargetDir = require('path').join(workspacePath, '.github', 'skills');
        defaultDeployer.deployAllSkills(skillsTargetDir).then((skills: string[]) => {
            if (skills.length > 0) {
                notify(`Auto-deployed ${skills.length} skill${skills.length !== 1 ? 's' : ''}`);
            }
        });
    }

    // Respect the 'dashboard.enabled' setting before attempting connection.
    // When disabled, the extension loads normally but skips auto-detection.
    // Users can still connect manually via the "Detect Services" command.
    const dashboardEnabled = config.get<boolean>('dashboard.enabled', true);
    if (dashboardEnabled) {
        // Initial connection attempt, then keep polling continuously.
        connectionManager.detectAndConnect().then(connected => {
            if (connected) {
                exitDegradedMode();
            }
            // Always start polling so we can recover from future blips.
            connectionManager.startAutoDetection();
        });
        // Start SSE event subscription (lazy: connects on first attempt, reconnects on failure)
        eventSubscriptionService.start();
    } else {
        console.log('[ProjectMemory] Dashboard connection disabled via projectMemory.dashboard.enabled = false');
    }

    // --- Supervisor activation and management commands ---
    const supervisorSettings = readSupervisorSettings();

    // Register "Launch Supervisor" command (detached process)
    context.subscriptions.push(
        // Alias: package.json registers 'project-memory.startSupervisor' — map it to
        // the canonical launch command so clicking it in the command palette works.
        vscode.commands.registerCommand('project-memory.startSupervisor', () => {
            vscode.commands.executeCommand('project-memory.launchSupervisor');
        }),
        vscode.commands.registerCommand('project-memory.launchSupervisor', async () => {
            try {
                const settings = readSupervisorSettings();
                launchSupervisorDetached(settings);
                
                // Wait a bit for supervisor to start, then try to detect
                setTimeout(async () => {
                    const connected = await connectionManager.detectAndConnect();
                    if (connected) {
                        exitDegradedMode();
                        vscode.window.showInformationMessage('Project Memory Supervisor connected.');
                    } else {
                        vscode.window.showWarningMessage(
                            'Supervisor launched but services not yet detected. ' +
                            'Check the supervisor is starting correctly.'
                        );
                    }
                }, 5000); // Give supervisor 5s to start
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(
                    `Failed to launch Supervisor: ${msg}`,
                    'Configure Path'
                ).then(choice => {
                    if (choice === 'Configure Path') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'supervisor.launcherPath'
                        );
                    }
                });
            }
        })
    );

    // Register "Launch Supervisor in Terminal" command (visible terminal)
    context.subscriptions.push(
        vscode.commands.registerCommand('project-memory.launchSupervisorInTerminal', async () => {
            try {
                const settings = readSupervisorSettings();
                launchSupervisorInTerminal(settings);
                vscode.window.showInformationMessage(
                    'Supervisor launching in terminal. Services will start momentarily.'
                );
                
                // Poll for connection
                setTimeout(async () => {
                    await connectionManager.detectAndConnect();
                }, 3000);
            } catch (error) {
                const msg = error instanceof Error ? error.message : String(error);
                vscode.window.showErrorMessage(
                    `Failed to launch Supervisor: ${msg}`,
                    'Configure Path'
                ).then(choice => {
                    if (choice === 'Configure Path') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'supervisor.launcherPath'
                        );
                    }
                });
            }
        })
    );

    // Register "Open Supervisor Directory" command
    context.subscriptions.push(
        vscode.commands.registerCommand('project-memory.openSupervisorDirectory', async () => {
            const settings = readSupervisorSettings();
            const dir = getSupervisorDirectory(settings);
            
            if (dir) {
                openDirectoryInExplorer(dir);
                vscode.window.showInformationMessage(
                    `Opened supervisor directory in Explorer. Run supervisor.exe or start-supervisor.ps1 to launch.`
                );
            } else {
                vscode.window.showErrorMessage(
                    'Could not locate the Supervisor directory. ' +
                    'Set supervisor.launcherPath to the full path of your supervisor executable or start-supervisor.ps1.',
                    'Configure Path'
                ).then(choice => {
                    if (choice === 'Configure Path') {
                        vscode.commands.executeCommand(
                            'workbench.action.openSettings',
                            'supervisor.launcherPath'
                        );
                    }
                });
            }
        })
    );

    // Register "Reconnect/Detect" command
    context.subscriptions.push(
        vscode.commands.registerCommand('project-memory.detectConnection', async () => {
            const connected = await connectionManager.detectAndConnect();
            if (connected) {
                exitDegradedMode();
                vscode.window.showInformationMessage('Project Memory components connected.');
            } else {
                vscode.window.showWarningMessage(
                    'Project Memory components not detected. ' +
                    'Ensure the Supervisor is running (start-supervisor.ps1).',
                    'Launch Supervisor', 'Open Directory'
                ).then(choice => {
                    if (choice === 'Launch Supervisor') {
                        vscode.commands.executeCommand('project-memory.launchSupervisor');
                    } else if (choice === 'Open Directory') {
                        vscode.commands.executeCommand('project-memory.openSupervisorDirectory');
                    }
                });
            }
        })
    );

    runSupervisorActivation(context, supervisorSettings).then(async supervisorResult => {
        if (supervisorResult === 'degraded') {
            const dir = getSupervisorDirectory(supervisorSettings);
            const canLaunch = dir !== null;
            enterDegradedMode(
                context,
                'Supervisor was not detected. Launch it to enable full Project Memory functionality.',
                canLaunch
            );
        } else if (supervisorResult === 'ready') {
            // Supervisor is running -- register this VS Code window with it so
            // the pool manager can track which windows are connected.
            supervisorClient = new SupervisorControlClient();
            context.subscriptions.push(supervisorClient);
            const connected = await supervisorClient.connect();
            if (connected) {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                const windowId = workspaceFolder
                    ? workspaceFolder.uri.fsPath
                    : `${vscode.env.machineId}:${process.pid}`;
                const clientId = await supervisorClient.attachClient(process.pid, windowId);
                if (clientId) {
                    console.log(`[Supervisor] Registered as ${clientId} (window: ${windowId})`);
                }
            }
        }
    }).catch(err => {
        console.error('[Supervisor] Activation error:', err);
        enterDegradedMode(context, String(err), false);
    });

    // --- Pool management commands ---
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showMcpSessions', async () => {
            if (!supervisorClient?.isConnected) {
                vscode.window.showWarningMessage('Not connected to Supervisor. Launch it first.');
                return;
            }
            const sessions = await supervisorClient.listMcpConnections();
            if (sessions.length === 0) {
                vscode.window.showInformationMessage('No active MCP sessions.');
                return;
            }
            const channel = vscode.window.createOutputChannel('MCP Sessions');
            channel.clear();
            channel.appendLine(`Active MCP Sessions (${sessions.length}):`);
            channel.appendLine('');
            for (const s of sessions) {
                channel.appendLine(`  Session: ${s.session_id}`);
                channel.appendLine(`    Transport : ${s.transport_type}`);
                channel.appendLine(`    Instance  : port ${s.instance_port}`);
                channel.appendLine(`    Connected : ${s.connected_at}`);
                channel.appendLine(`    Last call : ${s.last_activity ?? 'none'}`);
                channel.appendLine(`    Calls     : ${s.call_count}`);
                if (s.linked_client_id) {
                    channel.appendLine(`    Client ID : ${s.linked_client_id}`);
                }
                channel.appendLine('');
            }
            channel.show();
        }),

        vscode.commands.registerCommand('projectMemory.showMcpInstances', async () => {
            if (!supervisorClient?.isConnected) {
                vscode.window.showWarningMessage('Not connected to Supervisor. Launch it first.');
                return;
            }
            const instances = await supervisorClient.listMcpInstances();
            if (instances.length === 0) {
                vscode.window.showInformationMessage('No MCP pool instances found.');
                return;
            }
            const lines = instances.map((i: any) =>
                `  Port ${i.port}: ${i.connection_count} connection(s)`
            );
            vscode.window.showInformationMessage(
                `MCP Pool (${instances.length} instance${instances.length !== 1 ? 's' : ''}):\n${lines.join('\n')}`,
                { modal: true }
            );
        }),

        vscode.commands.registerCommand('projectMemory.scaleUpMcp', async () => {
            if (!supervisorClient?.isConnected) {
                vscode.window.showWarningMessage('Not connected to Supervisor. Launch it first.');
                return;
            }
            const ok = await supervisorClient.scaleUpMcp();
            if (ok) {
                vscode.window.showInformationMessage('MCP pool scale-up requested.');
            } else {
                vscode.window.showWarningMessage(
                    'Scale-up was not accepted. The pool may already be at maximum capacity.'
                );
            }
        })
    );

    // --- Configuration change listener ---
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('projectMemory')) {
                const newConfig = vscode.workspace.getConfiguration('projectMemory');
                dashboardProvider.updateConfig(
                    newConfig.get<string>('dataRoot') || getDefaultDataRoot(),
                    newConfig.get<string>('agentsRoot') || getDefaultAgentsRoot()
                );
                // Clear cached identity so stale paths are re-resolved
                clearIdentityCache();
                // Sync DefaultDeployer with fresh settings
                defaultDeployer.updateConfig({
                    agentsRoot: newConfig.get<string>('agentsRoot') || getDefaultAgentsRoot(),
                    instructionsRoot: newConfig.get<string>('instructionsRoot') || getDefaultInstructionsRoot(),
                    skillsRoot: getDefaultSkillsRoot(),
                    defaultAgents: newConfig.get<string[]>('defaultAgents') || [],
                    defaultInstructions: newConfig.get<string[]>('defaultInstructions') || [],
                    defaultSkills: newConfig.get<string[]>('defaultSkills') || [],
                });
            }
        })
    );

    console.log('Project Memory Dashboard extension activated');
}

// --- Deactivation ---

export async function deactivate() {
    console.log('Project Memory Dashboard extension deactivating...');

    // Unregister this window from the Supervisor pool manager.
    if (supervisorClient) {
        await supervisorClient.detachClient().catch(() => { /* ignore */ });
        supervisorClient.dispose();
        supervisorClient = null;
    }

    // Dispose dashboard provider
    if (dashboardProvider) {
        dashboardProvider.dispose();
    }

    console.log('Project Memory Dashboard extension deactivated');
}

// --- Private initialization helpers ---

/**
 * Detect and prompt to launch supervisor if not connected.
 * Called when dashboard opens or user explicitly requests detection.
 */
async function detectAndPromptIfNeeded(): Promise<void> {
    if (!connectionManager) { return; }

    const connected = await connectionManager.detectAndConnect();

    if (connected) {
        exitDegradedMode();
        return;
    }

    // Not connected -- prompt the user
    const supervisorSettings = readSupervisorSettings();
    const dir = getSupervisorDirectory(supervisorSettings);
    const canLaunch = dir !== null;

    const choice = canLaunch
        ? await vscode.window.showWarningMessage(
            'Project Memory components not detected. Launch supervisor?',
            'Launch Supervisor', 'Open Directory', 'Cancel',
          )
        : await vscode.window.showWarningMessage(
            'Project Memory components not detected. Launch supervisor?',
            'Launch Supervisor', 'Cancel',
          );

    if (choice === 'Launch Supervisor' && canLaunch) {
        vscode.commands.executeCommand('project-memory.launchSupervisor');
    } else if (choice === 'Open Directory' && canLaunch) {
        vscode.commands.executeCommand('project-memory.openSupervisorDirectory');
    }
}
