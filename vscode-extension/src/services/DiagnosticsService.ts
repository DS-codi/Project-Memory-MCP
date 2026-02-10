/**
 * DiagnosticsService
 * 
 * Tracks system health: active child processes, MCP server connection,
 * dashboard server health, memory usage. Provides a consolidated report
 * for the status bar indicator and diagnostics command.
 */

import * as vscode from 'vscode';
import { ServerManager } from '../server/ServerManager';
import { McpBridge } from '../chat';

export interface DiagnosticsReport {
    timestamp: string;
    server: {
        running: boolean;
        external: boolean;
        containerMode: boolean;
        port: number;
        frontendRunning: boolean;
    };
    mcp: {
        connected: boolean;
        lastProbeMs: number | null;
        probeError: string | null;
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
    private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
    private lastReport: DiagnosticsReport | null = null;
    private _onHealthChange = new vscode.EventEmitter<DiagnosticsReport>();
    public readonly onHealthChange = this._onHealthChange.event;

    constructor(
        private serverManager: ServerManager,
        private getMcpBridge: () => McpBridge | null,
        private serverPort: number
    ) {}

    /** Start periodic health checks (every 30s). */
    startMonitoring(intervalMs = 30_000): void {
        if (this.healthCheckTimer) { return; }
        this.healthCheckTimer = setInterval(() => {
            this.runCheck();
        }, intervalMs);
        // Immediate first check
        this.runCheck();
    }

    stopMonitoring(): void {
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }
    }

    /** Run a full diagnostics check and return the report. */
    async runCheck(): Promise<DiagnosticsReport> {
        const issues: string[] = [];

        // Server status
        const containerMode = this.serverManager.isContainerMode;
        const serverRunning = this.serverManager.isRunning || containerMode;
        const serverExternal = this.serverManager.isExternalServer;
        const frontendRunning = this.serverManager.isFrontendRunning || containerMode;

        if (!serverRunning) {
            issues.push('Dashboard server is not running');
        }

        // MCP status + health probe
        const bridge = this.getMcpBridge();
        const mcpConnected = bridge?.isConnected() ?? false;
        let lastProbeMs: number | null = null;
        let probeError: string | null = null;

        if (mcpConnected && bridge) {
            try {
                const start = Date.now();
                await Promise.race([
                    bridge.callTool('memory_workspace', { action: 'list' }),
                    new Promise((_, reject) => setTimeout(() => reject(new Error('MCP probe timeout (5s)')), 5000))
                ]);
                lastProbeMs = Date.now() - start;
                if (lastProbeMs > 3000) {
                    issues.push(`MCP server slow: ${lastProbeMs}ms response time`);
                }
            } catch (e) {
                probeError = e instanceof Error ? e.message : String(e);
                issues.push(`MCP health probe failed: ${probeError}`);
            }
        }

        if (!mcpConnected) {
            issues.push('MCP server is not connected');
        }

        // Memory
        const memUsage = process.memoryUsage();
        const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;
        if (memoryMB > 500) {
            issues.push(`High memory usage: ${memoryMB} MB`);
        }

        // Uptime
        const uptimeSeconds = Math.floor((Date.now() - this.extensionStartTime) / 1000);

        // Overall health
        let health: 'green' | 'yellow' | 'red' = 'green';
        if (issues.length > 0) {
            health = issues.some(i => i.includes('not running') || i.includes('not connected')) ? 'red' : 'yellow';
        }

        const report: DiagnosticsReport = {
            timestamp: new Date().toISOString(),
            server: {
                running: serverRunning,
                external: serverExternal,
                containerMode,
                port: this.serverPort,
                frontendRunning,
            },
            mcp: {
                connected: mcpConnected,
                lastProbeMs,
                probeError,
            },
            extension: {
                memoryMB,
                uptime: uptimeSeconds,
            },
            health,
            issues,
        };

        this.lastReport = report;
        this._onHealthChange.fire(report);
        return report;
    }

    /** Get the most recent cached report (or run a fresh check). */
    async getReport(): Promise<DiagnosticsReport> {
        if (this.lastReport) { return this.lastReport; }
        return this.runCheck();
    }

    /** Format a report as human-readable text for an output channel. */
    formatReport(report: DiagnosticsReport): string {
        const lines: string[] = [];
        lines.push('=== Project Memory Diagnostics ===');
        lines.push(`Timestamp: ${report.timestamp}`);
        lines.push(`Health: ${report.health.toUpperCase()}`);
        lines.push('');

        lines.push('--- Dashboard Server ---');
        lines.push(`  Running: ${report.server.running}`);
        lines.push(`  Mode: ${report.server.containerMode ? 'container' : report.server.external ? 'external' : 'local'}`);
        lines.push(`  Port: ${report.server.port}`);
        lines.push(`  Frontend: ${report.server.frontendRunning}`);
        lines.push('');

        lines.push('--- MCP Server ---');
        lines.push(`  Connected: ${report.mcp.connected}`);
        if (report.mcp.lastProbeMs !== null) {
            lines.push(`  Last probe: ${report.mcp.lastProbeMs}ms`);
        }
        if (report.mcp.probeError) {
            lines.push(`  Probe error: ${report.mcp.probeError}`);
        }
        lines.push('');

        lines.push('--- Extension ---');
        lines.push(`  Memory: ${report.extension.memoryMB} MB`);
        lines.push(`  Uptime: ${report.extension.uptime}s`);
        lines.push('');

        if (report.issues.length > 0) {
            lines.push('--- Issues ---');
            report.issues.forEach(issue => lines.push(`  ⚠ ${issue}`));
        } else {
            lines.push('No issues detected.');
        }

        return lines.join('\n');
    }

    dispose(): void {
        this.stopMonitoring();
        this._onHealthChange.dispose();
    }
}
