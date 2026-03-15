import express, { type Express, type Request, type Response as ExpressResponse } from 'express';
import { randomUUID } from 'node:crypto';
import { getDbPath } from '../db/index.js';
import { memoryWorkspace } from '../tools/consolidated/memory_workspace.js';
import { memoryContext } from '../tools/consolidated/memory_context.js';
import type { ToolResponse } from '../types/index.js';

const FALLBACK_SOURCE = 'fallback_rest';
const DEFAULT_SUPERVISOR_GUI_HOST = '127.0.0.1';
const DEFAULT_SUPERVISOR_GUI_PORT = 3464;
const SUPERVISOR_GUI_PROXY_TIMEOUT_MS = 15_000;

interface GuiProxyResult {
  ok: boolean;
  status: number;
  payload: Record<string, unknown>;
  debug: Record<string, unknown>;
  error?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function inferStatusCode(error: string | undefined): number {
  const message = (error || '').toLowerCase();
  if (!message) {
    return 500;
  }

  if (message.includes('not found')) {
    return 404;
  }

  if (
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('unknown action') ||
    message.includes('missing')
  ) {
    return 400;
  }

  return 500;
}

function inferErrorCode(error: string | undefined): string {
  const message = (error || '').toLowerCase();
  if (message.includes('not found')) {
    return 'not_found';
  }

  if (
    message.includes('required') ||
    message.includes('invalid') ||
    message.includes('unknown action') ||
    message.includes('missing')
  ) {
    return 'invalid_request';
  }

  return 'internal_error';
}

function respondToolResult(res: ExpressResponse, result: ToolResponse<unknown>, successStatus = 200): void {
  if (result.success) {
    res.status(successStatus).json({
      success: true,
      data: result.data,
      source: FALLBACK_SOURCE,
      timestamp: nowIso(),
    });
    return;
  }

  res.status(inferStatusCode(result.error)).json({
    success: false,
    error: result.error || 'Unknown error',
    code: inferErrorCode(result.error),
    source: FALLBACK_SOURCE,
    timestamp: nowIso(),
  });
}

function respondValidationError(res: ExpressResponse, error: string): void {
  res.status(400).json({
    success: false,
    error,
    code: 'invalid_request',
    source: FALLBACK_SOURCE,
    timestamp: nowIso(),
  });
}

function isMissingWorkspaceContext(error: string | undefined): boolean {
  const message = (error || '').toLowerCase();
  return message.includes('workspace context not found') || message.includes('context not found');
}

function requireWorkspaceId(req: Request, res: ExpressResponse): string | null {
  const workspaceId = req.params.workspaceId;
  if (!workspaceId || typeof workspaceId !== 'string' || workspaceId.trim().length === 0) {
    respondValidationError(res, 'workspaceId route parameter is required');
    return null;
  }

  return workspaceId;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parsePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return parsed;
}

function normalizeBaseUrl(value: string): string {
  return value.trim().replace(/\/+$/, '');
}

function resolveSupervisorGuiBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  if (typeof env.SUPERVISOR_GUI_URL === 'string' && env.SUPERVISOR_GUI_URL.trim().length > 0) {
    return normalizeBaseUrl(env.SUPERVISOR_GUI_URL);
  }

  const host =
    typeof env.SUPERVISOR_GUI_HOST === 'string' && env.SUPERVISOR_GUI_HOST.trim().length > 0
      ? env.SUPERVISOR_GUI_HOST.trim()
      : DEFAULT_SUPERVISOR_GUI_HOST;
  const port = parsePort(env.SUPERVISOR_GUI_PORT, DEFAULT_SUPERVISOR_GUI_PORT);
  return `http://${host}:${port}`;
}

async function parseJsonSafely(response: globalThis.Response): Promise<Record<string, unknown>> {
  try {
    const parsed = (await response.json()) as unknown;
    return isPlainObject(parsed) ? parsed : { data: parsed };
  } catch {
    return {};
  }
}

async function proxySupervisorGuiRequest(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>,
): Promise<GuiProxyResult> {
  const requestId = randomUUID();
  const startedAt = Date.now();
  const baseUrl = resolveSupervisorGuiBaseUrl();
  const upstreamUrl = new URL(path, `${baseUrl}/`).toString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SUPERVISOR_GUI_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(upstreamUrl, {
      method,
      headers: body
        ? {
            'Content-Type': 'application/json',
          }
        : undefined,
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const payload = await parseJsonSafely(response);
    const upstreamOk = response.ok && payload.ok !== false;

    return {
      ok: upstreamOk,
      status: response.status,
      payload,
      debug: {
        request_id: requestId,
        upstream_url: upstreamUrl,
        upstream_status: response.status,
        elapsed_ms: Date.now() - startedAt,
        method,
        path,
        supervisor_gui_base_url: baseUrl,
      },
      ...(upstreamOk
        ? {}
        : {
            error:
              typeof payload.error === 'string'
                ? payload.error
                : `Supervisor GUI endpoint ${method} ${path} returned ${response.status}`,
          }),
    };
  } catch (error) {
    return {
      ok: false,
      status: 502,
      payload: {},
      error: error instanceof Error ? error.message : String(error),
      debug: {
        request_id: requestId,
        upstream_url: upstreamUrl,
        upstream_status: null,
        elapsed_ms: Date.now() - startedAt,
        method,
        path,
        supervisor_gui_base_url: baseUrl,
      },
    };
  } finally {
    clearTimeout(timeout);
  }
}

function respondGuiProxyResult(res: ExpressResponse, result: GuiProxyResult): void {
  if (result.ok) {
    res.status(200).json({
      success: true,
      data: result.payload,
      source: FALLBACK_SOURCE,
      timestamp: nowIso(),
      debug: result.debug,
    });
    return;
  }

  const status = result.status >= 400 ? result.status : 502;
  const code = status === 502 ? 'upstream_unreachable' : 'upstream_error';

  res.status(status).json({
    success: false,
    error: result.error || 'Supervisor GUI proxy failed',
    code,
    source: FALLBACK_SOURCE,
    timestamp: nowIso(),
    debug: {
      ...result.debug,
      upstream_payload: result.payload,
    },
  });
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

export function createFallbackRestApp(): Express {
  const app = express();
  app.use(express.json());

  const healthHandler = (_req: Request, res: ExpressResponse) => {
    res.json({
      success: true,
      data: {
        status: 'ok',
        service: 'project-memory-fallback-api',
        dbPath: getDbPath(),
        source: FALLBACK_SOURCE,
      },
      source: FALLBACK_SOURCE,
      timestamp: nowIso(),
    });
  };

  app.get('/health', healthHandler);
  app.get('/api/fallback/health', healthHandler);

  app.get('/api/fallback/gui/ping', async (_req: Request, res: ExpressResponse) => {
    const result = await proxySupervisorGuiRequest('/gui/ping', 'GET');
    respondGuiProxyResult(res, result);
  });

  app.post('/api/fallback/gui/launch', async (req: Request, res: ExpressResponse) => {
    const appName = req.body?.app_name;
    const payload = req.body?.payload;

    if (!isNonEmptyString(appName)) {
      respondValidationError(res, 'app_name is required');
      return;
    }

    if (payload === undefined || payload === null) {
      respondValidationError(res, 'payload is required');
      return;
    }

    const launchBody: Record<string, unknown> = {
      app_name: appName,
      payload,
    };

    if (typeof req.body?.timeout_seconds === 'number') {
      launchBody.timeout_seconds = req.body.timeout_seconds;
    }
    if (isNonEmptyString(req.body?.workspace_id)) {
      launchBody.workspace_id = req.body.workspace_id;
    }
    if (isNonEmptyString(req.body?.session_id)) {
      launchBody.session_id = req.body.session_id;
    }
    if (isNonEmptyString(req.body?.agent)) {
      launchBody.agent = req.body.agent;
    }

    const result = await proxySupervisorGuiRequest('/gui/launch', 'POST', launchBody);
    respondGuiProxyResult(res, result);
  });

  app.post('/api/fallback/gui/continue', async (req: Request, res: ExpressResponse) => {
    if (!isNonEmptyString(req.body?.session_id)) {
      respondValidationError(res, 'session_id is required');
      return;
    }

    if (req.body?.payload === undefined || req.body?.payload === null) {
      respondValidationError(res, 'payload is required');
      return;
    }

    const continueBody: Record<string, unknown> = {
      session_id: req.body.session_id,
      payload: req.body.payload,
    };

    if (typeof req.body?.timeout_seconds === 'number') {
      continueBody.timeout_seconds = req.body.timeout_seconds;
    }

    const result = await proxySupervisorGuiRequest('/gui/continue', 'POST', continueBody);
    respondGuiProxyResult(res, result);
  });

  app.get('/api/fallback/runtime/recent', async (req: Request, res: ExpressResponse) => {
    const params = new URLSearchParams();

    if (typeof req.query.component === 'string' && req.query.component.trim().length > 0) {
      params.set('component', req.query.component.trim());
    }

    if (req.query.limit !== undefined) {
      if (typeof req.query.limit !== 'string' || req.query.limit.trim().length === 0) {
        respondValidationError(res, 'limit must be a positive integer');
        return;
      }

      const parsedLimit = Number.parseInt(req.query.limit, 10);
      if (!Number.isFinite(parsedLimit) || parsedLimit <= 0) {
        respondValidationError(res, 'limit must be a positive integer');
        return;
      }

      params.set('limit', String(Math.min(parsedLimit, 2_000)));
    }

    const queryString = params.toString();
    const upstreamPath = queryString.length > 0 ? `/runtime/recent?${queryString}` : '/runtime/recent';
    const result = await proxySupervisorGuiRequest(upstreamPath, 'GET');
    respondGuiProxyResult(res, result);
  });

  app.get('/api/fallback/runtime/capture', async (_req: Request, res: ExpressResponse) => {
    const result = await proxySupervisorGuiRequest('/runtime/capture', 'GET');
    respondGuiProxyResult(res, result);
  });

  app.put('/api/fallback/runtime/capture', async (req: Request, res: ExpressResponse) => {
    if (typeof req.body?.enabled !== 'boolean') {
      respondValidationError(res, 'enabled must be a boolean');
      return;
    }

    const result = await proxySupervisorGuiRequest('/runtime/capture', 'POST', {
      enabled: req.body.enabled,
    });
    respondGuiProxyResult(res, result);
  });

  app.get('/api/fallback/workspaces', async (_req: Request, res: ExpressResponse) => {
    try {
      const result = await memoryWorkspace({ action: 'list' });
      respondToolResult(res, result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        code: 'internal_error',
        source: FALLBACK_SOURCE,
        timestamp: nowIso(),
      });
    }
  });

  app.post('/api/fallback/workspaces/register', async (req: Request, res: ExpressResponse) => {
    try {
      const workspacePath =
        typeof req.body?.workspace_path === 'string'
          ? req.body.workspace_path
          : typeof req.body?.workspacePath === 'string'
            ? req.body.workspacePath
            : null;

      if (!workspacePath) {
        respondValidationError(res, 'workspace_path is required');
        return;
      }

      const force = typeof req.body?.force === 'boolean' ? req.body.force : undefined;
      const result = await memoryWorkspace({
        action: 'register',
        workspace_path: workspacePath,
        force,
      });

      respondToolResult(res, result, result.success ? 200 : inferStatusCode(result.error));
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        code: 'internal_error',
        source: FALLBACK_SOURCE,
        timestamp: nowIso(),
      });
    }
  });

  app.get('/api/fallback/workspaces/:workspaceId/context', async (req: Request, res: ExpressResponse) => {
    try {
      const workspaceId = requireWorkspaceId(req, res);
      if (!workspaceId) {
        return;
      }

      const result = await memoryContext({
        action: 'workspace_get',
        workspace_id: workspaceId,
      });

      respondToolResult(res, result);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        code: 'internal_error',
        source: FALLBACK_SOURCE,
        timestamp: nowIso(),
      });
    }
  });

  app.put('/api/fallback/workspaces/:workspaceId/context', async (req: Request, res: ExpressResponse) => {
    try {
      const workspaceId = requireWorkspaceId(req, res);
      if (!workspaceId) {
        return;
      }

      const payload = req.body;
      if (!isPlainObject(payload)) {
        respondValidationError(res, 'request body must be a JSON object');
        return;
      }

      const updateResult = await memoryContext({
        action: 'workspace_update',
        workspace_id: workspaceId,
        data: payload,
      });

      if (updateResult.success) {
        respondToolResult(res, updateResult);
        return;
      }

      if (!isMissingWorkspaceContext(updateResult.error)) {
        respondToolResult(res, updateResult);
        return;
      }

      const setResult = await memoryContext({
        action: 'workspace_set',
        workspace_id: workspaceId,
        data: payload,
      });

      respondToolResult(res, setResult);
    } catch (error) {
      res.status(500).json({
        success: false,
        error: error instanceof Error ? error.message : String(error),
        code: 'internal_error',
        source: FALLBACK_SOURCE,
        timestamp: nowIso(),
      });
    }
  });

  return app;
}
