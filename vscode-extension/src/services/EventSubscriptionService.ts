/**
 * EventSubscriptionService
 *
 * Connects to the dashboard server's SSE event stream at
 * GET http://localhost:<dashboardPort>/api/events/stream
 *
 * Parses plan-lifecycle events emitted by the server and re-emits them as
 * typed VS Code EventEmitter events so downstream consumers (TreeView,
 * StatusBarManager, NotificationService) can react without polling.
 *
 * Reconnects automatically with exponential backoff (same pattern as
 * SupervisorHeartbeat). Only starts if `dashboard.enabled` is true.
 */

import * as http from 'http';
import * as vscode from 'vscode';

// ─────────────────────────────────────────────────────────────────────────────
// Event types (must stay in sync with dashboard/server/src/events/emitter.ts)
// ─────────────────────────────────────────────────────────────────────────────

export type MCPEventType =
    | 'step_updated'
    | 'plan_created'
    | 'plan_archived'
    | 'plan_resumed'
    | 'plan_deleted'
    | 'note_added'
    | 'agent_session_started'
    | 'agent_session_completed'
    | 'handoff_started'
    | 'handoff_completed'
    | 'workspace_registered'
    | 'workspace_indexed'
    | string; // allow unknown future types

export interface MCPEvent {
    id: string;
    type: MCPEventType;
    timestamp: string;
    workspace_id?: string;
    plan_id?: string;
    agent_type?: string;
    tool_name?: string;
    data: Record<string, unknown>;
}

/** Union of specific event categories emitted by this service. */
export interface AgentEvent extends MCPEvent {
    type: 'agent_session_started' | 'agent_session_completed' | 'handoff_started' | 'handoff_completed';
}
export interface PlanEvent extends MCPEvent {
    type: 'plan_created' | 'plan_archived' | 'plan_resumed' | 'plan_deleted' | 'note_added';
}
export interface StepEvent extends MCPEvent {
    type: 'step_updated';
}
export interface WorkspaceEvent extends MCPEvent {
    type: 'workspace_registered' | 'workspace_indexed';
}

// ─────────────────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────────────────

export class EventSubscriptionService implements vscode.Disposable {
    // Typed emitters
    private readonly _onAgentEvent = new vscode.EventEmitter<AgentEvent>();
    private readonly _onPlanEvent = new vscode.EventEmitter<PlanEvent>();
    private readonly _onStepEvent = new vscode.EventEmitter<StepEvent>();
    private readonly _onWorkspaceEvent = new vscode.EventEmitter<WorkspaceEvent>();
    private readonly _onAnyEvent = new vscode.EventEmitter<MCPEvent>();
    private readonly _onConnected = new vscode.EventEmitter<void>();
    private readonly _onDisconnected = new vscode.EventEmitter<void>();

    public readonly onAgentEvent = this._onAgentEvent.event;
    public readonly onPlanEvent = this._onPlanEvent.event;
    public readonly onStepEvent = this._onStepEvent.event;
    public readonly onWorkspaceEvent = this._onWorkspaceEvent.event;
    /** Fires for every event, regardless of type. */
    public readonly onAnyEvent = this._onAnyEvent.event;
    public readonly onConnected = this._onConnected.event;
    public readonly onDisconnected = this._onDisconnected.event;

    private _req: http.ClientRequest | null = null;
    private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private _disposed = false;
    private _connected = false;
    private _reconnectDelayMs = 2000;
    private readonly _maxReconnectDelayMs = 30_000;
    private _buffer = '';

    constructor(public dashboardPort: number) {}

    // ── Public API ────────────────────────────────────────────────────────────

    get isConnected(): boolean {
        return this._connected;
    }

    start(): void {
        if (this._disposed) { return; }
        this._connect();
    }

    dispose(): void {
        this._disposed = true;
        this._clearReconnectTimer();
        this._req?.destroy();
        this._req = null;
        this._onAgentEvent.dispose();
        this._onPlanEvent.dispose();
        this._onStepEvent.dispose();
        this._onWorkspaceEvent.dispose();
        this._onAnyEvent.dispose();
        this._onConnected.dispose();
        this._onDisconnected.dispose();
    }

    // ── Connection logic ──────────────────────────────────────────────────────

    private _connect(): void {
        if (this._disposed) { return; }

        const options: http.RequestOptions = {
            hostname: '127.0.0.1',
            port: this.dashboardPort,
            path: '/api/events/stream',
            method: 'GET',
            headers: {
                'Accept': 'text/event-stream',
                'Cache-Control': 'no-cache',
                'Connection': 'keep-alive',
            },
        };

        const req = http.request(options, (res) => {
            if (res.statusCode !== 200) {
                res.resume();
                this._scheduleReconnect();
                return;
            }

            this._reconnectDelayMs = 2000;
            if (!this._connected) {
                this._connected = true;
                this._onConnected.fire();
            }

            this._buffer = '';

            res.on('data', (chunk: Buffer) => {
                this._buffer += chunk.toString();
                this._flushBuffer();
            });

            res.on('end', () => {
                this._onStreamEnd();
            });

            res.on('error', () => {
                this._onStreamEnd();
            });
        });

        req.on('error', () => {
            this._onStreamEnd();
        });

        req.setTimeout(0); // no socket timeout on SSE stream
        req.end();
        this._req = req;
    }

    private _onStreamEnd(): void {
        if (this._disposed) { return; }
        if (this._connected) {
            this._connected = false;
            this._onDisconnected.fire();
        }
        this._scheduleReconnect();
    }

    private _scheduleReconnect(): void {
        this._clearReconnectTimer();
        this._reconnectTimer = setTimeout(() => {
            this._connect();
        }, this._reconnectDelayMs);
        this._reconnectDelayMs = Math.min(this._reconnectDelayMs * 2, this._maxReconnectDelayMs);
    }

    private _clearReconnectTimer(): void {
        if (this._reconnectTimer !== null) {
            clearTimeout(this._reconnectTimer);
            this._reconnectTimer = null;
        }
    }

    // ── SSE parsing ───────────────────────────────────────────────────────────

    private _flushBuffer(): void {
        // SSE messages are separated by double newlines
        const messages = this._buffer.split('\n\n');
        // Keep the last (possibly incomplete) chunk in the buffer
        this._buffer = messages.pop() ?? '';

        for (const msg of messages) {
            this._parseMessage(msg);
        }
    }

    private _parseMessage(msg: string): void {
        let eventType = 'message';
        let dataLine = '';

        for (const line of msg.split('\n')) {
            if (line.startsWith('event:')) {
                eventType = line.slice('event:'.length).trim();
            } else if (line.startsWith('data:')) {
                dataLine = line.slice('data:'.length).trim();
            }
        }

        // Skip heartbeat comments and non-mcp_event messages
        if (eventType !== 'mcp_event' || !dataLine) {
            return;
        }

        try {
            const event = JSON.parse(dataLine) as MCPEvent;
            this._dispatch(event);
        } catch {
            // Malformed JSON — ignore
        }
    }

    private _dispatch(event: MCPEvent): void {
        this._onAnyEvent.fire(event);

        switch (event.type) {
            case 'agent_session_started':
            case 'agent_session_completed':
            case 'handoff_started':
            case 'handoff_completed':
                this._onAgentEvent.fire(event as AgentEvent);
                break;

            case 'plan_created':
            case 'plan_archived':
            case 'plan_resumed':
            case 'plan_deleted':
            case 'note_added':
                this._onPlanEvent.fire(event as PlanEvent);
                break;

            case 'step_updated':
                this._onStepEvent.fire(event as StepEvent);
                break;

            case 'workspace_registered':
            case 'workspace_indexed':
                this._onWorkspaceEvent.fire(event as WorkspaceEvent);
                break;
        }
    }
}
