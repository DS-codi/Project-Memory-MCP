/**
 * Server Manager
 * 
 * Manages the Express API server lifecycle: start, stop, restart,
 * force-stop, and status bar updates. Delegates frontend management
 * to FrontendManager and health/port utilities to ServerHealthUtils.
 * 
 * Refactored from 720-line monolith into ~350 lines.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import * as path from 'path';
import { FrontendManager } from './FrontendManager';
import { appendToRotatingLog, writeAuditEvent } from './ServerLogger';
import { PidLockfile } from './PidLockfile';
import {
    checkHealth,
    waitForHealth,
    getPidForPort,
    resolveServerDirectory,
    measureApiCall as measureApiCallUtil,
    PerformanceStats,
} from './ServerHealthUtils';
import {
    shouldUseContainer,
    probeContainer,
    getContainerMode,
    getContainerMcpPort,
    type ContainerStatus,
} from './ContainerDetection';
import { ContainerHealthService } from '../services/ContainerHealthService';

function notify(message: string, ...items: string[]): Thenable<string | undefined> {
    const config = vscode.workspace.getConfiguration('projectMemoryDev');
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
    private ownedServerPid: number | null = null;
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private _isRunning = false;
    private _isExternalServer = false;
    private _isContainerMode = false;
    private _containerHealthService: ContainerHealthService | null = null;
    private _intentionalStop = false;
    private config: ServerConfig;
    private restartAttempts = 0;
    private maxRestartAttempts = 3;
    private _performanceStats: PerformanceStats = { apiCalls: 0, avgResponseTime: 0, lastCheck: Date.now() };
    private frontendManager: FrontendManager;
    private idleCheckTimer: ReturnType<typeof setInterval> | null = null;
    private lastActivityTime = Date.now();
    private lockfile: PidLockfile;

    constructor(config: ServerConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Server');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'projectMemoryDev.toggleServer';
        this.lockfile = new PidLockfile(config.dataRoot);
        this.frontendManager = new FrontendManager(
            { serverPort: config.serverPort || 3001 },
            (msg) => this.log(msg)
        );
    }

    // --- Getters ---

    get isRunning(): boolean { return this._isRunning; }
    get isFrontendRunning(): boolean { return this.frontendManager.isRunning; }
    get isExternalServer(): boolean { return this._isExternalServer; }
    get isContainerMode(): boolean { return this._isContainerMode; }
    get performanceStats() { return { ...this._performanceStats }; }

    // --- Idle Timeout ---

    /** Start idle monitoring. Checks every minute if idle time exceeds the configured timeout. */
    startIdleMonitoring(timeoutMinutes: number): void {
        if (timeoutMinutes <= 0) { return; }
        this.resetIdleTimer();
        this.log(`Idle server timeout enabled: ${timeoutMinutes} minutes`);

        this.idleCheckTimer = setInterval(() => {
            if (!this._isRunning || this._isExternalServer) { return; }
            const idleMs = Date.now() - this.lastActivityTime;
            const timeoutMs = timeoutMinutes * 60 * 1000;
            if (idleMs >= timeoutMs) {
                this.log(`Server idle for ${Math.floor(idleMs / 60000)}min — shutting down`);
                this.logEvent('server_idle_shutdown', { idleMinutes: Math.floor(idleMs / 60000), timeoutMinutes });
                this.stop();
                notify('Project Memory server stopped due to inactivity. It will restart on next use.');
            }
        }, 60_000);
    }

    /** Reset the idle timer (call on any activity — API call, dashboard open, etc.). */
    resetIdleTimer(): void {
        this.lastActivityTime = Date.now();
    }

    private stopIdleMonitoring(): void {
        if (this.idleCheckTimer) {
            clearInterval(this.idleCheckTimer);
            this.idleCheckTimer = null;
        }
    }

    // --- Backend Server Lifecycle ---

    async start(): Promise<boolean> {
        if (this._isRunning) {
            this.log('Server is already running');
            return true;
        }

        const port = this.config.serverPort || 3001;

        // --- Container detection (Phase 6C.2) ---
        const containerMode = getContainerMode();
        if (containerMode !== 'local') {
            this.log(`Container mode: ${containerMode} — probing for container...`);
            const { useContainer, status } = await shouldUseContainer();

            if (useContainer && status.detected) {
                this.log(`Container detected: MCP=${status.mcpHealthy}, Dashboard=${status.dashboardHealthy}`);
                this.logEvent('server_connected_container', {
                    port,
                    mcpPort: getContainerMcpPort(),
                    mcpHealthy: status.mcpHealthy,
                    dashboardHealthy: status.dashboardHealthy,
                });
                this._isRunning = true;
                this._isExternalServer = true;
                this._isContainerMode = true;
                this.restartAttempts = 0;
                this.updateStatusBar('container');
                this.startContainerHealthMonitor();
                notify('Connected to Project Memory container');
                return true;
            }

            if (containerMode === 'container') {
                this.log('Container mode forced but container not detected');
                this.updateStatusBar('error');
                vscode.window.showWarningMessage(
                    'Project Memory: Container mode is set but no container was detected. ' +
                    'Start the container with `run-container.ps1 run` or change containerMode to "auto".'
                );
                return false;
            }

            this.log('No container detected — falling back to local server');
        }

        // PID lockfile check: another window may already own the server
        if (this.lockfile.isOwnedByOther()) {
            this.log('Another VS Code window owns the server — connecting as external');
        }

        // Check if server is already running (from another VS Code instance)
        this.log(`Checking if server already exists on port ${port}...`);
        const existingServer = await checkHealth(port);
        if (existingServer) {
            this.log('Found existing server - connecting without spawning new process');
            this.logEvent('server_connected_external', { port });
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
            const env = {
                ...process.env,
                PORT: String(this.config.serverPort || 3001),
                WS_PORT: String(this.config.wsPort || 3002),
                MBS_DATA_ROOT: this.config.dataRoot,
                MBS_AGENTS_ROOT: this.config.agentsRoot,
                MBS_PROMPTS_ROOT: this.config.promptsRoot || '',
                MBS_INSTRUCTIONS_ROOT: this.config.instructionsRoot || '',
            };

            // Try built version first, fall back to tsx for dev
            const distPath = path.join(serverDir, 'dist', 'index.js');
            const fs = require('fs');
            let command: string;
            let args: string[];

            if (fs.existsSync(distPath)) {
                command = 'node';
                args = [distPath];
            } else {
                command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
                args = ['tsx', 'src/index.ts'];
            }

            this.serverProcess = spawn(command, args, {
                cwd: serverDir,
                env,
                shell: true,
                windowsHide: true,
            });

            this.serverProcess.stdout?.on('data', (data) => this.log(data.toString().trim()));
            this.serverProcess.stderr?.on('data', (data) => this.log(`[stderr] ${data.toString().trim()}`));

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

                if (this._intentionalStop) {
                    this.log('Intentional stop - not auto-restarting');
                    this._intentionalStop = false;
                    this.updateStatusBar('stopped');
                } else if (code !== 0 && this.restartAttempts < this.maxRestartAttempts) {
                    this.restartAttempts++;
                    this.log(`Attempting restart (${this.restartAttempts}/${this.maxRestartAttempts})...`);
                    setTimeout(() => this.start(), 2000);
                } else {
                    this.updateStatusBar('stopped');
                }
            });

            // Wait for server to be ready
            const isReady = await waitForHealth(port, 10000);
            if (isReady) {
                this._isRunning = true;
                this.restartAttempts = 0;
                this.ownedServerPid = await getPidForPort(port);
                if (this.ownedServerPid) {
                    this.log(`Server process id: ${this.ownedServerPid}`);
                }
                this.updateStatusBar('running');
                this.log('Server started successfully');
                this.logEvent('server_spawned', { pid: this.ownedServerPid, port, serverDir });
                this.lockfile.acquire(port);
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
        this._intentionalStop = true;
        this.stopContainerHealthMonitor();

        if (this._isExternalServer) {
            this.log('Disconnecting from external server (not stopping it)');
            this._intentionalStop = false;
            this._isRunning = false;
            this._isExternalServer = false;
            this._isContainerMode = false;
            this.updateStatusBar('stopped');
            return;
        }

        // Kill tracked PID if process handle is lost
        if (!this.serverProcess && this.ownedServerPid) {
            this.log(`Stopping tracked server pid ${this.ownedServerPid}`);
            this.killPid(this.ownedServerPid);
            this.ownedServerPid = null;
            this._isRunning = false;
            this.updateStatusBar('stopped');
            return;
        }

        if (!this.serverProcess) return;

        this.log('Stopping server...');
        this.updateStatusBar('stopping');

        return new Promise((resolve) => {
            if (!this.serverProcess) { resolve(); return; }

            const timeout = setTimeout(() => {
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
                this.logEvent('server_stopped', { pid: this.ownedServerPid });
                this.lockfile.release();
                resolve();
            });

            // Graceful shutdown
            if (process.platform === 'win32') {
                spawn('taskkill', ['/pid', String(this.serverProcess.pid), '/f', '/t'], { windowsHide: true });
            } else {
                this.serverProcess.kill('SIGTERM');
            }
        });
    }

    async forceStopOwnedServer(): Promise<boolean> {
        if (this._isExternalServer) return false;
        this._intentionalStop = true;

        const port = this.config.serverPort || 3001;
        const pid = this.ownedServerPid || await getPidForPort(port);
        if (!pid) {
            this.log(`No owned server process found on port ${port}`);
            return false;
        }

        this.log(`Force stopping owned server on port ${port} (pid ${pid})`);
        this.logEvent('server_force_kill', { pid, port, trigger: 'forceStopOwnedServer' });
        this.killPid(pid);
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

        this._intentionalStop = true;
        const port = this.config.serverPort || 3001;
        const pid = await getPidForPort(port);
        if (!pid) {
            this.log(`No process found listening on port ${port}`);
            return false;
        }

        this.log(`Force stopping server on port ${port} (pid ${pid})`);
        this.logEvent('server_force_kill', { pid, port, trigger: 'forceStopExternalServer' });
        this.killPid(pid);

        await new Promise(resolve => setTimeout(resolve, 1000));
        const stillHealthy = await checkHealth(port);
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

    // --- Frontend Delegation ---

    async startFrontend(): Promise<boolean> { return this.frontendManager.start(); }
    async stopFrontend(): Promise<void> { return this.frontendManager.stop(); }

    // --- Configuration ---

    updateConfig(config: Partial<ServerConfig>): void {
        this.config = { ...this.config, ...config };
        if (this._isRunning) this.restart();
    }

    public hasServerDirectory(): boolean {
        return this.getServerDirectory() !== null;
    }

    private getServerDirectory(): string | null {
        return resolveServerDirectory((msg) => this.log(msg));
    }

    // --- Performance Monitoring ---

    async measureApiCall<T>(fn: () => Promise<T>): Promise<T> {
        return measureApiCallUtil(fn, this._performanceStats);
    }

    // --- Status Bar ---

    private updateStatusBar(status: 'starting' | 'running' | 'stopping' | 'stopped' | 'error' | 'connected' | 'container'): void {
        const icons: Record<string, string> = {
            starting: '$(loading~spin)',
            running: '$(check)',
            connected: '$(plug)',
            container: '$(package)',
            stopping: '$(loading~spin)',
            stopped: '$(circle-slash)',
            error: '$(error)',
        };

        const colors: Record<string, vscode.ThemeColor | undefined> = {
            running: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            connected: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            container: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            error: new vscode.ThemeColor('statusBarItem.errorBackground'),
        };

        const labels: Record<string, string> = {
            starting: 'PM Server',
            running: 'PM Server (local)',
            connected: 'PM Server',
            container: 'PM Server (container)',
            stopping: 'PM Server',
            stopped: 'PM Server',
            error: 'PM Server',
        };

        const tooltipSuffix = this._isContainerMode
            ? ' (container)'
            : this._isExternalServer
                ? ' (connected to existing)'
                : '';

        this.statusBarItem.text = `${icons[status]} ${labels[status] || 'PM Server'}`;
        this.statusBarItem.tooltip = `Project Memory Server: ${status}${tooltipSuffix}\nClick to toggle`;
        this.statusBarItem.backgroundColor = colors[status];
        this.statusBarItem.show();
    }

    // --- Container Health Monitor (delegated to ContainerHealthService) ---

    /**
     * Start the ContainerHealthService and wire lifecycle events.
     * On disconnect → auto-fallback to local. On reconnect → offer
     * to switch back to the container.
     */
    private startContainerHealthMonitor(): void {
        this.stopContainerHealthMonitor();

        this._containerHealthService = new ContainerHealthService({
            dashboardPort: this.config.serverPort || 3001,
            log: (msg) => this.log(msg),
        });

        // Disconnected → auto-fallback
        this._containerHealthService.on('disconnected', async () => {
            if (!this._isContainerMode || !this._isRunning) { return; }

            const mcpPort = getContainerMcpPort();
            const dashPort = this.config.serverPort || 3001;
            this.log('Container health check failed — container unreachable');
            this.logEvent('container_disconnected', { mcpPort, dashPort });

            this._isRunning = false;
            this._isExternalServer = false;
            this._isContainerMode = false;

            if (this._intentionalStop) {
                this.updateStatusBar('stopped');
                this.log('Container stopped intentionally — not falling back to local');
                return;
            }

            this.log('Auto-falling back to local server...');
            this.updateStatusBar('starting');
            notify('Project Memory: Container lost — switching to local server');

            const started = await this.start();
            if (!started) {
                this.updateStatusBar('error');
                const choice = await vscode.window.showWarningMessage(
                    'Project Memory: Container lost and local server failed to start.',
                    'Retry',
                    'Dismiss'
                );
                if (choice === 'Retry') {
                    this.start();
                }
            }
        });

        // Reconnected → offer to switch back
        this._containerHealthService.on('reconnected', async () => {
            if (this._isContainerMode) { return; } // already on container
            this.log('Container came back online — offering reconnect');
            const choice = await vscode.window.showInformationMessage(
                'Project Memory: Container is back online. Switch to container mode?',
                'Switch',
                'Stay Local'
            );
            if (choice === 'Switch') {
                await this.stop();
                await this.start(); // will re-detect container in start()
            }
        });

        // Degraded → update status bar
        this._containerHealthService.on('degraded', () => {
            if (this._isContainerMode) {
                this.updateStatusBar('container');
                this.log('Container degraded — MCP healthy but dashboard down');
            }
        });

        this._containerHealthService.startPolling();
    }

    private stopContainerHealthMonitor(): void {
        if (this._containerHealthService) {
            this._containerHealthService.dispose();
            this._containerHealthService = null;
        }
    }

    /** Expose the container health service for status bar integration. */
    get containerHealthService(): ContainerHealthService | null {
        return this._containerHealthService;
    }

    // --- Utilities ---

    private killPid(pid: number): void {
        if (process.platform === 'win32') {
            spawn('taskkill', ['/pid', String(pid), '/f', '/t'], { windowsHide: true });
        } else {
            try { process.kill(pid, 'SIGKILL'); } catch (e) {
                this.log(`Failed to kill pid ${pid}: ${e}`);
            }
        }
    }

    /**
     * Log to both the VS Code output channel and a rotating file under data/logs/.
     */
    private log(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(line);
        appendToRotatingLog(this.config.dataRoot, 'server-manager.log', line);
    }

    /** Structured event log for process lifecycle events (spawn, kill, restart). */
    private logEvent(event: string, details: Record<string, unknown> = {}): void {
        this.log(`EVENT: ${event} ${JSON.stringify(details)}`);
        writeAuditEvent(this.config.dataRoot, event, details);
    }

    showLogs(): void {
        this.outputChannel.show();
    }

    dispose(): void {
        this.stopIdleMonitoring();
        this.stopContainerHealthMonitor();
        this.lockfile.release();
        this.stop();
        this.frontendManager.dispose();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
