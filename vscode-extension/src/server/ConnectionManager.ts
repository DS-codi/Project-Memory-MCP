/**
 * Connection Manager (formerly ServerManager)
 * 
 * Detects and connects to external Project Memory components:
 * - MCP server (port 3457 by default)
 * - Dashboard server (port 3001 by default)
 * 
 * NO PROCESS SPAWNING - all components must be launched externally via
 * the Supervisor (start-supervisor.ps1 or supervisor.exe).
 * 
 * This manager only:
 * - Detects if services are running (health checks)
 * - Tracks connection state
 * - Updates status bar
 * - Provides diagnostics
 */

import * as vscode from 'vscode';
import { checkHealth } from './ServerHealthUtils';

export interface ConnectionConfig {
    dashboardPort: number;
    mcpPort: number;
}

export class ConnectionManager implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private _isDashboardConnected = false;
    private _isMcpConnected = false;
    private config: ConnectionConfig;
    private detectionTimer: ReturnType<typeof setInterval> | null = null;
    /** Prevents concurrent `detectAndConnect` calls from racing each other. */
    private _detectInProgress = false;

    /**
     * Called whenever the dashboard becomes reachable (initial connection OR
     * after a server blip). Use this to reconnect the MCP bridge.
     */
    public onConnected?: () => void;

    constructor(config: ConnectionConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Connection');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'projectMemoryDev.toggleConnection';
        this.updateStatusBar('disconnected');
        this.statusBarItem.show();
    }

    // --- Connection Detection ---

    /**
     * Detect if external services are running and connect.
     * Returns true if at least dashboard is reachable.
     * Guards against concurrent invocations so the 30 s poll timer and an
     * explicit caller cannot race each other.
     */
    async detectAndConnect(): Promise<boolean> {
        if (this._detectInProgress) {
            return this._isDashboardConnected;
        }
        this._detectInProgress = true;
        try {
            return await this._detectAndConnectImpl();
        } finally {
            this._detectInProgress = false;
        }
    }

    private async _detectAndConnectImpl(): Promise<boolean> {
        this.log('Detecting external Project Memory components...');
        this.updateStatusBar('detecting');

        // Check dashboard server
        const dashboardHealthy = await checkHealth(this.config.dashboardPort);
        this._isDashboardConnected = dashboardHealthy;

        // Check MCP server (optional for basic functionality)
        const mcpHealthy = await checkHealth(this.config.mcpPort);
        this._isMcpConnected = mcpHealthy;

        if (dashboardHealthy && mcpHealthy) {
            this.log(`✓ Connected to dashboard (${this.config.dashboardPort}) and MCP (${this.config.mcpPort})`);
            this.updateStatusBar('connected');
            return true;
        } else if (dashboardHealthy) {
            this.log(`✓ Connected to dashboard (${this.config.dashboardPort}), MCP not detected`);
            this.updateStatusBar('partial');
            return true;
        } else {
            this.log(`✗ No services detected on ports ${this.config.dashboardPort} or ${this.config.mcpPort}`);
            this.updateStatusBar('disconnected');
            return false;
        }
    }

    /**
     * Disconnect (just updates state, doesn't kill processes).
     */
    disconnect(): void {
        this._isDashboardConnected = false;
        this._isMcpConnected = false;
        this.updateStatusBar('disconnected');
        this.log('Disconnected from external services');
    }

    // --- Auto-Detection Polling ---

    /**
     * Start periodic health polling. Runs continuously so that:
     * - If services are initially down, the extension connects when they start.
     * - If services blip and come back, the MCP bridge is re-connected.
     *
     * Uses a 30s interval when disconnected (fast reconnect), 60s when
     * connected (lightweight keepalive / stale-flag detection).
     */
    startAutoDetection(): void {
        if (this.detectionTimer) { return; }

        this.log('Starting connection health polling');
        const tick = async () => {
            const wasConnected = this._isDashboardConnected;
            const connected = await this.detectAndConnect();

            if (connected && (!wasConnected)) {
                // Server came (back) up — fire onConnected so the bridge reconnects.
                this.onConnected?.();
            }
        };

        // Poll at 30s — cheap HTTP hit, keeps the bridge healthy.
        this.detectionTimer = setInterval(tick, 30_000);
    }

    stopAutoDetection(): void {
        if (this.detectionTimer) {
            clearInterval(this.detectionTimer);
            this.detectionTimer = null;
            this.log('Stopped auto-detection polling');
        }
    }

    // --- Getters ---

    get isDashboardConnected(): boolean { return this._isDashboardConnected; }
    get isMcpConnected(): boolean { return this._isMcpConnected; }
    get isFullyConnected(): boolean { return this._isDashboardConnected && this._isMcpConnected; }

    // --- Configuration ---

    updateConfig(config: Partial<ConnectionConfig>): void {
        this.config = { ...this.config, ...config };
        // Re-detect with new config
        this.detectAndConnect();
    }

    // --- Status Bar ---

    private updateStatusBar(status: 'detecting' | 'connected' | 'partial' | 'degraded' | 'disconnected'): void {
        const icons: Record<string, string> = {
            detecting: '$(loading~spin)',
            connected: '$(check)',
            partial: '$(check)',
            degraded: '$(warning)',
            disconnected: '$(circle-slash)',
        };

        const colors: Record<string, vscode.ThemeColor | undefined> = {
            connected: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            partial: new vscode.ThemeColor('statusBarItem.prominentBackground'),
            degraded: new vscode.ThemeColor('statusBarItem.warningBackground'),
            disconnected: undefined,
        };

        const labels: Record<string, string> = {
            detecting: 'PM Detecting...',
            connected: 'PM Connected',
            partial: 'PM Connected',
            degraded: 'PM Degraded',
            disconnected: 'PM Disconnected',
        };

        const tooltips: Record<string, string> = {
            detecting: 'Project Memory: Detecting external services...',
            connected: `Project Memory: Connected\nDashboard: ${this.config.dashboardPort}\nMCP: ${this.config.mcpPort}\nClick to disconnect`,
            partial: `Project Memory: Connected (MCP offline)\nDashboard: ${this.config.dashboardPort} ✓\nMCP: ${this.config.mcpPort} ✗ — check supervisor logs\nClick to re-detect`,
            degraded: `Project Memory: Dashboard connected, MCP unavailable\nDashboard: ${this.config.dashboardPort}\nClick to reconnect`,
            disconnected: 'Project Memory: Not connected\nClick to detect or launch supervisor',
        };

        this.statusBarItem.text = `${icons[status]} ${labels[status]}`;
        this.statusBarItem.tooltip = tooltips[status];
        this.statusBarItem.backgroundColor = colors[status];
    }

    // --- Logging ---

    private log(message: string): void {
        const timestamp = new Date().toISOString();
        const line = `[${timestamp}] ${message}`;
        this.outputChannel.appendLine(line);
    }

    showLogs(): void {
        this.outputChannel.show();
    }

    // --- Cleanup ---

    dispose(): void {
        this.stopAutoDetection();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }
}
