/**
 * SupervisorHeartbeat
 *
 * Subscribes to the supervisor's Server-Sent Events heartbeat stream at
 * GET http://localhost:<mcpPort>/supervisor/heartbeat
 *
 * Every 10 seconds the supervisor broadcasts a JSON blob with service health.
 * All VS Code instances share one stream rather than doing individual polls,
 * which eliminates per-instance health-check overhead and the false-disconnect
 * cycle that came from polling.
 *
 * Usage:
 *   const hb = new SupervisorHeartbeat(3457);
 *   hb.onBeat(evt => console.log(evt));
 *   hb.start();
 *   // ...
 *   hb.dispose();
 */

import * as http from 'http';
import * as vscode from 'vscode';

export interface HeartbeatEvent {
    timestamp_ms: number;
    mcp_proxy_port: number;
    pool_base_port: number;
    pool_instances: number;
    mcp_healthy: boolean;
}

export class SupervisorHeartbeat implements vscode.Disposable {
    private _onBeat = new vscode.EventEmitter<HeartbeatEvent>();
    private _onLost = new vscode.EventEmitter<void>();
    private _onRestored = new vscode.EventEmitter<void>();

    /** Fires whenever a heartbeat event arrives from the supervisor. */
    public readonly onBeat = this._onBeat.event;
    /** Fires when the heartbeat stream is lost (supervisor down/unreachable). */
    public readonly onLost = this._onLost.event;
    /** Fires when the stream reconnects after being lost. */
    public readonly onRestored = this._onRestored.event;

    private req: http.ClientRequest | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private disposed = false;
    private wasConnected = false;
    private reconnectDelayMs = 2000;
    private readonly maxReconnectDelayMs = 30_000;

    constructor(
        private readonly mcpPort: number,
        private readonly log?: (msg: string) => void,
    ) {}

    start(): void {
        if (this.disposed) { return; }
        this.connect();
    }

    dispose(): void {
        this.disposed = true;
        this.clearReconnectTimer();
        this.req?.destroy();
        this.req = null;
        this._onBeat.dispose();
        this._onLost.dispose();
        this._onRestored.dispose();
    }

    // ── Private ──────────────────────────────────────────────────────────────

    private connect(): void {
        if (this.disposed) { return; }

        const options: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: this.mcpPort,
            path: '/supervisor/heartbeat',
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        };

        this.log?.(`[heartbeat] connecting to ${options.hostname}:${options.port}${options.path}`);

        const req = http.request(options, (res) => {
            if (res.statusCode !== 200) {
                this.log?.(`[heartbeat] unexpected status ${res.statusCode} — will retry`);
                res.resume();
                this.scheduleReconnect();
                return;
            }

            // Connection established.
            this.reconnectDelayMs = 2000;
            if (this.wasConnected === false) {
                this.wasConnected = true;
            } else {
                this._onRestored.fire();
            }

            let buffer = '';
            res.setEncoding('utf8');

            res.on('data', (chunk: string) => {
                buffer += chunk;
                // SSE lines are separated by \n\n (event boundary).
                const parts = buffer.split('\n\n');
                buffer = parts.pop() ?? '';
                for (const block of parts) {
                    for (const line of block.split('\n')) {
                        if (line.startsWith('data:')) {
                            const payload = line.slice(5).trim();
                            if (payload === 'ping' || payload === '') { continue; }
                            try {
                                const evt = JSON.parse(payload) as HeartbeatEvent;
                                this._onBeat.fire(evt);
                            } catch {
                                // ignore malformed JSON
                            }
                        }
                    }
                }
            });

            res.on('end', () => {
                this.log?.('[heartbeat] stream ended — scheduling reconnect');
                this._onLost.fire();
                this.scheduleReconnect();
            });

            res.on('error', (err) => {
                this.log?.(`[heartbeat] stream error: ${err.message}`);
                this._onLost.fire();
                this.scheduleReconnect();
            });
        });

        req.on('error', (err) => {
            this.log?.(`[heartbeat] request error: ${err.message}`);
            if (this.wasConnected) {
                this._onLost.fire();
            }
            this.scheduleReconnect();
        });

        req.end();
        this.req = req;
    }

    private scheduleReconnect(): void {
        if (this.disposed) { return; }
        this.clearReconnectTimer();
        this.log?.(`[heartbeat] reconnecting in ${this.reconnectDelayMs}ms`);
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connect();
        }, this.reconnectDelayMs);
        // Exponential back-off, capped at 30 s.
        this.reconnectDelayMs = Math.min(this.reconnectDelayMs * 2, this.maxReconnectDelayMs);
    }

    private clearReconnectTimer(): void {
        if (this.reconnectTimer !== null) {
            clearTimeout(this.reconnectTimer);
            this.reconnectTimer = null;
        }
    }
}
