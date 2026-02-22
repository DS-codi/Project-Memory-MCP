/**
 * HTTP Transport Module
 * 
 * Provides SSE and Streamable HTTP transport for the MCP server,
 * enabling container-mode operation where multiple clients connect
 * over HTTP instead of stdio.
 * 
 * Supports:
 * - /mcp         — Streamable HTTP endpoint (POST/GET/DELETE)
 * - /sse         — Legacy SSE endpoint (GET)
 * - /messages    — Legacy SSE message endpoint (POST)
 * - /health      — Health check endpoint (GET)
 * 
 * @see Phase 6A of infrastructure-improvement-plan.md
 */

import express, { type Express, type Request, type Response } from 'express';
import { randomUUID } from 'node:crypto';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { getDataRoot, listDirs } from '../storage/file-store.js';
import { isDataRootAccessible } from './data-root-liveness.js';
import { getAllLiveSessions, getLiveSessionCount } from '../tools/session-live-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportType = 'stdio' | 'sse' | 'streamable-http';

interface TransportEntry {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  type: 'streamable-http' | 'sse';
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const transports: Record<string, TransportEntry> = {};
const serverStartTime = Date.now();

// ---------------------------------------------------------------------------
// Health endpoint
// ---------------------------------------------------------------------------

function buildHealthResponse(): Record<string, unknown> {
  const mem = process.memoryUsage();
  const uptimeSeconds = Math.floor((Date.now() - serverStartTime) / 1000);
  const sessionEntries = Object.entries(transports);

  // Classify sessions by transport type
  const sessionsByType: Record<string, number> = {};
  for (const [, entry] of sessionEntries) {
    sessionsByType[entry.type] = (sessionsByType[entry.type] || 0) + 1;
  }

  // Determine connection state
  const connectionState: 'healthy' | 'degraded' | 'starting' =
    uptimeSeconds < 10 ? 'starting'
    : 'healthy';

  return {
    status: 'ok',
    server: 'project-memory-mcp',
    version: '1.0.0',
    transport: 'http',
    uptime: uptimeSeconds,
    connectionState,
    activeSessions: sessionEntries.length,
    sessionsByType,
    liveAgentSessions: getLiveSessionCount(),
    memory: {
      heapUsedMB: Math.round(mem.heapUsed / 1024 / 1024 * 100) / 100,
      rssMB: Math.round(mem.rss / 1024 / 1024 * 100) / 100,
    },
    process: {
      pid: process.pid,
      nodeVersion: process.version,
      platform: process.platform,
    },
    dataRoot: process.env.MBS_DATA_ROOT || 'default',
    dataRootAccessible: isDataRootAccessible(),
    agentsRoot: process.env.MBS_AGENTS_ROOT || 'default',
    timestamp: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Express app factory
// ---------------------------------------------------------------------------

/**
 * Create an Express application that exposes the MCP server over HTTP.
 * 
 * The caller is responsible for calling `app.listen()`.
 * 
 * @param getServer - Factory that returns a new, *unconnected* McpServer
 *                    instance. Called once per session so each client gets
 *                    its own server lifecycle.
 */
export function createHttpApp(getServer: () => McpServer): Express {
  const app = express();
  app.use(express.json());

  // ---- Health endpoint (6A.3) ----
  app.get('/health', async (_req: Request, res: Response) => {
    try {
      const workspaceIds = await listDirs(getDataRoot());
      const health = buildHealthResponse();
      (health as Record<string, unknown>).registeredWorkspaces = workspaceIds.length;
      res.json(health);
    } catch {
      const health = buildHealthResponse();
      (health as Record<string, unknown>).registeredWorkspaces = 'error';
      res.json(health);
    }
  });

  // ---- Streamable HTTP transport (/mcp) ----
  app.all('/mcp', async (req: Request, res: Response) => {
    try {
      const sessionId = req.headers['mcp-session-id'] as string | undefined;
      let transport: StreamableHTTPServerTransport;

      if (sessionId && transports[sessionId]) {
        const existing = transports[sessionId];
        if (existing.type !== 'streamable-http') {
          res.status(400).json({
            jsonrpc: '2.0',
            error: { code: -32000, message: 'Session uses a different transport' },
            id: null,
          });
          return;
        }
        transport = existing.transport as StreamableHTTPServerTransport;
      } else if (!sessionId && req.method === 'POST' && isInitializeRequest(req.body)) {
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => {
            transports[sid] = { transport, type: 'streamable-http' };
            console.error(`[http] Streamable HTTP session initialized: ${sid}`);
          },
        });

        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && transports[sid]) {
            delete transports[sid];
            console.error(`[http] Streamable HTTP session closed: ${sid}`);
          }
        };

        const server = getServer();
        await server.connect(transport);
      } else {
        res.status(400).json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Bad Request: No valid session ID' },
          id: null,
        });
        return;
      }

      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error('[http] Error handling /mcp:', error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: 'Internal server error' },
          id: null,
        });
      }
    }
  });

  // ---- Live agent sessions endpoint ----
  app.get('/sessions/live', (_req: Request, res: Response) => {
    res.json(getAllLiveSessions());
  });

  // ---- Legacy SSE transport (/sse + /messages) ----
  app.get('/sse', async (_req: Request, res: Response) => {
    console.error('[http] SSE client connected');
    const transport = new SSEServerTransport('/messages', res);
    transports[transport.sessionId] = { transport, type: 'sse' };

    res.on('close', () => {
      delete transports[transport.sessionId];
      console.error(`[http] SSE session closed: ${transport.sessionId}`);
    });

    const server = getServer();
    await server.connect(transport);
  });

  app.post('/messages', async (req: Request, res: Response) => {
    const sessionId = req.query.sessionId as string;
    const entry = transports[sessionId];

    if (!entry || entry.type !== 'sse') {
      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No SSE transport for session' },
        id: null,
      });
      return;
    }

    await (entry.transport as SSEServerTransport).handlePostMessage(req, res, req.body);
  });

  return app;
}

// ---------------------------------------------------------------------------
// Shutdown
// ---------------------------------------------------------------------------

export async function closeAllTransports(): Promise<void> {
  for (const sessionId of Object.keys(transports)) {
    try {
      await transports[sessionId].transport.close?.();
      delete transports[sessionId];
    } catch (error) {
      console.error(`[http] Error closing session ${sessionId}:`, error);
    }
  }
}
