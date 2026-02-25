import { EventEmitter } from 'events';
import * as http from 'http';
import * as https from 'https';
import type { MCPEvent } from './emitter.js';

/**
 * In-memory event bus for real-time SSE streaming.
 *
 * Events are sourced from the supervisor SSE endpoint (Plan 2 bridge).
 * Internal subscribers (SSE route handler) listen via EventEmitter.
 *
 * Call `eventBus.connectToSupervisor(url)` on startup when
 * `SUPERVISOR_EVENTS_URL` is defined.
 */
class MCPEventBus extends EventEmitter {
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectDelay = 1_000; // starts at 1 s, doubles up to 30 s
  private stopped = false;

  /**
   * Push an event to all in-process SSE subscribers.
   * Can also be called directly by legacy code paths (emitter.ts) while
   * the file-write path is still active.
   */
  push(event: MCPEvent): void {
    this.emit('event', event);
  }

  /**
   * Open a persistent SSE connection to the supervisor event stream and
   * forward every event to in-process subscribers.
   *
   * Reconnects automatically with exponential backoff (1 s → 30 s max).
   */
  connectToSupervisor(url: string): void {
    this.stopped = false;
    this._connect(url);
  }

  /** Stop any pending reconnect and mark the bus as stopped. */
  stopSupervisor(): void {
    this.stopped = true;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private _connect(url: string): void {
    if (this.stopped) return;

    const parsed    = new URL(url);
    const transport = parsed.protocol === 'https:' ? https : http;

    const req = transport.get(url, { headers: { Accept: 'text/event-stream' } }, (res) => {
      if (res.statusCode !== 200) {
        console.warn(`[eventBus] Supervisor SSE responded ${res.statusCode} — will retry`);
        res.resume();
        this._scheduleReconnect(url);
        return;
      }

      console.log(`[eventBus] Connected to supervisor SSE: ${url}`);
      this.reconnectDelay = 1_000; // reset on success

      let buffer = '';
      res.setEncoding('utf8');

      res.on('data', (chunk: string) => {
        buffer += chunk;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;
          try {
            const event = JSON.parse(raw) as MCPEvent;
            this.push(event);
          } catch {
            // malformed chunk — skip
          }
        }
      });

      res.on('end', () => {
        console.log('[eventBus] Supervisor SSE stream ended — reconnecting…');
        this._scheduleReconnect(url);
      });

      res.on('error', (err: Error) => {
        console.error('[eventBus] Supervisor SSE stream error:', err.message);
        this._scheduleReconnect(url);
      });
    });

    req.on('error', (err: Error) => {
      console.warn(`[eventBus] Cannot reach supervisor at ${url}: ${err.message}`);
      this._scheduleReconnect(url);
    });

    req.end();
  }

  private _scheduleReconnect(url: string): void {
    if (this.stopped) return;
    const delay = Math.min(this.reconnectDelay, 30_000);
    this.reconnectDelay = Math.min(this.reconnectDelay * 2, 30_000);
    this.reconnectTimer = setTimeout(() => this._connect(url), delay);
  }
}

/** Singleton event bus instance */
export const eventBus = new MCPEventBus();
