/**
 * Dashboard View Provider
 * 
 * Provides the webview panel for the Project Memory dashboard.
 * Embeds the React dashboard application within VS Code.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';

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

export class DashboardViewProvider implements vscode.WebviewViewProvider {
    public static readonly viewType = 'projectMemory.dashboardView';

    private _view?: vscode.WebviewView;
    private _dataRoot: string;
    private _agentsRoot: string;
    private _disposables: vscode.Disposable[] = [];

    constructor(
        private readonly _extensionUri: vscode.Uri,
        dataRoot: string,
        agentsRoot: string
    ) {
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
    }

    public dispose(): void {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }

    // Compute workspace ID to match MCP server format exactly
    private getWorkspaceId(): string | null {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder) return null;
        
        const workspacePath = workspaceFolder.uri.fsPath;
        // Must match server's generateWorkspaceId: sha256, normalized lowercase path
        const normalizedPath = path.normalize(workspacePath).toLowerCase();
        const hash = crypto.createHash('sha256').update(normalizedPath).digest('hex').substring(0, 12);
        const folderName = path.basename(workspacePath).replace(/[^a-zA-Z0-9-_]/g, '-');
        return `${folderName}-${hash}`;
    }

    public resolveWebviewView(
        webviewView: vscode.WebviewView,
        context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken
    ) {
        // Dispose old listeners if view is being recreated
        this.dispose();
        
        this._view = webviewView;

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
                        const { command } = message.data as { command: string };
                        console.log('Executing command:', command);
                        try {
                            await vscode.commands.executeCommand(command);
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
                    const planUrl = `http://localhost:5173/workspace/${workspaceId}/plan/${planId}`;
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
        return 'http://localhost:5173';
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
            const data = await response.json();
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

            if (!picked || !picked.detail) {
                return null;
            }

            return { workspaceId, planId: picked.detail };
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
        // Use a nonce for inline scripts
        const nonce = getNonce();
        
        // Get the configured API port
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get<number>('serverPort') || config.get<number>('apiPort') || 3001;
        const dashboardUrl = `http://localhost:5173`; // Vite dev server
        const workspaceId = this.getWorkspaceId() || '';
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'No workspace';
        const dataRoot = JSON.stringify(this._dataRoot);
        const iconSvgs = {
            dashboard: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="7" height="9" x="3" y="3" rx="1"/><rect width="7" height="5" x="14" y="3" rx="1"/><rect width="7" height="9" x="14" y="12" rx="1"/><rect width="7" height="5" x="3" y="16" rx="1"/></svg>',
            knowledgeBase: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/></svg>',
            contextFiles: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/></svg>',
            contextFilesGrid: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18"/><path d="M3 15h6"/><path d="M15 3v18"/><path d="M15 9h6"/></svg>',
            agents: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" x2="19" y1="8" y2="14"/><line x1="22" x2="16" y1="11" y2="11"/></svg>',
            syncHistory: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 16-4 4-4-4"/><path d="M17 20V4"/><path d="m3 8 4-4 4 4"/><path d="M7 4v16"/></svg>',
            diagnostics: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>',
            newTemplate: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14"/><path d="M12 5v14"/></svg>',
            resumePlan: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 3l14 9-14 9V3z"/></svg>',
            archive: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="20" height="5" x="2" y="3" rx="1"/><path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>',
            addContextNote: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><path d="M15 3v6h6"/><path d="M9 18h6"/><path d="M10 14h4"/></svg>',
            researchNote: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/><path d="M15 12h-9"/></svg>',
            createNewPlan: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 20H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H20a2 2 0 0 1 2 2v4"/><circle cx="18" cy="18" r="3"/><path d="M18 15v6"/><path d="M15 18h6"/></svg>',
            deployAgents: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v9"/><path d="m16 11 3-3 3 3"/></svg>',
            deployInstructions: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1-2.5-2.5Z"/><path d="M6.5 15.5H20"/><path d="M14 11V7"/><path d="m11 10 3-3 3 3"/></svg>',
            deployPrompts: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 2-2-2-2"/><path d="M11 9h4"/><rect width="18" height="18" x="3" y="3" rx="2"/><path d="M12 15v4"/><path d="m9 18 3-3 3 3"/></svg>',
            configureDefaults: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/><path d="m9 12 2 2 4-4"/></svg>',
            deployAllDefaults: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l2-1.14"/><path d="M16.5 9.4 7.55 4.24"/><polyline points="3.29 7 12 12 20.71 7"/><line x1="12" y1="22" x2="12" y2="12"/><path d="M17 13h5"/><path d="M17 17h5"/><path d="M17 21h5"/></svg>',
            handoffEvent: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m16 13 4 4-4 4"/><path d="M20 17H4a2 2 0 0 1-2-2V5"/></svg>',
            noteEvent: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 1 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>',
            stepUpdate: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 11 3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>',
            searchBox: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>',
            buildScript: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="16 18 22 12 16 6"/><polyline points="8 6 2 12 8 18"/></svg>',
            runButton: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>',
            stopStale: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect width="10" height="10" x="7" y="7" rx="2"/></svg>',
            healthBadge: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>',
            dataRoot: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="3" y2="15"/></svg>',
            agentHandoff: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><polyline points="16 11 18 13 22 9"/></svg>',
            isolate: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/><path d="M15 3v18"/></svg>'
        };
        const iconsJson = JSON.stringify(iconSvgs);

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} vscode-resource: vscode-webview-resource: data:; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:* ws://localhost:*; frame-src http://localhost:*;">
    <title>Project Memory Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        html, body { 
            font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif); 
            background: var(--vscode-editor-background, #1e1e1e);
            color: var(--vscode-editor-foreground, #cccccc);
            min-height: 100%;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
        }
        .header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
            position: sticky;
            top: 0;
            background: var(--vscode-editor-background);
            z-index: 10;
        }
        .header h2 { font-size: 14px; font-weight: 600; }
        .status { 
            display: flex; 
            align-items: center; 
            gap: 6px;
            margin-left: auto;
            font-size: 12px;
        }
        .status-dot {
            width: 8px;
            height: 8px;
            border-radius: 50%;
            background: var(--vscode-testing-iconPassed);
        }
        .status-dot.error { background: var(--vscode-testing-iconFailed); }
        .status-dot.loading { background: var(--vscode-testing-iconQueued); animation: pulse 1s infinite; }
        @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }
        .header-btn {
            background: transparent;
            border: 1px solid var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
            padding: 2px 6px;
            border-radius: 3px;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 4px;
            font-size: 10px;
        }
        .header-btn:hover { background: var(--vscode-button-secondaryHoverBackground); }
        .header-btn svg { width: 12px; height: 12px; }
        .header-btn.isolated { border-color: var(--vscode-inputValidation-warningBorder); color: var(--vscode-inputValidation-warningBorder); }
        .content {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow-y: auto;
            padding-bottom: 20px;
        }
        .fallback {
            padding: 20px;
            text-align: center;
        }
        .fallback p { margin-bottom: 12px; color: var(--vscode-descriptionForeground); }
        .btn {
            background: var(--vscode-button-background);
            color: var(--vscode-button-foreground);
            border: none;
            padding: 8px 16px;
            border-radius: 4px;
            cursor: pointer;
            font-size: 13px;
            margin: 4px;
        }
        .btn:hover { background: var(--vscode-button-hoverBackground); }
        .btn-secondary {
            background: var(--vscode-button-secondaryBackground);
            color: var(--vscode-button-secondaryForeground);
        }
        .btn-small {
            padding: 4px 8px;
            font-size: 11px;
            margin: 2px;
        }
        .icon-grid {
            display: grid;
            grid-template-columns: repeat(5, 1fr);
            gap: 8px;
        }
        .icon-btn {
            border: 1px solid var(--vscode-panel-border);
            background: transparent;
            border-radius: 6px;
            padding: 8px 6px;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            color: var(--vscode-editor-foreground);
        }
        .icon-btn:hover { background: var(--vscode-list-hoverBackground); }
        .icon-btn:focus { outline: 1px solid var(--vscode-focusBorder); }
        .icon-btn svg {
            width: 18px;
            height: 18px;
            opacity: 0.9;
            display: block;
        }
        .icon-row-title {
            font-size: 11px;
            font-weight: 600;
            margin-bottom: 8px;
        }
        .plans-widget {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 0;
            overflow: hidden;
        }
        .plans-header {
            padding: 12px 16px;
            display: flex;
            align-items: center;
            gap: 8px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-header h3 {
            font-size: 12px;
            flex: 1;
        }
        .plans-tabs {
            display: grid;
            grid-template-columns: 1fr 1fr;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plans-tab {
            background: transparent;
            border: none;
            padding: 10px 12px;
            cursor: pointer;
            font-size: 12px;
            color: var(--vscode-editor-foreground);
        }
        .plans-tab .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 1px 6px;
            border-radius: 10px;
            font-size: 10px;
            margin-left: 6px;
        }
        .plans-tab.active {
            background: var(--vscode-list-hoverBackground);
            font-weight: 600;
        }
        .plans-content { max-height: 300px; overflow-y: auto; }
        .plans-pane { display: none; }
        .plans-pane.active { display: block; }
        .activity-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .activity-item {
            display: flex;
            align-items: center;
            gap: 8px;
            font-size: 12px;
        }
        .activity-item svg {
            width: 16px;
            height: 16px;
            opacity: 0.9;
            display: block;
        }
        body.size-small .icon-grid { grid-template-columns: repeat(3, 1fr); }
        body.size-medium .icon-grid { grid-template-columns: repeat(4, 1fr); }
        body.size-large .icon-grid { grid-template-columns: repeat(6, 1fr); }
        
        /* Toast notifications */
        .toast {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%) translateY(100px);
            background: var(--vscode-editor-background);
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px 16px;
            font-size: 12px;
            z-index: 1000;
            opacity: 0;
            transition: transform 0.3s ease, opacity 0.3s ease;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        }
        .toast.show {
            transform: translateX(-50%) translateY(0);
            opacity: 1;
        }
        .toast-success {
            border-color: var(--vscode-testing-iconPassed);
            color: var(--vscode-testing-iconPassed);
        }
        .toast-error {
            border-color: var(--vscode-testing-iconFailed);
            color: var(--vscode-testing-iconFailed);
        }
        
        .info-card {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 16px;
            margin: 12px 16px;
        }
        .info-card h3 { font-size: 12px; margin-bottom: 8px; }
        .info-card ul { list-style: none; font-size: 12px; }
        .info-card li { padding: 4px 0; display: flex; gap: 8px; }
        .info-card .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body ul { list-style: none; font-size: 12px; }
        .widget-body li { padding: 4px 0; display: flex; gap: 8px; }
        .label { color: var(--vscode-descriptionForeground); min-width: 80px; }

        .widget-body {
            padding: 12px 16px;
        }

        .stacked-sections {
            display: flex;
            flex-direction: row;
            gap: 12px;
        }

        .stacked-section {
            border: 1px solid var(--vscode-panel-border);
            border-radius: 6px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.02);
            flex: 1 1 0;
        }

        .stacked-section:first-child {
            flex: 2 1 0;
        }

        .stacked-section:last-child {
            flex: 3 1 0;
        }

        body.size-small .stacked-sections {
            flex-direction: column;
        }

        .status-divider {
            border-top: 1px solid var(--vscode-panel-border);
            margin: 10px 0;
            opacity: 0.6;
        }

        .status-list .label {
            min-width: 110px;
        }

        .status-value {
            font-size: 12px;
            font-weight: 600;
            word-break: break-word;
        }

        .status-value.status-ok {
            color: var(--vscode-testing-iconPassed);
        }

        .status-value.status-warn {
            color: var(--vscode-testing-iconQueued);
        }

        .status-value.status-bad {
            color: var(--vscode-testing-iconFailed);
        }

        .search-widget {
            margin: 12px 16px 4px;
            display: flex;
            flex-direction: column;
            gap: 6px;
        }

        .search-row {
            display: flex;
            align-items: center;
            gap: 8px;
            border: 1px solid var(--vscode-panel-border);
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            padding: 6px 8px;
        }

        .search-row svg {
            width: 16px;
            height: 16px;
            opacity: 0.85;
        }

        .search-input {
            flex: 1;
            background: transparent;
            border: none;
            color: var(--vscode-editor-foreground);
            font-size: 12px;
            outline: none;
        }
        
        /* Collapsible sections */
        .collapsible {
            background: var(--vscode-editor-inactiveSelectionBackground);
            border-radius: 6px;
            margin: 8px 16px;
            overflow: hidden;
        }
        .collapsible-header {
            display: flex;
            align-items: center;
            padding: 10px 14px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
            background: transparent;
            border: none;
            width: 100%;
            text-align: left;
            color: inherit;
        }
        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .collapsible-header h3 { font-size: 12px; flex: 1; }
        .collapsible-header .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .collapsible-header .chevron {
            display: inline-block;
            transform: rotate(90deg);
            transition: transform 0.2s;
            font-size: 12px;
        }
        .collapsible.collapsed .chevron { transform: rotate(-90deg); }
        .collapsible-content {
            max-height: 300px;
            overflow-y: auto;
            border-top: 1px solid var(--vscode-panel-border);
        }
        .collapsible.collapsed .collapsible-content { display: none; }
        
        /* Plan items */
        .plan-item {
            display: flex;
            align-items: center;
            padding: 10px 16px;
            gap: 10px;
            border-bottom: 1px solid var(--vscode-panel-border);
        }
        .plan-item:last-child { border-bottom: none; }
        .plan-item:hover { background: var(--vscode-list-hoverBackground); }
        .plan-info { flex: 1; min-width: 0; }
        .plan-title { 
            font-size: 12px; 
            font-weight: 500;
            white-space: nowrap;
            overflow: hidden;
            text-overflow: ellipsis;
        }
        .plan-meta {
            font-size: 10px;
            color: var(--vscode-descriptionForeground);
            display: flex;
            gap: 8px;
            margin-top: 2px;
        }
        .plan-status {
            padding: 2px 6px;
            border-radius: 3px;
            font-size: 10px;
            text-transform: uppercase;
        }
        .plan-status.active { background: var(--vscode-testing-iconPassed); color: white; }
        .plan-status.archived { background: var(--vscode-descriptionForeground); color: white; }
        .plan-actions { display: flex; gap: 4px; }
        
        .empty-state {
            padding: 20px;
            text-align: center;
            color: var(--vscode-descriptionForeground);
            font-size: 12px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h2>Project Memory</h2>
        <button class="header-btn" id="isolateBtn" data-action="isolate-server" title="Spawn isolated server for this workspace">
            ${iconSvgs.isolate}
            <span id="isolateBtnText">Isolate</span>
        </button>
        <div class="status">
            <span class="status-dot loading" id="statusDot"></span>
            <span id="statusText">Checking...</span>
        </div>
    </div>
    <div class="content" id="content">
        <div class="fallback" id="fallback">
            <p>Connecting to dashboard server...</p>
        </div>
    </div>
    
    <script nonce="${nonce}">
        const vscode = acquireVsCodeApi();
        const apiPort = ${apiPort};
        const dashboardUrl = '${dashboardUrl}';
        const workspaceId = '${workspaceId}';
        const workspaceName = '${workspaceName}';
        const dataRoot = ${dataRoot};
        const icons = ${iconsJson};
        
        let activePlans = [];
        let archivedPlans = [];
        let currentPlanTab = 'active';
        let recentEvents = [];
        let hasRenderedDashboard = false;
        let lastPlanSignature = '';
        
        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'deploymentComplete') {
                const { type, count, targetDir } = message.data;
                showToast('\u2714 Deployed ' + count + ' ' + type + ' to workspace', 'success');
            } else if (message.type === 'deploymentError') {
                showToast('\u274C ' + message.data.error, 'error');
            } else if (message.type === 'isolateServerStatus') {
                const { isolated, port } = message.data;
                const isolateBtn = document.getElementById('isolateBtn');
                const isolateBtnText = document.getElementById('isolateBtnText');
                if (isolateBtn && isolateBtnText) {
                    if (isolated) {
                        isolateBtn.classList.add('isolated');
                        isolateBtnText.textContent = 'Isolated:' + port;
                        isolateBtn.title = 'Running isolated server on port ' + port + '. Click to reconnect to shared server.';
                    } else {
                        isolateBtn.classList.remove('isolated');
                        isolateBtnText.textContent = 'Isolate';
                        isolateBtn.title = 'Spawn isolated server for this workspace';
                    }
                }
            }
        });
        
        // Toast notification system
        function showToast(message, type) {
            // Remove existing toasts
            const existingToast = document.querySelector('.toast');
            if (existingToast) existingToast.remove();
            
            const toast = document.createElement('div');
            toast.className = 'toast toast-' + type;
            toast.textContent = message;
            document.body.appendChild(toast);
            
            // Animate in
            setTimeout(() => toast.classList.add('show'), 10);
            
            // Remove after 3 seconds
            setTimeout(() => {
                toast.classList.remove('show');
                setTimeout(() => toast.remove(), 300);
            }, 3000);
        }
        
        // Use event delegation for button clicks (CSP-compliant)
        document.addEventListener('click', function(e) {
            const target = e.target;
            const button = target.closest('button');
            if (!button) return;

            const tab = button.getAttribute('data-tab');
            if (tab) {
                setPlanTab(tab);
                return;
            }
            
            const action = button.getAttribute('data-action');
            const command = button.getAttribute('data-command');
            const planId = button.getAttribute('data-plan-id');
            const copyText = button.getAttribute('data-copy');
            
            if (action === 'toggle-collapse') {
                const targetId = button.getAttribute('data-target');
                const targetEl = targetId ? document.getElementById(targetId) : null;
                if (targetEl) {
                    targetEl.classList.toggle('collapsed');
                }
                return;
            }

            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'open-context-files') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context' } });
            } else if (action === 'open-context-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=context' } });
            } else if (action === 'open-research-note') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'context', query: 'focus=research' } });
            } else if (action === 'open-build-scripts') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts' } });
            } else if (action === 'open-run-script') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'build-scripts', query: 'run=1' } });
            } else if (action === 'open-handoff') {
                vscode.postMessage({ type: 'openPlanRoute', data: { route: 'plan', query: 'tab=timeline' } });
            } else if (action === 'open-resume-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'resume' } });
            } else if (action === 'open-archive-plan') {
                vscode.postMessage({ type: 'planAction', data: { action: 'archive' } });
            } else if (action === 'refresh') {
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'isolate-server') {
                vscode.postMessage({ type: 'isolateServer' });
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'open-plan' && planId) {
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: workspaceId } });
            } else if (action === 'copy' && copyText) {
                vscode.postMessage({ type: 'copyToClipboard', data: { text: copyText } });
            } else if (action === 'open-search') {
                const input = document.getElementById('searchInput');
                const query = input ? input.value.trim() : '';
                openSearch(query);
            }
        });

        document.addEventListener('keydown', function(e) {
            const target = e.target;
            if (target && target.classList && target.classList.contains('search-input') && e.key === 'Enter') {
                const query = target.value.trim();
                openSearch(query);
            }
        });

        function openSearch(query) {
            const suffix = query ? '/search?q=' + encodeURIComponent(query) : '/search';
            vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl + suffix } });
        }
        
        function renderPlanList(plans, type) {
            if (plans.length === 0) {
                return '<div class="empty-state">No ' + type + ' plans</div>';
            }
            return plans.map(plan => {
                const planId = plan.id || plan.plan_id || 'unknown';
                const shortId = planId.split('_').pop() || planId.substring(0, 8);
                return \`
                    <div class="plan-item">
                        <div class="plan-info">
                            <div class="plan-title" title="\${plan.title}">\${plan.title}</div>
                            <div class="plan-meta">
                                <span>\${plan.category || 'general'}</span>
                                <span>&#8226;</span>
                                <span>\${plan.progress?.done || 0}/\${plan.progress?.total || 0} steps</span>
                            </div>
                        </div>
                        <span class="plan-status \${plan.status}">\${plan.status}</span>
                        <div class="plan-actions">
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${planId}" title="Copy plan ID">&#128203;</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${planId}" title="Open plan">&#8594;</button>
                        </div>
                    </div>
                \`;
            }).join('');
        }

        function setPlanTab(tab) {
            currentPlanTab = tab === 'archived' ? 'archived' : 'active';
            const activeTab = document.getElementById('plansTabActive');
            const archivedTab = document.getElementById('plansTabArchived');
            const activePane = document.getElementById('plansPaneActive');
            const archivedPane = document.getElementById('plansPaneArchived');

            if (activeTab) activeTab.classList.toggle('active', currentPlanTab === 'active');
            if (archivedTab) archivedTab.classList.toggle('active', currentPlanTab === 'archived');
            if (activePane) activePane.classList.toggle('active', currentPlanTab === 'active');
            if (archivedPane) archivedPane.classList.toggle('active', currentPlanTab === 'archived');
        }
        
        function getPlanSignature(plans) {
            return plans.map(plan => {
                const id = plan.id || plan.plan_id || 'unknown';
                const status = plan.status || 'unknown';
                const done = plan.progress?.done || 0;
                const total = plan.progress?.total || 0;
                return id + ':' + status + ':' + done + '/' + total;
            }).join('|');
        }

        async function fetchPlans() {
            if (!workspaceId) {
                console.log('No workspaceId, skipping plan fetch');
                return;
            }
            console.log('Fetching plans for workspace:', workspaceId);
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/plans/workspace/' + workspaceId);
                console.log('Plans response status:', response.status);
                if (response.ok) {
                    const data = await response.json();
                    console.log('Plans data:', data);
                    const nextActive = (data.plans || []).filter(p => p.status === 'active');
                    const nextArchived = (data.plans || []).filter(p => p.status === 'archived');
                    const signature = getPlanSignature(nextActive) + '||' + getPlanSignature(nextArchived);
                    if (signature !== lastPlanSignature) {
                        lastPlanSignature = signature;
                        activePlans = nextActive;
                        archivedPlans = nextArchived;
                        updatePlanLists();
                    }
                }
            } catch (error) {
                console.log('Failed to fetch plans:', error);
            }
        }
        
        function updatePlanLists() {
            const activeList = document.getElementById('plansListActive');
            const archivedList = document.getElementById('plansListArchived');
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');

            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;

            setPlanTab(currentPlanTab);
        }

        function eventLabel(event) {
            if (!event || !event.type) return 'Activity';
            switch (event.type) {
                case 'handoff_completed':
                case 'handoff_started':
                    return 'Handoff';
                case 'note_added':
                    return 'Note added';
                case 'step_updated':
                    return 'Step updated';
                case 'plan_created':
                    return 'Plan created';
                case 'plan_archived':
                    return 'Plan archived';
                default:
                    return event.type.replace(/_/g, ' ');
            }
        }

        function eventIcon(event) {
            if (!event || !event.type) return icons.diagnostics;
            if (event.type.startsWith('handoff')) return icons.handoffEvent;
            if (event.type === 'note_added') return icons.noteEvent;
            if (event.type === 'step_updated') return icons.stepUpdate;
            return icons.diagnostics;
        }

        function renderActivityList(events) {
            if (!events || events.length === 0) {
                return '<div class="empty-state">No recent activity</div>';
            }
            return events.map(event => {
                const label = eventLabel(event);
                const time = event.timestamp ? new Date(event.timestamp).toLocaleTimeString() : '';
                return \`
                    <div class="activity-item">
                        ${'${'}eventIcon(event)}
                        <span>${'${'}label}</span>
                        <span style="margin-left:auto; color: var(--vscode-descriptionForeground);">${'${'}time}</span>
                    </div>
                \`;
            }).join('');
        }

        async function fetchEvents() {
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/events');
                if (response.ok) {
                    const data = await response.json();
                    recentEvents = (data.events || []).slice(0, 5);
                    const activityList = document.getElementById('activityList');
                    if (activityList) {
                        activityList.innerHTML = renderActivityList(recentEvents);
                    }
                }
            } catch (error) {
                console.log('Failed to fetch events:', error);
            }
        }

        function updateStatusCards(data) {
            const healthValue = document.getElementById('healthStatusValue');
            const staleValue = document.getElementById('staleStatusValue');
            const dataRootValue = document.getElementById('dataRootValue');

            function setStatusClass(element, state) {
                if (!element) return;
                element.classList.remove('status-ok', 'status-warn', 'status-bad');
                if (state) {
                    element.classList.add(state);
                }
            }

            if (healthValue) {
                if (data && typeof data.status === 'string') {
                    healthValue.textContent = data.status;
                    setStatusClass(healthValue, data.status === 'ok' ? 'status-ok' : 'status-warn');
                } else if (data && data.ok === true) {
                    healthValue.textContent = 'Healthy';
                    setStatusClass(healthValue, 'status-ok');
                } else if (data && data.ok === false) {
                    healthValue.textContent = 'Unhealthy';
                    setStatusClass(healthValue, 'status-bad');
                } else {
                    healthValue.textContent = 'Connected';
                    setStatusClass(healthValue, null);
                }
            }

            if (staleValue) {
                if (data && typeof data.stale_count === 'number') {
                    staleValue.textContent = data.stale_count === 0 ? 'None' : data.stale_count + ' stale';
                    setStatusClass(staleValue, data.stale_count === 0 ? 'status-ok' : 'status-warn');
                } else if (data && Array.isArray(data.stale_processes)) {
                    staleValue.textContent = data.stale_processes.length === 0 ? 'None' : data.stale_processes.length + ' stale';
                    setStatusClass(staleValue, data.stale_processes.length === 0 ? 'status-ok' : 'status-warn');
                } else if (data && typeof data.stale === 'boolean') {
                    staleValue.textContent = data.stale ? 'Stale' : 'Fresh';
                    setStatusClass(staleValue, data.stale ? 'status-warn' : 'status-ok');
                } else {
                    staleValue.textContent = 'Not available';
                    setStatusClass(staleValue, null);
                }
            }

            if (dataRootValue) {
                dataRootValue.textContent = dataRoot || 'Unknown';
            }
        }

        function setLayoutSize(width) {
            document.body.classList.remove('size-small', 'size-medium', 'size-large');
            if (width < 300) {
                document.body.classList.add('size-small');
            } else if (width < 420) {
                document.body.classList.add('size-medium');
            } else {
                document.body.classList.add('size-large');
            }
        }

        const sizeObserver = new ResizeObserver(entries => {
            for (const entry of entries) {
                setLayoutSize(entry.contentRect.width);
            }
        });
        sizeObserver.observe(document.body);

        async function checkServer() {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const fallback = document.getElementById('fallback');

            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/health');
                if (response.ok) {
                    const data = await response.json();
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';

                    if (!hasRenderedDashboard) {
                        fallback.innerHTML = \`
                            <div class="search-widget">
                                <div class="search-row">
                                    ${iconSvgs.searchBox}
                                    <input class="search-input" id="searchInput" placeholder="Search across memory" />
                                    <button class="btn btn-small" data-action="open-search">Go</button>
                                </div>
                            </div>

                            <section class="collapsible" id="widget-status">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-status">
                                    <span class="chevron">></span>
                                    <h3>Status</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <ul>
                                            <li><span class="label">Status:</span> <span>Running</span></li>
                                            <li><span class="label">API Port:</span> <span>${apiPort}</span></li>
                                            <li><span class="label">Workspace:</span> <span>${workspaceName}</span></li>
                                        </ul>
                                        <div class="status-divider"></div>
                                        <ul class="status-list">
                                            <li><span class="label">Workspace Health</span> <span class="status-value" id="healthStatusValue">Checking...</span></li>
                                            <li><span class="label">Stale/Stop</span> <span class="status-value" id="staleStatusValue">Checking...</span></li>
                                            <li><span class="label">Data Root</span> <span class="status-value" id="dataRootValue">Loading...</span></li>
                                        </ul>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-actions">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-actions">
                                    <span class="chevron">></span>
                                    <h3>Actions Panel</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="icon-grid">
                                            <button class="icon-btn" data-action="open-browser" title="Open Full Dashboard">
                                                ${iconSvgs.dashboard}
                                            </button>
                                            <button class="icon-btn" data-action="refresh" title="Refresh Status">
                                                ${iconSvgs.syncHistory}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.createPlan" title="Create New Plan">
                                                ${iconSvgs.createNewPlan}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployAgents" title="Deploy Agents">
                                                ${iconSvgs.deployAgents}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployInstructions" title="Deploy Instructions">
                                                ${iconSvgs.deployInstructions}
                                            </button>
                                            <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployPrompts" title="Deploy Prompts">
                                                ${iconSvgs.deployPrompts}
                                            </button>
                                            <button class="icon-btn" data-action="open-resume-plan" title="Resume Plan">
                                                ${iconSvgs.resumePlan}
                                            </button>
                                            <button class="icon-btn" data-action="open-archive-plan" title="Archive Plan">
                                                ${iconSvgs.archive}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-config-context">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-config-context">
                                    <span class="chevron">></span>
                                    <h3>Configuration & Context</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="stacked-sections">
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Configuration</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.openSettings" title="Configure Defaults">
                                                        ${iconSvgs.configureDefaults}
                                                    </button>
                                                    <button class="icon-btn" data-action="run-command" data-command="projectMemory.deployDefaults" title="Deploy All Defaults">
                                                        ${iconSvgs.deployAllDefaults}
                                                    </button>
                                                </div>
                                            </div>
                                            <div class="stacked-section">
                                                <div class="icon-row-title">Context</div>
                                                <div class="icon-grid">
                                                    <button class="icon-btn" data-action="open-context-note" title="Add Context Note">
                                                        ${iconSvgs.addContextNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-research-note" title="Add Research Note">
                                                        ${iconSvgs.researchNote}
                                                    </button>
                                                    <button class="icon-btn" data-action="open-context-files" title="View Context Files">
                                                        ${iconSvgs.contextFilesGrid}
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-plans">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-plans">
                                    <span class="chevron">></span>
                                    <h3>Plans</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="plans-widget">
                                        <div class="plans-header">
                                            <h3>Plans</h3>
                                        </div>
                                        <div class="plans-tabs">
                                            <button class="plans-tab active" id="plansTabActive" data-tab="active">
                                                Active <span class="count" id="activeCount">0</span>
                                            </button>
                                            <button class="plans-tab" id="plansTabArchived" data-tab="archived">
                                                Archived <span class="count" id="archivedCount">0</span>
                                            </button>
                                        </div>
                                        <div class="plans-content">
                                            <div class="plans-pane active" id="plansPaneActive">
                                                <div id="plansListActive">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                            <div class="plans-pane" id="plansPaneArchived">
                                                <div id="plansListArchived">
                                                    <div class="empty-state">Loading...</div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-activity">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-activity">
                                    <span class="chevron">></span>
                                    <h3>Recent Activity</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="activity-list" id="activityList">
                                            <div class="empty-state">Loading activity...</div>
                                        </div>
                                    </div>
                                </div>
                            </section>

                            <section class="collapsible" id="widget-build">
                                <button class="collapsible-header" data-action="toggle-collapse" data-target="widget-build">
                                    <span class="chevron">></span>
                                    <h3>Build & System</h3>
                                </button>
                                <div class="collapsible-content">
                                    <div class="widget-body">
                                        <div class="icon-grid">
                                            <button class="icon-btn" data-action="open-build-scripts" title="Build Scripts">
                                                ${iconSvgs.buildScript}
                                            </button>
                                            <button class="icon-btn" data-action="open-run-script" title="Run Script">
                                                ${iconSvgs.runButton}
                                            </button>
                                            <button class="icon-btn" data-action="open-handoff" title="Agent Handoff">
                                                ${iconSvgs.agentHandoff}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            </section>
                        \`;
                        hasRenderedDashboard = true;
                    }

                    updateStatusCards(data);
                    fetchPlans();
                    fetchEvents();
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (error) {
                const errorText = error && error.message ? error.message : String(error);
                console.error('Health check failed:', errorText);
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
                hasRenderedDashboard = false;
                fallback.innerHTML = \`
                    <p>Dashboard server is not running</p>
                    <p style="margin-top: 8px; color: var(--vscode-descriptionForeground); font-size: 11px;">Health check: ${'${'}errorText}</p>
                    <button class="btn" data-action="run-command" data-command="projectMemory.startServer">Start Server</button>
                    <button class="btn btn-secondary" data-action="refresh">Retry</button>
                    <div class="info-card" style="margin-top: 20px;">
                        <h3>Troubleshooting</h3>
                        <ul>
                            <li>Check if port \${apiPort} is available</li>
                            <li>View server logs for errors</li>
                            <li>Try restarting the server</li>
                        </ul>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.showServerLogs">Show Server Logs</button>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.forceStopExternalServer">Force Stop External Server</button>
                    </div>
                \`;
            }
        }
        
        // Initial check
        checkServer();
        
        // Initialize isolated button state based on current port
        (function initIsolateButton() {
            const isIsolated = apiPort !== 3001;
            const isolateBtn = document.getElementById('isolateBtn');
            const isolateBtnText = document.getElementById('isolateBtnText');
            if (isolateBtn && isolateBtnText && isIsolated) {
                isolateBtn.classList.add('isolated');
                isolateBtnText.textContent = 'Isolated:' + apiPort;
                isolateBtn.title = 'Running isolated server on port ' + apiPort + '. Click to reconnect to shared server.';
            }
        })();
        
        // Periodic check every 30 seconds (reduced from 10 for performance)
        setInterval(checkServer, 30000);
        
        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}

function getNonce(): string {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
