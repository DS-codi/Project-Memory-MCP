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
  type ReadOutputRequest,
  type ReadOutputResponse,
  type KillSessionRequest,
  type KillSessionResponse,
  type TerminalIpcMessage,
  encodeMessage,
  decodeMessage,
  isCommandResponse,
  isHeartbeat,
  isReadOutputResponse,
  isKillSessionResponse,
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

/**
 * Return the supervisor control TCP port used for on-demand launch.
 * Reads PM_SUPERVISOR_CONTROL_PORT; defaults to 9200.
 */
function resolveControlPort(): number {
  const raw = process.env.PM_SUPERVISOR_CONTROL_PORT?.trim();
  if (raw) {
    const parsed = parseInt(raw, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  return 9200;
}

/**
 * Send a `Start { service: "interactive_terminal" }` control command to the
 * supervisor over a short-lived TCP connection on `controlPort`.
 *
 * Resolves (without throwing) whether or not the send succeeds — failures are
 * logged but must not crash the caller because the adapter should fall back
 * to the original error path gracefully.
 */
async function triggerSupervisorLaunch(controlPort: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const payload =
      JSON.stringify({ type: 'Start', service: 'interactive_terminal' }) + '\n';
    const socket = new net.Socket();
    let done = false;

    const cleanup = (): void => {
      if (!done) {
        done = true;
        socket.destroy();
      }
      resolve();
    };

    const timer = setTimeout(() => {
      if (!done) {
        console.warn(
          `[terminal-tcp-adapter] supervisor control connect timeout on port ${controlPort}`,
        );
        cleanup();
      }
    }, 3_000);

    socket.once('error', (err: NodeJS.ErrnoException) => {
      clearTimeout(timer);
      if (!done) {
        console.warn(
          `[terminal-tcp-adapter] supervisor control error on port ${controlPort}: ${err.message}`,
        );
        cleanup();
      }
    });

    socket.once('connect', () => {
      socket.write(payload, (err) => {
        clearTimeout(timer);
        if (err) {
          console.warn(
            `[terminal-tcp-adapter] supervisor control write error: ${err.message}`,
          );
        }
        cleanup();
      });
    });

    socket.connect(controlPort, '127.0.0.1');
  });
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
/**
 * Shorter timeout used for the very first probe connect attempt (before
 * on-demand supervisor launch).  500 ms is enough to get a fast ECONNREFUSED
 * from the OS while avoiding a long wait when the port is merely filtered.
 */
const PROBE_CONNECT_TIMEOUT_MS = 500;
/** Timeout waiting for a CommandResponse after sending a request (ms). */
const RESPONSE_TIMEOUT_MS = 60_000;

export class TcpTerminalAdapter {
  private readonly host: string;
  private readonly port: number;
  private readonly inContainerMode: boolean;
  private readonly enableOnDemandLaunch: boolean;
  private readonly progressCallback?: (heartbeat: Heartbeat) => void;

  private socket: net.Socket | null = null;
  private connected = false;
  private lineBuffer = '';

  constructor(options?: TcpAdapterOptions) {
    const defaults = resolveGuiHost();
    this.host = options?.host ?? defaults.host;
    this.port = options?.port ?? defaults.port;
    this.inContainerMode = process.env.PM_RUNNING_IN_CONTAINER === 'true';
    this.enableOnDemandLaunch = !this.inContainerMode && this.host === defaults.host && this.port === defaults.port;
    this.progressCallback = options?.progressCallback;
  }

  // -----------------------------------------------------------------------
  // Connect
  // -----------------------------------------------------------------------

  /**
   * Open a TCP connection to the GUI app.
   * Throws on connection failure or timeout.
   *
   * In host mode, if the first attempt gets ECONNREFUSED the adapter sends an
   * on-demand launch command to the supervisor and retries up to 3 times with
   * 1.5 s / 3 s / 5 s backoff.  Container mode uses the original multi-host
   * candidate logic and does not attempt on-demand launch.
   */
  async connect(): Promise<void> {
    if (this.connected && this.socket && !this.socket.destroyed) {
      return; // already connected
    }

    if (!this.inContainerMode) {
      if (!this.enableOnDemandLaunch) {
        return this.connectOnce(this.host, this.port, PROBE_CONNECT_TIMEOUT_MS);
      }

      // ── First attempt (fast probe to detect ECONNREFUSED quickly) ────
      try {
        return await this.connectOnce(this.host, this.port, PROBE_CONNECT_TIMEOUT_MS);
      } catch (firstErr) {
        const isRefused = this.isEconnrefused(firstErr);
        if (!isRefused) throw firstErr;
      }

      // ── ECONNREFUSED — trigger on-demand launch via supervisor ────────
      const controlPort = resolveControlPort();
      try {
        await triggerSupervisorLaunch(controlPort);
      } catch {
        // triggerSupervisorLaunch never throws but guard here to be safe.
      }

      // ── Retry loop (1.5 s / 3 s / 5 s backoff) ───────────────────────
      const retryDelaysMs = [1_500, 3_000, 5_000];
      let lastError: unknown;
      for (const delayMs of retryDelaysMs) {
        await new Promise<void>((r) => setTimeout(r, delayMs));
        try {
          return await this.connectOnce(this.host, this.port);
        } catch (retryErr) {
          lastError = retryErr;
          if (!this.isEconnrefused(retryErr)) throw retryErr;
          // ECONNREFUSED again — keep retrying.
        }
      }

      // ── All retries exhausted ─────────────────────────────────────────
      const detail =
        lastError instanceof Error ? lastError.message : String(lastError);
      throw new Error(
        `TCP connect to ${this.host}:${this.port} failed after on-demand launch: ${detail}`,
      );
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

  /** Return true if the error represents ECONNREFUSED (port not yet listening).
   *  Handles both raw Node.js socket errors and the wrapped Error produced by
   *  connectOnce(), which embeds the original message in the string. */
  private isEconnrefused(err: unknown): boolean {
    if (!(err instanceof Error)) return false;
    const node = err as NodeJS.ErrnoException;
    if (node.code === 'ECONNREFUSED') return true;
    // connectOnce wraps the raw socket error in a new Error — fall back to a
    // message-string check.
    return err.message.includes('ECONNREFUSED');
  }

  private connectOnce(
    host: string,
    port: number,
    timeoutMs: number = CONNECT_TIMEOUT_MS,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const socket = new net.Socket();
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          socket.destroy();
          reject(
            new Error(
              `TCP connect timeout after ${timeoutMs}ms to ${host}:${port}`,
            ),
          );
        }
      }, timeoutMs);

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
  // Send and Await (generic helper)
  // -----------------------------------------------------------------------

  /**
   * Generic send-and-await: write a request message, then wait for a response
   * that matches the given predicate. Heartbeats are forwarded to progressCallback.
   */
  private async sendAndAwaitTyped<TReq extends TerminalIpcMessage, TRes>(
    request: TReq,
    requestId: string,
    isMatch: (msg: TerminalIpcMessage) => msg is TRes & TerminalIpcMessage,
    matchId: (msg: TRes) => string,
  ): Promise<TRes> {
    if (!this.socket || !this.connected || this.socket.destroyed) {
      await this.reconnect();
    }

    const socket = this.socket!;
    const encoded = encodeMessage(request);

    return new Promise<TRes>((resolve, reject) => {
      let settled = false;

      const timer = setTimeout(() => {
        if (!settled) {
          settled = true;
          cleanup();
          reject(
            new Error(
              `Timeout waiting for response to request ${requestId} after ${RESPONSE_TIMEOUT_MS}ms`,
            ),
          );
        }
      }, RESPONSE_TIMEOUT_MS);

      const onData = (chunk: Buffer): void => {
        if (settled) return;
        this.lineBuffer += chunk.toString('utf8');

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

          if (isMatch(msg) && matchId(msg as TRes) === requestId) {
            settled = true;
            clearTimeout(timer);
            cleanup();
            resolve(msg as TRes);
            return;
          }
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
  // Send and Await (CommandRequest → CommandResponse)
  // -----------------------------------------------------------------------

  /**
   * Send a CommandRequest and wait for the matching CommandResponse.
   * Heartbeat messages received while waiting are forwarded to progressCallback.
   * Throws on timeout, disconnect, or socket error.
   */
  async sendAndAwait(request: CommandRequest): Promise<CommandResponse> {
    return this.sendAndAwaitTyped<CommandRequest, CommandResponse>(
      request,
      request.id,
      isCommandResponse,
      (msg) => msg.id,
    );
  }

  // -----------------------------------------------------------------------
  // Read Output (ReadOutputRequest → ReadOutputResponse)
  // -----------------------------------------------------------------------

  /**
   * Send a ReadOutputRequest and wait for the matching ReadOutputResponse.
   * Throws on timeout, disconnect, or socket error.
   */
  async sendReadOutput(sessionId: string): Promise<ReadOutputResponse> {
    const requestId = `read_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const request: ReadOutputRequest = {
      type: 'read_output_request',
      id: requestId,
      session_id: sessionId,
    };
    return this.sendAndAwaitTyped<ReadOutputRequest, ReadOutputResponse>(
      request,
      requestId,
      isReadOutputResponse,
      (msg) => msg.id,
    );
  }

  // -----------------------------------------------------------------------
  // Kill Session (KillSessionRequest → KillSessionResponse)
  // -----------------------------------------------------------------------

  /**
   * Send a KillSessionRequest and wait for the matching KillSessionResponse.
   * Throws on timeout, disconnect, or socket error.
   */
  async sendKill(sessionId: string): Promise<KillSessionResponse> {
    const requestId = `kill_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const request: KillSessionRequest = {
      type: 'kill_session_request',
      id: requestId,
      session_id: sessionId,
    };
    return this.sendAndAwaitTyped<KillSessionRequest, KillSessionResponse>(
      request,
      requestId,
      isKillSessionResponse,
      (msg) => msg.id,
    );
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
