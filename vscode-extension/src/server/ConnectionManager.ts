/**
 * Connection Manager (formerly ServerManager)
 * 
 * Detects and connects to external Project Memory components:
 * - MCP server (port 3457 by default)
 * - Dashboard server (port 3459 by default)
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
import type {
    WorkspaceContextSyncEntry as WorkspaceConfigSyncEntry,
    WorkspaceContextSyncEntryPolicy as WorkspaceConfigSyncEntryPolicy,
    WorkspaceContextSyncReport as WorkspaceConfigSyncReport,
} from '../deployer/workspace-context-manifest';

export interface ConnectionConfig {
    dashboardPort: number;
    mcpPort: number;
}

export type { WorkspaceConfigSyncEntry, WorkspaceConfigSyncEntryPolicy, WorkspaceConfigSyncReport };

export class ConnectionManager implements vscode.Disposable {
    private outputChannel: vscode.OutputChannel;
    private statusBarItem: vscode.StatusBarItem;
    private _isDashboardConnected = false;
    private _isMcpConnected = false;
    private config: ConnectionConfig;
    private detectionTimer: ReturnType<typeof setTimeout> | null = null;
    /** Prevents concurrent `detectAndConnect` calls from racing each other. */
    private _detectInProgress = false;

    /**
     * Called whenever the dashboard becomes reachable (initial connection OR
     * after a server blip). Use this to reconnect the MCP bridge.
     */
    public onConnected?: () => void;

    // ── Polling state ──────────────────────────────────────────────────────
    /** Consecutive failed `detectAndConnect` calls. Resets on success. */
    private _consecutiveFailures = 0;
    /** When true, polling is suspended until `resetCircuit()` is called. */
    private _circuitOpen = false;

    // ── Focused workspace mode ─────────────────────────────────────────────
    private _isFocusedWorkspaceMode = false;
    private readonly _onDidChangeFocusedMode = new vscode.EventEmitter<boolean>();
    readonly onDidChangeFocusedMode: vscode.Event<boolean> = this._onDidChangeFocusedMode.event;

    constructor(config: ConnectionConfig) {
        this.config = config;
        this.outputChannel = vscode.window.createOutputChannel('Project Memory Connection');
        this.statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
        this.statusBarItem.command = 'projectMemory.toggleConnection';
        this.updateStatusBar('disconnected');
        this.statusBarItem.show();
    }

    get mcpPort(): number { return this.config.mcpPort; }
    get dashboardPort(): number { return this.config.dashboardPort; }

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

    // --- Auto-Detection Polling (exponential backoff + circuit breaker) ---

    /**
     * Start periodic health polling with exponential backoff.
     *
     * - First poll fires after 5 s (or immediately if already failing).
     * - On each failure the delay doubles: 5 s → 10 s → 20 s → 30 s (cap).
     * - Delay resets to 30 s whenever the dashboard is reachable (keepalive).
     * - After **3 consecutive failures** the circuit breaker opens and polling
     *   stops entirely. Call `resetCircuit()` to resume.
     */
    startAutoDetection(): void {
        if (this.detectionTimer || this._circuitOpen) { return; }
        this.log('Starting connection health polling (exponential backoff enabled)');
        this._scheduleNextPoll();
    }

    /** Stop polling. Clears any pending timeout but does not reset the circuit. */
    stopAutoDetection(): void {
        if (this.detectionTimer) {
            clearTimeout(this.detectionTimer);
            this.detectionTimer = null;
            this.log('Stopped auto-detection polling');
        }
    }

    /**
     * Reset the circuit breaker and resume polling.
     *
     * Call this after the user manually confirms the services are available
     * (e.g. via a "Reconnect" command) or after a successful `detectAndConnect`.
     */
    resetCircuit(): void {
        const wasOpen = this._circuitOpen;
        this._circuitOpen = false;
        this._consecutiveFailures = 0;
        if (wasOpen) {
            this.log('Circuit breaker reset — resuming polling');
            this._scheduleNextPoll();
        }
    }

    // ── Backoff internals ──────────────────────────────────────────────────

    /**
     * Calculate the next poll delay.
     *
     * Connected → fixed 30 s keepalive.
     * Disconnected → exponential: 5 s × 2^failures, capped at 30 s.
     */
    private _getBackoffDelay(): number {
        if (this._isDashboardConnected) {
            return 30_000;                                     // keepalive
        }
        return Math.min(5_000 * Math.pow(2, this._consecutiveFailures), 30_000);
    }

    private _scheduleNextPoll(): void {
        if (this._circuitOpen) { return; }
        const delay = this._getBackoffDelay();
        this.log(`Next health poll in ${Math.round(delay / 1000)} s`);
        this.detectionTimer = setTimeout(() => this._pollTick(), delay);
    }

    private async _pollTick(): Promise<void> {
        this.detectionTimer = null;

        const wasConnected = this._isDashboardConnected;
        const connected    = await this.detectAndConnect();

        if (connected) {
            this._consecutiveFailures = 0;
            if (!wasConnected) {
                // Server came (back) up — fire onConnected so the bridge reconnects.
                this.onConnected?.();
            }
        } else {
            this._consecutiveFailures++;

            if (this._consecutiveFailures >= 3) {
                this._circuitOpen = true;
                this.log(
                    `Circuit breaker opened after ${this._consecutiveFailures} consecutive ` +
                    'failures. Polling suspended. Call resetCircuit() to resume.'
                );
                this.updateStatusBar('disconnected');
                return; // do NOT schedule next poll
            }
        }

        this._scheduleNextPoll();
    }

    // --- Getters ---

    get isDashboardConnected(): boolean { return this._isDashboardConnected; }
    get isMcpConnected(): boolean { return this._isMcpConnected; }
    get isFullyConnected(): boolean { return this._isDashboardConnected && this._isMcpConnected; }

    isFocusedWorkspaceMode(): boolean { return this._isFocusedWorkspaceMode; }

    setFocusedWorkspaceMode(active: boolean): void {
        if (this._isFocusedWorkspaceMode !== active) {
            this._isFocusedWorkspaceMode = active;
            this._onDidChangeFocusedMode.fire(active);
        }
    }

    async callTool(name: string, args: Record<string, unknown>): Promise<unknown> {
        const url = `http://localhost:${this.config.mcpPort}/admin/mcp_call`;
        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, arguments: args }),
        });
        if (!response.ok) {
            throw new Error(`MCP call to '${name}' failed: ${response.status} ${response.statusText}`);
        }
        return response.json();
    }

    async checkWorkspaceConfigSync(workspaceId: string): Promise<WorkspaceConfigSyncReport> {
        const response = await this.callTool('memory_workspace', {
            action: 'check_context_sync',
            workspace_id: workspaceId,
        });

        const errorMessage = this.extractToolError(response);
        if (errorMessage) {
            throw new Error(errorMessage);
        }

        const report = this.extractWorkspaceConfigSyncReport(response);
        if (!report) {
            throw new Error('Malformed response from memory_workspace(action: check_context_sync).');
        }

        return report;
    }

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

    private extractToolError(response: unknown): string | null {
        for (const record of this.unwrapObjectChain(response)) {
            if (record.success === false && typeof record.error === 'string') {
                return record.error;
            }
        }

        return null;
    }

    private extractWorkspaceConfigSyncReport(response: unknown): WorkspaceConfigSyncReport | null {
        for (const record of this.unwrapObjectChain(response)) {
            if (
                record.report_mode === 'read_only'
                && record.writes_performed === false
                && Array.isArray(record.agents)
                && Array.isArray(record.instructions)
                && this.isWorkspaceConfigSummary(record.summary)
            ) {
                return record as unknown as WorkspaceConfigSyncReport;
            }
        }

        return null;
    }

    private isWorkspaceConfigSummary(value: unknown): value is WorkspaceConfigSyncReport['summary'] {
        if (!value || typeof value !== 'object') {
            return false;
        }

        const summary = value as Record<string, unknown>;
        return [
            'total',
            'in_sync',
            'local_only',
            'db_only',
            'content_mismatch',
            'protected_drift',
            'ignored_local',
            'import_candidate',
        ].every((key) => typeof summary[key] === 'number');
    }

    private unwrapObjectChain(value: unknown): Array<Record<string, unknown>> {
        const queue: unknown[] = [value];
        const visited = new Set<unknown>();
        const records: Array<Record<string, unknown>> = [];

        while (queue.length > 0) {
            const current = queue.shift();
            if (!current || typeof current !== 'object' || visited.has(current)) {
                continue;
            }

            visited.add(current);

            if (Array.isArray(current)) {
                queue.push(...current);
                continue;
            }

            const record = current as Record<string, unknown>;
            records.push(record);

            const data = record.data;
            const result = record.result;
            if (data && typeof data === 'object') {
                queue.push(data);
            }
            if (result && typeof result === 'object') {
                queue.push(result);
            }
        }

        return records;
    }

    showLogs(): void {
        this.outputChannel.show();
    }

    // --- Cleanup ---

    dispose(): void {
        this.stopAutoDetection();
        this._onDidChangeFocusedMode.dispose();
        this.outputChannel.dispose();
        this.statusBarItem.dispose();
    }}
