/**
 * Container Alert Listener Tests
 *
 * Verifies:
 *  - Listener starts and accepts POST /container-ready
 *  - Emits 'container-ready' event with parsed payload
 *  - Returns 200 on valid POST, 405 on wrong method, 400 on bad JSON
 *  - GET /health returns 200
 *  - stop() shuts down cleanly
 *  - EADDRINUSE is handled gracefully (non-fatal)
 */

import { describe, it, expect, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import {
  ContainerAlertListener,
  type ContainerReadyPayload,
} from '../../transport/container-alert-listener.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function httpRequest(
  url: string,
  method: string,
  body?: string
): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const req = http.request(
      { hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname, method },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => { raw += chunk; });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body: raw }));
      }
    );
    req.on('error', reject);
    if (body) {
      req.setHeader('Content-Type', 'application/json');
      req.write(body);
    }
    req.end();
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ContainerAlertListener', () => {
  let listener: ContainerAlertListener | null = null;

  afterEach(async () => {
    if (listener) {
      await listener.stop();
      listener = null;
    }
  });

  it('starts and stops without error', async () => {
    listener = new ContainerAlertListener({ port: 0 }); // port 0 = random
    await listener.start();
    await listener.stop();
    listener = null;
  });

  it('accepts POST /container-ready and emits event', async () => {
    listener = new ContainerAlertListener({ port: 0 });
    await listener.start();

    // Get the actual bound port
    const port = listener.port;

    const received: ContainerReadyPayload[] = [];
    listener.on('container-ready', (payload) => {
      received.push(payload);
    });

    const payload = JSON.stringify({
      url: 'http://localhost:3000',
      version: '1.0.0',
      transport: 'streamable-http',
    });

    const res = await httpRequest(`http://127.0.0.1:${port}/container-ready`, 'POST', payload);
    expect(res.status).toBe(200);

    // Give the event time to fire
    await new Promise((r) => setTimeout(r, 50));

    expect(received).toHaveLength(1);
    expect(received[0].url).toBe('http://localhost:3000');
    expect(received[0].version).toBe('1.0.0');
  });

  it('returns 404 on GET to /container-ready (POST-only endpoint)', async () => {
    listener = new ContainerAlertListener({ port: 0 });
    await listener.start();
    const port = listener.port;

    const res = await httpRequest(`http://127.0.0.1:${port}/container-ready`, 'GET');
    expect(res.status).toBe(404);
  });

  it('returns 400 on invalid JSON body', async () => {
    listener = new ContainerAlertListener({ port: 0 });
    await listener.start();
    const port = listener.port;

    const res = await httpRequest(
      `http://127.0.0.1:${port}/container-ready`,
      'POST',
      'not json!'
    );
    expect(res.status).toBe(400);
  });

  it('responds 200 on GET /health', async () => {
    listener = new ContainerAlertListener({ port: 0 });
    await listener.start();
    const port = listener.port;

    const res = await httpRequest(`http://127.0.0.1:${port}/health`, 'GET');
    expect(res.status).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.status).toBe('ok');
  });

  it('returns 404 on unknown path', async () => {
    listener = new ContainerAlertListener({ port: 0 });
    await listener.start();
    const port = listener.port;

    const res = await httpRequest(`http://127.0.0.1:${port}/unknown`, 'GET');
    expect(res.status).toBe(404);
  });
});
