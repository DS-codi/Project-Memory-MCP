"use strict";
/**
 * Dashboard View Provider
 *
 * Provides the webview panel for the Project Memory dashboard.
 * Embeds the React dashboard application within VS Code.
 */
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.DashboardViewProvider = void 0;
const vscode = __importStar(require("vscode"));
class DashboardViewProvider {
    _extensionUri;
    static viewType = 'projectMemory.dashboardView';
    _view;
    _dataRoot;
    _agentsRoot;
    constructor(_extensionUri, dataRoot, agentsRoot) {
        this._extensionUri = _extensionUri;
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
    }
    resolveWebviewView(webviewView, context, _token) {
        this._view = webviewView;
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [
                vscode.Uri.joinPath(this._extensionUri, 'webview', 'dist'),
                vscode.Uri.joinPath(this._extensionUri, 'resources')
            ]
        };
        webviewView.webview.html = this._getHtmlForWebview(webviewView.webview);
        // Handle messages from the webview
        webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('Received message from webview:', message);
            switch (message.type) {
                case 'openFile':
                    const { filePath, line } = message.data;
                    vscode.commands.executeCommand('projectMemory.openFile', filePath, line);
                    break;
                case 'runCommand':
                    const { command } = message.data;
                    console.log('Executing command:', command);
                    try {
                        await vscode.commands.executeCommand(command);
                        console.log('Command executed successfully');
                    }
                    catch (err) {
                        console.error('Command execution failed:', err);
                        vscode.window.showErrorMessage(`Command failed: ${err}`);
                    }
                    break;
                case 'openExternal':
                    const { url } = message.data;
                    console.log('Opening in Simple Browser:', url);
                    // Open in VS Code's Simple Browser instead of external browser
                    vscode.commands.executeCommand('simpleBrowser.show', url);
                    break;
                case 'showNotification':
                    const { level, text } = message.data;
                    if (level === 'error') {
                        vscode.window.showErrorMessage(text);
                    }
                    else if (level === 'warning') {
                        vscode.window.showWarningMessage(text);
                    }
                    else {
                        vscode.window.showInformationMessage(text);
                    }
                    break;
                case 'revealInExplorer':
                    const { path } = message.data;
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
        });
    }
    postMessage(message) {
        if (this._view) {
            this._view.webview.postMessage(message);
        }
    }
    updateConfig(dataRoot, agentsRoot) {
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
        this.postMessage({
            type: 'configUpdated',
            data: { dataRoot, agentsRoot }
        });
    }
    _getHtmlForWebview(webview) {
        // Use a nonce for inline scripts
        const nonce = getNonce();
        // Get the configured API port
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get('serverPort') || config.get('apiPort') || 3001;
        const dashboardUrl = `http://localhost:5173`; // Vite dev server
        return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}'; connect-src http://localhost:*; frame-src http://localhost:*;">
    <title>Project Memory Dashboard</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { 
            font-family: var(--vscode-font-family); 
            background: var(--vscode-editor-background);
            color: var(--vscode-editor-foreground);
            height: 100vh;
            display: flex;
            flex-direction: column;
        }
        .header {
            padding: 12px 16px;
            border-bottom: 1px solid var(--vscode-panel-border);
            display: flex;
            align-items: center;
            gap: 8px;
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
            overflow: hidden;
        }
        iframe {
            flex: 1;
            border: none;
            width: 100%;
            height: 100%;
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
        
        // Use event delegation for button clicks (CSP-compliant)
        document.addEventListener('click', function(e) {
            const target = e.target;
            if (!target.matches('button')) return;
            
            const action = target.getAttribute('data-action');
            const command = target.getAttribute('data-command');
            
            if (action === 'open-browser') {
                vscode.postMessage({ type: 'openExternal', data: { url: dashboardUrl } });
            } else if (action === 'refresh') {
                const statusDot = document.getElementById('statusDot');
                statusDot.className = 'status-dot loading';
                checkServer();
            } else if (action === 'run-command' && command) {
                vscode.postMessage({ type: 'runCommand', data: { command: command } });
            }
        });
        
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
                    
                    // Show dashboard info - using data-action instead of onclick
                    fallback.innerHTML = \`
                        <div class="info-card">
                            <h3>📊 Server Status</h3>
                            <ul>
                                <li><span class="label">Status:</span> <span>✓ Running</span></li>
                                <li><span class="label">API Port:</span> <span>\${apiPort}</span></li>
                                <li><span class="label">Data Root:</span> <span>\${data.dataRoot || 'Not set'}</span></li>
                            </ul>
                        </div>
                        <div style="padding: 16px;">
                            <button class="btn" data-action="open-browser">Open Full Dashboard</button>
                            <button class="btn btn-secondary" data-action="refresh">Refresh</button>
                        </div>
                        <div class="info-card">
                            <h3>⚡ Quick Actions</h3>
                            <ul>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.createPlan">Create New Plan</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployAgents">Deploy Agents</button></li>
                                <li><button class="btn btn-secondary" style="width:100%" data-action="run-command" data-command="projectMemory.deployCopilotConfig">Deploy Copilot Config</button></li>
                            </ul>
                        </div>
                    \`;
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
        
        // Periodic check every 10 seconds
        setInterval(checkServer, 10000);
        
        // Signal ready
        vscode.postMessage({ type: 'ready' });
    </script>
</body>
</html>`;
    }
}
exports.DashboardViewProvider = DashboardViewProvider;
function getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
        text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
}
//# sourceMappingURL=DashboardViewProvider.js.map