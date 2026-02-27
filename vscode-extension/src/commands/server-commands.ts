/**
 * Server/Connection management commands: detect, connect, disconnect, launch.
 * 
 * NOTE: The extension no longer spawns or manages server processes.
 * All components must be launched externally via the Supervisor.
 */

import * as vscode from 'vscode';
import { ConnectionManager } from '../server/ConnectionManager';
import { getDashboardFrontendUrl } from '../server/ContainerDetection';
import { DashboardViewProvider } from '../providers/DashboardViewProvider';
import { DashboardPanel } from '../ui/DashboardPanel';
import { notify } from '../utils/helpers';

export function registerServerCommands(
    context: vscode.ExtensionContext,
    connectionManager: ConnectionManager,
    dashboardProvider: DashboardViewProvider,
    getDashboardPort: () => number
): void {
    context.subscriptions.push(
        vscode.commands.registerCommand('projectMemory.showDashboard', () => {
            vscode.commands.executeCommand('workbench.view.extension.projectMemory');
        }),

        vscode.commands.registerCommand('projectMemory.openDashboardPanel', async (targetUrl?: string) => {
            // Check if dashboard is connected
            if (!connectionManager.isDashboardConnected) {
                const choice = await vscode.window.showWarningMessage(
                    'Dashboard server not detected. Launch Supervisor?',
                    'Launch Supervisor', 'Open Directory', 'Cancel'
                );

                if (choice === 'Launch Supervisor') {
                    await vscode.commands.executeCommand('project-memory.launchSupervisor');
                    // Wait a bit for supervisor to start
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await connectionManager.detectAndConnect();
                } else if (choice === 'Open Directory') {
                    await vscode.commands.executeCommand('project-memory.openSupervisorDirectory');
                    return;
                } else {
                    return;
                }
            }

            if (connectionManager.isDashboardConnected) {
                const dashboardUrl = targetUrl && targetUrl.trim().length > 0
                    ? targetUrl
                    : (getDashboardFrontendUrl() || `http://localhost:${getDashboardPort()}`);
                DashboardPanel.createOrShow(context.extensionUri, dashboardUrl);
            } else {
                vscode.window.showErrorMessage(
                    'Could not connect to dashboard. Ensure Supervisor is running.'
                );
            }
        }),

        vscode.commands.registerCommand('projectMemory.toggleConnection', async () => {
            if (connectionManager.isDashboardConnected) {
                connectionManager.disconnect();
                notify('Disconnected from Project Memory components');
            } else {
                const connected = await connectionManager.detectAndConnect();
                if (connected) {
                    notify('Connected to Project Memory components');
                } else {
                    const choice = await vscode.window.showWarningMessage(
                        'Components not detected. Launch Supervisor?',
                        'Launch Supervisor', 'Open Directory'
                    );
                    if (choice === 'Launch Supervisor') {
                        vscode.commands.executeCommand('project-memory.launchSupervisor');
                    } else if (choice === 'Open Directory') {
                        vscode.commands.executeCommand('project-memory.openSupervisorDirectory');
                    }
                }
            }
        }),

        vscode.commands.registerCommand('projectMemory.showServerLogs', () => {
            connectionManager.showLogs();
        }),

        vscode.commands.registerCommand('projectMemory.refreshData', () => {
            dashboardProvider.postMessage({ type: 'refresh' });
        })
    );
}
