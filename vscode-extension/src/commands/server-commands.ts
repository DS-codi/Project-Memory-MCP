/**
 * Server/Connection management commands: detect, connect, disconnect, launch.
 * 
 * NOTE: The extension no longer spawns or manages server processes.
 * All components must be launched externally via the Supervisor.
 */

import * as vscode from 'vscode';
import { ConnectionManager } from '../server/ConnectionManager';
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
        vscode.commands.registerCommand('projectMemoryDev.showDashboard', () => {
            vscode.commands.executeCommand('workbench.view.extension.projectMemory');
        }),

        vscode.commands.registerCommand('projectMemoryDev.openDashboardPanel', async () => {
            // Check if dashboard is connected
            if (!connectionManager.isDashboardConnected) {
                const choice = await vscode.window.showWarningMessage(
                    'Dashboard server not detected. Launch Supervisor?',
                    'Launch Supervisor', 'Open Directory', 'Cancel'
                );

                if (choice === 'Launch Supervisor') {
                    await vscode.commands.executeCommand('project-memory-dev.launchSupervisor');
                    // Wait a bit for supervisor to start
                    await new Promise(resolve => setTimeout(resolve, 5000));
                    await connectionManager.detectAndConnect();
                } else if (choice === 'Open Directory') {
                    await vscode.commands.executeCommand('project-memory-dev.openSupervisorDirectory');
                    return;
                } else {
                    return;
                }
            }

            if (connectionManager.isDashboardConnected) {
                const dashboardUrl = `http://localhost:${getDashboardPort()}`;
                DashboardPanel.createOrShow(context.extensionUri, dashboardUrl);
            } else {
                vscode.window.showErrorMessage(
                    'Could not connect to dashboard. Ensure Supervisor is running.'
                );
            }
        }),

        vscode.commands.registerCommand('projectMemoryDev.toggleConnection', async () => {
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
                        vscode.commands.executeCommand('project-memory-dev.launchSupervisor');
                    } else if (choice === 'Open Directory') {
                        vscode.commands.executeCommand('project-memory-dev.openSupervisorDirectory');
                    }
                }
            }
        }),

        // DEPRECATED: These commands now show guidance instead of performing actions
        vscode.commands.registerCommand('projectMemoryDev.startServer', async () => {
            vscode.window.showInformationMessage(
                'The extension no longer starts servers. Launch the Supervisor instead.',
                'Launch Supervisor', 'Open Directory'
            ).then(choice => {
                if (choice === 'Launch Supervisor') {
                    vscode.commands.executeCommand('project-memory-dev.launchSupervisor');
                } else if (choice === 'Open Directory') {
                    vscode.commands.executeCommand('project-memory-dev.openSupervisorDirectory');
                }
            });
        }),

        vscode.commands.registerCommand('projectMemoryDev.stopServer', async () => {
            vscode.window.showInformationMessage(
                'The extension no longer controls servers. Stop the Supervisor using:\n' +
                '• stop-supervisor.ps1 script\n' +
                '• Close the supervisor terminal\n' +
                '• Use system task manager',
                'Open Directory'
            ).then(choice => {
                if (choice === 'Open Directory') {
                    vscode.commands.executeCommand('project-memory-dev.openSupervisorDirectory');
                }
            });
        }),

        vscode.commands.registerCommand('projectMemoryDev.restartServer', async () => {
            vscode.window.showInformationMessage(
                'The extension no longer restarts servers. To restart:\n' +
                '1. Stop the Supervisor (stop-supervisor.ps1 or Ctrl+C)\n' +
                '2. Launch it again (start-supervisor.ps1)',
                'Open Directory'
            ).then(choice => {
                if (choice === 'Open Directory') {
                    vscode.commands.executeCommand('project-memory-dev.openSupervisorDirectory');
                }
            });
        }),

        vscode.commands.registerCommand('projectMemoryDev.showServerLogs', () => {
            connectionManager.showLogs();
        }),

        // This command is potentially dangerous and no longer needed
        vscode.commands.registerCommand('projectMemoryDev.forceStopExternalServer', async () => {
            vscode.window.showWarningMessage(
                'Force-stopping external processes is no longer supported. ' +
                'Use stop-supervisor.ps1 or system task manager instead.'
            );
        }),

        vscode.commands.registerCommand('projectMemoryDev.isolateServer', async () => {
            vscode.window.showInformationMessage(
                'Isolation mode has been simplified. To use a different port:\n' +
                '1. Configure projectMemoryDev.serverPort in workspace settings\n' +
                '2. Launch a second Supervisor instance with a custom config pointing to that port\n' +
                '3. Reload VS Code window',
                'Learn More'
            ).then(choice => {
                if (choice === 'Learn More') {
                    vscode.env.openExternal(vscode.Uri.parse(
                        'https://github.com/project-memory/project-memory-mcp#isolation-mode'
                    ));
                }
            });
        }),

        vscode.commands.registerCommand('projectMemoryDev.refreshData', () => {
            dashboardProvider.postMessage({ type: 'refresh' });
        })
    );
}
