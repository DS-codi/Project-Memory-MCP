import { getDb } from '../db/connection.js';
import { eventBus } from '../events/eventBus.js';
import type { MCPEvent } from '../events/emitter.js';

interface EventLogRow {
  id: string;
  event_type: string;
  timestamp: string;
  workspace_id: string | null;
  plan_id: string | null;
  agent_type: string | null;
  tool_name: string | null;
  data: string | null;
}

let lastSeenTimestamp = new Date().toISOString();
let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Polls the shared SQLite event_log table for 'workspace_scope_changed' events
 * and pushes them to the in-memory eventBus.
 * 
 * This bridges the gap between the MCP server (which writes to the DB)
 * and the Supervisor (which consumes the dashboard's SSE stream).
 */
export function startMcpEventPoller(intervalMs = 2000): void {
  if (pollInterval) return;

  console.log(`[mcpEventPoller] Starting poller (interval: ${intervalMs}ms)`);

  pollInterval = setInterval(() => {
    try {
      const db = getDb();
      const rows = db.prepare(
        `SELECT * FROM event_log 
         WHERE event_type = 'workspace_scope_changed' 
         AND timestamp > ? 
         ORDER BY timestamp ASC`
      ).all(lastSeenTimestamp) as EventLogRow[];

      for (const row of rows) {
        let parsedData: Record<string, unknown> = {};
        try {
          parsedData = row.data ? JSON.parse(row.data) : {};
        } catch {
          // ignore malformed JSON
        }

        const event: MCPEvent = {
          id: row.id,
          type: row.event_type,
          timestamp: row.timestamp,
          workspace_id: row.workspace_id ?? undefined,
          plan_id: row.plan_id ?? undefined,
          agent_type: row.agent_type ?? undefined,
          tool_name: row.tool_name ?? undefined,
          data: parsedData,
        };

        console.log(`[mcpEventPoller] Forwarding event: ${event.type} (${event.id})`);
        eventBus.push(event);
        lastSeenTimestamp = row.timestamp;
      }
    } catch (err) {
      console.error('[mcpEventPoller] Error polling event_log:', err);
    }
  }, intervalMs);
}

export function stopMcpEventPoller(): void {
  if (pollInterval) {
    clearInterval(pollInterval);
    pollInterval = null;
    console.log('[mcpEventPoller] Poller stopped');
  }
}
