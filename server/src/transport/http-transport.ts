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
import { getDbPath } from '../db/index.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { InMemoryEventStore } from '@modelcontextprotocol/sdk/examples/shared/inMemoryEventStore.js';
import { getDataRoot, listDirs } from '../storage/db-store.js';
import { isDataRootAccessible } from './data-root-liveness.js';
import { listWorkspaces } from '../db/workspace-db.js';
import { getPlansByWorkspace } from '../db/plan-db.js';
import {
  handleMemoryCartographer,
  type CartographerAction,
  type MemoryCartographerParams,
} from '../tools/memory_cartographer.js';import { memoryWorkspace } from '../tools/consolidated/memory_workspace.js';
import { memoryPlan } from '../tools/consolidated/memory_plan.js';
import { memorySteps } from '../tools/consolidated/memory_steps.js';
import { memoryContext } from '../tools/consolidated/memory_context.js';
import { memoryAgent } from '../tools/consolidated/memory_agent.js';import { storeContext, getContext } from '../db/context-db.js';
import { runSeed } from '../db/seed.js';
import { run, queryOne, queryAll, newId, nowIso } from '../db/query-helpers.js';
import { getAllLiveSessions, getLiveSessionCount, getLiveSessionEntry, clearLiveSession } from '../tools/session-live-store.js';
import {
  listUserSessions,
  getUserSession,
  createUserSession,
  updateUserSession,
  deleteUserSession,
} from '../db/user-session-db.js';
import { runMigrations, migrationStatus } from '../db/index.js';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TransportType = 'stdio' | 'sse' | 'streamable-http';

interface TransportEntry {
  transport: StreamableHTTPServerTransport | SSEServerTransport;
  type: 'streamable-http' | 'sse';
  connectedAt: string; // ISO 8601
  /** The _session_id passed by the client in its first tool call, used to cross-reference the live session store. */
  lastSessionId?: string;
}

// ---------------------------------------------------------------------------
// State
// ---------------------------------------------------------------------------

const transports: Record<string, TransportEntry> = {};
const serverStartTime = Date.now();

const SUPERVISOR_CARTOGRAPHER_ACTIONS = new Set<CartographerAction>([
  'summary',
  'file_context',
  'flow_entry_points',
  'layer_view',
  'search',
  'slice_detail',
  'slice_projection',
  'slice_filters',
]);

const SUPERVISOR_SEARCH_SCOPES = new Set<NonNullable<MemoryCartographerParams['search_scope']>>([
  'symbols',
  'files',
  'modules',
  'all',
]);

const SUPERVISOR_PROJECTION_TYPES = new Set<NonNullable<MemoryCartographerParams['projection_type']>>([
  'file_level',
  'module_level',
  'symbol_level',
]);

function parseSupervisorCartographerAction(value: unknown): CartographerAction | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  if (!SUPERVISOR_CARTOGRAPHER_ACTIONS.has(value as CartographerAction)) {
    return undefined;
  }
  return value as CartographerAction;
}

function parseOptionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }
  const parsed = value.filter((entry): entry is string => typeof entry === 'string' && entry.length > 0);
  return parsed.length > 0 ? parsed : undefined;
}

function parseOptionalNumber(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return undefined;
  }
  return value;
}

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
    dbPath: getDbPath(),
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
      } else if (req.method === 'GET') {
        // GET without a valid session ID — VS Code's MCP client sends this to open a
        // standalone SSE notification stream before (or independently of) initialization.
        // We use stateful per-session transports so standalone SSE isn't supported.
        // Per MCP spec §6.3 the server MUST return 405 for unsupported standalone GET;
        // returning 405 (not 400) tells the client to stop retrying this path.
        res.status(405).set('Allow', 'POST, DELETE').json({
          jsonrpc: '2.0',
          error: { code: -32000, message: 'Method Not Allowed: GET requires a valid Mcp-Session-Id; use POST to initialize a session first' },
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

      // Capture _session_id from tool call bodies so /admin/connections can
      // cross-reference the live session store (which is keyed by _session_id,
      // not by the transport UUID).
      if (sessionId && transports[sessionId] && !transports[sessionId].lastSessionId) {
        const body = req.body as Record<string, unknown> | undefined;
        const args = (body?.params as Record<string, unknown> | undefined)?.arguments as Record<string, unknown> | undefined;
        const sid = args?._session_id;
        if (typeof sid === 'string' && sid) {
          transports[sessionId].lastSessionId = sid;
        }
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

  // ---- Session stop endpoint ----
  app.post('/sessions/stop', (req: Request, res: Response) => {
    const { sessionKey } = req.body as { sessionKey?: string };
    if (!sessionKey || typeof sessionKey !== 'string') {
      res.status(400).json({ error: 'sessionKey is required' });
      return;
    }
    // sessionKey format: workspaceId::planId::sessionId
    const parts = sessionKey.split('::');
    const sessionId = parts.length === 3 ? parts[2] : sessionKey;
    const sessions = getAllLiveSessions();
    if (!sessions[sessionId]) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }
    clearLiveSession(sessionId);
    console.error(`[http] Session stopped via REST: ${sessionId}`);
    res.json({ stopped: true, sessionId });
  });

  // ---- Session inject endpoint ----
  app.post('/sessions/inject', (req: Request, res: Response) => {
    const { sessionKey, text } = req.body as { sessionKey?: string; text?: string };
    if (!sessionKey || typeof sessionKey !== 'string') {
      res.status(400).json({ error: 'sessionKey is required' });
      return;
    }
    if (!text || typeof text !== 'string') {
      res.status(400).json({ error: 'text is required' });
      return;
    }
    // sessionKey format: workspaceId::planId::sessionId
    const parts = sessionKey.split('::');
    const sessionId = parts.length === 3 ? parts[2] : sessionKey;
    const sessions = getAllLiveSessions();
    if (!sessions[sessionId]) {
      res.status(404).json({ error: `Session not found: ${sessionId}` });
      return;
    }
    // Acknowledge inject intent; in-process delivery depends on the session's
    // tool-call interception being active in the same process.
    console.error(`[http] Inject guidance queued for session ${sessionId}: ${text.slice(0, 80)}`);
    res.json({ queued: true, sessionId, textLength: text.length });
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

    // Capture _session_id from the first tool call for live store cross-referencing.
    if (!entry.lastSessionId) {
      const body = req.body as Record<string, unknown> | undefined;
      const args = (body?.params as Record<string, unknown> | undefined)?.arguments as Record<string, unknown> | undefined;
      const sid = args?._session_id;
      if (typeof sid === 'string' && sid) {
        entry.lastSessionId = sid;
      }
    }

    await (entry.transport as SSEServerTransport).handlePostMessage(req, res, req.body);
  });

  // ---- Admin: list active connections (for supervisor polling) ----
  app.get('/admin/connections', (_req: Request, res: Response) => {
    const connections = Object.entries(transports).map(([sessionId, entry]) => {
      // Live store is keyed by the client's _session_id (from tool params), not the
      // transport UUID — use lastSessionId (captured from the first tool call body)
      // as the lookup key, falling back to the transport UUID for legacy paths.
      const liveEntry = getLiveSessionEntry(entry.lastSessionId ?? sessionId);
      return {
        sessionId,
        type: entry.type,
        connectedAt: entry.connectedAt,
        lastActivity: liveEntry?.lastCallAt ?? null,
        callCount: liveEntry?.callCount ?? 0,
        agentType: liveEntry?.agentType ?? null,
        workspaceId: liveEntry?.workspaceId ?? null,
        planId: liveEntry?.planId ?? null,
        clientType: liveEntry?.clientType ?? null,
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

  // ---- Admin: migration status (for supervisor health checks) ----
  app.get('/admin/migrations', (_req: Request, res: Response) => {
    try {
      const status = migrationStatus();
      const pending = status.filter(m => !m.applied).map(m => m.filename);
      res.json({
        migrations: status,
        pending_count: pending.length,
        pending,
        healthy: pending.length === 0,
      });
    } catch (error) {
      console.error('[http] Error fetching migration status:', error);
      res.status(500).json({ error: 'Failed to fetch migration status' });
    }
  });

  // ---- Admin: run pending migrations ----
  app.post('/admin/migrations/run', async (_req: Request, res: Response) => {
    try {
      const result = await Promise.resolve(runMigrations());
      res.json({
        applied: result.applied,
        skipped: result.skipped,
        success: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error running migrations:', error);
      res.status(500).json({ error: message });
    }
  });

  // ---- Admin: list registered workspaces (for supervisor UI) ----
  app.get('/admin/workspaces', (_req: Request, res: Response) => {
    try {
      const rows = listWorkspaces();
      const workspaces = rows.map(r => ({ id: r.id, name: r.name, path: r.path }));
      res.json({ workspaces, total: workspaces.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error listing workspaces:', error);
      res.status(500).json({ error: message });
    }
  });

  // GET /admin/plans?workspace_id=xxx[&status=active|all] — plans with step counts
  // Omitting status (or status=all) returns all non-archived plans.
  app.get('/admin/plans', (req: Request, res: Response) => {
    const wsId         = req.query.workspace_id as string | undefined;
    const statusFilter = req.query.status       as string | undefined;
    if (!wsId) {
      res.status(400).json({ error: 'workspace_id query parameter is required' });
      return;
    }
    try {
      const opts = (!statusFilter || statusFilter === 'all') ? {} : { status: statusFilter };
      const plans = getPlansByWorkspace(wsId, opts);
      const result = plans.map(plan => {
        const rows = queryAll<{ status: string; cnt: number }>(
          'SELECT status, COUNT(*) as cnt FROM steps WHERE plan_id = ? GROUP BY status',
          [plan.id]
        );
        const steps_total = rows.reduce((sum, r) => sum + Number(r.cnt), 0);
        const steps_done  = rows.filter(r => r.status === 'done').reduce((sum, r) => sum + Number(r.cnt), 0);
        const nextStep = queryOne<{ task: string; phase: string; status: string; assignee: string | null }>(
          `SELECT s.task, COALESCE(ph.name, '') AS phase, s.status, s.assignee
           FROM steps s
           LEFT JOIN phases ph ON ph.id = s.phase_id
           WHERE s.plan_id = ? AND s.status IN ('active', 'pending')
           ORDER BY CASE s.status WHEN 'active' THEN 0 ELSE 1 END, s.order_index ASC
           LIMIT 1`,
          [plan.id]
        );
        return {
          id:                     plan.id,
          title:                  plan.title,
          status:                 plan.status,
          category:               plan.category,
          priority:               plan.priority,
          recommended_next_agent: plan.recommended_next_agent ?? null,
          updated_at:             plan.updated_at,
          workspace_id:           plan.workspace_id,
          steps_done,
          steps_total,
          next_step_task:   nextStep?.task     ?? null,
          next_step_phase:  nextStep?.phase    ?? null,
          next_step_status: nextStep?.status   ?? null,
          next_step_agent:  nextStep?.assignee ?? null,
        };
      });
      res.json({ plans: result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error listing plans:', error);
      res.status(500).json({ error: message });
    }
  });

  // ---- Admin: trigger memory_cartographer queries (for supervisor UI) ----
  app.post('/admin/memory_cartographer', async (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const { workspace_id, force_refresh } = body;
    if (!workspace_id || typeof workspace_id !== 'string') {
      res.status(400).json({ error: 'workspace_id is required' });
      return;
    }

    const parsedAction = parseSupervisorCartographerAction(body.action);
    if (typeof body.action !== 'undefined' && !parsedAction) {
      res.status(400).json({ error: `Unsupported action '${String(body.action)}' for /admin/memory_cartographer` });
      return;
    }

    const action: CartographerAction = parsedAction ?? 'summary';

    const requestParams: MemoryCartographerParams = {
      action,
      workspace_id,
      agent_type: 'Coordinator',
      caller_surface: 'supervisor',
      write_documentation: true,
      ...(force_refresh === true && { force_refresh: true }),
    };

    if (typeof body.file_id === 'string') {
      requestParams.file_id = body.file_id;
    }
    if (typeof body.include_symbols === 'boolean') {
      requestParams.include_symbols = body.include_symbols;
    }
    if (typeof body.include_references === 'boolean') {
      requestParams.include_references = body.include_references;
    }
    if (typeof body.include_cross_layer_edges === 'boolean') {
      requestParams.include_cross_layer_edges = body.include_cross_layer_edges;
    }
    if (typeof body.query === 'string') {
      requestParams.query = body.query;
    }
    if (typeof body.slice_id === 'string') {
      requestParams.slice_id = body.slice_id;
    }
    if (typeof body.materialize === 'boolean') {
      requestParams.materialize = body.materialize;
    }

    const searchScope = body.search_scope;
    if (typeof searchScope === 'string' && SUPERVISOR_SEARCH_SCOPES.has(searchScope as NonNullable<MemoryCartographerParams['search_scope']>)) {
      requestParams.search_scope = searchScope as NonNullable<MemoryCartographerParams['search_scope']>;
    }

    const projectionType = body.projection_type;
    if (typeof projectionType === 'string' && SUPERVISOR_PROJECTION_TYPES.has(projectionType as NonNullable<MemoryCartographerParams['projection_type']>)) {
      requestParams.projection_type = projectionType as NonNullable<MemoryCartographerParams['projection_type']>;
    }

    const layerFilter = parseOptionalStringArray(body.layer_filter);
    if (layerFilter) {
      requestParams.layer_filter = layerFilter;
    }

    const languageFilter = parseOptionalStringArray(body.language_filter);
    if (languageFilter) {
      requestParams.language_filter = languageFilter;
    }

    const layers = parseOptionalStringArray(body.layers);
    if (layers) {
      requestParams.layers = layers;
    }

    const limit = parseOptionalNumber(body.limit);
    if (typeof limit === 'number') {
      requestParams.limit = limit;
    }

    const depthLimit = parseOptionalNumber(body.depth_limit);
    if (typeof depthLimit === 'number') {
      requestParams.depth_limit = depthLimit;
    }

    if (Array.isArray(body.filters)) {
      requestParams.filters = body.filters;
    }

    try {
      const result = await handleMemoryCartographer(requestParams);
      if (result.success) {
        const contextType = action === 'summary' ? 'cartographer_summary' : `cartographer_${action}`;
        storeContext('workspace', workspace_id, contextType, result.data as object);

        if (action !== 'summary') {
          res.json(result);
          return;
        }

        // Upsert language-group slices into architecture_slices
        const languageBreakdown = (result.data as Record<string, unknown> | undefined)
          ?.data as Record<string, unknown> | undefined;
        const summary = (languageBreakdown?.result as Record<string, unknown> | undefined)
          ?.summary as Record<string, unknown> | undefined;
        const langRows = Array.isArray(summary?.language_breakdown)
          ? (summary.language_breakdown as Array<{ language: string; file_count: number }>)
          : [];
        const now = nowIso();
        for (const entry of langRows) {
          if (!entry.language) continue;
          const existing = queryOne<{ id: string }>(
            "SELECT id FROM architecture_slices WHERE workspace_id = ? AND path = ? AND type = 'language_group'",
            [workspace_id, entry.language],
          );
          const meta = JSON.stringify({ language: entry.language, file_count: entry.file_count, scanned_at: now });
          if (existing) {
            run(
              'UPDATE architecture_slices SET catalog_metadata = ?, updated_at = ? WHERE id = ?',
              [meta, now, existing.id],
            );
          } else {
            run(
              'INSERT INTO architecture_slices (id, workspace_id, path, type, catalog_metadata, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [newId(), workspace_id, entry.language, 'language_group', meta, now, now],
            );
          }
        }
      }
      res.json(result);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error running memory_cartographer:', error);
      res.status(500).json({ error: message });
    }
  });

  // ---- Admin: direct MCP tool call for chatbot (allowlisted tools only) ----
  const CHATBOT_TOOL_ALLOWLIST = new Set([
    'memory_workspace', 'memory_plan', 'memory_steps', 'memory_context', 'memory_agent',
  ]);

  app.post('/admin/mcp_call', async (req: Request, res: Response) => {
    const body = req.body as { name?: string; arguments?: Record<string, unknown> };
    const { name, arguments: args } = body;
    if (!name || !CHATBOT_TOOL_ALLOWLIST.has(name)) {
      res.status(400).json({ error: `Tool '${name ?? '(none)'}' not in chatbot allowlist` });
      return;
    }
    try {
      const params = (args ?? {}) as Record<string, unknown>;
      let result: unknown;
      switch (name) {
        case 'memory_workspace':
          result = await memoryWorkspace(params as unknown as Parameters<typeof memoryWorkspace>[0]);
          break;
        case 'memory_plan':
          result = await memoryPlan(params as unknown as Parameters<typeof memoryPlan>[0]);
          break;
        case 'memory_steps':
          result = await memorySteps(params as unknown as Parameters<typeof memorySteps>[0]);
          break;
        case 'memory_context':
          result = await memoryContext(params as unknown as Parameters<typeof memoryContext>[0]);
          break;
        case 'memory_agent':
          result = await memoryAgent(params as unknown as Parameters<typeof memoryAgent>[0]);
          break;
        default:
          res.status(400).json({ error: `Tool '${name}' not in chatbot allowlist` });
          return;
      }
      res.json({ result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error in /admin/mcp_call:', error);
      res.status(500).json({ error: message });
    }
  });

  // ---- Admin: get last stored cartographer summary for a workspace ----
  app.get('/admin/cartographer_summary/:workspace_id', (req: Request, res: Response) => {
    const { workspace_id } = req.params;
    if (!workspace_id) {
      res.status(400).json({ error: 'workspace_id is required' });
      return;
    }
    const rows = getContext('workspace', workspace_id, 'cartographer_summary');
    if (rows.length === 0) {
      res.json({ success: true, has_data: false, data: null });
      return;
    }
    // Most recent by updated_at
    const row = rows.sort((a, b) => a.updated_at.localeCompare(b.updated_at)).pop()!;
    try {
      const parsed = JSON.parse(row.data) as Record<string, unknown>;
      // stored shape: { action, data: { result: { summary, ... }, elapsed_ms, diagnostics } }
      const inner = (parsed?.data as Record<string, unknown> | undefined) ?? {};
      const result = (inner?.result as Record<string, unknown> | undefined) ?? {};
      const summary = (result.summary as Record<string, unknown> | undefined) ?? {};
      const diagnostics = (inner?.diagnostics as Record<string, unknown> | undefined) ?? {};
      const markers = Array.isArray(diagnostics.markers) ? (diagnostics.markers as string[]) : [];
      const cacheHit = markers.includes('cache_hit') || diagnostics.cache_hit === true ? true
        : markers.length > 0 || 'cache_hit' in diagnostics ? false
        : null;
      res.json({
        success: true,
        has_data: true,
        data: {
          files_total: (summary.file_count ?? summary.files_total) ?? null,
          symbols_total: (summary.symbol_count ?? summary.symbols_total) ?? null,
          language_breakdown: Array.isArray(summary.language_breakdown) ? summary.language_breakdown : [],
          elapsed_ms: inner?.elapsed_ms ?? null,
          cache_hit: cacheHit,
          scanned_at: row.updated_at,
        },
      });
    } catch {
      res.json({ success: true, has_data: false, data: null });
    }
  });

  // ---- Admin: user sessions CRUD ----

  app.get('/admin/user-sessions', (_req: Request, res: Response) => {
    try {
      const sessions = listUserSessions();
      res.json({ sessions, total: sessions.length });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error listing user sessions:', error);
      res.status(500).json({ error: message });
    }
  });

  app.get('/admin/user-sessions/:id', (req: Request, res: Response) => {
    try {
      const session = getUserSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: `User session not found: ${req.params.id}` });
        return;
      }
      res.json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error fetching user session:', error);
      res.status(500).json({ error: message });
    }
  });

  app.post('/admin/user-sessions', (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      if (!body.name || typeof body.name !== 'string') {
        res.status(400).json({ error: 'name is required' });
        return;
      }
      const session = createUserSession({
        name: body.name,
        working_dirs: Array.isArray(body.working_dirs) ? body.working_dirs as string[] : [],
        commands: Array.isArray(body.commands) ? body.commands as string[] : [],
        notes: typeof body.notes === 'string' ? body.notes : '',
        linked_agent_session_ids: Array.isArray(body.linked_agent_session_ids) ? body.linked_agent_session_ids as string[] : [],
        pinned: body.pinned === true,
      });
      res.status(201).json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error creating user session:', error);
      res.status(500).json({ error: message });
    }
  });

  app.put('/admin/user-sessions/:id', (req: Request, res: Response) => {
    try {
      const body = req.body as Record<string, unknown>;
      const session = updateUserSession(req.params.id, {
        ...(typeof body.name === 'string' && { name: body.name }),
        ...(Array.isArray(body.working_dirs) && { working_dirs: body.working_dirs as string[] }),
        ...(Array.isArray(body.commands) && { commands: body.commands as string[] }),
        ...(typeof body.notes === 'string' && { notes: body.notes }),
        ...(Array.isArray(body.linked_agent_session_ids) && { linked_agent_session_ids: body.linked_agent_session_ids as string[] }),
        ...(typeof body.pinned === 'boolean' && { pinned: body.pinned }),
      });
      if (!session) {
        res.status(404).json({ error: `User session not found: ${req.params.id}` });
        return;
      }
      res.json(session);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error updating user session:', error);
      res.status(500).json({ error: message });
    }
  });

  app.delete('/admin/user-sessions/:id', (req: Request, res: Response) => {
    try {
      const deleted = deleteUserSession(req.params.id);
      if (!deleted) {
        res.status(404).json({ error: `User session not found: ${req.params.id}` });
        return;
      }
      res.status(204).send();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error deleting user session:', error);
      res.status(500).json({ error: message });
    }
  });

  // GET /admin/user-sessions/:id/agent-sessions — join linked IDs against live sessions store
  app.get('/admin/user-sessions/:id/agent-sessions', (req: Request, res: Response) => {
    try {
      const session = getUserSession(req.params.id);
      if (!session) {
        res.status(404).json({ error: `User session not found: ${req.params.id}` });
        return;
      }
      const live = getAllLiveSessions();
      const agentSessions = session.linked_agent_session_ids.map(agentId => {
        const liveEntry = live[agentId] ?? null;
        return {
          session_id: agentId,
          live: liveEntry !== null,
          ...(liveEntry ?? {}),
        };
      });
      res.json({ user_session_id: session.id, agent_sessions: agentSessions });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error fetching agent sessions for user session:', error);
      res.status(500).json({ error: message });
    }
  });

  // ---- Admin: re-seed agent defs + instructions from disk (idempotent) ----
  app.post('/admin/reseed', async (_req: Request, res: Response) => {
    try {
      const result = await runSeed();
      res.json({ success: true, result });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('[http] Error running reseed:', error);
      res.status(500).json({ error: message });
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
