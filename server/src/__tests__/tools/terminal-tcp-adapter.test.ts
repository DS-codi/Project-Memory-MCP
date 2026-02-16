/**
 * Integration tests for TcpTerminalAdapter — terminal-tcp-adapter.test.ts
 *
 * Uses a mock TCP server that mimics the Rust GUI app.
 * Verifies NDJSON framing, connect/send/await/close lifecycle,
 * heartbeat forwarding, error paths, and timeout behaviour.
 *
 * Step 21 of the MCP Terminal Tool & GUI Approval Flow plan.
 */

import { describe, it, expect, afterEach, vi } from 'vitest';
import * as net from 'node:net';
import { TcpTerminalAdapter } from '../../tools/terminal-tcp-adapter.js';
import type {
  CommandRequest,
  CommandResponse,
  Heartbeat,
} from '../../tools/terminal-ipc-protocol.js';

// =========================================================================
// Mock TCP Server Helper
// =========================================================================

type RespondFn = (msg: CommandResponse | Heartbeat) => void;
type ServerHandler = (
  request: CommandRequest,
  respond: RespondFn,
  socket: net.Socket,
) => void;

interface MockServer {
  server: net.Server;
  port: number;
}

/**
 * Create a mock TCP server that speaks NDJSON, parses incoming
 * CommandRequests, and lets the test handler script responses.
 */
function createMockGuiServer(handler: ServerHandler): Promise<MockServer> {
  return new Promise((resolve) => {
    const server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (!line.trim()) continue;
          try {
            const parsed = JSON.parse(line);
            if (parsed.type === 'command_request') {
              handler(
                parsed as CommandRequest,
                (msg) => {
                  socket.write(JSON.stringify(msg) + '\n');
                },
                socket,
              );
            }
          } catch {
            // Ignore garbled input
          }
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address() as net.AddressInfo;
      resolve({ server, port: addr.port });
    });
  });
}

/** Build a minimal valid CommandRequest. */
function makeRequest(id: string): CommandRequest {
  return {
    type: 'command_request',
    id,
    command: 'echo',
    working_directory: '/tmp',
  };
}

// =========================================================================
// Cleanup
// =========================================================================

/** Tracked adapters + servers for automatic cleanup. */
const adaptersToClose: TcpTerminalAdapter[] = [];
const serversToClose: net.Server[] = [];
const originalEnv = { ...process.env };

afterEach(() => {
  for (const a of adaptersToClose) a.close();
  adaptersToClose.length = 0;
  for (const s of serversToClose) s.close();
  serversToClose.length = 0;
  process.env = { ...originalEnv };
  vi.restoreAllMocks();
});

function track(adapter: TcpTerminalAdapter, server?: net.Server) {
  adaptersToClose.push(adapter);
  if (server) serversToClose.push(server);
}

// =========================================================================
// Tests
// =========================================================================

describe('TcpTerminalAdapter', () => {
  // -----------------------------------------------------------------------
  // 1. Approved flow
  // -----------------------------------------------------------------------
  it('receives an approved CommandResponse and returns it', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      respond({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: 'hello world',
        exit_code: 0,
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-approved'));

    expect(response.type).toBe('command_response');
    expect(response.id).toBe('req-approved');
    expect(response.status).toBe('approved');
    expect(response.output).toBe('hello world');
    expect(response.exit_code).toBe(0);
  });

  // -----------------------------------------------------------------------
  // 2. Declined flow
  // -----------------------------------------------------------------------
  it('receives a declined CommandResponse', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      respond({
        type: 'command_response',
        id: req.id,
        status: 'declined',
        reason: 'User denied the command',
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-declined'));

    expect(response.status).toBe('declined');
    expect(response.reason).toBe('User denied the command');
  });

  // -----------------------------------------------------------------------
  // 3. Timeout flow (GUI-side timeout)
  // -----------------------------------------------------------------------
  it('receives a timeout CommandResponse', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      respond({
        type: 'command_response',
        id: req.id,
        status: 'timeout',
        reason: 'Approval dialog timed out',
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-timeout'));

    expect(response.status).toBe('timeout');
    expect(response.reason).toBe('Approval dialog timed out');
  });

  // -----------------------------------------------------------------------
  // 4. Heartbeat forwarding
  // -----------------------------------------------------------------------
  it('forwards Heartbeat messages to progressCallback before final response', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      // Send two heartbeats then the real response
      respond({
        type: 'heartbeat',
        id: 'hb-1',
        timestamp_ms: 1000,
      } as unknown as CommandResponse);
      respond({
        type: 'heartbeat',
        id: 'hb-2',
        timestamp_ms: 2000,
      } as unknown as CommandResponse);
      respond({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: 'done',
        exit_code: 0,
      });
    });

    const heartbeats: Heartbeat[] = [];
    const adapter = new TcpTerminalAdapter({
      host: '127.0.0.1',
      port,
      progressCallback: (hb) => heartbeats.push(hb),
    });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-hb'));

    expect(response.status).toBe('approved');
    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[0].id).toBe('hb-1');
    expect(heartbeats[0].timestamp_ms).toBe(1000);
    expect(heartbeats[1].id).toBe('hb-2');
    expect(heartbeats[1].timestamp_ms).toBe(2000);
  });

  // -----------------------------------------------------------------------
  // 5. Connection refused (no server running)
  // -----------------------------------------------------------------------
  it('throws when connecting to a port with no server', async () => {
    // Use a port that (almost certainly) has nothing listening
    const adapter = new TcpTerminalAdapter({
      host: '127.0.0.1',
      port: 19999,
    });
    adaptersToClose.push(adapter);

    await expect(adapter.connect()).rejects.toThrow(/TCP connect failed/);
  });

  // -----------------------------------------------------------------------
  // 6. Socket close mid-await
  // -----------------------------------------------------------------------
  it('rejects when server closes socket before responding', async () => {
    const { server, port } = await createMockGuiServer((_req, _respond, socket) => {
      // Immediately close the connection after receiving the request
      socket.end();
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    await expect(
      adapter.sendAndAwait(makeRequest('req-close')),
    ).rejects.toThrow(/Socket closed while awaiting response/);
  });

  // -----------------------------------------------------------------------
  // 7. Partial NDJSON lines (split across TCP writes)
  // -----------------------------------------------------------------------
  it('handles a response split across multiple TCP writes', async () => {
    const { server, port } = await createMockGuiServer((req, _respond, socket) => {
      const full = JSON.stringify({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: 'split result',
        exit_code: 0,
      });

      // Split the JSON string into two chunks (no newline in first chunk)
      const mid = Math.floor(full.length / 2);
      const part1 = full.slice(0, mid);
      const part2 = full.slice(mid) + '\n';

      socket.write(part1);
      // Small delay so the two writes arrive as separate TCP frames
      setTimeout(() => socket.write(part2), 20);
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-split'));

    expect(response.status).toBe('approved');
    expect(response.output).toBe('split result');
  });

  // -----------------------------------------------------------------------
  // 8. Response timeout (server never responds)
  // -----------------------------------------------------------------------
  it('rejects after response timeout when server never responds', async () => {
    const { server, port } = await createMockGuiServer(() => {
      // Intentionally never respond
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();

    // Install fake timers so we don't actually wait 60s
    vi.useFakeTimers();

    const sendPromise = adapter.sendAndAwait(makeRequest('req-never'));

    // Register the rejection handler BEFORE advancing timers
    // so the rejection is caught and doesn't become unhandled
    const expectation = expect(sendPromise).rejects.toThrow(
      /Timeout waiting for response/,
    );

    // Advance past the 60s response timeout
    await vi.advanceTimersByTimeAsync(61_000);

    // Now await the expectation
    await expectation;

    vi.useRealTimers();
  });

  // -----------------------------------------------------------------------
  // 9. connect() is idempotent when already connected
  // -----------------------------------------------------------------------
  it('does not open a second socket when already connected', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      respond({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: 'ok',
        exit_code: 0,
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    await adapter.connect(); // should be a no-op

    const response = await adapter.sendAndAwait(makeRequest('req-idem'));
    expect(response.status).toBe('approved');
  });

  // -----------------------------------------------------------------------
  // 10. close() is safe to call multiple times
  // -----------------------------------------------------------------------
  it('close() is safe to call when already closed', () => {
    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port: 1 });
    // Should not throw even though we never connected
    adapter.close();
    adapter.close();
  });

  // -----------------------------------------------------------------------
  // 11. Reconnect on disconnected socket
  // -----------------------------------------------------------------------
  it('auto-reconnects if socket was closed before sendAndAwait', async () => {
    let connectionCount = 0;
    const { server, port } = await createMockGuiServer((req, respond) => {
      connectionCount++;
      respond({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: `conn-${connectionCount}`,
        exit_code: 0,
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    // Forcibly close to simulate disconnect
    adapter.close();

    // sendAndAwait should trigger reconnect internally
    const response = await adapter.sendAndAwait(makeRequest('req-reconnect'));
    expect(response.status).toBe('approved');
  });

  // -----------------------------------------------------------------------
  // 12. Ignores responses for other request IDs
  // -----------------------------------------------------------------------
  it('ignores CommandResponse with non-matching id', async () => {
    const { server, port } = await createMockGuiServer((req, respond) => {
      // First send a response for a different ID (should be ignored)
      respond({
        type: 'command_response',
        id: 'some-other-id',
        status: 'approved',
        output: 'wrong response',
        exit_code: 0,
      });
      // Then send the correct response
      respond({
        type: 'command_response',
        id: req.id,
        status: 'approved',
        output: 'correct response',
        exit_code: 0,
      });
    });

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.1', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-match'));

    expect(response.id).toBe('req-match');
    expect(response.output).toBe('correct response');
  });

  // -----------------------------------------------------------------------
  // 13. Container candidate fallback success
  // -----------------------------------------------------------------------
  it('in container mode, falls back through host candidates and connects to the first reachable host', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY = '127.0.0.2';

    const server = net.createServer((socket) => {
      let buffer = '';
      socket.on('data', (chunk) => {
        buffer += chunk.toString('utf8');
        let idx: number;
        while ((idx = buffer.indexOf('\n')) !== -1) {
          const line = buffer.slice(0, idx);
          buffer = buffer.slice(idx + 1);
          if (!line.trim()) continue;
          const parsed = JSON.parse(line) as CommandRequest;
          socket.write(
            JSON.stringify({
              type: 'command_response',
              id: parsed.id,
              status: 'approved',
              output: 'fallback-ok',
              exit_code: 0,
            }) + '\n',
          );
        }
      });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.3', () => resolve()));
    const addr = server.address() as net.AddressInfo;
    const port = addr.port;

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.3', port });
    track(adapter, server);

    await adapter.connect();
    const response = await adapter.sendAndAwait(makeRequest('req-container-fallback'));
    expect(response.status).toBe('approved');
    expect(response.output).toBe('fallback-ok');
  });

  // -----------------------------------------------------------------------
  // 14. Container all-candidates-failed diagnostics
  // -----------------------------------------------------------------------
  it('in container mode, returns transparent attempted-host diagnostics when all candidates fail', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY = '127.0.0.2';

    const probe = net.createServer();
    await new Promise<void>((resolve) => probe.listen(0, '127.0.0.1', () => resolve()));
    const probeAddress = probe.address() as net.AddressInfo;
    const unavailablePort = probeAddress.port;
    await new Promise<void>((resolve, reject) => probe.close((err) => (err ? reject(err) : resolve())));

    const adapter = new TcpTerminalAdapter({ host: '127.0.0.3', port: unavailablePort });
    adaptersToClose.push(adapter);

    const result = await adapter.connect().then(
      () => ({ ok: true as const, error: null }),
      (error: unknown) => ({ ok: false as const, error }),
    );

    expect(result.ok).toBe(false);
    const message =
      result.error instanceof Error ? result.error.message : String(result.error);

    expect(message).toMatch(/trying 6 host candidate\(s\) on port/);
    expect(message).toMatch(new RegExp(`127\\.0\\.0\\.2:${unavailablePort}`));
    expect(message).toMatch(new RegExp(`127\\.0\\.0\\.3:${unavailablePort}`));
    expect(message).toMatch(new RegExp(`host\\.containers\\.internal:${unavailablePort}`));
    expect(message).toMatch(new RegExp(`host\\.docker\\.internal:${unavailablePort}`));
    expect(message).toMatch(new RegExp(`127\\.0\\.0\\.1:${unavailablePort}`));
    expect(message).toMatch(new RegExp(`localhost:${unavailablePort}`));
  });
});
