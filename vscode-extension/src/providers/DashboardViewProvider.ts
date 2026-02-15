/**
 * Dashboard View Provider
 * 
 * Provides the webview panel for the Project Memory dashboard.
 * Embeds the React dashboard application within VS Code.
 */

import * as vscode from 'vscode';
import { resolveWorkspaceIdentity, computeFallbackWorkspaceId } from '../utils/workspace-identity';
import { getDashboardFrontendUrl } from '../server/ContainerDetection';
import { getWebviewHtml } from './dashboard-webview';
import {
    handleGetSkills, handleDeploySkill,
    handleGetInstructions, handleDeployInstruction, handleUndeployInstruction
} from './dashboard-webview/dashboard-message-handlers';

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

export interface Message {
    type: string;
    data?: unknown;
}

interface WorkspaceResolution {
    workspaceId: string;
    workspaceName: string;
    workspacePath: string;
    source: 'identity' | 'fallback';
}

export class DashboardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'projectMemory.dashboardView';

    private _view?: vscode.WebviewView;
    private _dataRoot: string;
    private _agentsRoot: string;
    private _disposables: vscode.Disposable[] = [];
    private _onResolveCallback?: () => void;

    constructor(
        private readonly _extensionUri: vscode.Uri,
        dataRoot: string,
        agentsRoot: string
    ) {
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
    }

    /**
     * Register a callback to be invoked once when the webview is first resolved.
     * Used for lazy server start — the server starts when the dashboard panel opens.
     */
    public onFirstResolve(callback: () => void): void {
        this._onResolveCallback = callback;
    }

    public dispose(): void {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // Compute workspace ID - checks identity.json first, falls back to hash
    private getWorkspaceId(): string | null {
        const resolution = this.resolveWorkspaceContext();
        return resolution?.workspaceId ?? null;
    }

    private resolveWorkspaceContext(): WorkspaceResolution | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return null;

        const fsPath = workspaceFolder.uri.fsPath;
        console.log('[PM Debug] getWorkspaceId for fsPath:', fsPath);
        const identity = resolveWorkspaceIdentity(fsPath);
        if (identity) {
            console.log('[PM Debug] Found identity:', identity.workspaceId, 'from', identity.projectPath);
            return {
                workspaceId: identity.workspaceId,
                workspaceName: identity.workspaceName,
                workspacePath: identity.projectPath,
                source: 'identity'
            };
        }
        const fallbackId = computeFallbackWorkspaceId(fsPath);
        console.log('[PM Debug] Using fallback ID:', fallbackId);
        return {
            workspaceId: fallbackId,
            workspaceName: workspaceFolder.name,
            workspacePath: fsPath,
            source: 'fallback'
        };
    }

    // Get workspace display name - checks identity.json first
    private getWorkspaceName(): string {
        const resolution = this.resolveWorkspaceContext();
        return resolution?.workspaceName ?? 'No workspace';
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        // Trigger lazy server start on first panel open
        if (this._onResolveCallback) {
            this._onResolveCallback();
            this._onResolveCallback = undefined; // fire once
        }

        // Dispose old listeners if view is being recreated
        this.dispose();
        
        this._view = webviewView;

        const workspaceResolution = this.resolveWorkspaceContext();
        if (workspaceResolution) {
            const startupMessage = `[Project Memory] Resolved workspace at panel startup: ${workspaceResolution.workspaceId} | ${workspaceResolution.workspacePath} | source=${workspaceResolution.source}`;
            console.log(startupMessage);
            notify(startupMessage);
        } else {
            console.log('[Project Memory] No workspace folder is available at panel startup.');
        }

        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'resources')
            ]
        };

        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);

        // Handle view disposal
        this._disposables.push(
            webviewView.onDidDispose(() => {
                this._view = undefined;
            })
        );

        // Handle messages from the webview
        this._disposables.push(
            webviewView.webview.onDidReceiveMessage(async (message: Message) => {
                console.log('Received message from webview:', message);
                switch (message.type) {
                    case 'openFile':
                        const { filePath, line } = message.data as { filePath: string; line?: number };
                        vscode.commands.executeCommand('projectMemory.openFile', filePath, line);
                        break;

                    case 'runCommand':
                        const { command, args } = message.data as { command: string; args?: unknown[] };
                        console.log('Executing command:', command);
                        try {
                            await vscode.commands.executeCommand(command, ...(Array.isArray(args) ? args : []));
                            console.log('Command executed successfully');
                    } catch (err) {
                        console.error('Command execution failed:', err);
                        vscode.window.showErrorMessage(`Command failed: ${err}`);
                    }
                    break;

                case 'openExternal':
                    const { url } = message.data as { url: string };
                    console.log('Opening dashboard panel:', url);
                    // Start frontend on-demand, then open panel
                    vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
                    break;

                case 'openPlan':
                    const { planId, workspaceId } = message.data as { planId: string; workspaceId: string };
                    const planUrl = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
                    console.log('Opening plan:', planUrl);
                    vscode.commands.executeCommand('projectMemory.openDashboardPanel', planUrl);
                    break;

                case 'openPlanRoute':
                    await this.openPlanRoute(message.data as { route: string; query?: string });
                    break;

                case 'planAction':
                    await this.runPlanAction(message.data as { action: 'archive' | 'resume' });
                    break;

                case 'isolateServer':
                    await vscode.commands.executeCommand('projectMemory.isolateServer');
                    break;

                case 'copyToClipboard':
                    const { text } = message.data as { text: string };
                    await vscode.env.clipboard.writeText(text);
                    notify(`Copied to clipboard: ${text}`);
                    break;

                case 'showNotification':
                    const { level, text: notifText } = message.data as { level: 'info' | 'warning' | 'error'; text: string };
                    if (level === 'error') {
                        vscode.window.showErrorMessage(notifText);
                    } else if (level === 'warning') {
                        vscode.window.showWarningMessage(notifText);
                    } else {
                        notify(notifText);
                    }
                    break;

                case 'revealInExplorer':
                    const { path } = message.data as { path: string };
                    vscode.commands.executeCommand('revealInExplorer', vscode.Uri.file(path));
                    break;

                case 'getConfig':
                    this.postMessage({
                        type: 'config',
                        data: {
                            dataRoot: this._dataRoot,
                            agentsRoot: this._agentsRoot,
                            workspaceFolders: vscode.workspace.workspaceFolders?.map(f => ({
                                name: f.name,
                                path: f.uri.fsPath
                            })) || []
                        }
                    });
                    break;

                case 'ready':
                    // Webview is ready, send initial config
                    this.postMessage({
                        type: 'init',
                        data: {
                            dataRoot: this._dataRoot,
                            agentsRoot: this._agentsRoot
                        }
                    });
                    break;

                case 'getSkills':
                    handleGetSkills(this);
                    break;

                case 'deploySkill':
                    handleDeploySkill(this, message.data as { skillName: string });
                    break;

                case 'getInstructions':
                    handleGetInstructions(this);
                    break;

                case 'deployInstruction':
                    handleDeployInstruction(this, message.data as { instructionName: string });
                    break;

                case 'undeployInstruction':
                    handleUndeployInstruction(this, message.data as { instructionName: string });
                    break;
            }
        })
        );
    }

    public postMessage(message: Message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }

    public updateConfig(dataRoot: string, agentsRoot: string) {
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
        this.postMessage({
            type: 'configUpdated',
            data: { dataRoot, agentsRoot }
        });
    }

    private getApiPort(): number {
        const config = vscode.workspace.getConfiguration('projectMemory');
        return config.get<number>('serverPort') || config.get<number>('apiPort') || 3001;
    }

    private getDashboardUrl(): string {
        return getDashboardFrontendUrl();
    }

    private async pickPlan(): Promise<{ workspaceId: string; planId: string } | null> {
        const workspaceId = this.getWorkspaceId();
        if (!workspaceId) {
            vscode.window.showErrorMessage('No workspace is open.');
            return null;
        }

        const port = this.getApiPort();
        try {
            const response = await fetch(`http://localhost:${port}/api/plans/workspace/${workspaceId}`);
            if (!response.ok) {
                vscode.window.showErrorMessage('Failed to load plans from the dashboard server.');
                return null;
            }
            const data: any = await response.json();
            const plans = Array.isArray(data.plans) ? data.plans : [];
            if (plans.length === 0) {
                vscode.window.showInformationMessage('No plans found for this workspace.');
                return null;
            }

            const picked = await vscode.window.showQuickPick(
                plans.map((plan: { title?: string; id?: string; plan_id?: string; status?: string }) => {
                    const id = plan.id || plan.plan_id || 'unknown';
                    return {
                        label: plan.title || id,
                        description: plan.status || 'unknown',
                        detail: id
                    };
                }),
                { placeHolder: 'Select a plan' }
            );

            if (!picked || !(picked as any).detail) {
                return null;
            }

            return { workspaceId, planId: (picked as any).detail };
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to load plans: ${error}`);
            return null;
        }
    }

    private async openPlanRoute(options: { route: string; query?: string }): Promise<void> {
        const selection = await this.pickPlan();
        if (!selection) {
            return;
        }

        const { workspaceId, planId } = selection;
        let url = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
        if (options.route === 'context') {
            url += '/context';
        } else if (options.route === 'build-scripts') {
            url += '/build-scripts';
        }

        if (options.query) {
            url += `?${options.query}`;
        }

        vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
    }

    private async runPlanAction(options: { action: 'archive' | 'resume' }): Promise<void> {
        const selection = await this.pickPlan();
        if (!selection) {
            return;
        }

        const { workspaceId, planId } = selection;
        const actionLabel = options.action === 'archive' ? 'Archive' : 'Resume';

        if (options.action === 'archive') {
            const confirm = await vscode.window.showWarningMessage(
                `Archive plan ${planId}?`,
                { modal: true },
                'Archive'
            );
            if (confirm !== 'Archive') {
                return;
            }
        }

        const port = this.getApiPort();
        try {
            const response = await fetch(
                `http://localhost:${port}/api/plans/${workspaceId}/${planId}/${options.action}`,
                { method: 'POST' }
            );
            if (!response.ok) {
                const errorText = await response.text();
                vscode.window.showErrorMessage(`Failed to ${options.action} plan: ${errorText}`);
                return;
            }

            notify(`${actionLabel}d plan ${planId}`);
            const url = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
            vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
        } catch (error) {
            vscode.window.showErrorMessage(`Failed to ${options.action} plan: ${error}`);
        }
    }

    private _getHtmlForWebview(webview: vscode.Webview): string {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get<number>('serverPort') || config.get<number>('apiPort') || 3001;
        const workspaceResolution = this.resolveWorkspaceContext();

        return getWebviewHtml({
            cspSource: webview.cspSource,
            apiPort,
            dashboardUrl: getDashboardFrontendUrl(),
            workspaceId: workspaceResolution?.workspaceId || '',
            workspaceName: workspaceResolution?.workspaceName || 'No workspace',
            dataRoot: JSON.stringify(this._dataRoot),
        });
    }
}

