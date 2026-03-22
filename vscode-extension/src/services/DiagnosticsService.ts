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
import { ConnectionManager, type WorkspaceConfigSyncReport, type WorkspaceConfigSyncEntry } from '../server/ConnectionManager';
import { SupervisorHeartbeat, HeartbeatEvent } from '../supervisor/SupervisorHeartbeat';

interface WorkspaceSyncDiagnosticsState {
    workspaceId?: string;
    status: 'idle' | 'checking' | 'ready' | 'error';
    lastCheckedAt: string | null;
    lastReason: string | null;
    statusMessage: string | null;
    actionableFindings: number;
    summary: WorkspaceConfigSyncReport['summary'] | null;
    sampleFindings: string[];
    lastError?: string;
}

export interface DiagnosticsReport {
    timestamp: string;
    connection: {
        dashboardConnected: boolean;
        mcpConnected: boolean;
        dashboardPort: number;
        mcpPort: number;
    };
    mcp: {
        supervisorHeartbeat: boolean;
        lastHeartbeatMs: number | null;
        poolInstances: number;
        mcpProxyHealthy: boolean;
    };
    extension: {
        memoryMB: number;
        uptime: number;
    };
    workspaceSync: WorkspaceSyncDiagnosticsState;
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
    private workspaceSyncState: WorkspaceSyncDiagnosticsState = {
        status: 'idle',
        lastCheckedAt: null,
        lastReason: null,
        statusMessage: 'Passive watcher is waiting for its first report.',
        actionableFindings: 0,
        summary: null,
        sampleFindings: [],
    };

    constructor(
        private connectionManager: ConnectionManager
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
                // Just update the diagnostic report. Re-detection is handled by
                // ConnectionManager's own polling (circuit reset happens in extension.ts
                // onBeat wiring). Calling detectAndConnect() on every 10 s beat caused
                // status-bar churn ("PM Detecting...") that made Copilot chat unresponsive.
                this.runCheck();
            }),
            heartbeat.onLost(() => {
                this.heartbeatAlive = false;
                this.runCheck();
            }),
            heartbeat.onRestored(() => {
                this.heartbeatAlive = true;
                // Heartbeat came back — trigger an immediate re-check so we don't
                // wait up to 30 s for the poll timer to notice services are back.
                this.connectionManager.detectAndConnect().then(() => this.runCheck());
            }),
        );
    }

    updateWorkspaceSync(report: WorkspaceConfigSyncReport): void {
        const actionableEntries = this.collectActionableEntries(report);
        this.workspaceSyncState = {
            workspaceId: report.workspace_id,
            lastCheckedAt: new Date().toISOString(),
            actionableFindings: actionableEntries.length,
            summary: report.summary,
            sampleFindings: actionableEntries
                .slice(0, 3)
                .map((entry) => `${entry.relative_path}: ${entry.status}`),
        };
        this.runCheck();
    }

    setWorkspaceSyncError(message: string, workspaceId?: string): void {
        this.workspaceSyncState = {
            ...this.workspaceSyncState,
            workspaceId: workspaceId ?? this.workspaceSyncState.workspaceId,
            lastCheckedAt: new Date().toISOString(),
            lastError: message,
        };
        this.runCheck();
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

        // MCP proxy health from heartbeat (reflects pool availability).
        const mcpProxyHealthy = this.lastHeartbeat?.mcp_healthy ?? true;
        if (!mcpProxyHealthy) {
            issues.push('MCP proxy health degraded — pool instances may be offline');
        }

        // Supervisor heartbeat.
        if (!this.heartbeatAlive) {
            issues.push('Supervisor heartbeat lost — supervisor may be down');
        }

        // Memory — use 1000MB threshold; extension host routinely exceeds 500MB
        // with Copilot and other extensions loaded.
        const memUsage = process.memoryUsage();
        const memoryMB = Math.round(memUsage.heapUsed / 1024 / 1024 * 100) / 100;
        if (memoryMB > 1000) {
            issues.push(`High memory usage: ${memoryMB} MB`);
        }

        issues.push(...this.buildWorkspaceSyncIssues());

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

            beginWorkspaceSyncCheck(reason: string, workspaceId?: string): void {
                this.workspaceSyncState = {
                    ...this.workspaceSyncState,
                    workspaceId: workspaceId ?? this.workspaceSyncState.workspaceId,
                    status: 'checking',
                    lastReason: reason,
                    statusMessage: `Passive sync check running (${reason}).`,
                };
                this.runCheck();
            }

            setWorkspaceSyncIdle(reason: string, message: string, workspaceId?: string): void {
                this.workspaceSyncState = {
                    ...this.workspaceSyncState,
                    workspaceId: workspaceId ?? this.workspaceSyncState.workspaceId,
                    status: 'idle',
                    lastReason: reason,
                    statusMessage: message,
                };
                this.runCheck();
            }
                dashboardPort: this.connectionManager.dashboardPort,
            updateWorkspaceSync(report: WorkspaceConfigSyncReport, reason?: string): void {
            },
            mcp: {
                supervisorHeartbeat: this.heartbeatAlive,
                    status: 'ready',
                lastHeartbeatMs: this.lastHeartbeat?.timestamp_ms ?? null,
                    lastReason: reason ?? this.workspaceSyncState.lastReason,
                    statusMessage: actionableEntries.length > 0
                        ? 'Passive sync check captured actionable findings.'
                        : 'Passive sync check completed with no actionable findings.',
                poolInstances: this.lastHeartbeat?.pool_instances ?? 0,
                mcpProxyHealthy,
            },
            extension: { memoryMB, uptime: uptimeSeconds },
            workspaceSync: { ...this.workspaceSyncState },
                    lastError: undefined,
            health,
            issues,
        };

            setWorkspaceSyncError(message: string, workspaceId?: string, reason?: string): void {
        this._onHealthChange.fire(report);
        return report;
    }
                    status: 'error',

                    lastReason: reason ?? this.workspaceSyncState.lastReason,
                    statusMessage: 'Passive sync check failed.',
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
            `  MCP proxy: ${report.mcp.mcpProxyHealthy ? '✓ healthy' : '✗ degraded'}`,
            `  Pool instances: ${report.mcp.poolInstances}`,
            '',
            '--- Extension ---',
            `  Memory: ${report.extension.memoryMB} MB`,
            `  Uptime: ${report.extension.uptime}s`,
            '',
            '--- Workspace Config Sync ---',
        ];

        if (report.workspaceSync.lastError) {
            lines.push(`  Status: ${report.workspaceSync.status}`);
            lines.push(`  Trigger: ${report.workspaceSync.lastReason ?? 'unknown'}`);
            lines.push(`  Last check: ${report.workspaceSync.lastCheckedAt ?? 'unknown'}`);
            lines.push(`  State: ${report.workspaceSync.statusMessage ?? 'Passive watcher reported an error.'}`);
            lines.push(`  Error: ${report.workspaceSync.lastError}`);
        } else if (report.workspaceSync.summary) {
            const summary = report.workspaceSync.summary;
            lines.push(`  Status: ${report.workspaceSync.status}`);
            lines.push(`  Trigger: ${report.workspaceSync.lastReason ?? 'unknown'}`);
            lines.push(`  Last check: ${report.workspaceSync.lastCheckedAt ?? 'unknown'}`);
            lines.push(`  State: ${report.workspaceSync.statusMessage ?? 'Passive watcher completed.'}`);
            lines.push(`  Actionable findings: ${report.workspaceSync.actionableFindings}`);
            lines.push(`  Protected drift: ${summary.protected_drift}`);
            lines.push(`  Content mismatch: ${summary.content_mismatch}`);
            lines.push(`  Local only: ${summary.local_only}`);
            lines.push(`  DB only: ${summary.db_only}`);
            lines.push(`  Import candidates: ${summary.import_candidate}`);
            lines.push(`  In sync: ${summary.in_sync}`);
            lines.push(`  Ignored local: ${summary.ignored_local}`);
            if (report.workspaceSync.sampleFindings.length > 0) {
                lines.push('  Sample findings:');
                report.workspaceSync.sampleFindings.forEach((finding) => lines.push(`    - ${finding}`));
            }
        } else {
            lines.push(`  Status: ${report.workspaceSync.status}`);
            lines.push(`  Trigger: ${report.workspaceSync.lastReason ?? 'not yet scheduled'}`);
            lines.push(`  State: ${report.workspaceSync.statusMessage ?? 'No passive watcher report captured yet.'}`);
        }

        lines.push('');

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

    private collectActionableEntries(report: WorkspaceConfigSyncReport): WorkspaceConfigSyncEntry[] {
        return [...report.agents, ...report.instructions].filter((entry) => (
            entry.status !== 'in_sync' && entry.status !== 'ignored_local'
        ));
    }

    private buildWorkspaceSyncIssues(): string[] {
        if (this.workspaceSyncState.lastError) {
            return [`Workspace config sync check failed: ${this.workspaceSyncState.lastError}`];
        }

        const summary = this.workspaceSyncState.summary;
        if (!summary) {
            return [];
        }

        const issues: string[] = [];
        if (summary.protected_drift > 0) {
            issues.push(`Workspace config drift: ${summary.protected_drift} PM-controlled file(s) out of parity`);
        }
        if (summary.content_mismatch > 0) {
            issues.push(`Workspace config drift: ${summary.content_mismatch} managed file mismatch(es)`);
        }
        if (summary.local_only > 0) {
            issues.push(`Workspace config drift: ${summary.local_only} managed workspace-only file(s)`);
        }
        if (summary.db_only > 0) {
            issues.push(`Workspace config drift: ${summary.db_only} DB-only file(s)`);
        }
        if (summary.import_candidate > 0) {
            issues.push(`Workspace config drift: ${summary.import_candidate} manual import candidate(s)`);
        }

        return issues;
    }
}

