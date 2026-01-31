import { Router } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';

export const eventsRouter = Router();

interface MCPEvent {
  id: string;
  type: string;
  timestamp: string;
  workspace_id?: string;
  plan_id?: string;
  agent_type?: string;
  tool_name?: string;
  data: Record<string, unknown>;
}

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

  let lastEventTime = new Date().toISOString();
  const dir = getEventsDir();

  // Poll for new events every second
  const interval = setInterval(async () => {
    try {
      const files = await fs.readdir(dir);
      const eventFiles = files
        .filter(f => f.startsWith('evt_') && f.endsWith('.json'))
        .sort()
        .reverse()
        .slice(0, 10);

      for (const file of eventFiles) {
        try {
          const content = await fs.readFile(path.join(dir, file), 'utf-8');
          const event = JSON.parse(content) as MCPEvent;

          // Only send new events
          if (event.timestamp > lastEventTime) {
            res.write(`event: mcp_event\ndata: ${JSON.stringify(event)}\n\n`);
            lastEventTime = event.timestamp;
          }
        } catch (e) {
          // Skip
        }
      }
    } catch (e) {
      // Events dir doesn't exist
    }
  }, 1000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(interval);
    res.end();
  });
});
