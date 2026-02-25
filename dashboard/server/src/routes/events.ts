import { Router } from 'express';
import { eventBus } from '../events/eventBus.js';
import type { MCPEvent } from '../events/emitter.js';
import { getRecentEvents, getEventsSince } from '../db/queries.js';
import type { EventLogRow } from '../db/queries.js';

export const eventsRouter = Router();

/** Map a DB event_log row to the MCPEvent shape expected by clients. */
function rowToEvent(row: EventLogRow): MCPEvent {
  const rawData = row.data ? JSON.parse(row.data) as Record<string, unknown> : {};
  return {
    id: `evt_${row.id}`,
    type: row.event_type,
    timestamp: row.timestamp,
    workspace_id: rawData.workspace_id as string | undefined,
    plan_id:      rawData.plan_id      as string | undefined,
    agent_type:   rawData.agent_type   as string | undefined,
    tool_name:    rawData.tool_name    as string | undefined,
    data: rawData,
  };
}

// GET /api/events - Get recent events from DB
eventsRouter.get('/', (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const since = req.query.since as string | undefined;

    const rows = since ? getEventsSince(since, limit) : getRecentEvents(limit);
    const events = rows.map(rowToEvent);

    res.json({
      events,
      total: events.length,
      latest_timestamp: events[0]?.timestamp ?? null,
    });
  } catch (error) {
    console.error('Error getting events:', error);
    res.status(500).json({ error: 'Failed to get events' });
  }
});

// GET /api/events/stream - SSE endpoint for real-time events
eventsRouter.get('/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ connected: true })}\n\n`);

  // Subscribe to in-memory event bus instead of polling filesystem
  const onEvent = (event: MCPEvent) => {
    res.write(`event: mcp_event\ndata: ${JSON.stringify(event)}\n\n`);
  };

  eventBus.on('event', onEvent);

  // Send a heartbeat every 30s to keep the connection alive
  const heartbeat = setInterval(() => {
    res.write(`:heartbeat\n\n`);
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    eventBus.off('event', onEvent);
    clearInterval(heartbeat);
    res.end();
  });
});

