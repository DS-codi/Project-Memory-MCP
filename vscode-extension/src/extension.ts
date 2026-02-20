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
import { McpBridge, ChatParticipant, ToolProvider, confirmPendingAction, cancelPendingAction } from './chat';
import { SessionInterceptRegistry } from './chat/orchestration/session-intercept-registry';
import { DiagnosticsService } from './services/DiagnosticsService';
import { notify } from './utils/helpers';
import { getDefaultDataRoot, getDefaultAgentsRoot, getDefaultInstructionsRoot, getDefaultPromptsRoot, getDefaultSkillsRoot } from './utils/defaults';
import { resolveTerminalCwdForBuildScript } from './utils/buildScriptCwd';
import { clearIdentityCache } from './utils/workspace-identity';
import { getDashboardFrontendUrl } from './server/ContainerDetection';
import { registerServerCommands, registerDeployCommands, registerPlanCommands, registerWorkspaceCommands } from './commands';
import { extractWorkspaceIdFromRegisterResponse, resolveWorkspaceIdFromWorkspaceList } from './chat/workspaceRegistration';
import { readSupervisorSettings } from './supervisor/settings';
import { runSupervisorActivation } from './supervisor/activation';
import { enterDegradedMode } from './supervisor/degraded';

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
let sessionInterceptRegistry: SessionInterceptRegistry | null = null;

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

    // --- Supervisor activation (fire-and-forget before MCP attach) ---
    // runSupervisorActivation is async; we do not await it so extension
    // activation is not blocked. Degraded mode is surfaced via status bar item.
    const supervisorSettings = readSupervisorSettings();
    runSupervisorActivation(context, supervisorSettings).then(supervisorResult => {
        if (supervisorResult === 'degraded') {
            enterDegradedMode(
                context,
                'Supervisor did not start in time. Click to retry.'
            );
        }
    }).catch(err => {
        console.error('[Supervisor] Activation error:', err);
        enterDegradedMode(context, String(err));
    });

    // --- Chat integration (lightweight init, async connect) ---
    const isExtensionHostTest = process.env.PROJECT_MEMORY_TEST_MODE === '1';
    initializeChatIntegration(context, config, dataRoot, {
        registerChatParticipant: !isExtensionHostTest,
        registerTools: !isExtensionHostTest,
    });

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
    dataRoot: string,
    options?: {
        registerChatParticipant?: boolean;
        registerTools?: boolean;
    }
): void {
    const registerChatParticipant = options?.registerChatParticipant ?? true;
    const registerTools = options?.registerTools ?? true;

    if (toolProvider) {
        toolProvider.dispose();
        toolProvider = null;
    }
    if (chatParticipant) {
        chatParticipant.dispose();
        chatParticipant = null;
    }
    if (sessionInterceptRegistry) {
        sessionInterceptRegistry.dispose();
        sessionInterceptRegistry = null;
    }
    if (mcpBridge) {
        try {
            mcpBridge.dispose();
        } catch {
            // ignore cleanup errors during re-initialization
        }
        mcpBridge = null;
    }

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

    // Initialize session registry before tools
    sessionInterceptRegistry = new SessionInterceptRegistry(context.workspaceState);
    sessionInterceptRegistry.restore();
    context.subscriptions.push(sessionInterceptRegistry);

    if (registerChatParticipant) {
        chatParticipant = new ChatParticipant(mcpBridge);
        context.subscriptions.push(chatParticipant);
    }

    if (registerTools) {
        toolProvider = new ToolProvider(mcpBridge, { sessionRegistry: sessionInterceptRegistry });
        context.subscriptions.push(toolProvider);
    }

    // Set registry on dashboard provider
    dashboardProvider.setSessionRegistry(sessionInterceptRegistry);

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

    const ensureBridgeConnected = async (): Promise<boolean> => {
        if (!mcpBridge) {
            vscode.window.showWarningMessage('MCP bridge is not initialized yet. Please try again.');
            return false;
        }

        if (!mcpBridge.isConnected()) {
            try {
                await mcpBridge.connect();
            } catch {
                vscode.window.showErrorMessage('Failed to connect to MCP server.');
                return false;
            }
        }

        return true;
    };

    const resolveWorkspaceRegistration = async (): Promise<{ workspaceId: string } | null> => {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) {
            vscode.window.showWarningMessage('No workspace folder is open.');
            return null;
        }

        const requestedPath = workspaceFolder.uri.fsPath;

        const workspaceResult = await mcpBridge!.callTool<unknown>('memory_workspace', {
            action: 'register',
            workspace_path: requestedPath,
        });

        const directWorkspaceId = extractWorkspaceIdFromRegisterResponse(workspaceResult);
        if (directWorkspaceId) {
            return { workspaceId: directWorkspaceId };
        }

        const workspaceListResult = await mcpBridge!.callTool<unknown>('memory_workspace', {
            action: 'list',
        });

        const fallbackWorkspaceId = resolveWorkspaceIdFromWorkspaceList(
            workspaceListResult,
            requestedPath,
            requestedPath
        );

        if (fallbackWorkspaceId) {
            return { workspaceId: fallbackWorkspaceId };
        }

        throw new Error('Workspace registration did not return a workspace ID.');
    };

    const updateStepStatusFromChatAction = async (status: 'active' | 'done', planId?: string, stepIndex?: number): Promise<void> => {
        if (!planId) {
            vscode.window.showWarningMessage(`Mark step ${status} requires a plan ID.`);
            return;
        }

        const parsedStepIndex = typeof stepIndex === 'number' ? stepIndex : Number(stepIndex);
        if (!Number.isInteger(parsedStepIndex) || parsedStepIndex < 0) {
            vscode.window.showWarningMessage('Mark step action requires a valid step index.');
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: status === 'active' ? 'Marking step active...' : 'Marking step done...',
                    cancellable: false,
                },
                async () => {
                    const registration = await resolveWorkspaceRegistration();
                    if (!registration) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_steps', {
                        action: 'update',
                        workspace_id: registration.workspaceId,
                        plan_id: planId,
                        step_index: parsedStepIndex,
                        status,
                    });
                }
            );

            notify(`Step ${parsedStepIndex + 1} marked ${status}.`);
            await vscode.commands.executeCommand('projectMemory.showPlanInChat', planId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to update step status: ${message}`);
        }
    };

    type BuildScriptSummary = {
        id?: string;
        name?: string;
        description?: string;
        command?: string;
        directory?: string;
    };

    type ResolvedBuildScript = {
        command?: string;
        directory_path?: string;
        script_name?: string;
    };

    const runBuildScriptFromChatAction = async (scriptIdOrPlanId?: string, maybePlanId?: string): Promise<void> => {
        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            const registration = await resolveWorkspaceRegistration();
            if (!registration) {
                return;
            }

            let scriptId: string | undefined;
            let planId: string | undefined;

            if (typeof scriptIdOrPlanId === 'string' && scriptIdOrPlanId.startsWith('script_')) {
                scriptId = scriptIdOrPlanId;
                planId = typeof maybePlanId === 'string' && maybePlanId.trim().length > 0 ? maybePlanId : undefined;
            } else if (typeof scriptIdOrPlanId === 'string' && scriptIdOrPlanId.trim().length > 0) {
                planId = scriptIdOrPlanId;
            }

            const listPayload: Record<string, unknown> = {
                action: 'list_build_scripts',
                workspace_id: registration.workspaceId,
            };

            if (planId) {
                listPayload.plan_id = planId;
            }

            const scriptsResult = await mcpBridge!.callTool<{ scripts?: BuildScriptSummary[] } | BuildScriptSummary[]>('memory_plan', listPayload);
            const scripts = Array.isArray(scriptsResult) ? scriptsResult : scriptsResult.scripts ?? [];

            if (scripts.length === 0) {
                vscode.window.showInformationMessage('No registered build scripts found for this scope.');
                return;
            }

            let selectedScript = scripts.find((script) => script.id === scriptId);

            if (!selectedScript) {
                if (scripts.length === 1) {
                    selectedScript = scripts[0];
                } else {
                    const picked = await vscode.window.showQuickPick(
                        scripts.map((script) => ({
                            label: script.name || script.id || 'Unnamed script',
                            description: script.description,
                            detail: `${script.command || 'N/A'}  (${script.directory || 'N/A'})`,
                            script,
                        })),
                        {
                            placeHolder: 'Select a build script to run',
                            matchOnDescription: true,
                            matchOnDetail: true,
                        }
                    );

                    if (!picked) {
                        return;
                    }

                    selectedScript = picked.script;
                }
            }

            const selectedScriptId = selectedScript.id;
            if (!selectedScriptId) {
                vscode.window.showErrorMessage('Selected build script has no script ID.');
                return;
            }

            const resolved = await mcpBridge!.callTool<ResolvedBuildScript>('memory_plan', {
                action: 'run_build_script',
                workspace_id: registration.workspaceId,
                script_id: selectedScriptId,
            });

            const command = resolved.command?.trim();
            if (!command) {
                throw new Error('Resolved build script did not include a command.');
            }

            const workspaceCwd = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
            const cwdResolution = resolveTerminalCwdForBuildScript(
                resolved.directory_path,
                selectedScript.directory,
                workspaceCwd
            );
            const terminalCwd = cwdResolution.cwd;

            if (cwdResolution.warning) {
                vscode.window.showWarningMessage(cwdResolution.warning);
            }

            const terminal = vscode.window.createTerminal({
                name: `PM Build: ${resolved.script_name || selectedScript.name || selectedScriptId}`,
                ...(terminalCwd ? { cwd: terminalCwd } : {}),
            });

            terminal.show(true);
            terminal.sendText(command, true);
            notify(`Started build script: ${resolved.script_name || selectedScript.name || selectedScriptId}`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to run build script: ${message}`);
        }
    };

    const createDedicatedPlanFromBlockedStep = async (planId?: string, stepIndex?: number): Promise<void> => {
        if (!planId) {
            vscode.window.showWarningMessage('Create dedicated plan requires a plan ID.');
            return;
        }

        const parsedStepIndex = typeof stepIndex === 'number' ? stepIndex : Number(stepIndex);
        const resolvedStepIndex = Number.isInteger(parsedStepIndex) && parsedStepIndex >= 0
            ? parsedStepIndex
            : undefined;

        if (!await ensureBridgeConnected()) {
            return;
        }

        type ParentPlanState = {
            plan_id?: string;
            id?: string;
            title?: string;
            description?: string;
            is_program?: boolean;
            program_id?: string;
            child_plan_ids?: string[];
            steps?: Array<{
                index?: number;
                phase?: string;
                task?: string;
                status?: string;
                notes?: string;
            }>;
        };

        type CreatedPlanState = {
            plan_id?: string;
            id?: string;
        };

        try {
            const registration = await resolveWorkspaceRegistration();
            if (!registration) {
                return;
            }

            const parentPlan = await mcpBridge!.callTool<ParentPlanState>('memory_plan', {
                action: 'get',
                workspace_id: registration.workspaceId,
                plan_id: planId,
            });

            const resolvedParentPlanId = parentPlan.plan_id || parentPlan.id || planId;
            const normalizedSteps = (parentPlan.steps ?? []).map((step, index) => ({
                ...step,
                index: typeof step.index === 'number' ? step.index : index,
            }));

            if (typeof resolvedStepIndex === 'number' && !normalizedSteps.some((step) => step.index === resolvedStepIndex)) {
                vscode.window.showWarningMessage(`Unable to find step ${resolvedStepIndex + 1} in plan ${resolvedParentPlanId}.`);
                return;
            }

            const fallbackBlockedStepIndex = normalizedSteps.find((step) => step.status === 'blocked')?.index;
            const effectiveStepIndex = typeof resolvedStepIndex === 'number'
                ? resolvedStepIndex
                : fallbackBlockedStepIndex;

            const parentStep = normalizedSteps.find((step) => {
                if (typeof effectiveStepIndex !== 'number') {
                    return false;
                }

                return step.index === effectiveStepIndex;
            });

            const stepTask = parentStep?.task?.trim() || 'Scope escalation follow-up required';
            const stepPhase = parentStep?.phase?.trim();
            const stepNotes = parentStep?.notes?.trim();
            const blockerDescriptionLines = [
                `Parent plan: ${resolvedParentPlanId}`,
            ];

            if (typeof effectiveStepIndex === 'number') {
                blockerDescriptionLines.push(
                    `Parent step: ${effectiveStepIndex + 1}${stepPhase ? ` (${stepPhase})` : ''}`,
                    `Blocked task: ${stepTask}`
                );
            } else {
                blockerDescriptionLines.push(
                    'Parent step: unavailable (scope escalation requested without a blocked step index)',
                    `Blocked task: ${stepTask}`
                );
            }

            if (stepNotes) {
                blockerDescriptionLines.push(`Blocker details: ${stepNotes}`);
            }

            const dedicatedTitle = typeof effectiveStepIndex === 'number'
                ? `Dedicated: Resolve blocker in ${resolvedParentPlanId} step ${effectiveStepIndex + 1}`
                : `Dedicated: Resolve scope escalation from ${resolvedParentPlanId}`;

            const createdPlan = await mcpBridge!.callTool<CreatedPlanState>('memory_plan', {
                action: 'create',
                workspace_id: registration.workspaceId,
                title: dedicatedTitle,
                description: blockerDescriptionLines.join('\n'),
                category: 'debug',
                priority: 'high',
            });

            const dedicatedPlanId = createdPlan.plan_id || createdPlan.id;
            if (!dedicatedPlanId) {
                throw new Error('Dedicated plan creation did not return a plan ID.');
            }

            const parentProgramId = parentPlan.program_id;
            const parentIsProgram = parentPlan.is_program === true || (parentPlan.child_plan_ids?.length ?? 0) > 0;

            if (parentProgramId) {
                await mcpBridge!.callTool('memory_plan', {
                    action: 'link_to_program',
                    workspace_id: registration.workspaceId,
                    program_id: parentProgramId,
                    plan_id: dedicatedPlanId,
                });
            } else if (parentIsProgram) {
                await mcpBridge!.callTool('memory_plan', {
                    action: 'link_to_program',
                    workspace_id: registration.workspaceId,
                    program_id: resolvedParentPlanId,
                    plan_id: dedicatedPlanId,
                });
            } else {
                await mcpBridge!.callTool('memory_plan', {
                    action: 'set_plan_dependencies',
                    workspace_id: registration.workspaceId,
                    plan_id: dedicatedPlanId,
                    depends_on_plans: [resolvedParentPlanId],
                });
            }

            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@memory /plan show ${dedicatedPlanId}`,
            });

            const notifySuffix = typeof effectiveStepIndex === 'number'
                ? ` for blocked step ${effectiveStepIndex + 1}`
                : ' for scope escalation';

            notify(`Created dedicated plan ${dedicatedPlanId}${notifySuffix}.`);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to create dedicated plan: ${message}`);
        }
    };

    const launchAgentChatFromAction = async (
        agentName?: string,
        prompt?: string,
        launchContext?: { workspace_id?: string; plan_id?: string }
    ): Promise<void> => {
        const selectedAgent = typeof agentName === 'string' && agentName.trim().length > 0
            ? agentName.trim()
            : await vscode.window.showQuickPick(
                ['Coordinator', 'Researcher', 'Architect', 'Executor', 'Reviewer', 'Tester', 'Revisionist', 'Archivist', 'Analyst', 'Brainstorm', 'Runner'],
                { placeHolder: 'Select an agent to launch in chat' }
            );

        if (!selectedAgent) {
            return;
        }

        const normalizedHandle = selectedAgent.toLowerCase();

        const resolvedPrompt = typeof prompt === 'string' && prompt.trim().length > 0
            ? prompt.trim()
            : [
                `Continue as ${selectedAgent}.`,
                launchContext?.workspace_id ? `workspace_id: ${launchContext.workspace_id}` : undefined,
                launchContext?.plan_id ? `plan_id: ${launchContext.plan_id}` : undefined,
            ].filter((line): line is string => Boolean(line && line.trim().length > 0)).join('\n');

        await vscode.commands.executeCommand('workbench.action.chat.open', {
            query: `@${normalizedHandle} ${resolvedPrompt}`,
        });
    };

    const addStepToPlanFromChatAction = async (planId?: string): Promise<void> => {
        const resolvedPlanId = typeof planId === 'string' && planId.trim().length > 0
            ? planId.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter a plan ID for the new step',
                placeHolder: 'plan_xxxxxxxx',
            });

        if (!resolvedPlanId) {
            return;
        }

        const taskDescription = await vscode.window.showInputBox({
            prompt: `Add step to plan ${resolvedPlanId}:`,
            placeHolder: 'Describe the task to add',
            ignoreFocusOut: true,
        });

        if (!taskDescription || taskDescription.trim().length === 0) {
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Adding step to plan...',
                    cancellable: false,
                },
                async () => {
                    const registration = await resolveWorkspaceRegistration();
                    if (!registration) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_steps', {
                        action: 'add',
                        workspace_id: registration.workspaceId,
                        plan_id: resolvedPlanId,
                        steps: [
                            {
                                phase: 'Phase: Follow-up',
                                task: taskDescription.trim(),
                                status: 'pending',
                                type: 'code',
                            }
                        ]
                    });
                }
            );

            notify(`Added step to ${resolvedPlanId}.`);
            await vscode.commands.executeCommand('projectMemory.showPlanInChat', resolvedPlanId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to add step: ${message}`);
        }
    };

    const openPlanInDashboardFromChatAction = async (workspaceId?: string, planId?: string): Promise<void> => {
        const resolvedWorkspaceId = typeof workspaceId === 'string' && workspaceId.trim().length > 0
            ? workspaceId.trim()
            : undefined;

        const resolvedPlanId = typeof planId === 'string' && planId.trim().length > 0
            ? planId.trim()
            : undefined;

        let effectiveWorkspaceId = resolvedWorkspaceId;
        if (!effectiveWorkspaceId) {
            if (!await ensureBridgeConnected()) {
                return;
            }

            const registration = await resolveWorkspaceRegistration();
            if (!registration) {
                return;
            }

            effectiveWorkspaceId = registration.workspaceId;
        }

        const baseUrl = getDashboardFrontendUrl();
        const targetUrl = resolvedPlanId
            ? `${baseUrl}/workspace/${effectiveWorkspaceId}/plan/${resolvedPlanId}`
            : `${baseUrl}/workspace/${effectiveWorkspaceId}`;

        await vscode.commands.executeCommand('projectMemory.openDashboardPanel', targetUrl);
    };

    const archivePlanFromChatAction = async (workspaceIdOrPlanId?: string, maybePlanId?: string): Promise<void> => {
        const explicitWorkspaceId = typeof workspaceIdOrPlanId === 'string' && workspaceIdOrPlanId.trim().length > 0
            && typeof maybePlanId === 'string' && maybePlanId.trim().length > 0
            ? workspaceIdOrPlanId.trim()
            : undefined;

        const resolvedPlanId = typeof maybePlanId === 'string' && maybePlanId.trim().length > 0
            ? maybePlanId.trim()
            : typeof workspaceIdOrPlanId === 'string' && workspaceIdOrPlanId.trim().length > 0 && !explicitWorkspaceId
                ? workspaceIdOrPlanId.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter a plan ID to archive',
                placeHolder: 'plan_xxxxxxxx',
            });

        if (!resolvedPlanId) {
            return;
        }

        const confirmed = await vscode.window.showWarningMessage(
            `Archive plan ${resolvedPlanId}?`,
            { modal: true },
            'Archive'
        );

        if (confirmed !== 'Archive') {
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Archiving plan...',
                    cancellable: false,
                },
                async () => {
                    const effectiveWorkspaceId = explicitWorkspaceId
                        ?? (await resolveWorkspaceRegistration())?.workspaceId;

                    if (!effectiveWorkspaceId) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_plan', {
                        action: 'archive',
                        workspace_id: effectiveWorkspaceId,
                        plan_id: resolvedPlanId,
                    });
                }
            );

            notify(`Archived plan ${resolvedPlanId}.`);
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: '@memory /plan list',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to archive plan: ${message}`);
        }
    };

    const resumePausedPlanFromChatAction = async (workspaceIdOrPlanId?: string, maybePlanId?: string): Promise<void> => {
        const explicitWorkspaceId = typeof workspaceIdOrPlanId === 'string' && workspaceIdOrPlanId.trim().length > 0
            && typeof maybePlanId === 'string' && maybePlanId.trim().length > 0
            ? workspaceIdOrPlanId.trim()
            : undefined;

        const resolvedPlanId = typeof maybePlanId === 'string' && maybePlanId.trim().length > 0
            ? maybePlanId.trim()
            : typeof workspaceIdOrPlanId === 'string' && workspaceIdOrPlanId.trim().length > 0 && !explicitWorkspaceId
                ? workspaceIdOrPlanId.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter the paused plan ID to resume',
                placeHolder: 'plan_xxxxxxxx',
            });

        if (!resolvedPlanId) {
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Resuming paused plan...',
                    cancellable: false,
                },
                async () => {
                    const effectiveWorkspaceId = explicitWorkspaceId
                        ?? (await resolveWorkspaceRegistration())?.workspaceId;

                    if (!effectiveWorkspaceId) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_plan', {
                        action: 'resume_plan',
                        workspace_id: effectiveWorkspaceId,
                        plan_id: resolvedPlanId,
                    });
                }
            );

            notify(`Resumed paused plan ${resolvedPlanId}.`);
            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: '@memory /plan list',
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to resume plan: ${message}`);
        }
    };

    const confirmPlanStepFromChatAction = async (planId?: string, stepIndex?: number): Promise<void> => {
        const resolvedPlanId = typeof planId === 'string' && planId.trim().length > 0
            ? planId.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter a plan ID',
                placeHolder: 'plan_xxxxxxxx',
            });

        if (!resolvedPlanId) {
            return;
        }

        const parsedStepIndex = typeof stepIndex === 'number' ? stepIndex : Number(stepIndex);
        if (!Number.isInteger(parsedStepIndex) || parsedStepIndex < 0) {
            vscode.window.showWarningMessage('Approve Step requires a valid step index.');
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Approving step...',
                    cancellable: false,
                },
                async () => {
                    const registration = await resolveWorkspaceRegistration();
                    if (!registration) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_plan', {
                        action: 'confirm',
                        workspace_id: registration.workspaceId,
                        plan_id: resolvedPlanId,
                        confirmation_scope: 'step',
                        confirm_step_index: parsedStepIndex,
                        confirmed_by: 'user',
                    });
                }
            );

            notify(`Approved step ${parsedStepIndex + 1} in ${resolvedPlanId}.`);
            await vscode.commands.executeCommand('projectMemory.showPlanInChat', resolvedPlanId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to approve step: ${message}`);
        }
    };

    const confirmPlanPhaseFromChatAction = async (planId?: string, phase?: string): Promise<void> => {
        const resolvedPlanId = typeof planId === 'string' && planId.trim().length > 0
            ? planId.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter a plan ID',
                placeHolder: 'plan_xxxxxxxx',
            });

        if (!resolvedPlanId) {
            return;
        }

        const resolvedPhase = typeof phase === 'string' && phase.trim().length > 0
            ? phase.trim()
            : await vscode.window.showInputBox({
                prompt: 'Enter phase name to approve',
                placeHolder: 'Phase 1',
            });

        if (!resolvedPhase) {
            return;
        }

        if (!await ensureBridgeConnected()) {
            return;
        }

        try {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'Approving phase...',
                    cancellable: false,
                },
                async () => {
                    const registration = await resolveWorkspaceRegistration();
                    if (!registration) {
                        return;
                    }

                    await mcpBridge!.callTool('memory_plan', {
                        action: 'confirm',
                        workspace_id: registration.workspaceId,
                        plan_id: resolvedPlanId,
                        confirmation_scope: 'phase',
                        confirm_phase: resolvedPhase,
                        confirmed_by: 'user',
                    });
                }
            );

            notify(`Approved phase ${resolvedPhase} in ${resolvedPlanId}.`);
            await vscode.commands.executeCommand('projectMemory.showPlanInChat', resolvedPlanId);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to approve phase: ${message}`);
        }
    };

    const confirmActionFromChat = async (actionId?: string): Promise<void> => {
        if (!actionId || actionId.trim().length === 0) {
            vscode.window.showWarningMessage('No confirmation action ID provided.');
            return;
        }

        try {
            const result = await confirmPendingAction(actionId);
            if (result.executed) {
                notify(result.message);
            } else {
                vscode.window.showWarningMessage(result.message);
            }
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            vscode.window.showErrorMessage(`Failed to confirm action: ${message}`);
        }
    };

    const cancelActionFromChat = (actionId?: string): void => {
        if (!actionId || actionId.trim().length === 0) {
            vscode.window.showWarningMessage('No confirmation action ID provided.');
            return;
        }

        const result = cancelPendingAction(actionId);
        if (result.cancelled) {
            notify(result.message);
        } else {
            vscode.window.showWarningMessage(result.message);
        }
    };

    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showPlanInChat', async (planId?: string, researchNote?: string) => {
            const resolvedPlanId = planId || await vscode.window.showInputBox({
                prompt: 'Enter a plan ID',
                placeHolder: 'plan_xxxxxxxx'
            });

            if (!resolvedPlanId) {
                return;
            }

            const researchNoteArg = typeof researchNote === 'string' && researchNote.trim().length > 0
                ? ` --research-note ${JSON.stringify(researchNote)}`
                : '';

            await vscode.commands.executeCommand('workbench.action.chat.open', {
                query: `@memory /plan show ${resolvedPlanId}${researchNoteArg}`,
            });
        }),
        vscode.commands.registerCommand('projectMemory.markStepActive', (planId?: string, stepIndex?: number) =>
            updateStepStatusFromChatAction('active', planId, stepIndex)
        ),
        vscode.commands.registerCommand('projectMemory.markStepDone', (planId?: string, stepIndex?: number) =>
            updateStepStatusFromChatAction('done', planId, stepIndex)
        ),
        vscode.commands.registerCommand('projectMemory.runBuildScript', (scriptIdOrPlanId?: string, planId?: string) =>
            runBuildScriptFromChatAction(scriptIdOrPlanId, planId)
        ),
        vscode.commands.registerCommand('projectMemory.launchAgentChat', (
            agentName?: string,
            prompt?: string,
            launchContext?: { workspace_id?: string; plan_id?: string }
        ) => launchAgentChatFromAction(agentName, prompt, launchContext)),
        vscode.commands.registerCommand('projectMemory.addStepToPlan', (planId?: string) =>
            addStepToPlanFromChatAction(planId)
        ),
        vscode.commands.registerCommand('projectMemory.openPlanInDashboard', (workspaceId?: string, planId?: string) =>
            openPlanInDashboardFromChatAction(workspaceId, planId)
        ),
        vscode.commands.registerCommand('projectMemory.createDedicatedPlan', (planId?: string, stepIndex?: number) =>
            createDedicatedPlanFromBlockedStep(planId, stepIndex)
        ),
        vscode.commands.registerCommand('projectMemory.archivePlan', (workspaceIdOrPlanId?: string, maybePlanId?: string) =>
            archivePlanFromChatAction(workspaceIdOrPlanId, maybePlanId)
        ),
        vscode.commands.registerCommand('projectMemory.resumePausedPlan', (workspaceIdOrPlanId?: string, maybePlanId?: string) =>
            resumePausedPlanFromChatAction(workspaceIdOrPlanId, maybePlanId)
        ),
        vscode.commands.registerCommand('projectMemory.confirmPlanStep', (planId?: string, stepIndex?: number) =>
            confirmPlanStepFromChatAction(planId, stepIndex)
        ),
        vscode.commands.registerCommand('projectMemory.confirmPlanPhase', (planId?: string, phase?: string) =>
            confirmPlanPhaseFromChatAction(planId, phase)
        ),
        vscode.commands.registerCommand('projectMemory.confirmAction', (actionId?: string) =>
            confirmActionFromChat(actionId)
        ),
        vscode.commands.registerCommand('projectMemory.cancelAction', (actionId?: string) =>
            cancelActionFromChat(actionId)
        )
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
