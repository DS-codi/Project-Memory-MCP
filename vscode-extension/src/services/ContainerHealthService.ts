/**
 * Container Health Service
 *
 * Standalone service that polls the container's /health endpoint and
 * emits lifecycle events: connected, degraded, disconnected, reconnected.
 *
 * Extracted from ServerManager to decouple health monitoring from
 * server lifecycle management. Used by ServerManager for auto-fallback
 * and by ContainerStatusBar for UI indication.
 *
 * @see Phase 7 — Container Resilience & Auto-Mount
 */

import { EventEmitter } from 'events';
import { probeContainer, getContainerMcpPort } from '../server/ContainerDetection';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ContainerHealthState = 'connected' | 'degraded' | 'disconnected' | 'reconnected' | 'unknown';

export interface ContainerHealthSnapshot {
    state: ContainerHealthState;
    mcpHealthy: boolean;
    dashboardHealthy: boolean;
    lastCheck: number;
    uptimeSeconds?: number;
    consecutiveFailures: number;
    mcpInfo?: Record<string, unknown>;
}

export interface ContainerHealthEvents {
    connected: [snapshot: ContainerHealthSnapshot];
    degraded: [snapshot: ContainerHealthSnapshot];
    disconnected: [snapshot: ContainerHealthSnapshot];
    reconnected: [snapshot: ContainerHealthSnapshot];
    stateChanged: [snapshot: ContainerHealthSnapshot];
}

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MAX_CONSECUTIVE_FAILURES = 3;

export class ContainerHealthService extends EventEmitter {
    private _state: ContainerHealthState = 'unknown';
    private _pollTimer: ReturnType<typeof setInterval> | null = null;
    private _pollIntervalMs: number;
    private _consecutiveFailures = 0;
    private _lastCheck = 0;
    private _dashboardPort: number;
    private _wasConnected = false;
    private _snapshot: ContainerHealthSnapshot | null = null;
    private _logFn: (msg: string) => void;

    constructor(opts: {
        dashboardPort?: number;
        pollIntervalMs?: number;
        log?: (msg: string) => void;
    } = {}) {
        super();
        this._dashboardPort = opts.dashboardPort ?? 3001;
        this._pollIntervalMs = opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
        this._logFn = opts.log ?? (() => { /* noop */ });
    }

    // ---- Public getters ----

    get state(): ContainerHealthState { return this._state; }
    get isConnected(): boolean { return this._state === 'connected' || this._state === 'reconnected'; }
    get snapshot(): ContainerHealthSnapshot | null { return this._snapshot; }
    get isPolling(): boolean { return this._pollTimer !== null; }

    // ---- Lifecycle ----

    /**
     * Start periodic polling. Performs an immediate check first.
     */
    async startPolling(): Promise<void> {
        this.stopPolling();
        this._logFn('[ContainerHealth] Starting health polling');
        await this.poll();
        this._pollTimer = setInterval(() => this.poll(), this._pollIntervalMs);
    }

    /**
     * Stop periodic polling and reset state.
     */
    stopPolling(): void {
        if (this._pollTimer) {
            clearInterval(this._pollTimer);
            this._pollTimer = null;
        }
    }

    /**
     * Run a single health check. Can be called manually outside polling.
     */
    async poll(): Promise<ContainerHealthSnapshot> {
        const mcpPort = getContainerMcpPort();
        const status = await probeContainer(mcpPort, this._dashboardPort);
        this._lastCheck = Date.now();

        let newState: ContainerHealthState;

        if (status.mcpHealthy && status.dashboardHealthy) {
            this._consecutiveFailures = 0;
            newState = this._wasConnected
                ? (this._state === 'disconnected' || this._state === 'degraded' ? 'reconnected' : 'connected')
                : 'connected';
            this._wasConnected = true;
        } else if (status.mcpHealthy && !status.dashboardHealthy) {
            this._consecutiveFailures = 0;
            newState = 'degraded';
            this._wasConnected = true;
        } else {
            this._consecutiveFailures++;
            if (this._consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
                newState = 'disconnected';
            } else {
                // Keep current state during transient failures
                newState = this._state === 'unknown' ? 'disconnected' : this._state;
            }
        }

        const snapshot: ContainerHealthSnapshot = {
            state: newState,
            mcpHealthy: status.mcpHealthy,
            dashboardHealthy: status.dashboardHealthy,
            lastCheck: this._lastCheck,
            uptimeSeconds: status.mcpInfo?.uptime as number | undefined,
            consecutiveFailures: this._consecutiveFailures,
            mcpInfo: status.mcpInfo || undefined,
        };

        this._snapshot = snapshot;

        if (newState !== this._state) {
            const previous = this._state;
            this._state = newState;
            this._logFn(`[ContainerHealth] State: ${previous} → ${newState}`);
            this.emit(newState, snapshot);
            this.emit('stateChanged', snapshot);
        }

        return snapshot;
    }

    // ---- Cleanup ----

    dispose(): void {
        this.stopPolling();
        this.removeAllListeners();
    }
}
