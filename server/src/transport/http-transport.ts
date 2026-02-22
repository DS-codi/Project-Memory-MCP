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
import { getAllLiveSessions, getLiveSessionCount, getLiveSessionEntry } from '../tools/session-live-store.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportType = 'stdio' | 'sse' | 'streamable-http';

interface TransportEntry {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  type: 'streamable-http' | 'sse';
  connectedAt: string; // ISO 8601
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
  const healthHandler = async (_req: Request, res: Response) => {
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
  };
  app.get('/health', healthHandler);
  // Alias used by the VS Code extension's checkHealth() utility
  app.get('/api/health', healthHandler);

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
      } else if (req.method === 'POST' && isInitializeRequest(req.body)) {
        // Initialize always creates a fresh session — even if a stale session ID
        // header is present.  This is the reconnect path: client discarded its
        // broken session and is starting over.
        const eventStore = new InMemoryEventStore();
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          eventStore,
          onsessioninitialized: (sid) => {
            transports[sid] = { transport, type: 'streamable-http', connectedAt: new Date().toISOString() };
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
      } else if (sessionId && !transports[sessionId]) {
        // Session ID provided but not found — session has expired or been cleaned up.
        // MCP spec §6.3: server MUST return 404; client SHOULD reinitialize on 404.
        res.status(404).json({
          jsonrpc: '2.0',
          error: { code: -32001, message: 'Session not found — please reinitialize' },
          id: null,
        });
        return;
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
    transports[transport.sessionId] = { transport, type: 'sse', connectedAt: new Date().toISOString() };

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

  // ---- Admin: list active connections (for supervisor polling) ----
  app.get('/admin/connections', (_req: Request, res: Response) => {
    const connections = Object.entries(transports).map(([sessionId, entry]) => {
      const liveEntry = getLiveSessionEntry(sessionId);
      return {
        sessionId,
        type: entry.type,
        connectedAt: entry.connectedAt,
        lastActivity: liveEntry?.lastCallAt ?? null,
        callCount: liveEntry?.callCount ?? 0,
        agentType: liveEntry?.agentType ?? null,
        workspaceId: liveEntry?.workspaceId ?? null,
        planId: liveEntry?.planId ?? null,
      };
    });
    res.json(connections);
  });

  // ---- Admin: close a specific connection ----
  app.delete('/admin/connections/:sessionId', async (req: Request, res: Response) => {
    const { sessionId } = req.params;
    const entry = transports[sessionId];
    if (!entry) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }
    try {
      await entry.transport.close?.();
      delete transports[sessionId];
      console.error(`[http] Session closed by supervisor request: ${sessionId}`);
      res.json({ closed: true, sessionId });
    } catch (error) {
      console.error(`[http] Error closing session ${sessionId}:`, error);
      res.status(500).json({ error: 'Failed to close session' });
    }
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
