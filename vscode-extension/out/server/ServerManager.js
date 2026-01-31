"use strict";
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
exports.ServerManager = void 0;
const vscode = __importStar(require("vscode"));
const child_process_1 = require("child_process");
const path = __importStar(require("path"));
const http = __importStar(require("http"));
class ServerManager {
    serverProcess = null;
    frontendProcess = null;
    outputChannel;
    statusBarItem;
    _isRunning = false;
    _isFrontendRunning = false;
    config;
    restartAttempts = 0;
    maxRestartAttempts = 3;
    constructor(config) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Server');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'projectMemory.toggleServer';
    }
    get isRunning() {
        return this._isRunning;
    }
    get isFrontendRunning() {
        return this._isFrontendRunning;
    }
    async start() {
        if (this._isRunning) {
            this.log('Server is already running');
            return true;
        }
        const serverDir = this.getServerDirectory();
        if (!serverDir) {
            vscode.window.showErrorMessage('Could not find dashboard server directory');
            return false;
        }
        this.log(`Starting server from: ${serverDir}`);
        this.updateStatusBar('starting');
        try {
            // Set environment variables
            const env = {
                ...process.env,
                PORT: String(this.config.serverPort || 3001),
                WS_PORT: String(this.config.wsPort || 3002),
                MBS_DATA_ROOT: this.config.dataRoot,
                MBS_AGENTS_ROOT: this.config.agentsRoot,
                MBS_PROMPTS_ROOT: this.config.promptsRoot || '',
                MBS_INSTRUCTIONS_ROOT: this.config.instructionsRoot || '',
            };
            // Try to use the built version first, fall back to tsx for dev
            const distPath = path.join(serverDir, 'dist', 'index.js');
            let command;
            let args;
            // Check if dist exists
            const fs = require('fs');
            if (fs.existsSync(distPath)) {
                command = 'node';
                args = [distPath];
            }
            else {
                // Use tsx for development
                command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                args = ['tsx', 'src/index.ts'];
            }
            this.serverProcess = (0, child_process_1.spawn)(command, args, {
                cwd: serverDir,
                env,
                shell: true,
                windowsHide: true,
            });
            this.serverProcess.stdout?.on('data', (data) => {
                this.log(data.toString().trim());
            });
            this.serverProcess.stderr?.on('data', (data) => {
                this.log(`[stderr] ${data.toString().trim()}`);
            });
            this.serverProcess.on('error', (error) => {
                this.log(`Server error: ${error.message}`);
                this._isRunning = false;
                this.updateStatusBar('error');
            });
            this.serverProcess.on('exit', (code, signal) => {
                this.log(`Server exited with code ${code}, signal ${signal}`);
                this._isRunning = false;
                this.serverProcess = null;
                if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`);
                    setTimeout(() => this.start(), 2000);
                }
                else {
                    this.updateStatusBar('stopped');
                }
            });
            // Wait for server to be ready
            const isReady = await this.waitForServer(10000);
            if (isReady) {
                this._isRunning = true;
                this.restartAttempts = 0;
                this.updateStatusBar('running');
                this.log('Server started successfully');
                return true;
            }
            else {
                this.log('Server failed to start within timeout');
                this.stop();
                return false;
            }
        }
        catch (error) {
            this.log(`Failed to start server: ${error}`);
            this.updateStatusBar('error');
            return false;
        }
    }
    async stop() {
        if (!this.serverProcess) {
            return;
        }
        this.log('Stopping server...');
        this.updateStatusBar('stopping');
        return new Promise((resolve) => {
            if (!this.serverProcess) {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                // Force kill if graceful shutdown takes too long
                if (this.serverProcess) {
                    this.log('Force killing server...');
                    this.serverProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            this.serverProcess.on('exit', () => {
                clearTimeout(timeout);
                this._isRunning = false;
                this.serverProcess = null;
                this.updateStatusBar('stopped');
                this.log('Server stopped');
                resolve();
            });
            // Send graceful shutdown signal
            if (process.platform === 'win32') {
                // Windows doesn't handle SIGTERM well, use taskkill
                (0, child_process_1.spawn)('taskkill', ['/pid', String(this.serverProcess.pid), '/f', '/t'], {
                    windowsHide: true,
                });
            }
            else {
                this.serverProcess.kill('SIGTERM');
            }
        });
    }
    async restart() {
        await this.stop();
        return this.start();
    }
    async startFrontend() {
        if (this._isFrontendRunning) {
            this.log('Frontend is already running');
            return true;
        }
        const dashboardDir = this.getDashboardDirectory();
        if (!dashboardDir) {
            this.log('Could not find dashboard directory for frontend');
            return false;
        }
        this.log(`Starting frontend from: ${dashboardDir}`);
        try {
            const command = process.platform === 'win32' ? 'npm.cmd' : 'npm';
            const args = ['run', 'dev'];
            this.frontendProcess = (0, child_process_1.spawn)(command, args, {
                cwd: dashboardDir,
                shell: true,
                windowsHide: true,
                env: {
                    ...process.env,
                    VITE_API_URL: `http://localhost:${this.config.serverPort || 3001}`,
                },
            });
            this.frontendProcess.stdout?.on('data', (data) => {
                this.log(`[frontend] ${data.toString().trim()}`);
            });
            this.frontendProcess.stderr?.on('data', (data) => {
                this.log(`[frontend] ${data.toString().trim()}`);
            });
            this.frontendProcess.on('error', (error) => {
                this.log(`Frontend error: ${error.message}`);
                this._isFrontendRunning = false;
            });
            this.frontendProcess.on('exit', (code, signal) => {
                this.log(`Frontend exited with code ${code}, signal ${signal}`);
                this._isFrontendRunning = false;
                this.frontendProcess = null;
            });
            // Wait for frontend to be ready (check port 5173)
            const isReady = await this.waitForPort(5173, 15000);
            if (isReady) {
                this._isFrontendRunning = true;
                this.log('Frontend started successfully on port 5173');
                return true;
            }
            else {
                this.log('Frontend failed to start within timeout');
                return false;
            }
        }
        catch (error) {
            this.log(`Failed to start frontend: ${error}`);
            return false;
        }
    }
    async stopFrontend() {
        if (!this.frontendProcess) {
            return;
        }
        this.log('Stopping frontend...');
        return new Promise((resolve) => {
            if (!this.frontendProcess) {
                resolve();
                return;
            }
            const timeout = setTimeout(() => {
                if (this.frontendProcess) {
                    this.log('Force killing frontend...');
                    this.frontendProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000);
            this.frontendProcess.on('exit', () => {
                clearTimeout(timeout);
                this._isFrontendRunning = false;
                this.frontendProcess = null;
                this.log('Frontend stopped');
                resolve();
            });
            if (process.platform === 'win32') {
                (0, child_process_1.spawn)('taskkill', ['/pid', String(this.frontendProcess.pid), '/f', '/t'], {
                    windowsHide: true,
                });
            }
            else {
                this.frontendProcess.kill('SIGTERM');
            }
        });
    }
    getDashboardDirectory() {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const extensionPath = vscode.extensions.getExtension('project-memory.project-memory-dashboard')?.extensionPath;
        const possiblePaths = [
            workspacePath ? path.join(workspacePath, 'dashboard') : null,
            extensionPath ? path.join(extensionPath, '..', 'dashboard') : null,
            'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard',
        ].filter(Boolean);
        const fs = require('fs');
        for (const p of possiblePaths) {
            const packageJson = path.join(p, 'package.json');
            if (fs.existsSync(packageJson)) {
                return p;
            }
        }
        return null;
    }
    async waitForPort(port, timeout) {
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                const isOpen = await this.checkPort(port);
                if (isOpen) {
                    return true;
                }
            }
            catch {
                // Port not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }
    checkPort(port) {
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${port}`, (res) => {
                resolve(res.statusCode !== undefined);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    updateConfig(config) {
        this.config = { ...this.config, ...config };
        if (this._isRunning) {
            this.restart();
        }
    }
    getServerDirectory() {
        // Look for the server in multiple possible locations
        const extensionPath = vscode.extensions.getExtension('project-memory.project-memory-dashboard')?.extensionPath;
        this.log(`Extension path: ${extensionPath || 'not found'}`);
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        this.log(`Workspace path: ${workspacePath || 'not found'}`);
        const possiblePaths = [
            // Workspace folder (for development) - check first
            workspacePath ? path.join(workspacePath, 'dashboard', 'server') : null,
            // Bundled with extension
            extensionPath ? path.join(extensionPath, 'server') : null,
            // Development - relative to extension source
            extensionPath ? path.join(extensionPath, '..', 'dashboard', 'server') : null,
            // Common development locations
            'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server',
        ].filter(Boolean);
        this.log(`Checking paths: ${JSON.stringify(possiblePaths)}`);
        const fs = require('fs');
        for (const p of possiblePaths) {
            const packageJson = path.join(p, 'package.json');
            this.log(`Checking: ${packageJson}`);
            if (fs.existsSync(packageJson)) {
                this.log(`Found server at: ${p}`);
                return p;
            }
        }
        this.log('Server directory not found in any location');
        return null;
    }
    async waitForServer(timeout) {
        const port = this.config.serverPort || 3001;
        const startTime = Date.now();
        while (Date.now() - startTime < timeout) {
            try {
                const isHealthy = await this.checkHealth(port);
                if (isHealthy) {
                    return true;
                }
            }
            catch {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }
        return false;
    }
    checkHealth(port) {
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${port}/api/health`, (res) => {
                resolve(res.statusCode === 200);
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }
    updateStatusBar(status) {
        const icons = {
            starting: '$(loading~spin)',
            running: '$(check)',
            stopping: '$(loading~spin)',
            stopped: '$(circle-slash)',
            error: '$(error)',
        };
        const colors = {
            running: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            error: new vscode.ThemeColor('statusBarItem.errorBackground'),
        };
        this.statusBarItem.text = `${icons[status]} PM Server`;
        this.statusBarItem.tooltip = `Project Memory Server: ${status}\nClick to toggle`;
        this.statusBarItem.backgroundColor = colors[status];
        this.statusBarItem.show();
    }
    log(message) {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }
    showLogs() {
        this.outputChannel.show();
    }
    dispose() {
        this.stop();
        this.stopFrontend();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
exports.ServerManager = ServerManager;
//# sourceMappingURL=ServerManager.js.map