/**
 * TCP Terminal Adapter — terminal-tcp-adapter.ts
 *
 * TCP client that communicates with the Rust GUI app over NDJSON.
 * Sends CommandRequest messages, receives CommandResponse and Heartbeat messages.
 *
 * Created in Phase 3 (TCP Adapter) of the MCP Terminal Tool & GUI Approval Flow plan.
 */

import * as net from 'node:net';
import {
  type CommandRequest,
  type CommandResponse,
  type Heartbeat,
  type TerminalIpcMessage,
  encodeMessage,
  decodeMessage,
  isCommandResponse,
  isHeartbeat,
} from './terminal-ipc-protocol.js';

// =========================================================================
// Public Interface
// =========================================================================

export interface TcpAdapterOptions {
  host?: string;
  port?: number;
  progressCallback?: (heartbeat: Heartbeat) => void;
}

// =========================================================================
// Host / Port Resolution
// =========================================================================

/**
 * Determine the GUI host and port based on environment.
 *
 * - Container mode (PM_RUNNING_IN_CONTAINER=true): uses gateway host on port 45459
 * - Host mode (default): uses 127.0.0.1:9100
 */
function resolveGuiHost(): { host: string; port: number } {
  if (process.env.PM_RUNNING_IN_CONTAINER === 'true') {
    const gateway =
      process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY?.trim();
    return {
      host: gateway || 'host.containers.internal',
      port: 45459,
    };
  }
  return { host: '127.0.0.1', port: 9100 };
}

function buildContainerHostCandidates(primaryHost: string): string[] {
  const gateway = process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY?.trim();
  const raw = [
    gateway,
    primaryHost,
    'host.containers.internal',
    'host.docker.internal',
    '127.0.0.1',
    'localhost',
  ];

  const unique: string[] = [];
  for (const host of raw) {
    if (!host) continue;
    if (!unique.includes(host)) unique.push(host);
  }
  return unique;
}

// =========================================================================
// TCP Adapter Class
// =========================================================================

/** Timeout for the initial TCP connection attempt (ms). */
const CONNECT_TIMEOUT_MS = 5_000;
/** Timeout waiting for a CommandResponse after sending a request (ms). */
const RESPONSE_TIMEOUT_MS = 60_000;

export class TcpTerminalAdapter {
  private readonly host: string;
  private readonly port: number;
  private readonly inContainerMode: boolean;
  private readonly progressCallback?: (heartbeat: Heartbeat) => void;

  private socket: net.Socket | null = null;
  private connected = false;
  private lineBuffer = '';

  constructor(options?: TcpAdapterOptions) {
    const defaults = resolveGuiHost();
    this.host = options?.host ?? defaults.host;
    this.port = options?.port ?? defaults.port;
    this.inContainerMode = process.env.PM_RUNNING_IN_CONTAINER === 'true';
    this.progressCallback = options?.progressCallback;
  }

  // -----------------------------------------------------------------------
  // Connect
  // -----------------------------------------------------------------------

  /**
   * Open a TCP connection to the GUI app.
   * Throws on connection failure or timeout.
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket && !this.socket.destroyed) {
      return; // already connected
    }

    if (!this.inContainerMode) {
      return this.connectOnce(this.host, this.port);
    }

    const attempts: string[] = [];
    const candidates = buildContainerHostCandidates(this.host);

    for (const candidateHost of candidates) {
      try {
        await this.connectOnce(candidateHost, this.port);
        return;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        attempts.push(`${candidateHost}:${this.port} -> ${message}`);
      }
    }

    throw new Error(
      `TCP connect failed in container mode after trying ${candidates.length} host candidate(s) on port ${this.port}: ${attempts.join(' | ')}`,
    );
  }

  private connectOnce(host: string, port: number): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(
            new Error(
              `TCP connect timeout after ${CONNECT_TIMEOUT_MS}ms to ${host}:${port}`,
            ),
          );
        }
      }, CONNECT_TIMEOUT_MS);

      socket.once('connect', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        this.socket = socket;
        this.connected = true;
        this.lineBuffer = '';
        resolve();
      });

      socket.once('error', (err: Error) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(
            new Error(
              `TCP connect failed to ${host}:${port}: ${err.message}`,
            ),
          );
        }
      });

      socket.connect(port, host);
    });
  }

  // -----------------------------------------------------------------------
  // Send and Await
  // -----------------------------------------------------------------------

  /**
   * Send a CommandRequest and wait for the matching CommandResponse.
   * Heartbeat messages received while waiting are forwarded to progressCallback.
   * Throws on timeout, disconnect, or socket error.
   */
  async sendAndAwait(request: CommandRequest): Promise<CommandResponse> {
    if (!this.socket || !this.connected || this.socket.destroyed) {
      // One reconnect attempt
      await this.reconnect();
    }

    const socket = this.socket!;
    const encoded = encodeMessage(request);

    return new Promise<CommandResponse>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              `Timeout waiting for response to request ${request.id} after ${RESPONSE_TIMEOUT_MS}ms`,
            ),
          );
        }
      }, RESPONSE_TIMEOUT_MS);

      const onData = (chunk: Buffer): void => {
        if (settled) return;
        this.lineBuffer += chunk.toString('utf8');

        // Process complete NDJSON lines
        let newlineIdx: number;
        while ((newlineIdx = this.lineBuffer.indexOf('\n')) !== -1) {
          const line = this.lineBuffer.slice(0, newlineIdx);
          this.lineBuffer = this.lineBuffer.slice(newlineIdx + 1);

          if (!line.trim()) continue;

          const msg: TerminalIpcMessage | null = decodeMessage(line);
          if (!msg) continue;

          if (isHeartbeat(msg)) {
            this.progressCallback?.(msg);
            continue;
          }

          if (isCommandResponse(msg) && msg.id === request.id) {
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(msg);
            return;
          }
          // Ignore unrelated messages (responses for other IDs, etc.)
        }
      };

      const onError = (err: Error): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          this.connected = false;
          reject(new Error(`Socket error while awaiting response: ${err.message}`));
        }
      };

      const onClose = (): void => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          this.connected = false;
          reject(new Error('Socket closed while awaiting response'));
        }
      };

      const cleanup = (): void => {
        socket.removeListener('data', onData);
        socket.removeListener('error', onError);
        socket.removeListener('close', onClose);
      };

      socket.on('data', onData);
      socket.on('error', onError);
      socket.on('close', onClose);

      // Write the request
      socket.write(encoded, (err) => {
        if (err && !settled) {
          settled = true;
          clearTimeout(timer);
          cleanup();
          reject(new Error(`Socket write error: ${err.message}`));
        }
      });
    });
  }

  // -----------------------------------------------------------------------
  // Close
  // -----------------------------------------------------------------------

  /** Destroy the TCP socket. Safe to call multiple times. */
  close(): void {
    this.connected = false;
    this.lineBuffer = '';
    if (this.socket) {
      this.socket.destroy();
      this.socket = null;
    }
  }

  // -----------------------------------------------------------------------
  // Reconnect
  // -----------------------------------------------------------------------

  /**
   * Attempt one reconnect. Throws if the reconnect fails.
   */
  private async reconnect(): Promise<void> {
    this.close();
    await this.connect();
  }
}
