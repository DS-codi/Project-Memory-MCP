import * as vscode from 'vscode';
import { spawn, ChildProcess, exec } from 'child_process';
import * as path from 'path';
import * as http from 'http';

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemory');
    if (config.get<boolean>('showNotifications', true)) {
        return vscode.window.showInformationMessage(message, ...items);
    }
    return Promise.resolve(undefined);
}

export interface ServerConfig {
    dataRoot: string;
    agentsRoot: string;
    promptsRoot?: string;
    instructionsRoot?: string;
    serverPort?: number;
    wsPort?: number;
}

export class ServerManager implements vscode.Disposable {
    private serverProcess: ChildProcess | null = null;
    private frontendProcess: ChildProcess | null = null;
    private ownedServerPid: number | null = null;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private _isRunning = false;
    private _isFrontendRunning = false;
    private _isExternalServer = false;  // True if connected to server started by another VS Code instance
    private _isExternalFrontend = false;
    private config: ServerConfig;
    private restartAttempts = 0;
    private maxRestartAttempts = 3;
    private _performanceStats = { apiCalls: 0, avgResponseTime: 0, lastCheck: Date.now() };

    constructor(config: ServerConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Server');
        this.statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            100
        );
        this.statusBarItem.command = 'projectMemory.toggleServer';
    }

    get isRunning(): boolean {
        return this._isRunning;
    }

    get isFrontendRunning(): boolean {
        return this._isFrontendRunning;
    }

    get isExternalServer(): boolean {
        return this._isExternalServer;
    }

    get performanceStats() {
        return { ...this._performanceStats };
    }

    async start(): Promise<boolean> {
        if (this._isRunning) {
            this.log('Server is already running');
            return true;
        }

        const port = this.config.serverPort || 3001;
        
        // Check if server is already running (from another VS Code instance)
        this.log(`Checking if server already exists on port ${port}...`);
        const existingServer = await this.checkHealth(port);
        if (existingServer) {
            this.log('Found existing server - connecting without spawning new process');
            this._isRunning = true;
            this._isExternalServer = true;
            this.restartAttempts = 0;
            this.updateStatusBar('connected');
            notify('Connected to existing Project Memory server');
            return true;
        }

        const serverDir = this.getServerDirectory();
        if (!serverDir) {
            this.log('Dashboard server directory not found');
            return false;
        }

        this.log(`Starting server from: ${serverDir}`);
        this._isExternalServer = false;
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
            let command: string;
            let args: string[];

            // Check if dist exists
            const fs = require('fs');
            if (fs.existsSync(distPath)) {
                command = 'node';
                args = [distPath];
            } else {
                // Use tsx for development
                command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                args = ['tsx', 'src/index.ts'];
            }

            this.serverProcess = spawn(command, args, {
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
                this.ownedServerPid = null;

                if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`);
                    setTimeout(() => this.start(), 2000);
                } else {
                    this.updateStatusBar('stopped');
                }
            });

            // Wait for server to be ready
            const isReady = await this.waitForServer(10000);
            if (isReady) {
                this._isRunning = true;
                this.restartAttempts = 0;
                this.ownedServerPid = await this.getPidForPort(port);
                if (this.ownedServerPid) {
                    this.log(`Server process id: ${this.ownedServerPid}`);
                }
                this.updateStatusBar('running');
                this.log('Server started successfully');
                return true;
            } else {
                this.log('Server failed to start within timeout');
                this.stop();
                return false;
            }
        } catch (error) {
            this.log(`Failed to start server: ${error}`);
            this.updateStatusBar('error');
            return false;
        }
    }

    async stop(): Promise<void> {
        // Don't stop external servers - we didn't start them
        if (this._isExternalServer) {
            this.log('Disconnecting from external server (not stopping it)');
            this._isRunning = false;
            this._isExternalServer = false;
            this.updateStatusBar('stopped');
            return;
        }

        if (!this.serverProcess && this.ownedServerPid) {
            this.log(`Stopping tracked server pid ${this.ownedServerPid}`);
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(this.ownedServerPid), '/f', '/t'], { windowsHide: true });
            } else {
                try {
                    process.kill(this.ownedServerPid, 'SIGKILL');
                } catch (error) {
                    this.log(`Failed to kill server pid ${this.ownedServerPid}: ${error}`);
                }
            }
            this.ownedServerPid = null;
            this._isRunning = false;
            this.updateStatusBar('stopped');
            return;
        }

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
                this.ownedServerPid = null;
                this.updateStatusBar('stopped');
                this.log('Server stopped');
                resolve();
            });

            // Send graceful shutdown signal
            if (process.platform === 'win32') {
                // Windows doesn't handle SIGTERM well, use taskkill
                spawn('taskkill', ['/pid', String(this.serverProcess.pid), '/f', '/t'], {
                    windowsHide: true,
                });
            } else {
                this.serverProcess.kill('SIGTERM');
            }
        });
    }

    async forceStopOwnedServer(): Promise<boolean> {
        if (this._isExternalServer) {
            return false;
        }

        const port = this.config.serverPort || 3001;
        const pid = this.ownedServerPid || await this.getPidForPort(port);
        if (!pid) {
            this.log(`No owned server process found on port ${port}`);
            return false;
        }

        this.log(`Force stopping owned server on port ${port} (pid ${pid})`);
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true });
        } else {
            try {
                process.kill(pid, 'SIGKILL');
            } catch (error) {
                this.log(`Force stop failed: ${error}`);
                return false;
            }
        }

        this.ownedServerPid = null;
        this._isRunning = false;
        this.updateStatusBar('stopped');
        return true;
    }

    async forceStopExternalServer(): Promise<boolean> {
        if (this.serverProcess && !this._isExternalServer) {
            this.log('Server was started by this extension; use Stop Server instead');
            return false;
        }

        const port = this.config.serverPort || 3001;
        const pid = await this.getPidForPort(port);
        if (!pid) {
            this.log(`No process found listening on port ${port}`);
            return false;
        }

        this.log(`Force stopping server on port ${port} (pid ${pid})`);

        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true });
        } else {
            try {
                process.kill(pid, 'SIGKILL');
            } catch (error) {
                this.log(`Force stop failed: ${error}`);
                return false;
            }
        }

        await new Promise(resolve => setTimeout(resolve, 1000));
        const stillHealthy = await this.checkHealth(port);
        if (!stillHealthy) {
            this._isRunning = false;
            this._isExternalServer = false;
            this.updateStatusBar('stopped');
            this.log('External server stopped');
            return true;
        }

        this.log('Server still responding after force stop');
        return false;
    }

    async restart(): Promise<boolean> {
        await this.stop();
        return this.start();
    }

    async startFrontend(): Promise<boolean> {
        if (this._isFrontendRunning) {
            this.log('Frontend is already running');
            return true;
        }

        // Check if frontend is already running (from another VS Code instance)
        const existingFrontend = await this.checkPort(5173);
        if (existingFrontend) {
            this.log('Found existing frontend on port 5173 - using it');
            this._isFrontendRunning = true;
            this._isExternalFrontend = true;
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

            this.frontendProcess = spawn(command, args, {
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
            } else {
                this.log('Frontend failed to start within timeout');
                return false;
            }
        } catch (error) {
            this.log(`Failed to start frontend: ${error}`);
            return false;
        }
    }

    async stopFrontend(): Promise<void> {
        // Don't stop external frontends - we didn't start them
        if (this._isExternalFrontend) {
            this.log('Disconnecting from external frontend (not stopping it)');
            this._isFrontendRunning = false;
            this._isExternalFrontend = false;
            return;
        }

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
                spawn('taskkill', ['/pid', String(this.frontendProcess.pid), '/f', '/t'], {
                    windowsHide: true,
                });
            } else {
                this.frontendProcess.kill('SIGTERM');
            }
        });
    }

    private getDashboardDirectory(): string | null {
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        const extensionPath = vscode.extensions.getExtension('project-memory.project-memory-dashboard')?.extensionPath;
        
        const possiblePaths = [
            // Bundled with extension - check this FIRST
            extensionPath ? path.join(extensionPath, 'dashboard') : null,
            // Development workspace (where the extension is being developed)
            'c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard',
            'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard',
            // Current workspace (only if developing in this workspace)
            workspacePath ? path.join(workspacePath, 'dashboard') : null,
            // Sibling to extension
            extensionPath ? path.join(extensionPath, '..', 'dashboard') : null,
        ].filter(Boolean) as string[];

        const fs = require('fs');
        for (const p of possiblePaths) {
            const packageJson = path.join(p, 'package.json');
            if (fs.existsSync(packageJson)) {
                this.log(`Found dashboard at: ${p}`);
                return p;
            }
        }

        this.log('Could not find dashboard directory for frontend');
        return null;
    }

    private async waitForPort(port: number, timeout: number): Promise<boolean> {
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const isOpen = await this.checkPort(port);
                if (isOpen) {
                    return true;
                }
            } catch {
                // Port not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return false;
    }

    private checkPort(port: number): Promise<boolean> {
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

    updateConfig(config: Partial<ServerConfig>): void {
        this.config = { ...this.config, ...config };
        if (this._isRunning) {
            this.restart();
        }
    }

    private getServerDirectory(): string | null {
        // Look for the server in multiple possible locations
        const extensionPath = vscode.extensions.getExtension('project-memory.project-memory-dashboard')?.extensionPath;
        const workspacePath = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
        
        const possiblePaths = [
            // Bundled with extension - check FIRST
            extensionPath ? path.join(extensionPath, 'server') : null,
            // Development workspace (where extension is being developed)
            'c:\\Users\\codi.f\\vscode_ModularAgenticProcedureSystem\\dashboard\\server',
            'c:\\Users\\User\\Project_Memory_MCP\\Project-Memory-MCP\\dashboard\\server',
            // Current workspace (only if developing in this workspace)
            workspacePath ? path.join(workspacePath, 'dashboard', 'server') : null,
            // Development - relative to extension source
            extensionPath ? path.join(extensionPath, '..', 'dashboard', 'server') : null,
        ].filter(Boolean) as string[];

        const fs = require('fs');
        for (const p of possiblePaths) {
            const packageJson = path.join(p, 'package.json');
            if (fs.existsSync(packageJson)) {
                this.log(`Found server at: ${p}`);
                return p;
            }
        }

        return null;
    }

    public hasServerDirectory(): boolean {
        return this.getServerDirectory() !== null;
    }

    private async waitForServer(timeout: number): Promise<boolean> {
        const port = this.config.serverPort || 3001;
        const startTime = Date.now();

        while (Date.now() - startTime < timeout) {
            try {
                const isHealthy = await this.checkHealth(port);
                if (isHealthy) {
                    return true;
                }
            } catch {
                // Server not ready yet
            }
            await new Promise(resolve => setTimeout(resolve, 500));
        }

        return false;
    }

    private checkHealth(port: number): Promise<boolean> {
        return new Promise((resolve) => {
            const req = http.get(`http://localhost:${port}/api/health`, (res) => {
                if (res.statusCode !== 200) {
                    resolve(false);
                    res.resume();
                    return;
                }

                let body = '';
                res.on('data', (chunk) => {
                    body += chunk.toString();
                });

                res.on('end', () => {
                    try {
                        const payload = JSON.parse(body);
                        resolve(payload?.status === 'ok');
                    } catch {
                        resolve(false);
                    }
                });
            });
            req.on('error', () => resolve(false));
            req.setTimeout(1000, () => {
                req.destroy();
                resolve(false);
            });
        });
    }

    private getPidForPort(port: number): Promise<number | null> {
        return new Promise((resolve) => {
            if (process.platform === 'win32') {
                exec(`netstat -ano -p tcp | findstr :${port}`, { windowsHide: true }, (error, stdout) => {
                    if (error || !stdout) {
                        resolve(null);
                        return;
                    }

                    const lines = stdout.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
                    for (const line of lines) {
                        if (!line.includes(`:${port}`)) continue;
                        if (!/LISTENING/i.test(line)) continue;
                        const match = line.match(/LISTENING\s+(\d+)/i);
                        if (match) {
                            resolve(Number(match[1]));
                            return;
                        }
                    }

                    resolve(null);
                });
                return;
            }

            exec(`lsof -iTCP:${port} -sTCP:LISTEN -t`, (error, stdout) => {
                if (error || !stdout) {
                    resolve(null);
                    return;
                }

                const firstLine = stdout.split(/\r?\n/).find(line => line.trim().length > 0);
                if (!firstLine) {
                    resolve(null);
                    return;
                }

                const pid = Number(firstLine.trim());
                resolve(Number.isNaN(pid) ? null : pid);
            });
        });
    }

    private updateStatusBar(status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'connected'): void {
        const icons: Record<string, string> = {
            starting: '$(loading~spin)',
            running: '$(check)',
            connected: '$(plug)',
            stopping: '$(loading~spin)',
            stopped: '$(circle-slash)',
            error: '$(error)',
        };

        const colors: Record<string, vscode.ThemeColor | undefined> = {
            running: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            connected: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            error: new vscode.ThemeColor('statusBarItem.errorBackground'),
        };

        const labels: Record<string, string> = {
            starting: 'PM Server',
            running: 'PM Server (local)',
            connected: 'PM Server (shared)',
            stopping: 'PM Server',
            stopped: 'PM Server',
            error: 'PM Server',
        };

        this.statusBarItem.text = `${icons[status]} ${labels[status] || 'PM Server'}`;
        this.statusBarItem.tooltip = `Project Memory Server: ${status}${this._isExternalServer ? ' (connected to existing)' : ''}\nClick to toggle`;
        this.statusBarItem.backgroundColor = colors[status];
        this.statusBarItem.show();
    }

    // Performance monitoring
    async measureApiCall<T>(fn: () => Promise<T>): Promise<T> {
        const start = Date.now();
        try {
            const result = await fn();
            const duration = Date.now() - start;
            this._performanceStats.apiCalls++;
            this._performanceStats.avgResponseTime = 
                (this._performanceStats.avgResponseTime * (this._performanceStats.apiCalls - 1) + duration) / this._performanceStats.apiCalls;
            this._performanceStats.lastCheck = Date.now();
            return result;
        } catch (error) {
            throw error;
        }
    }

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        this.outputChannel.appendLine(`[${timestamp}] ${message}`);
    }

    showLogs(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.stop();
        this.stopFrontend();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
