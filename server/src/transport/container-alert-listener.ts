/**
 * Container Alert Listener — container-alert-listener.ts
 *
 * A minimal HTTP server that listens for a single-purpose "container ready"
 * notification from a containerised Project Memory instance.
 *
 * When the container starts up successfully (HTTP transport healthy), it
 * sends a one-shot POST to this listener. The listener emits an event so
 * the local MCP server can surface a notification (stderr log, VS Code
 * toast, etc.) prompting the user to switch to container mode.
 *
 * The listener does NOT auto-proxy or redirect traffic — it is purely
 * informational. The user must manually reconfigure their MCP client to
 * point at the container's HTTP endpoint.
 *
 * Default port: 9200 (configurable via MBS_ALERT_PORT env var).
 */

import { createServer, type Server, type IncomingMessage, type ServerResponse } from 'node:http';
import { EventEmitter } from 'node:events';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ContainerReadyPayload {
  url: string;        // e.g. "http://localhost:3000"
  version: string;    // e.g. "1.0.0"
  transport?: string; // e.g. "streamable-http"
  timestamp?: string; // ISO 8601
}

export interface AlertListenerOptions {
  /** Port to listen on. Default: MBS_ALERT_PORT env var or 9200. */
  port?: number;
  /** Host/interface to bind to. Default: '0.0.0.0'. */
  host?: string;
}

// ---------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------

export type AlertListenerEvents = {
  'container-ready': [ContainerReadyPayload];
  'error': [Error];
};

// ---------------------------------------------------------------------------
// Alert Listener
// ---------------------------------------------------------------------------

export class ContainerAlertListener extends EventEmitter {
  private _server: Server | null = null;
  private _port: number;
  private _host: string;

  constructor(options?: AlertListenerOptions) {
    super();
    const envPort = process.env.MBS_ALERT_PORT;
    this._port = options?.port ?? (envPort ? parseInt(envPort, 10) : 9200);
    this._host = options?.host ?? '0.0.0.0';
  }

  get port(): number {
    return this._port;
  }

  /**
   * Start listening for container-ready alerts.
   * Resolves once the HTTP server is bound and accepting connections.
   */
  start(): Promise<void> {
    if (this._server) return Promise.resolve();

    return new Promise((resolve, reject) => {
      const server = createServer((req, res) => this._handleRequest(req, res));

      // If the port is already in use, don't crash — just warn and skip.
      server.once('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'EADDRINUSE') {
          console.error(
            `[alert-listener] Port ${this._port} already in use — ` +
            `container alert listener will not start. ` +
            `Set MBS_ALERT_PORT to use a different port.`
          );
          this._server = null;
          resolve(); // non-fatal
        } else {
          reject(err);
        }
      });

      server.listen(this._port, this._host, () => {
        this._server = server;
        // Capture actual bound port (important when port 0 is used)
        const addr = server.address();
        if (addr && typeof addr === 'object') {
          this._port = addr.port;
        }
        console.error(
          `[alert-listener] Listening for container-ready alerts on ` +
          `${this._host}:${this._port}`
        );
        resolve();
      });
    });
  }

  /**
   * Stop the listener and release the port.
   */
  async stop(): Promise<void> {
    if (!this._server) return;

    return new Promise((resolve) => {
      this._server!.close(() => {
        this._server = null;
        resolve();
      });
    });
  }

  // -----------------------------------------------------------------------
  // Request handler
  // -----------------------------------------------------------------------

  private _handleRequest(req: IncomingMessage, res: ServerResponse): void {
    // Health check — lets the container verify the alert port is open
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', service: 'alert-listener' }));
      return;
    }

    // Container-ready alert
    if (req.method === 'POST' && req.url === '/container-ready') {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
        // Guard against absurdly large payloads
        if (body.length > 4096) {
          res.writeHead(413);
          res.end('Payload too large');
          req.destroy();
        }
      });

      req.on('end', () => {
        try {
          const payload = JSON.parse(body) as ContainerReadyPayload;

          if (!payload.url || !payload.version) {
            res.writeHead(400, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ error: 'Missing required fields: url, version' }));
            return;
          }

          // Add timestamp if not provided
          if (!payload.timestamp) {
            payload.timestamp = new Date().toISOString();
          }

          // Emit event for the MCP server to handle
          this.emit('container-ready', payload);

          // Log to stderr so users see the notification
          console.error(
            `\n[alert] ============================================\n` +
            `[alert] Container ready at ${payload.url}\n` +
            `[alert] Version: ${payload.version}\n` +
            `[alert] Transport: ${payload.transport ?? 'http'}\n` +
            `[alert] ============================================\n` +
            `[alert] To switch to container mode, update your MCP\n` +
            `[alert] config to point at: ${payload.url}/mcp\n` +
            `[alert] ============================================\n`
          );

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ acknowledged: true }));
        } catch {
          res.writeHead(400, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Invalid JSON body' }));
        }
      });

      return;
    }

    // Anything else
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
}
