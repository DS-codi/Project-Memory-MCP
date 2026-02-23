/**
 * Supervisor Control Client
 *
 * Sends NDJSON control messages to the running Supervisor process over its
 * named-pipe (Windows) or TCP control channel.
 *
 * Responsibilities:
 * - Register this VS Code window with the Supervisor on activation via
 *   `AttachClient`, so the Supervisor can correlate the window with its
 *   MCP pool sessions.
 * - Unregister via `DetachClient` on extension deactivation.
 * - Expose helpers for pool-management commands used by diagnostics commands.
 */

import * as net from 'net';
import * as vscode from 'vscode';

// ---------------------------------------------------------------------------
// Connection constants (must match supervisor defaults)
// ---------------------------------------------------------------------------

const SUPERVISOR_PIPE = '\\\\.\\pipe\\project-memory-supervisor';
const SUPERVISOR_TCP_HOST = '127.0.0.1';
const SUPERVISOR_TCP_PORT = 45470;
const REQUEST_TIMEOUT_MS = 5_000;
const CONNECT_TIMEOUT_MS = 1_500;

// ---------------------------------------------------------------------------
// Public types matching supervisor registry JSON (snake_case)
// ---------------------------------------------------------------------------

export interface McpConnectionInfo {
  session_id: string;
  transport_type: string;
  connected_at: string;
  last_activity: string | null;
  call_count: number;
  linked_client_id: string | null;
  instance_port: number;
}

export interface McpInstanceInfo {
  port: number;
  connection_count: number;
}

interface ControlResponse {
  ok: boolean;
  error?: string;
  data: unknown;
}

// ---------------------------------------------------------------------------
// SupervisorControlClient
// ---------------------------------------------------------------------------

export class SupervisorControlClient implements vscode.Disposable {
  private socket: net.Socket | null = null;
  private buffer = '';
  private pending: ((r: ControlResponse) => void) | null = null;
  private _connected = false;
  private _clientId: string | null = null;

  get isConnected(): boolean { return this._connected; }
  get clientId(): string | null { return this._clientId; }

  // -------------------------------------------------------------------------
  // Connection
  // -------------------------------------------------------------------------

  /**
   * Try to connect to the Supervisor.  Attempts the named pipe first (local
   * mode), then TCP (container mode).  Returns `true` on success.
   */
  async connect(): Promise<boolean> {
    if (this._connected) { return true; }

    const cfg = vscode.workspace.getConfiguration('projectMemoryDev');
    const containerMode = cfg.get<'auto' | 'local' | 'container'>('containerMode', 'auto');

    const tcpOpts: net.TcpNetConnectOpts = { host: SUPERVISOR_TCP_HOST, port: SUPERVISOR_TCP_PORT };
    const pipeOpts: net.IpcNetConnectOpts = { path: SUPERVISOR_PIPE };

    if (containerMode === 'container') {
      return this.tryConnect(tcpOpts);
    }
    if (containerMode === 'local') {
      return this.tryConnect(pipeOpts);
    }
    // auto: pipe first, then TCP
    return (await this.tryConnect(pipeOpts)) || (await this.tryConnect(tcpOpts));
  }

  private tryConnect(opts: net.NetConnectOpts): Promise<boolean> {
    return new Promise(resolve => {
      const s = net.createConnection(opts as net.NetConnectOpts);
      const timer = setTimeout(() => { s.destroy(); resolve(false); }, CONNECT_TIMEOUT_MS);

      s.on('connect', () => {
        clearTimeout(timer);
        this.socket = s;
        this._connected = true;
        s.setEncoding('utf8');
        s.on('data', (chunk: string) => this.onData(chunk));
        s.on('close', () => this.onDisconnect());
        s.on('error', () => this.onDisconnect());
        resolve(true);
      });

      s.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }

  private onDisconnect(): void {
    this._connected = false;
    this.socket = null;
    this._clientId = null;
    // Drain any pending request with an error.
    if (this.pending) {
      const cb = this.pending;
      this.pending = null;
      cb({ ok: false, error: 'disconnected', data: null });
    }
  }

  // -------------------------------------------------------------------------
  // NDJSON framing
  // -------------------------------------------------------------------------

  private onData(chunk: string): void {
    this.buffer += chunk;
    let nl: number;
    while ((nl = this.buffer.indexOf('\n')) >= 0) {
      const line = this.buffer.slice(0, nl).trim();
      this.buffer = this.buffer.slice(nl + 1);
      if (!line) { continue; }
      try {
        const resp = JSON.parse(line) as ControlResponse;
        if (this.pending) {
          const cb = this.pending;
          this.pending = null;
          cb(resp);
        }
      } catch {
        // ignore malformed lines
      }
    }
  }

  private sendRequest(req: object): Promise<ControlResponse> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this._connected) {
        reject(new Error('Not connected to supervisor'));
        return;
      }
      if (this.pending) {
        reject(new Error('A request is already in flight'));
        return;
      }
      const timer = setTimeout(() => {
        if (this.pending === resolve as unknown) {
          this.pending = null;
          reject(new Error('Supervisor request timed out'));
        }
      }, REQUEST_TIMEOUT_MS);

      this.pending = (r) => { clearTimeout(timer); resolve(r); };

      this.socket.write(JSON.stringify(req) + '\n', 'utf8', (err) => {
        if (err) {
          clearTimeout(timer);
          this.pending = null;
          reject(err);
        }
      });
    });
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /**
   * Register this VS Code window with the Supervisor.
   * Should be called once the Supervisor is detected as running.
   * Returns the assigned `client_id` string, or `null` on failure.
   */
  async attachClient(pid: number, windowId: string): Promise<string | null> {
    try {
      const resp = await this.sendRequest({ type: 'AttachClient', pid, window_id: windowId });
      if (resp.ok && typeof (resp.data as { client_id?: string })?.client_id === 'string') {
        this._clientId = (resp.data as { client_id: string }).client_id;
        return this._clientId;
      }
      console.warn('[SupervisorClient] AttachClient: unexpected response', resp);
    } catch (e) {
      console.warn('[SupervisorClient] AttachClient failed:', e);
    }
    return null;
  }

  /**
   * Unregister this window.  Safe to call even if not attached.
   */
  async detachClient(): Promise<void> {
    if (!this._clientId || !this._connected) { return; }
    try {
      await this.sendRequest({ type: 'DetachClient', client_id: this._clientId });
    } catch {
      // ignore errors during shutdown
    }
    this._clientId = null;
  }

  /** List all active VS Code ↔ MCP sessions tracked by the Supervisor. */
  async listMcpConnections(): Promise<McpConnectionInfo[]> {
    try {
      const resp = await this.sendRequest({ type: 'ListMcpConnections' });
      if (resp.ok && Array.isArray(resp.data)) {
        return resp.data as McpConnectionInfo[];
      }
    } catch (e) {
      console.warn('[SupervisorClient] ListMcpConnections failed:', e);
    }
    return [];
  }

  /** List all running MCP pool instances and their connection counts. */
  async listMcpInstances(): Promise<McpInstanceInfo[]> {
    try {
      const resp = await this.sendRequest({ type: 'ListMcpInstances' });
      if (resp.ok && Array.isArray(resp.data)) {
        return resp.data as McpInstanceInfo[];
      }
    } catch (e) {
      console.warn('[SupervisorClient] ListMcpInstances failed:', e);
    }
    return [];
  }

  /**
   * Manually trigger a pool scale-up (spawn one additional MCP instance).
   * Returns `true` if the Supervisor accepted the request.
   */
  async scaleUpMcp(): Promise<boolean> {
    try {
      const resp = await this.sendRequest({ type: 'ScaleUpMcp' });
      return resp.ok;
    } catch (e) {
      console.warn('[SupervisorClient] ScaleUpMcp failed:', e);
    }
    return false;
  }

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  disconnect(): void {
    this.socket?.destroy();
    this.socket = null;
    this._connected = false;
    this._clientId = null;
  }

  dispose(): void {
    this.disconnect();
  }
}
