import { EventEmitter } from 'events';
import type { MCPEvent } from './emitter.js';

/**
 * In-memory event bus for real-time SSE streaming.
 * 
 * Instead of SSE clients polling the filesystem every second,
 * emitEvent() pushes events here and SSE clients subscribe.
 * This eliminates O(files) readdir + reads per second per client.
 */
class MCPEventBus extends EventEmitter {
  private recentEvents: MCPEvent[] = [];
  private maxRecent = 100;

  /** Push a new event — called by emitEvent() after writing to disk */
  push(event: MCPEvent): void {
    this.recentEvents.push(event);
    if (this.recentEvents.length > this.maxRecent) {
      this.recentEvents = this.recentEvents.slice(-this.maxRecent);
    }
    this.emit('event', event);
  }

  /** Get the N most recent events from the in-memory buffer */
  getRecent(limit = 50): MCPEvent[] {
    return this.recentEvents.slice(-limit).reverse();
  }

  /** Get events newer than a given ISO timestamp */
  getEventsSince(since: string): MCPEvent[] {
    return this.recentEvents
      .filter(e => e.timestamp > since)
      .reverse();
  }
}

/** Singleton event bus instance */
export const eventBus = new MCPEventBus();
