/**
 * Frontend Manager
 * 
 * Manages the Vite dev-server process for the dashboard frontend.
 * Extracted from ServerManager to keep file sizes under 400 lines.
 */

import * as vscode from 'vscode';
import { spawn, ChildProcess } from 'child_process';
import { checkPort, waitForPort, resolveDashboardDirectory } from './ServerHealthUtils';

export interface FrontendConfig {
    serverPort: number;
}

export class FrontendManager implements vscode.Disposable {
    private frontendProcess: ChildProcess | null = null;
    private _isFrontendRunning = false;
    private _isExternalFrontend = false;
    private logger: (msg: string) => void;
    private config: FrontendConfig;

    constructor(config: FrontendConfig, logger: (msg: string) => void) {
        this.config = config;
        this.logger = logger;
    }

    get isRunning(): boolean {
        return this._isFrontendRunning;
    }

    get isExternal(): boolean {
        return this._isExternalFrontend;
    }

    async start(): Promise<boolean> {
        if (this._isFrontendRunning) {
            this.logger('Frontend is already running');
            return true;
        }

        // Check if frontend is already running (from another VS Code instance)
        const existingFrontend = await checkPort(5173);
        if (existingFrontend) {
            this.logger('Found existing frontend on port 5173 - using it');
            this._isFrontendRunning = true;
            this._isExternalFrontend = true;
            return true;
        }

        const dashboardDir = resolveDashboardDirectory(this.logger);
        if (!dashboardDir) {
            this.logger('Could not find dashboard directory for frontend');
            return false;
        }

        this.logger(`Starting frontend from: ${dashboardDir}`);

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
                this.logger(`[frontend] ${data.toString().trim()}`);
            });

            this.frontendProcess.stderr?.on('data', (data) => {
                this.logger(`[frontend] ${data.toString().trim()}`);
            });

            this.frontendProcess.on('error', (error) => {
                this.logger(`Frontend error: ${error.message}`);
                this._isFrontendRunning = false;
            });

            this.frontendProcess.on('exit', (code, signal) => {
                this.logger(`Frontend exited with code ${code}, signal ${signal}`);
                this._isFrontendRunning = false;
                this.frontendProcess = null;
            });

            // Wait for frontend to be ready (check port 5173)
            const isReady = await waitForPort(5173, 15000);
            if (isReady) {
                this._isFrontendRunning = true;
                this.logger('Frontend started successfully on port 5173');
                return true;
            } else {
                this.logger('Frontend failed to start within timeout');
                return false;
            }
        } catch (error) {
            this.logger(`Failed to start frontend: ${error}`);
            return false;
        }
    }

    async stop(): Promise<void> {
        // Don't stop external frontends - we didn't start them
        if (this._isExternalFrontend) {
            this.logger('Disconnecting from external frontend (not stopping it)');
            this._isFrontendRunning = false;
            this._isExternalFrontend = false;
            return;
        }

        if (!this.frontendProcess) {
            return;
        }

        this.logger('Stopping frontend...');

        return new Promise((resolve) => {
            if (!this.frontendProcess) {
                resolve();
                return;
            }

            const timeout = setTimeout(() => {
                if (this.frontendProcess) {
                    this.logger('Force killing frontend...');
                    this.frontendProcess.kill('SIGKILL');
                }
                resolve();
            }, 5000);

            this.frontendProcess.on('exit', () => {
                clearTimeout(timeout);
                this._isFrontendRunning = false;
                this.frontendProcess = null;
                this.logger('Frontend stopped');
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

    dispose(): void {
        this.stop();
    }
}
