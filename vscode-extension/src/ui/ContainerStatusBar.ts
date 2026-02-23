/**
 * Container Status Bar
 *
 * Displays the container connection state in the VS Code status bar.
 * Subscribes to ContainerHealthService events and shows:
 *   - $(cloud) Connected (green)
 *   - $(warning) Degraded (yellow) 
 *   - $(cloud-offline) Disconnected (red)
 *   - $(desktop-download) Local mode (neutral)
 *
 * @see Phase 7 — Container Resilience & Auto-Mount
 */

import * as vscode from 'vscode';
import {
    ContainerHealthService,
    type ContainerHealthState,
    type ContainerHealthSnapshot,
} from '../services/ContainerHealthService';

// ---------------------------------------------------------------------------
// Status bar configuration per state
// ---------------------------------------------------------------------------

interface StateAppearance {
    icon: string;
    label: string;
    tooltip: string;
    color?: vscode.ThemeColor;
}

const APPEARANCE: Record<ContainerHealthState | 'local', StateAppearance> = {
    connected: {
        icon: '$(cloud)',
        label: 'Container',
        tooltip: 'Connected to Project Memory container',
        color: new vscode.ThemeColor('statusBarItem.prominentBackground'),
    },
    reconnected: {
        icon: '$(cloud)',
        label: 'Container (reconnected)',
        tooltip: 'Reconnected to Project Memory container',
        color: new vscode.ThemeColor('statusBarItem.prominentBackground'),
    },
    degraded: {
        icon: '$(warning)',
        label: 'Container (degraded)',
        tooltip: 'Container MCP is healthy but dashboard is down',
        color: new vscode.ThemeColor('statusBarItem.warningBackground'),
    },
    disconnected: {
        icon: '$(cloud-offline)',
        label: 'Container (offline)',
        tooltip: 'Container is unreachable — running in local mode',
        color: new vscode.ThemeColor('statusBarItem.errorBackground'),
    },
    unknown: {
        icon: '$(question)',
        label: 'Container (?)',
        tooltip: 'Container status unknown',
    },
    local: {
        icon: '$(desktop-download)',
        label: 'Local',
        tooltip: 'Running in local mode (no container)',
    },
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export class ContainerStatusBar implements vscode.Disposable {
    private readonly _statusBarItem: vscode.StatusBarItem;
    private _healthService: ContainerHealthService | null = null;
    private _isContainerMode = false;
    private readonly _disposables: vscode.Disposable[] = [];

    constructor() {
        this._statusBarItem = vscode.window.createStatusBarItem(
            vscode.StatusBarAlignment.Right,
            99 // Just left of the existing PM Server status bar (priority 100)
        );
        this._statusBarItem.command = 'projectMemoryDev.showContainerStatus';
        this.update('local');
    }

    /**
     * Bind to a ContainerHealthService and start reflecting its state.
     * Call with `null` to unbind (e.g. when switching to local mode).
     */
    bind(service: ContainerHealthService | null, isContainerMode: boolean): void {
        // Remove old listeners
        if (this._healthService) {
            this._healthService.removeAllListeners('stateChanged');
        }

        this._healthService = service;
        this._isContainerMode = isContainerMode;

        if (!service || !isContainerMode) {
            this.update('local');
            return;
        }

        service.on('stateChanged', (snapshot: ContainerHealthSnapshot) => {
            this.update(snapshot.state, snapshot);
        });

        // Set initial state from current snapshot
        const snap = service.snapshot;
        this.update(snap?.state ?? 'unknown', snap ?? undefined);
    }

    private update(state: ContainerHealthState | 'local', snapshot?: ContainerHealthSnapshot): void {
        const appearance = APPEARANCE[state] ?? APPEARANCE.unknown;
        this._statusBarItem.text = `${appearance.icon} ${appearance.label}`;

        let tooltip = appearance.tooltip;
        if (snapshot) {
            const parts: string[] = [tooltip];
            if (snapshot.uptimeSeconds != null) {
                parts.push(`Uptime: ${formatUptime(snapshot.uptimeSeconds)}`);
            }
            parts.push(`Last check: ${new Date(snapshot.lastCheck).toLocaleTimeString()}`);
            if (snapshot.consecutiveFailures > 0) {
                parts.push(`Consecutive failures: ${snapshot.consecutiveFailures}`);
            }
            tooltip = parts.join('\n');
        }

        this._statusBarItem.tooltip = tooltip;
        this._statusBarItem.backgroundColor = appearance.color;
        this._statusBarItem.show();
    }

    dispose(): void {
        if (this._healthService) {
            this._healthService.removeAllListeners('stateChanged');
        }
        this._statusBarItem.dispose();
        this._disposables.forEach(d => d.dispose());
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatUptime(seconds: number): string {
    if (seconds < 60) { return `${seconds}s`; }
    if (seconds < 3600) { return `${Math.floor(seconds / 60)}m ${seconds % 60}s`; }
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    return `${h}h ${m}m`;
}
