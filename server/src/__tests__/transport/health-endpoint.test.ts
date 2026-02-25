/**
 * Health Endpoint Tests
 *
 * Verifies the /health endpoint returns the expected JSON shape
 * including connectionState, uptime, sessionsByType, process info,
 * and other fields added in Phase 7 (Container Resilience).
 *
 * Uses vitest + in-process HTTP server (no supertest dependency).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { createHttpApp } from '../../transport/http-transport.js';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('../../storage/db-store.js', () => ({
  getDataRoot: () => '/mock/data',
  listDirs: vi.fn().mockResolvedValue(['ws_alpha', 'ws_beta']),
}));

// Minimal McpServer stub — /health never touches the server instance
const mockMcpServer = {} as never;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpGet(url: string): Promise<{ status: number; body: Record<string, unknown> }> {
  return new Promise((resolve, reject) => {
    http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode ?? 0, body: JSON.parse(raw) });
        } catch (err) {
          reject(err);
        }
      });
    }).on('error', reject);
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('/health endpoint', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    const app = createHttpApp(() => mockMcpServer);
    server = app.listen(0);
    const { port } = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${port}`;
  });

  afterAll(() => {
    server.close();
  });

  it('returns 200 with status ok', async () => {
    const { status, body } = await httpGet(`${baseUrl}/health`);
    expect(status).toBe(200);
    expect(body.status).toBe('ok');
  });

  it('includes server identity fields', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(body.server).toBe('project-memory-mcp');
    expect(body).toHaveProperty('version');
    expect(body.transport).toBe('http');
  });

  it('includes connectionState field', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(['healthy', 'degraded', 'starting']).toContain(body.connectionState);
  });

  it('includes uptime as a number', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(typeof body.uptime).toBe('number');
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it('includes sessionsByType object', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(body).toHaveProperty('sessionsByType');
    expect(typeof body.sessionsByType).toBe('object');
  });

  it('includes activeSessions count', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(typeof body.activeSessions).toBe('number');
    expect(body.activeSessions).toBeGreaterThanOrEqual(0);
  });

  it('includes memory usage fields', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(body).toHaveProperty('memory');
    const mem = body.memory as Record<string, unknown>;
    expect(typeof mem.heapUsedMB).toBe('number');
    expect(typeof mem.rssMB).toBe('number');
  });

  it('includes process info', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(body).toHaveProperty('process');
    const proc = body.process as Record<string, unknown>;
    expect(typeof proc.pid).toBe('number');
    expect(typeof proc.nodeVersion).toBe('string');
    expect(typeof proc.platform).toBe('string');
  });

  it('includes registeredWorkspaces from listDirs', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    // Mock returns ['ws_alpha', 'ws_beta'] → 2
    expect(body.registeredWorkspaces).toBe(2);
  });

  it('includes ISO timestamp', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(typeof body.timestamp).toBe('string');
    // Should be parseable as a date
    expect(new Date(body.timestamp as string).getTime()).toBeGreaterThan(0);
  });

  it('includes dataRoot and agentsRoot', async () => {
    const { body } = await httpGet(`${baseUrl}/health`);
    expect(body).toHaveProperty('dataRoot');
    expect(body).toHaveProperty('agentsRoot');
  });
});
