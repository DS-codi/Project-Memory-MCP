/**
 * Dashboard View Provider
 * 
 * Provides the webview panel for the Project Memory dashboard.
 * Embeds the React dashboard application within VS Code.
 */

import * as vscode from 'vscode';
import * as crypto from 'crypto';
import * as path from 'path';

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

                case 'copyToClipboard':
                    const { text } = message.data as { text: string };
                    await vscode.env.clipboard.writeText(text);
                    vscode.window.showInformationMessage(`Copied to clipboard: ${text}`);
                    break;

                case 'showNotification':
                    const { level, text: notifText } = message.data as { level: 'info' | 'warning' | 'error'; text: string };
                    if (level === 'error') {
                        vscode.window.showErrorMessage(notifText);
                    } else if (level === 'warning') {
                        vscode.window.showWarningMessage(notifText);
                    } else {
                        vscode.window.showInformationMessage(notifText);
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

    private _getHtmlForWebview(webview: vscode.Webview): string {
        // Use a nonce for inline scripts
        const nonce = getNonce();
        
        // Get the configured API port
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get<number>('serverPort') || config.get<number>('apiPort') || 3001;
        const dashboardUrl = `http://localhost:5173`; // Vite dev server
        const workspaceId = this.getWorkspaceId() || '';
        const workspaceName = vscode.workspace.workspaceFolders?.[0]?.name || 'No workspace';

        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:* ws://localhost:*; frame-src http://localhost:*;">
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
        .info-card h3 { font-size: 13px; margin-bottom: 8px; }
        .info-card ul { list-style: none; font-size: 12px; }
        .info-card li { padding: 4px 0; display: flex; gap: 8px; }
        .info-card .label { color: var(--vscode-descriptionForeground); min-width: 80px; }
        
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
            padding: 12px 16px;
            cursor: pointer;
            user-select: none;
            gap: 8px;
        }
        .collapsible-header:hover {
            background: var(--vscode-list-hoverBackground);
        }
        .collapsible-header h3 { font-size: 13px; flex: 1; }
        .collapsible-header .count {
            background: var(--vscode-badge-background);
            color: var(--vscode-badge-foreground);
            padding: 2px 8px;
            border-radius: 10px;
            font-size: 11px;
        }
        .collapsible-header .chevron {
            transition: transform 0.2s;
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
        <h2>🧠 Project Memory</h2>
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
        
        let activePlans = [];
        let archivedPlans = [];
        
        // Listen for messages from the extension
        window.addEventListener('message', function(event) {
            const message = event.data;
            if (message.type === 'deploymentComplete') {
                const { type, count, targetDir } = message.data;
                showToast('✅ Deployed ' + count + ' ' + type + ' to workspace', 'success');
            } else if (message.type === 'deploymentError') {
                showToast('❌ ' + message.data.error, 'error');
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
            
            // Handle collapsible headers
            if (target.closest('.collapsible-header')) {
                const collapsible = target.closest('.collapsible');
                collapsible.classList.toggle('collapsed');
                return;
            }
            
            if (!target.matches('button')) return;
            
            const action = target.getAttribute('data-action');
            const command = target.getAttribute('data-command');
            const planId = target.getAttribute('data-plan-id');
            const copyText = target.getAttribute('data-copy');
            
            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'refresh') {
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            } else if (action === 'open-plan' && planId) {
                vscode.postMessage({ type: 'openPlan', data: { planId: planId, workspaceId: workspaceId } });
            } else if (action === 'copy' && copyText) {
                vscode.postMessage({ type: 'copyToClipboard', data: { text: copyText } });
            }
        });
        
        function renderPlanList(plans, type) {
            if (plans.length === 0) {
                return '<div class="empty-state">No ' + type + ' plans</div>';
            }
            return plans.map(plan => {
                const shortId = plan.id.split('_').pop() || plan.id.substring(0, 8);
                return \`
                    <div class="plan-item">
                        <div class="plan-info">
                            <div class="plan-title" title="\${plan.title}">\${plan.title}</div>
                            <div class="plan-meta">
                                <span>\${plan.category || 'general'}</span>
                                <span>•</span>
                                <span>\${plan.progress?.done || 0}/\${plan.progress?.total || 0} steps</span>
                            </div>
                        </div>
                        <span class="plan-status \${plan.status}">\${plan.status}</span>
                        <div class="plan-actions">
                            <button class="btn btn-small btn-secondary" data-action="copy" data-copy="\${plan.id}" title="Copy plan ID">📋</button>
                            <button class="btn btn-small" data-action="open-plan" data-plan-id="\${plan.id}" title="Open plan">→</button>
                        </div>
                    </div>
                \`;
            }).join('');
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
                    activePlans = (data.plans || []).filter(p => p.status === 'active');
                    archivedPlans = (data.plans || []).filter(p => p.status === 'archived');
                    updatePlanLists();
                }
            } catch (error) {
                console.log('Failed to fetch plans:', error);
            }
        }
        
        function updatePlanLists() {
            const activeList = document.getElementById('activePlansList');
            const archivedList = document.getElementById('archivedPlansList');
            const activeCount = document.getElementById('activeCount');
            const archivedCount = document.getElementById('archivedCount');
            
            if (activeList) activeList.innerHTML = renderPlanList(activePlans, 'active');
            if (archivedList) archivedList.innerHTML = renderPlanList(archivedPlans, 'archived');
            if (activeCount) activeCount.textContent = activePlans.length;
            if (archivedCount) archivedCount.textContent = archivedPlans.length;
        }
        
        async function checkServer() {
            const statusDot = document.getElementById('statusDot');
            const statusText = document.getElementById('statusText');
            const content = document.getElementById('content');
            const fallback = document.getElementById('fallback');
            
            try {
                const response = await fetch('http://localhost:' + apiPort + '/api/health');
                if (response.ok) {
                    const data = await response.json();
                    statusDot.className = 'status-dot';
                    statusText.textContent = 'Connected';
                    
                    // Show dashboard info with plan lists
                    fallback.innerHTML = \`
                        <div class="info-card">
                            <h3>📊 Server Status</h3>
                            <ul>
                                <li><span class="label">Status:</span> <span>✓ Running</span></li>
                                <li><span class="label">API Port:</span> <span>\${apiPort}</span></li>
                                <li><span class="label">Workspace:</span> <span>\${workspaceName}</span></li>
                            </ul>
                        </div>
                        <div style="padding: 8px 16px; display: flex; gap: 8px;">
                            <button class="btn" style="flex:1" data-action="open-browser">Open Full Dashboard</button>
                            <button class="btn btn-secondary" data-action="refresh">↻</button>
                        </div>
                        <div class="info-card">
                            <h3>⚡ Quick Actions</h3>
                            <ul>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.createPlan">Create New Plan</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployAgents">Deploy Agents</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployInstructions">Deploy Instructions</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployPrompts">Deploy Prompts</button></li>
                            </ul>
                        </div>
                        
                        <div class="info-card">
                            <h3>⚙️ Configuration</h3>
                            <ul>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.openSettings">Configure Defaults</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployDefaults">Deploy All Defaults</button></li>
                            </ul>
                        </div>
                        
                        <div class="collapsible" id="activePlansSection">
                            <div class="collapsible-header">
                                <span class="chevron">▼</span>
                                <h3>📋 Active Plans</h3>
                                <span class="count" id="activeCount">0</span>
                            </div>
                            <div class="collapsible-content" id="activePlansList">
                                <div class="empty-state">Loading...</div>
                            </div>
                        </div>
                        
                        <div class="collapsible collapsed" id="archivedPlansSection">
                            <div class="collapsible-header">
                                <span class="chevron">▼</span>
                                <h3>📦 Archived Plans</h3>
                                <span class="count" id="archivedCount">0</span>
                            </div>
                            <div class="collapsible-content" id="archivedPlansList">
                                <div class="empty-state">Loading...</div>
                            </div>
                        </div>
                    \`;
                    
                    // Fetch plans after rendering
                    fetchPlans();
                } else {
                    throw new Error('Server returned ' + response.status);
                }
            } catch (error) {
                statusDot.className = 'status-dot error';
                statusText.textContent = 'Disconnected';
                fallback.innerHTML = \`
                    <p>Dashboard server is not running</p>
                    <button class="btn" data-action="run-command" data-command="projectMemory.startServer">Start Server</button>
                    <button class="btn btn-secondary" data-action="refresh">Retry</button>
                    <div class="info-card" style="margin-top: 20px;">
                        <h3>💡 Troubleshooting</h3>
                        <ul>
                            <li>Check if port \${apiPort} is available</li>
                            <li>View server logs for errors</li>
                            <li>Try restarting the server</li>
                        </ul>
                        <button class="btn btn-secondary" style="margin-top: 12px" data-action="run-command" data-command="projectMemory.showServerLogs">Show Server Logs</button>
                    </div>
                \`;
            }
        }
        
        // Initial check
        checkServer();
        
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
