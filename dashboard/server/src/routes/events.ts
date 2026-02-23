import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { eventBus } from '../events/eventBus.js';
import type { MCPEvent } from '../events/emitter.js';

export const eventsRouter = Router();

// Get events directory
function getEventsDir(): string {
  return process.env.MBS_EVENTS_DIR || path.join(globalThis.MBS_DATA_ROOT, 'events');
}

// GET /api/events - Get recent events
eventsRouter.get('/', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const since = req.query.since as string;
    const dir = getEventsDir();

    const events: MCPEvent[] = [];

    try {
      const files = await fs.readdir(dir);
      const eventFiles = files
        .filter(f => f.startsWith('evt_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, limit);

      for (const file of eventFiles) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const event = JSON.parse(content) as MCPEvent;

          // Filter by since if provided
          if (since && event.timestamp <= since) break;

          events.push(event);
        } catch (e) {
          // Skip invalid files
        }
      }
    } catch (e) {
      // Events directory doesn't exist yet
    }

    res.json({
      events,
      total: events.length,
      latest_timestamp: events[0]?.timestamp || null,
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
