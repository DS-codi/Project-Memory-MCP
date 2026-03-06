import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createFallbackRestApp } from '../../transport/fallback-rest.js';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import { memoryContext } from '../../tools/consolidated/memory_context.js';

vi.mock('../../tools/consolidated/memory_workspace.js', () => ({
  memoryWorkspace: vi.fn(),
}));

vi.mock('../../tools/consolidated/memory_context.js', () => ({
  memoryContext: vi.fn(),
}));

vi.mock('../../db/index.js', () => ({
  getDbPath: () => '/tmp/test-db.sqlite',
}));

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function httpJsonRequest(
  url: string,
  method: 'GET' | 'POST' | 'PUT',
  body?: Record<string, unknown>,
): Promise<HttpResult> {
  return new Promise((resolve, reject) => {
    const payload = body ? JSON.stringify(body) : undefined;
    const req = http.request(
      url,
      {
        method,
        headers: payload
          ? {
              'content-type': 'application/json',
              'content-length': Buffer.byteLength(payload),
            }
          : undefined,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          try {
            resolve({
              status: res.statusCode ?? 0,
              body: raw ? (JSON.parse(raw) as Record<string, unknown>) : {},
            });
          } catch (error) {
            reject(error);
          }
        });
      },
    );

    req.on('error', reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

describe('fallback REST transport', () => {
  const memoryWorkspaceMock = vi.mocked(memoryWorkspace);
  const memoryContextMock = vi.mocked(memoryContext);

  let server: http.Server;
  let baseUrl: string;

  beforeAll(() => {
    const app = createFallbackRestApp();
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  beforeEach(() => {
    memoryWorkspaceMock.mockReset();
    memoryContextMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('serves fallback health endpoint', async () => {
    const { status, body } = await httpJsonRequest(`${baseUrl}/api/fallback/health`, 'GET');
    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      status: 'ok',
      source: 'fallback_rest',
    });
  });

  it('proxies gui ping with debug info', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          available: true,
          apps: ['brainstorm_gui', 'approval_gui'],
          server: 'project-memory-gui-server',
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { status, body } = await httpJsonRequest(`${baseUrl}/api/fallback/gui/ping`, 'GET');

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      available: true,
      apps: ['brainstorm_gui', 'approval_gui'],
    });
    expect(body.debug).toMatchObject({
      method: 'GET',
      path: '/gui/ping',
      upstream_status: 200,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('proxies gui launch and includes debug metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            success: true,
            pending_refinement: false,
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { status, body } = await httpJsonRequest(`${baseUrl}/api/fallback/gui/launch`, 'POST', {
      app_name: 'brainstorm_gui',
      payload: {
        title: 'Form title',
      },
      workspace_id: 'ws_launch',
      session_id: 'sess_123',
      agent: 'Coordinator',
    });

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.debug).toMatchObject({
      method: 'POST',
      path: '/gui/launch',
      upstream_status: 200,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, options] = fetchMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(options.method).toBe('POST');
    const parsedBody = JSON.parse(String(options.body));
    expect(parsedBody).toMatchObject({
      app_name: 'brainstorm_gui',
      workspace_id: 'ws_launch',
      session_id: 'sess_123',
      agent: 'Coordinator',
    });
  });

  it('returns 400 for gui launch requests missing app_name', async () => {
    const { status, body } = await httpJsonRequest(`${baseUrl}/api/fallback/gui/launch`, 'POST', {
      payload: {
        title: 'missing app_name',
      },
    });

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('invalid_request');
  });

  it('returns upstream_unreachable with debug info when gui launch upstream fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('connect ECONNREFUSED'));
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { status, body } = await httpJsonRequest(`${baseUrl}/api/fallback/gui/launch`, 'POST', {
      app_name: 'approval_gui',
      payload: {
        prompt: 'Approve?',
      },
    });

    expect(status).toBe(502);
    expect(body.success).toBe(false);
    expect(body.code).toBe('upstream_unreachable');
    expect(body.debug).toMatchObject({
      method: 'POST',
      path: '/gui/launch',
      upstream_status: null,
    });
  });

  it('proxies runtime recent output per component', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: true,
          data: {
            count: 1,
            items: [
              {
                component: 'dashboard',
                stream: 'stdout',
                line: 'dashboard ready',
              },
            ],
          },
        }),
        {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetchMock as unknown as typeof fetch);

    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/runtime/recent?component=dashboard&limit=50`,
      'GET',
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      ok: true,
      data: {
        count: 1,
      },
    });
    expect(body.debug).toMatchObject({
      method: 'GET',
      path: '/runtime/recent?component=dashboard&limit=50',
      upstream_status: 200,
    });
  });

  it('validates runtime recent limit query parameter', async () => {
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/runtime/recent?limit=abc`,
      'GET',
    );

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('invalid_request');
  });

  it('returns direct supervisor runtime stream URL', async () => {
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/runtime/stream-url?component=fallback_api`,
      'GET',
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      url: 'http://127.0.0.1:3464/runtime/stream?component=fallback_api',
    });
  });

  it('registers workspace via memory_workspace register action', async () => {
    memoryWorkspaceMock.mockResolvedValue({
      success: true,
      data: {
        action: 'register',
        data: {
          workspace: { workspace_id: 'ws_123' },
          first_time: false,
          indexed: true,
        },
      },
    } as any);

    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/register`,
      'POST',
      { workspace_path: 'C:/tmp/project' },
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(memoryWorkspaceMock).toHaveBeenCalledWith({
      action: 'register',
      workspace_path: 'C:/tmp/project',
      force: undefined,
    });
  });

  it('returns 400 for register requests missing workspace path', async () => {
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/register`,
      'POST',
      {},
    );

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.code).toBe('invalid_request');
    expect(memoryWorkspaceMock).not.toHaveBeenCalled();
  });

  it('fetches workspace context through memory_context workspace_get', async () => {
    memoryContextMock.mockResolvedValue({
      success: true,
      data: {
        action: 'workspace_get',
        data: { notes: ['hello'] },
      },
    } as any);

    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/ws_abc/context`,
      'GET',
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(memoryContextMock).toHaveBeenCalledWith({
      action: 'workspace_get',
      workspace_id: 'ws_abc',
    });
  });

  it('updates existing workspace context through workspace_update', async () => {
    memoryContextMock.mockResolvedValueOnce({
      success: true,
      data: {
        action: 'workspace_update',
        data: { saved: true },
      },
    } as any);

    const payload = { notes: ['new-note'] };
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/ws_upd/context`,
      'PUT',
      payload,
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(memoryContextMock).toHaveBeenCalledTimes(1);
    expect(memoryContextMock).toHaveBeenCalledWith({
      action: 'workspace_update',
      workspace_id: 'ws_upd',
      data: payload,
    });
  });

  it('falls back to workspace_set when workspace_update reports missing context', async () => {
    memoryContextMock
      .mockResolvedValueOnce({
        success: false,
        error: 'Workspace context not found',
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          action: 'workspace_set',
          data: { created: true },
        },
      } as any);

    const payload = { notes: ['first-note'] };
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/ws_new/context`,
      'PUT',
      payload,
    );

    expect(status).toBe(200);
    expect(body.success).toBe(true);
    expect(memoryContextMock).toHaveBeenNthCalledWith(1, {
      action: 'workspace_update',
      workspace_id: 'ws_new',
      data: payload,
    });
    expect(memoryContextMock).toHaveBeenNthCalledWith(2, {
      action: 'workspace_set',
      workspace_id: 'ws_new',
      data: payload,
    });
  });

  it('returns 400 when PUT body is not an object', async () => {
    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/ws_bad/context`,
      'PUT',
      ['invalid'] as unknown as Record<string, unknown>,
    );

    expect(status).toBe(400);
    expect(body.success).toBe(false);
    expect(memoryContextMock).not.toHaveBeenCalled();
  });

  it('maps not found errors to HTTP 404', async () => {
    memoryContextMock.mockResolvedValue({
      success: false,
      error: 'Workspace not found',
    });

    const { status, body } = await httpJsonRequest(
      `${baseUrl}/api/fallback/workspaces/ws_missing/context`,
      'GET',
    );

    expect(status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.code).toBe('not_found');
  });
});
