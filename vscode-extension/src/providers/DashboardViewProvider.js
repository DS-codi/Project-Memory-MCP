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
const workspace_identity_1 = require("../utils/workspace-identity");
const ContainerDetection_1 = require("../server/ContainerDetection");
const dashboard_webview_1 = require("./dashboard-webview");
const dashboard_message_handlers_1 = require("./dashboard-webview/dashboard-message-handlers");
function notify(message, ...items) {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}
class DashboardViewProvider {
    _extensionUri;
    static viewType = 'projectMemory.dashboardView';
    _view;
    _dataRoot;
    _agentsRoot;
    _disposables = [];
    _onResolveCallback;
    constructor(_extensionUri, dataRoot, agentsRoot) {
        this._extensionUri = _extensionUri;
        this._dataRoot = dataRoot;
        this._agentsRoot = agentsRoot;
    }
    /**
     * Register a callback to be invoked once when the webview is first resolved.
     * Used for lazy server start — the server starts when the dashboard panel opens.
     */
    onFirstResolve(callback) {
        this._onResolveCallback = callback;
    }
    dispose() {
        while (this._disposables.length) {
            const disposable = this._disposables.pop();
            if (disposable) {
                disposable.dispose();
            }
        }
    }
    // Compute workspace ID - checks identity.json first, falls back to hash
    getWorkspaceId() {
        const resolution = this.resolveWorkspaceContext();
        return resolution?.workspaceId ?? null;
    }
    resolveWorkspaceContext() {
        const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
        if (!workspaceFolder)
            return null;
        const fsPath = workspaceFolder.uri.fsPath;
        console.log('[PM Debug] getWorkspaceId for fsPath:', fsPath);
        const identity = (0, workspace_identity_1.resolveWorkspaceIdentity)(fsPath);
        if (identity) {
            console.log('[PM Debug] Found identity:', identity.workspaceId, 'from', identity.projectPath);
            return {
                workspaceId: identity.workspaceId,
                workspaceName: identity.workspaceName,
                workspacePath: identity.projectPath,
                source: 'identity'
            };
        }
        const fallbackId = (0, workspace_identity_1.computeFallbackWorkspaceId)(fsPath);
        console.log('[PM Debug] Using fallback ID:', fallbackId);
        return {
            workspaceId: fallbackId,
            workspaceName: workspaceFolder.name,
            workspacePath: fsPath,
            source: 'fallback'
        };
    }
    // Get workspace display name - checks identity.json first
    getWorkspaceName() {
        const resolution = this.resolveWorkspaceContext();
        return resolution?.workspaceName ?? 'No workspace';
    }
    resolveWebviewView(webviewView, context, _token) {
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
            console.log(`[PM] Resolved workspace: ${workspaceResolution.workspaceId} | ${workspaceResolution.workspacePath} | source=${workspaceResolution.source}`);
        }
        else {
            console.log('[PM] No workspace folder is available at panel startup.');
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
        this._disposables.push(webviewView.onDidDispose(() => {
            this._view = undefined;
        }));
        // Handle messages from the webview
        this._disposables.push(webviewView.webview.onDidReceiveMessage(async (message) => {
            console.log('Received message from webview:', message);
            switch (message.type) {
                case 'openFile':
                    const { filePath, line } = message.data;
                    vscode.commands.executeCommand('projectMemory.openFile', filePath, line);
                    break;
                case 'runCommand':
                    const { command, args } = message.data;
                    console.log('Executing command:', command);
                    try {
                        await vscode.commands.executeCommand(command, ...(Array.isArray(args) ? args : []));
                        console.log('Command executed successfully');
                    }
                    catch (err) {
                        console.error('Command execution failed:', err);
                        vscode.window.showErrorMessage(`Command failed: ${err}`);
                    }
                    break;
                case 'openExternal':
                    const { url } = message.data;
                    console.log('Opening dashboard panel:', url);
                    // Start frontend on-demand, then open panel
                    vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
                    break;
                case 'openPlan':
                    const { planId, workspaceId } = message.data;
                    const planUrl = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
                    console.log('Opening plan:', planUrl);
                    vscode.commands.executeCommand('projectMemory.openDashboardPanel', planUrl);
                    break;
                case 'openPlanInBrowser':
                    const { planId: browserPlanId, workspaceId: browserWorkspaceId } = message.data;
                    const browserPlanUrl = `${this.getDashboardUrl()}/workspace/${browserWorkspaceId}/plan/${browserPlanId}`;
                    console.log('Opening plan in external browser:', browserPlanUrl);
                    await vscode.env.openExternal(vscode.Uri.parse(browserPlanUrl));
                    break;
                case 'openPlanRoute':
                    await this.openPlanRoute(message.data);
                    break;
                case 'planAction':
                    await this.runPlanAction(message.data);
                    break;
                case 'isolateServer':
                    await vscode.commands.executeCommand('projectMemory.isolateServer');
                    break;
                case 'copyToClipboard':
                    const { text } = message.data;
                    await vscode.env.clipboard.writeText(text);
                    notify(`Copied to clipboard: ${text}`);
                    break;
                case 'showNotification':
                    const { level, text: notifText } = message.data;
                    if (level === 'error') {
                        vscode.window.showErrorMessage(notifText);
                    }
                    else if (level === 'warning') {
                        vscode.window.showWarningMessage(notifText);
                    }
                    else {
                        notify(notifText);
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
                    // Webview is ready, send initial config (including workspaceId in case it was
                    // empty when the webview HTML was generated on early startup)
                    this.postMessage({
                        type: 'init',
                        data: {
                            dataRoot: this._dataRoot,
                            agentsRoot: this._agentsRoot,
                            workspaceId: this.resolveWorkspaceContext()?.workspaceId || '',
                        }
                    });
                    break;
                case 'getSkills':
                    (0, dashboard_message_handlers_1.handleGetSkills)(this);
                    break;
                case 'deploySkill':
                    (0, dashboard_message_handlers_1.handleDeploySkill)(this, message.data);
                    break;
                case 'getInstructions':
                    (0, dashboard_message_handlers_1.handleGetInstructions)(this);
                    break;
                case 'deployInstruction':
                    (0, dashboard_message_handlers_1.handleDeployInstruction)(this, message.data);
                    break;
                case 'undeployInstruction':
                    (0, dashboard_message_handlers_1.handleUndeployInstruction)(this, message.data);
                    break;
                case 'getSessions':
                case 'stopSession':
                case 'injectSession':
                case 'clearAllSessions':
                case 'forceCloseSession':
                    // Session management has been archived (Plan 01: Extension Strip-Down).
                    // The dashboard may still send these messages — respond with empty data.
                    this.postMessage({ type: 'sessionsList', data: { sessions: [] } });
                    break;
                case 'openWorkspaceFolder': {
                    const folderUri = vscode.workspace.workspaceFolders?.[0]?.uri;
                    if (folderUri) {
                        await vscode.commands.executeCommand('revealFileInOS', folderUri);
                    }
                    else {
                        vscode.window.showWarningMessage('No workspace folder is open.');
                    }
                    break;
                }
                case 'copySupervisorCommand': {
                    const wsPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    if (wsPath) {
                        const scriptPath = require('path').join(wsPath, 'start-supervisor.ps1');
                        await vscode.env.clipboard.writeText(scriptPath);
                        this.postMessage({ type: 'supervisorCommandCopied', data: { path: scriptPath } });
                        notify(`Copied: ${scriptPath}`);
                    }
                    else {
                        vscode.window.showWarningMessage('No workspace folder is open.');
                    }
                    break;
                }
                case 'openWorkspaceTerminal': {
                    const wsTerminalPath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
                    const terminal = vscode.window.createTerminal({
                        name: 'Project Memory',
                        cwd: wsTerminalPath
                    });
                    terminal.show();
                    break;
                }
                case 'configureSupervisorPath': {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'supervisor.launcherPath');
                    break;
                }
            }
        }));
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
    getApiPort() {
        const config = vscode.workspace.getConfiguration('projectMemory');
        return config.get('serverPort') || config.get('apiPort') || 3001;
    }
    getDashboardUrl() {
        return (0, ContainerDetection_1.getDashboardFrontendUrl)();
    }
    async pickPlan() {
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
            const nested = data?.data && !Array.isArray(data.data) ? data.data : undefined;
            const plans = Array.isArray(data)
                ? data
                : Array.isArray(data?.plans)
                    ? data.plans
                    : Array.isArray(data?.active_plans)
                        ? data.active_plans
                        : Array.isArray(data?.data)
                            ? data.data
                            : Array.isArray(nested?.plans)
                                ? nested.plans
                                : Array.isArray(nested?.active_plans)
                                    ? nested.active_plans
                                    : Array.isArray(nested?.data)
                                        ? nested.data
                                        : [];
            if (plans.length === 0) {
                vscode.window.showInformationMessage('No plans found for this workspace.');
                return null;
            }
            const picked = await vscode.window.showQuickPick(plans.map((plan) => {
                const id = plan.id || plan.plan_id || 'unknown';
                return {
                    label: plan.title || id,
                    description: plan.status || 'unknown',
                    detail: id
                };
            }), { placeHolder: 'Select a plan' });
            if (!picked || !picked.detail) {
                return null;
            }
            return { workspaceId, planId: picked.detail };
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to load plans: ${error}`);
            return null;
        }
    }
    async resolvePlanSelection(options) {
        const explicitPlanId = options?.planId?.trim();
        const explicitWorkspaceId = options?.workspaceId?.trim();
        if (explicitPlanId && explicitWorkspaceId) {
            return {
                workspaceId: explicitWorkspaceId,
                planId: explicitPlanId,
            };
        }
        return this.pickPlan();
    }
    async openPlanRoute(options) {
        const selection = await this.resolvePlanSelection(options);
        if (!selection) {
            return;
        }
        const { workspaceId, planId } = selection;
        let url = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
        if (options.route === 'context') {
            url += '/context';
        }
        else if (options.route === 'build-scripts') {
            url += '/build-scripts';
        }
        if (options.query) {
            url += `?${options.query}`;
        }
        vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
    }
    async runPlanAction(options) {
        const selection = await this.resolvePlanSelection(options);
        if (!selection) {
            return;
        }
        const { workspaceId, planId } = selection;
        const actionLabel = options.action === 'archive' ? 'Archive' : 'Resume';
        if (options.action === 'archive') {
            const confirm = await vscode.window.showWarningMessage(`Archive plan ${planId}?`, { modal: true }, 'Archive');
            if (confirm !== 'Archive') {
                return;
            }
        }
        const port = this.getApiPort();
        try {
            const response = await fetch(`http://localhost:${port}/api/plans/${workspaceId}/${planId}/${options.action}`, { method: 'POST' });
            if (!response.ok) {
                const errorText = await response.text();
                vscode.window.showErrorMessage(`Failed to ${options.action} plan: ${errorText}`);
                return;
            }
            notify(`${actionLabel}d plan ${planId}`);
            const url = `${this.getDashboardUrl()}/workspace/${workspaceId}/plan/${planId}`;
            vscode.commands.executeCommand('projectMemory.openDashboardPanel', url);
        }
        catch (error) {
            vscode.window.showErrorMessage(`Failed to ${options.action} plan: ${error}`);
        }
    }
    _getHtmlForWebview(webview) {
        const config = vscode.workspace.getConfiguration('projectMemory');
        const apiPort = config.get('serverPort') || config.get('apiPort') || 3001;
        const workspaceResolution = this.resolveWorkspaceContext();
        return (0, dashboard_webview_1.getWebviewHtml)({
            cspSource: webview.cspSource,
            apiPort,
            dashboardUrl: (0, ContainerDetection_1.getDashboardFrontendUrl)(),
            workspaceId: workspaceResolution?.workspaceId || '',
            workspaceName: workspaceResolution?.workspaceName || 'No workspace',
            dataRoot: JSON.stringify(this._dataRoot),
        });
    }
}
exports.DashboardViewProvider = DashboardViewProvider;
//# sourceMappingURL=DashboardViewProvider.js.map