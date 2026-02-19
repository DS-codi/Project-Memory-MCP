/**
 * Container Startup Alert Tests
 *
 * Verifies:
 *  - sendStartupAlert sends a POST to the configured host/port
 *  - sendStartupAlert is fire-and-forget (resolves even when target is down)
 *  - Skips silently when MBS_ALERT_HOST is not set
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

// We need to control env vars before importing, so use dynamic import
let sendStartupAlert: typeof import('../../transport/container-startup-alert.js').sendStartupAlert;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('sendStartupAlert', () => {
  const originalEnv = { ...process.env };

  beforeEach(async () => {
    // Reset module cache to pick up fresh env vars
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('sends POST to /container-ready on the configured host:port', async () => {
    // Set up a tiny HTTP server to receive the alert
    const received: string[] = [];
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        received.push(body);
        res.writeHead(200);
        res.end();
      });
    });

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as AddressInfo).port;

    // Set env vars
    process.env.MBS_ALERT_HOST = '127.0.0.1';
    process.env.MBS_ALERT_PORT = String(port);

    // Dynamic import with fresh env
    const mod = await import('../../transport/container-startup-alert.js');
    sendStartupAlert = mod.sendStartupAlert;

    await sendStartupAlert(3000, '1.0.0', 'streamable-http');

    // Give the server time to process
    await new Promise((r) => setTimeout(r, 200));

    server.close();

    expect(received).toHaveLength(1);
    const payload = JSON.parse(received[0]);
    expect(payload.url).toBe('http://localhost:3000');
    expect(payload.version).toBe('1.0.0');
    expect(payload.transport).toBe('streamable-http');
  });

  it('resolves successfully when target is unreachable (fire-and-forget)', async () => {
    process.env.MBS_ALERT_HOST = '127.0.0.1';
    process.env.MBS_ALERT_PORT = '19999'; // nothing listening here

    const mod = await import('../../transport/container-startup-alert.js');

    // Should not throw
    await expect(mod.sendStartupAlert(3000, '1.0.0')).resolves.toBeUndefined();
  });

  it('skips when MBS_ALERT_HOST is not set', async () => {
    delete process.env.MBS_ALERT_HOST;

    const mod = await import('../../transport/container-startup-alert.js');

    // Should not throw, just silently skip
    await expect(mod.sendStartupAlert(3000, '1.0.0')).resolves.toBeUndefined();
  });
});
