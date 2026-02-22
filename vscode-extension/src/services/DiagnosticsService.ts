/**
 * DiagnosticsService
 *
 * Tracks system health driven by the supervisor's SSE heartbeat stream
 * (SupervisorHeartbeat) rather than periodic HTTP polling.
 *
 * The supervisor broadcasts a HeartbeatEvent every 10 seconds to all
 * connected VS Code instances.  DiagnosticsService subscribes once and
 * updates its report whenever a beat arrives or is lost.
 *
 * The old 30-second poll timer and bridge.httpGet probe have been removed —
 * they caused false disconnections whenever the dashboard server was briefly
 * slow.
 */

import * as vscode from 'vscode';
import { ConnectionManager } from '../server/ConnectionManager';
import { McpBridge } from '../chat';
import { SupervisorHeartbeat, HeartbeatEvent } from '../supervisor/SupervisorHeartbeat';

export interface DiagnosticsReport {
    timestamp: string;
    connection: {
        dashboardConnected: boolean;
        mcpConnected: boolean;
        dashboardPort: number;
        mcpPort: number;
    };
    mcp: {
        bridgeConnected: boolean;
        supervisorHeartbeat: boolean;
        lastHeartbeatMs: number | null;
        poolInstances: number;
    };
    extension: {
        memoryMB: number;
        uptime: number;
    };
    health: 'green' | 'yellow' | 'red';
    issues: string[];
}

export class DiagnosticsService implements vscode.Disposable {
    private extensionStartTime = Date.now();
    private lastReport: DiagnosticsReport | null = null;
    private _onHealthChange = new vscode.EventEmitter<DiagnosticsReport>();
    public readonly onHealthChange = this._onHealthChange.event;

    private heartbeatSubscriptions: vscode.Disposable[] = [];
    private lastHeartbeat: HeartbeatEvent | null = null;
    private heartbeatAlive = false;

    constructor(
        private connectionManager: ConnectionManager,
        private getMcpBridge: () => McpBridge | null,
        private dashboardPort: number
    ) {}

    /**
     * Wire up to a SupervisorHeartbeat instance.
     * Call this once after the heartbeat client has been started.
     * Each beat drives a fresh diagnostics report.
     */
    attachHeartbeat(heartbeat: SupervisorHeartbeat): void {
        this.heartbeatSubscriptions.push(
            heartbeat.onBeat(evt => {
                this.lastHeartbeat = evt;
                this.heartbeatAlive = true;
                // If the ConnectionManager state is stale (services were down last poll),
                // trigger an immediate re-check so we don't wait 30 s for the poll timer.
                if (!this.connectionManager.isDashboardConnected || !this.connectionManager.isMcpConnected) {
                    this.connectionManager.detectAndConnect().then(() => this.runCheck());
                } else {
                    this.runCheck();
                }
            }),
            heartbeat.onLost(() => {
                this.heartbeatAlive = false;
                this.runCheck();
            }),
            heartbeat.onRestored(() => {
                this.heartbeatAlive = true;
                // Trigger an immediate ConnectionManager re-check so we don't
                // wait up to 30 s for the poll timer to notice services came back.
                this.connectionManager.detectAndConnect().then(() => this.runCheck());
            }),
        );
    }

    /** Run a diagnostics check and emit onHealthChange. */
    runCheck(): DiagnosticsReport {
        const issues: string[] = [];

        // Connection status from ConnectionManager (still uses its own poll).
        const dashboardConnected = this.connectionManager.isDashboardConnected;
        const mcpConnected = this.connectionManager.isMcpConnected;

        if (!dashboardConnected) {
            issues.push('Dashboard server is not reachable');
        }
        if (!mcpConnected) {
            issues.push('MCP server (proxy) is not reachable');
        }

        // Supervisor heartbeat.
        if (!this.heartbeatAlive) {
            issues.push('Supervisor heartbeat lost — supervisor may be down');
        }

        // Bridge connected flag (no probe — just reads the cached state).
        const bridge = this.getMcpBridge();
        const bridgeConnected = bridge?.isConnected() ?? false;
        if (!bridgeConnected) {
            issues.push('MCP bridge is not connected');
        }

        // Memory — use 1000MB threshold; extension host routinely exceeds 500MB
        // with Copilot and other extensions loaded.
        const memUsage = process.memoryUsage();
        const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;
        if (memoryMB > 1000) {
            issues.push(`High memory usage: ${memoryMB} MB`);
        }

        const uptimeSeconds = Math.floor((Date.now() - this.extensionStartTime) / 1000);

        let health: 'green' | 'yellow' | 'red' = 'green';
        if (issues.length > 0) {
            // Services genuinely unreachable → red.
            // Bridge disconnected / heartbeat lost on its own → yellow (auto-recovers).
            health = issues.some(i =>
                i.includes('not reachable')
            ) ? 'red' : 'yellow';
        }

        const report: DiagnosticsReport = {
            timestamp: new Date().toISOString(),
            connection: {
                dashboardConnected,
                mcpConnected,
                dashboardPort: this.dashboardPort,
                mcpPort: this.connectionManager['config'].mcpPort,
            },
            mcp: {
                bridgeConnected,
                supervisorHeartbeat: this.heartbeatAlive,
                lastHeartbeatMs: this.lastHeartbeat?.timestamp_ms ?? null,
                poolInstances: this.lastHeartbeat?.pool_instances ?? 0,
            },
            extension: { memoryMB, uptime: uptimeSeconds },
            health,
            issues,
        };

        this.lastReport = report;
        this._onHealthChange.fire(report);
        return report;
    }

    /** Get the most recent cached report (or run a fresh check). */
    getReport(): DiagnosticsReport {
        return this.lastReport ?? this.runCheck();
    }

    /** Format a report as human-readable text for an output channel. */
    formatReport(report: DiagnosticsReport): string {
        const lines: string[] = [
            '=== Project Memory Diagnostics ===',
            `Timestamp: ${report.timestamp}`,
            `Health: ${report.health.toUpperCase()}`,
            '',
            '--- Connection Status ---',
            `  Dashboard: ${report.connection.dashboardConnected ? 'Connected' : 'Disconnected'} (port ${report.connection.dashboardPort})`,
            `  MCP Proxy: ${report.connection.mcpConnected ? 'Connected' : 'Disconnected'} (port ${report.connection.mcpPort})`,
            '',
            '--- Supervisor ---',
            `  Heartbeat: ${report.mcp.supervisorHeartbeat ? '✓ alive' : '✗ lost'}`,
            `  Pool instances: ${report.mcp.poolInstances}`,
            `  Bridge connected: ${report.mcp.bridgeConnected}`,
            '',
            '--- Extension ---',
            `  Memory: ${report.extension.memoryMB} MB`,
            `  Uptime: ${report.extension.uptime}s`,
            '',
        ];

        if (report.issues.length > 0) {
            lines.push('--- Issues ---');
            report.issues.forEach(i => lines.push(`  ⚠ ${i}`));
            lines.push('');
            lines.push('💡 Launch the Supervisor: "Project Memory: Launch Supervisor"');
        } else {
            lines.push('✓ No issues detected.');
        }

        return lines.join('\n');
    }

    dispose(): void {
        this.heartbeatSubscriptions.forEach(d => d.dispose());
        this.heartbeatSubscriptions = [];
        this._onHealthChange.dispose();
    }
}

