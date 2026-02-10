/**
 * Server management commands: start, stop, restart, toggle, isolate, force-stop.
 */

import * as vscode from 'vscode';
import { ServerManager } from '../server/ServerManager';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { DashboardPanel } from '../ui/DashboardPanel';
import { notify } from '../utils/helpers';
import { getDashboardFrontendUrl } from '../server/ContainerDetection';

export function registerServerCommands(
    context: vscode.ExtensionContext,
    serverManager: ServerManager,
    dashboardProvider: DashboardViewProvider,
    getServerPort: () => number
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showDashboard', () => {
            vscode.commands.executeCommand('workbench.view.extension.projectMemory');
        }),

        vscode.commands.registerCommand('projectMemory.openDashboardPanel', async (url?: string) => {
            // In container mode, the container serves both API and frontend — no local starts needed
            if (!serverManager.isContainerMode) {
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
            }

            const dashboardUrl = url || getDashboardFrontendUrl();
            DashboardPanel.createOrShow(context.extensionUri, dashboardUrl);
        }),

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

        vscode.commands.registerCommand('projectMemory.forceStopExternalServer', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const port = config.get<number>('serverPort') || 3001;
            const confirm = await vscode.window.showWarningMessage(
                `Force stop the external server on port ${port}?`,
                { modal: true },
                'Force Stop'
            );

            if (confirm !== 'Force Stop') return;

            const success = await serverManager.forceStopExternalServer();
            if (success) {
                notify('External server stopped');
            } else {
                vscode.window.showErrorMessage('Failed to stop external server. Check logs for details.');
                serverManager.showLogs();
            }
        }),

        vscode.commands.registerCommand('projectMemory.isolateServer', async () => {
            const config = vscode.workspace.getConfiguration('projectMemory');
            const currentPort = config.get<number>('serverPort') || 3001;
            const isCurrentlyIsolated = currentPort !== 3001;

            if (isCurrentlyIsolated) {
                await config.update('serverPort', 3001, vscode.ConfigurationTarget.Workspace);
                await serverManager.stopFrontend();
                await serverManager.stop();
                vscode.window.showInformationMessage(
                    'Switching to shared server on port 3001. Reloading window...',
                    'Reload'
                ).then(selection => {
                    if (selection === 'Reload') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            } else {
                const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
                if (!workspaceFolder) {
                    vscode.window.showErrorMessage('No workspace folder open');
                    return;
                }
                const hash = require('crypto').createHash('md5')
                    .update(workspaceFolder.uri.fsPath.toLowerCase())
                    .digest('hex');
                const isolatedPort = 3101 + (parseInt(hash.substring(0, 4), 16) % 99);

                await config.update('serverPort', isolatedPort, vscode.ConfigurationTarget.Workspace);
                await serverManager.stopFrontend();
                await serverManager.stop();
                vscode.window.showInformationMessage(
                    `Switching to isolated server on port ${isolatedPort}. Reloading window...`,
                    'Reload'
                ).then(selection => {
                    if (selection === 'Reload') {
                        vscode.commands.executeCommand('workbench.action.reloadWindow');
                    }
                });
            }

            dashboardProvider?.postMessage({
                type: 'isolateServerStatus',
                data: { isolated: !isCurrentlyIsolated, port: isCurrentlyIsolated ? 3001 : currentPort }
            });
        }),

        vscode.commands.registerCommand('projectMemory.refreshData', () => {
            dashboardProvider.postMessage({ type: 'refresh' });
        })
    );
}
