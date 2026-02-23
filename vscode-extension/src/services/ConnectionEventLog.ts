/**
 * ConnectionEventLog
 *
 * A lightweight ring-buffer that records every connection state change for
 * the MCP server, Dashboard, and Supervisor heartbeat.  The log survives
 * within a single VS Code session so you can inspect the timeline of events
 * when diagnosing intermittent disconnect issues.
 *
 * Kept intentionally small (pure TS, no VS Code API deps) so it can be
 * imported by any service without creating circular dependencies.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ServiceName = 'mcp' | 'dashboard' | 'heartbeat' | 'bridge';

export type ConnectionState = 'connected' | 'disconnected' | 'degraded';

export interface ConnectionEvent {
    /** ISO-8601 timestamp of when the event was recorded. */
    timestamp: string;
    /** Milliseconds since the VS Code extension started (process uptime proxy). */
    uptimeMs: number;
    /** Which service transitioned. */
    service: ServiceName;
    /** New state. */
    state: ConnectionState;
    /** Previous state (null on first record for this service). */
    previousState: ConnectionState | null;
    /** HTTP/SSE response latency if measured at transition time. */
    latencyMs?: number;
    /** Optional diagnostic details (error message, HTTP status, etc.). */
    detail?: string;
}

export interface ServiceStats {
    service: ServiceName;
    currentState: ConnectionState;
    /** Total number of disconnect events recorded. */
    disconnectCount: number;
    /** Total number of connect/restore events recorded. */
    connectCount: number;
    /** Timestamp of last state change. */
    lastChangeAt: string | null;
    /** How long (ms) the service has been in its current state. */
    currentStateDurationMs: number;
}

/** Summary returned by getStats(). */
export interface EventLogStats {
    sessionStartTime: string;
    sessionAgeMs: number;
    totalEvents: number;
    services: Record<ServiceName, ServiceStats>;
    /** True when any service is currently disconnected or degraded. */
    hasIssues: boolean;
}

// ---------------------------------------------------------------------------
// Implementation
// ---------------------------------------------------------------------------

const ALL_SERVICES: ServiceName[] = ['mcp', 'dashboard', 'heartbeat', 'bridge'];
const MAX_EVENTS = 200;

export class ConnectionEventLog {
    private events: ConnectionEvent[] = [];
    private readonly sessionStart: number = Date.now();
    private readonly sessionStartIso: string = new Date().toISOString();

    /** Track last known state per service to detect transitions. */
    private lastState: Partial<Record<ServiceName, ConnectionState>> = {};
    private lastChangeTime: Partial<Record<ServiceName, number>> = {};

    // ---- Public API --------------------------------------------------------

    /**
     * Record a connection event.
     * If the new state is the same as the recorded previous state, the call is
     * a no-op (avoids flooding the log with duplicate entries).
     *
     * @returns The recorded event, or null if it was a duplicate (no-op).
     */
    record(
        service: ServiceName,
        state: ConnectionState,
        opts: { latencyMs?: number; detail?: string } = {}
    ): ConnectionEvent | null {
        const prev = this.lastState[service] ?? null;

        // No-op if state hasn't changed since last record.
        if (prev === state) { return null; }

        const now = Date.now();
        const evt: ConnectionEvent = {
            timestamp: new Date(now).toISOString(),
            uptimeMs: now - this.sessionStart,
            service,
            state,
            previousState: prev,
            latencyMs: opts.latencyMs,
            detail: opts.detail,
        };

        this.events.push(evt);
        // Trim to ring-buffer size
        if (this.events.length > MAX_EVENTS) {
            this.events.splice(0, this.events.length - MAX_EVENTS);
        }

        this.lastState[service] = state;
        this.lastChangeTime[service] = now;

        return evt;
    }

    /** Get all recorded events, oldest first. */
    getHistory(): ConnectionEvent[] {
        return [...this.events];
    }

    /** Get the last N events (most-recent last). */
    getRecentHistory(n: number): ConnectionEvent[] {
        return this.events.slice(-n);
    }

    /** Get the current state for a service (undefined if never recorded). */
    getCurrentState(service: ServiceName): ConnectionState | undefined {
        return this.lastState[service];
    }

    /** Compute summary statistics for all services. */
    getStats(): EventLogStats {
        const now = Date.now();
        const services = {} as Record<ServiceName, ServiceStats>;

        for (const svc of ALL_SERVICES) {
            const currentState = this.lastState[svc] ?? 'disconnected';
            const lastChange = this.lastChangeTime[svc] ?? null;

            // Count transitions
            let disconnectCount = 0;
            let connectCount = 0;
            for (const evt of this.events) {
                if (evt.service !== svc) { continue; }
                if (evt.state === 'disconnected' || evt.state === 'degraded') { disconnectCount++; }
                if (evt.state === 'connected') { connectCount++; }
            }

            services[svc] = {
                service: svc,
                currentState,
                disconnectCount,
                connectCount,
                lastChangeAt: lastChange ? new Date(lastChange).toISOString() : null,
                currentStateDurationMs: lastChange ? now - lastChange : now - this.sessionStart,
            };
        }

        const hasIssues = ALL_SERVICES.some(
            svc => this.lastState[svc] === 'disconnected' || this.lastState[svc] === 'degraded'
        );

        return {
            sessionStartTime: this.sessionStartIso,
            sessionAgeMs: now - this.sessionStart,
            totalEvents: this.events.length,
            services,
            hasIssues,
        };
    }

    /** Format the event history as a human-readable string for an output channel. */
    formatHistory(): string {
        const lines: string[] = [];
        const stats = this.getStats();

        lines.push('=== Project Memory — Connection Event Log ===');
        lines.push(`Session started: ${stats.sessionStartTime}`);
        lines.push(`Session age:     ${Math.round(stats.sessionAgeMs / 1000)}s`);
        lines.push(`Total events:    ${stats.totalEvents} (ring buffer max ${MAX_EVENTS})`);
        lines.push('');

        // Current state summary
        lines.push('--- Current State ---');
        for (const svc of ALL_SERVICES) {
            const s = stats.services[svc];
            const stateIcon = s.currentState === 'connected' ? '✓' : s.currentState === 'degraded' ? '⚠' : '✗';
            const durSec = Math.round(s.currentStateDurationMs / 1000);
            const disconnects = s.disconnectCount > 0 ? `  (${s.disconnectCount} disconnect${s.disconnectCount !== 1 ? 's' : ''} this session)` : '';
            lines.push(`  ${stateIcon} ${svc.padEnd(12)} ${s.currentState.padEnd(14)} for ${durSec}s${disconnects}`);
        }
        lines.push('');

        if (this.events.length === 0) {
            lines.push('(no events recorded yet — state has not changed since session start)');
            return lines.join('\n');
        }

        // Timeline
        lines.push('--- Event Timeline (oldest → newest) ---');
        for (const evt of this.events) {
            const arrow = `${(evt.previousState ?? '?').padEnd(14)} → ${evt.state}`;
            const latency = evt.latencyMs != null ? `  ${evt.latencyMs}ms` : '';
            const detail = evt.detail ? `  [${evt.detail}]` : '';
            const uptime = `+${Math.round(evt.uptimeMs / 1000)}s`;
            lines.push(
                `  ${evt.timestamp}  ${uptime.padStart(7)}  ${evt.service.padEnd(11)}  ${arrow}${latency}${detail}`
            );
        }

        return lines.join('\n');
    }

    /** Wipe all recorded events (e.g. on deliberate reconnect). */
    clear(): void {
        this.events = [];
    }
}
