/**
 * DiagnosticsTreeProvider
 *
 * Renders system health as a VS Code TreeView, replacing the output-channel-only
 * diagnostics display with a persistent visual health panel.
 *
 * Data source: DiagnosticsReport from DiagnosticsService (updated on each heartbeat
 * or heartbeat-lost event). The provider is refreshed via `update(report)`.
 *
 * Tree structure:
 *   ▶ $(check/warning/error) Dashboard    port 3001
 *       — Connected / Unreachable
 *   ▶ $(check/warning/error) MCP Server   port 3457
 *       — Connected / Unreachable
 *   ▶ $(check/warning/error) Supervisor
 *       — Heartbeat: alive (last: 3s ago)
 *       — Pool instances: 2
 *   ▶ $(pulse) Memory
 *       — Heap: 42 MB
 *       — Uptime: 5m 30s
 */

import * as vscode from 'vscode';
import type { DiagnosticsReport } from '../services/DiagnosticsService';

// ─────────────────────────────────────────────────────────────────────────────
// Node types
// ─────────────────────────────────────────────────────────────────────────────

type NodeKind = 'subsystem' | 'detail';

export interface DiagNode {
    kind: NodeKind;
    id: string;
    label: string;
    description?: string;
    tooltip?: string;
    icon: string;
    contextValue?: string;
    /** Child detail items (only for subsystem nodes). */
    children?: DiagNode[];
}

// ─────────────────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────────────────

export class DiagnosticsTreeProvider
    implements vscode.TreeDataProvider<DiagNode>, vscode.Disposable
{
    private readonly _onDidChangeTreeData = new vscode.EventEmitter<DiagNode | undefined | null | void>();
    readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

    private _roots: DiagNode[] = DiagnosticsTreeProvider._emptyRoots();

    // ── Public API ────────────────────────────────────────────────────────────

    /** Replace the current tree with data from a fresh DiagnosticsReport. */
    update(report: DiagnosticsReport): void {
        this._roots = DiagnosticsTreeProvider._buildRoots(report);
        this._onDidChangeTreeData.fire();
    }

    /** Force a full refresh without a new report (e.g. after command execution). */
    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    dispose(): void {
        this._onDidChangeTreeData.dispose();
    }

    // ── TreeDataProvider ──────────────────────────────────────────────────────

    getTreeItem(node: DiagNode): vscode.TreeItem {
        const item = new vscode.TreeItem(
            node.label,
            node.children && node.children.length > 0
                ? vscode.TreeItemCollapsibleState.Expanded
                : vscode.TreeItemCollapsibleState.None,
        );
        item.id = node.id;
        item.description = node.description;
        item.tooltip = node.tooltip ?? node.label;
        item.iconPath = new vscode.ThemeIcon(node.icon);
        item.contextValue = node.contextValue;
        // Detail nodes with copyable values can be invoked to copy them
        if (node.kind === 'detail' && node.description) {
            item.command = {
                command: 'projectMemory.diagnostics.copyValue',
                title: 'Copy value',
                arguments: [node.description],
            };
        }
        return item;
    }

    getChildren(node?: DiagNode): vscode.ProviderResult<DiagNode[]> {
        if (!node) return this._roots;
        return node.children ?? [];
    }

    // ── Builders ──────────────────────────────────────────────────────────────

    private static _emptyRoots(): DiagNode[] {
        return [
            { kind: 'subsystem', id: 'dashboard', label: 'Dashboard', icon: 'loading~spin', description: 'loading…' },
            { kind: 'subsystem', id: 'mcp', label: 'MCP Server', icon: 'loading~spin', description: 'loading…' },
            { kind: 'subsystem', id: 'supervisor', label: 'Supervisor', icon: 'loading~spin', description: 'loading…' },
            { kind: 'subsystem', id: 'memory', label: 'Memory', icon: 'pulse', description: 'loading…' },
        ];
    }

    private static _buildRoots(r: DiagnosticsReport): DiagNode[] {
        return [
            DiagnosticsTreeProvider._dashboardNode(r),
            DiagnosticsTreeProvider._mcpNode(r),
            DiagnosticsTreeProvider._supervisorNode(r),
            DiagnosticsTreeProvider._memoryNode(r),
        ];
    }

    // Dashboard node
    private static _dashboardNode(r: DiagnosticsReport): DiagNode {
        const ok = r.connection.dashboardConnected;
        return {
            kind: 'subsystem',
            id: 'dashboard',
            label: 'Dashboard',
            description: `port ${r.connection.dashboardPort}`,
            tooltip: ok
                ? `Dashboard: connected on port ${r.connection.dashboardPort}`
                : `Dashboard: unreachable on port ${r.connection.dashboardPort}`,
            icon: ok ? 'check' : 'error',
            contextValue: 'diagnosticsSubsystem',
            children: [
                _detail('dashboard.status', 'Status', ok ? 'Connected' : 'Unreachable', ok ? 'check' : 'error'),
                _detail('dashboard.port', 'Port', String(r.connection.dashboardPort), 'plug'),
            ],
        };
    }

    // MCP Server node
    private static _mcpNode(r: DiagnosticsReport): DiagNode {
        const ok = r.connection.mcpConnected;
        return {
            kind: 'subsystem',
            id: 'mcp',
            label: 'MCP Server',
            description: `port ${r.connection.mcpPort}`,
            tooltip: ok
                ? `MCP Server: connected on port ${r.connection.mcpPort}`
                : `MCP Server: unreachable on port ${r.connection.mcpPort}`,
            icon: ok ? 'check' : 'error',
            contextValue: 'diagnosticsSubsystem',
            children: [
                _detail('mcp.status', 'Status', ok ? 'Connected' : 'Unreachable', ok ? 'check' : 'error'),
                _detail('mcp.port', 'Port', String(r.connection.mcpPort), 'plug'),
            ],
        };
    }

    // Supervisor node
    private static _supervisorNode(r: DiagnosticsReport): DiagNode {
        const alive = r.mcp.supervisorHeartbeat;
        const lastMs = r.mcp.lastHeartbeatMs;
        const agoLabel = lastMs != null
            ? _formatAgo(Date.now() - lastMs)
            : 'never';

        return {
            kind: 'subsystem',
            id: 'supervisor',
            label: 'Supervisor',
            description: alive ? 'alive' : 'no heartbeat',
            tooltip: alive
                ? `Supervisor: heartbeat alive (last: ${agoLabel})`
                : 'Supervisor: heartbeat lost — supervisor may be down',
            icon: alive ? 'check' : 'warning',
            contextValue: 'diagnosticsSubsystem',
            children: [
                _detail('supervisor.heartbeat', 'Heartbeat', alive ? `alive (${agoLabel})` : 'lost', alive ? 'check' : 'warning'),
                _detail('supervisor.pool', 'Pool instances', String(r.mcp.poolInstances), 'server'),
            ],
        };
    }

    // Memory / extension node
    private static _memoryNode(r: DiagnosticsReport): DiagNode {
        const memMB = r.extension.memoryMB;
        const highMem = memMB > 1000;
        const uptimeLabel = _formatUptime(r.extension.uptime);

        return {
            kind: 'subsystem',
            id: 'memory',
            label: 'Memory',
            description: `${memMB} MB`,
            tooltip: highMem
                ? `High memory usage: ${memMB} MB`
                : `Extension memory: ${memMB} MB — uptime: ${uptimeLabel}`,
            icon: highMem ? 'warning' : 'pulse',
            contextValue: 'diagnosticsSubsystem',
            children: [
                _detail('memory.heap', 'Heap', `${memMB} MB`, 'pulse'),
                _detail('memory.uptime', 'Uptime', uptimeLabel, 'clock'),
            ],
        };
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function _detail(id: string, label: string, value: string, icon: string): DiagNode {
    return { kind: 'detail', id, label, description: value, icon, tooltip: `${label}: ${value}`, contextValue: 'diagnosticsDetail' };
}

function _formatAgo(ms: number): string {
    const s = Math.floor(ms / 1000);
    if (s < 60) return `${s}s ago`;
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ${s % 60}s ago`;
    return `${Math.floor(m / 60)}h ${m % 60}m ago`;
}

function _formatUptime(seconds: number): string {
    if (seconds < 60) return `${seconds}s`;
    const m = Math.floor(seconds / 60);
    if (m < 60) return `${m}m ${seconds % 60}s`;
    return `${Math.floor(m / 60)}h ${m % 60}m`;
}
