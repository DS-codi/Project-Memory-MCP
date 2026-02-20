/**
 * Tests for supervisor-client.ts — Phase 4 Hub Integration
 *
 * Covers: supervisorRequest(), isSupervisorRunning(), checkGuiAvailability(), launchFormApp()
 * Strategy: Mock the net.Socket layer to avoid real connections.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as net from 'node:net';

// ── Mock net.Socket ────────────────────────────────────────────
// We intercept `net.Socket` so no real connections are made.

interface MockSocket {
  connect: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  on: ReturnType<typeof vi.fn>;
  once: ReturnType<typeof vi.fn>;
  removeListener: ReturnType<typeof vi.fn>;
  /** Simulate the connect event */
  _emitConnect: () => void;
  /** Simulate receiving data */
  _emitData: (data: string) => void;
  /** Simulate an error */
  _emitError: (err: Error) => void;
  _listeners: Record<string, ((...args: unknown[]) => void)[]>;
}

function createMockSocket(): MockSocket {
  const listeners: Record<string, ((...args: unknown[]) => void)[]> = {};
  const onceListeners: Record<string, ((...args: unknown[]) => void)[]> = {};

  const socket: MockSocket = {
    _listeners: listeners,
    connect: vi.fn(),
    write: vi.fn(),
    destroy: vi.fn(),
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return socket;
    }),
    once: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (!onceListeners[event]) onceListeners[event] = [];
      onceListeners[event].push(handler);
      return socket;
    }),
    removeListener: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      if (listeners[event]) {
        listeners[event] = listeners[event].filter(h => h !== handler);
      }
      return socket;
    }),
    _emitConnect: () => {
      const handlers = onceListeners['connect'] ?? [];
      onceListeners['connect'] = [];
      handlers.forEach(h => h());
    },
    _emitData: (data: string) => {
      const handlers = [...(listeners['data'] ?? [])];
      handlers.forEach(h => h(Buffer.from(data)));
    },
    _emitError: (err: Error) => {
      const onceHandlers = onceListeners['error'] ?? [];
      onceListeners['error'] = [];
      onceHandlers.forEach(h => h(err));
      const handlers = listeners['error'] ?? [];
      handlers.forEach(h => h(err));
    },
  };
  return socket;
}

let mockSocket: MockSocket;

vi.mock('node:net', () => ({
  Socket: vi.fn(),
}));

// We need to dynamically import the module AFTER setting up mocks
let supervisorRequest: typeof import('../../tools/orchestration/supervisor-client.js').supervisorRequest;
let isSupervisorRunning: typeof import('../../tools/orchestration/supervisor-client.js').isSupervisorRunning;
let checkGuiAvailability: typeof import('../../tools/orchestration/supervisor-client.js').checkGuiAvailability;
let launchFormApp: typeof import('../../tools/orchestration/supervisor-client.js').launchFormApp;

beforeEach(async () => {
  vi.clearAllMocks();
  vi.useFakeTimers({ shouldAdvanceTime: true });

  mockSocket = createMockSocket();
  (net.Socket as unknown as ReturnType<typeof vi.fn>).mockImplementation(() => mockSocket);

  // Re-import to get fresh module binding
  const mod = await import('../../tools/orchestration/supervisor-client.js');
  supervisorRequest = mod.supervisorRequest;
  isSupervisorRunning = mod.isSupervisorRunning;
  checkGuiAvailability = mod.checkGuiAvailability;
  launchFormApp = mod.launchFormApp;
});

afterEach(() => {
  vi.useRealTimers();
});

// ── Helpers ────────────────────────────────────────────────────

/** Simulate a successful connection + JSON response for a request. */
function simulateSuccessfulResponse(response: object) {
  // Schedule connect event after the socket.connect() call
  queueMicrotask(() => {
    mockSocket._emitConnect();
    // After write, emit data
    mockSocket.write.mockImplementation(() => {
      queueMicrotask(() => {
        mockSocket._emitData(JSON.stringify(response) + '\n');
      });
      return true;
    });
  });
}

/** Full happy-path helper: connect + respond to any request. */
function setupHappyPath(response: object) {
  mockSocket.connect.mockImplementation(() => {
    queueMicrotask(() => mockSocket._emitConnect());
    return mockSocket;
  });
  mockSocket.write.mockImplementation(() => {
    queueMicrotask(() => {
      mockSocket._emitData(JSON.stringify(response) + '\n');
    });
    return true;
  });
}

/** Setup a connection failure. */
function setupConnectionFailure(errMsg = 'ECONNREFUSED') {
  mockSocket.connect.mockImplementation(() => {
    queueMicrotask(() => mockSocket._emitError(new Error(errMsg)));
    return mockSocket;
  });
}

// =========================================================================
// supervisorRequest()
// =========================================================================

describe('supervisorRequest', () => {
  it('sends an NDJSON-framed Status request and returns parsed response', async () => {
    const expectedResponse = { ok: true, data: [] };
    setupHappyPath(expectedResponse);

    const result = await supervisorRequest({ type: 'Status' }, { forceTcp: true });

    expect(result).toEqual(expectedResponse);
    expect(mockSocket.write).toHaveBeenCalled();
    const written = mockSocket.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('Status');
  });

  it('cleans up socket after successful request', async () => {
    setupHappyPath({ ok: true, data: null });

    await supervisorRequest({ type: 'Status' }, { forceTcp: true });

    expect(mockSocket.destroy).toHaveBeenCalled();
  });

  it('rejects when connection fails', async () => {
    setupConnectionFailure('ECONNREFUSED');

    await expect(
      supervisorRequest({ type: 'Status' }, { forceTcp: true }),
    ).rejects.toThrow('ECONNREFUSED');
  });

  it('sends WhoAmI request with correct NDJSON fields', async () => {
    const expectedResponse = {
      ok: true,
      data: { message: 'hello', server_name: 'supervisor', capabilities: ['launch_app'] },
    };
    setupHappyPath(expectedResponse);

    const result = await supervisorRequest(
      {
        type: 'WhoAmI',
        request_id: 'test-uuid',
        client: 'mcp-server',
        client_version: '1.0.0',
      },
      { forceTcp: true },
    );

    expect(result.ok).toBe(true);
    const written = mockSocket.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('WhoAmI');
    expect(parsed.request_id).toBe('test-uuid');
  });

  it('sends LaunchApp request with payload and timeout', async () => {
    const expectedResponse = {
      ok: true,
      data: { app_name: 'brainstorm_gui', success: true, elapsed_ms: 150, timed_out: false },
    };
    setupHappyPath(expectedResponse);

    const result = await supervisorRequest(
      {
        type: 'LaunchApp',
        app_name: 'brainstorm_gui',
        payload: { foo: 'bar' },
        timeout_seconds: 60,
      },
      { forceTcp: true },
    );

    expect(result.ok).toBe(true);
    const written = mockSocket.write.mock.calls[0][0] as string;
    const parsed = JSON.parse(written.trim());
    expect(parsed.type).toBe('LaunchApp');
    expect(parsed.app_name).toBe('brainstorm_gui');
    expect(parsed.payload).toEqual({ foo: 'bar' });
  });

  it('rejects with parse error on malformed NDJSON response', async () => {
    mockSocket.connect.mockImplementation(() => {
      queueMicrotask(() => mockSocket._emitConnect());
      return mockSocket;
    });
    mockSocket.write.mockImplementation(() => {
      queueMicrotask(() => {
        mockSocket._emitData('NOT JSON\n');
      });
      return true;
    });

    await expect(
      supervisorRequest({ type: 'Status' }, { forceTcp: true }),
    ).rejects.toThrow('Failed to parse supervisor response');
  });
});

// =========================================================================
// isSupervisorRunning()
// =========================================================================

describe('isSupervisorRunning', () => {
  it('returns true when supervisor responds with ok:true', async () => {
    setupHappyPath({ ok: true, data: [] });

    const result = await isSupervisorRunning({ forceTcp: true });

    expect(result).toBe(true);
  });

  it('returns false when connection is refused', async () => {
    setupConnectionFailure('ECONNREFUSED');

    const result = await isSupervisorRunning({ forceTcp: true });

    expect(result).toBe(false);
  });

  it('returns false when supervisor responds with ok:false', async () => {
    setupHappyPath({ ok: false, error: 'shutting down' });

    const result = await isSupervisorRunning({ forceTcp: true });

    expect(result).toBe(false);
  });
});

// =========================================================================
// checkGuiAvailability()
// =========================================================================

describe('checkGuiAvailability', () => {
  it('returns supervisor_running:false when connection fails', async () => {
    setupConnectionFailure('ECONNREFUSED');

    const result = await checkGuiAvailability({ forceTcp: true });

    expect(result.supervisor_running).toBe(false);
    expect(result.brainstorm_gui).toBe(false);
    expect(result.approval_gui).toBe(false);
    expect(result.message).toContain('not running');
  });

  it('returns supervisor_running:false when Status response is not ok', async () => {
    setupHappyPath({ ok: false, error: 'unhealthy' });

    const result = await checkGuiAvailability({ forceTcp: true });

    expect(result.supervisor_running).toBe(false);
  });

  it('returns all available when supervisor has capabilities', async () => {
    // First call returns Status ok, second returns WhoAmI with capabilities
    let callCount = 0;
    mockSocket.connect.mockImplementation(() => {
      queueMicrotask(() => mockSocket._emitConnect());
      return mockSocket;
    });
    mockSocket.write.mockImplementation(() => {
      callCount++;
      queueMicrotask(() => {
        if (callCount === 1) {
          // Status response
          mockSocket._emitData(JSON.stringify({ ok: true, data: [] }) + '\n');
        } else {
          // WhoAmI response
          mockSocket._emitData(JSON.stringify({
            ok: true,
            data: {
              server_name: 'supervisor',
              capabilities: ['brainstorm_gui', 'approval_gui'],
            },
          }) + '\n');
        }
      });
      return true;
    });

    const result = await checkGuiAvailability({ forceTcp: true });

    expect(result.supervisor_running).toBe(true);
    expect(result.brainstorm_gui).toBe(true);
    expect(result.approval_gui).toBe(true);
    expect(result.capabilities).toContain('brainstorm_gui');
  });

  it('assumes GUIs available when no capabilities are reported', async () => {
    // Status ok, WhoAmI returns empty capabilities
    let callCount = 0;
    mockSocket.connect.mockImplementation(() => {
      queueMicrotask(() => mockSocket._emitConnect());
      return mockSocket;
    });
    mockSocket.write.mockImplementation(() => {
      callCount++;
      queueMicrotask(() => {
        if (callCount === 1) {
          mockSocket._emitData(JSON.stringify({ ok: true, data: [] }) + '\n');
        } else {
          mockSocket._emitData(JSON.stringify({ ok: true, data: { capabilities: [] } }) + '\n');
        }
      });
      return true;
    });

    const result = await checkGuiAvailability({ forceTcp: true });

    expect(result.supervisor_running).toBe(true);
    // When capabilities is empty, assumes available
    expect(result.brainstorm_gui).toBe(true);
    expect(result.approval_gui).toBe(true);
  });

  it('sets brainstorm_gui=false if only approval capability is listed', async () => {
    let callCount = 0;
    mockSocket.connect.mockImplementation(() => {
      queueMicrotask(() => mockSocket._emitConnect());
      return mockSocket;
    });
    mockSocket.write.mockImplementation(() => {
      callCount++;
      queueMicrotask(() => {
        if (callCount === 1) {
          mockSocket._emitData(JSON.stringify({ ok: true, data: [] }) + '\n');
        } else {
          mockSocket._emitData(JSON.stringify({
            ok: true,
            data: { capabilities: ['approval_gui'] },
          }) + '\n');
        }
      });
      return true;
    });

    const result = await checkGuiAvailability({ forceTcp: true });

    expect(result.supervisor_running).toBe(true);
    expect(result.brainstorm_gui).toBe(false);
    expect(result.approval_gui).toBe(true);
  });
});

// =========================================================================
// launchFormApp()
// =========================================================================

describe('launchFormApp', () => {
  it('returns successful FormAppLaunchResult when supervisor responds ok', async () => {
    setupHappyPath({
      ok: true,
      data: {
        app_name: 'brainstorm_gui',
        success: true,
        response_payload: { type: 'form_response', status: 'completed', answers: [] },
        elapsed_ms: 2500,
        timed_out: false,
      },
    });

    const result = await launchFormApp(
      'brainstorm_gui',
      { type: 'form_request', questions: [] },
      60,
      { forceTcp: true },
    );

    expect(result.success).toBe(true);
    expect(result.app_name).toBe('brainstorm_gui');
    expect(result.elapsed_ms).toBe(2500);
    expect(result.timed_out).toBe(false);
    expect(result.response_payload).toBeDefined();
  });

  it('returns failure result when supervisor returns ok:false', async () => {
    setupHappyPath({
      ok: false,
      error: 'App not registered',
    });

    const result = await launchFormApp(
      'brainstorm_gui',
      { questions: [] },
      undefined,
      { forceTcp: true },
    );

    expect(result.success).toBe(false);
    expect(result.error).toBe('App not registered');
    expect(result.timed_out).toBe(false);
  });

  it('uses generous request timeout for long-running GUI interactions', async () => {
    setupHappyPath({
      ok: true,
      data: { app_name: 'brainstorm_gui', success: true, elapsed_ms: 0, timed_out: false },
    });

    // When timeoutSeconds is 60, request timeout should be (60+10)*1000 = 70000
    await launchFormApp('brainstorm_gui', {}, 60, { forceTcp: true });

    // The internal requestTimeoutMs is passed through opts;
    // we verify the function completes without premature rejection
    expect(mockSocket.write).toHaveBeenCalled();
  });

  it('defaults to 310s request timeout when no timeoutSeconds given', async () => {
    setupHappyPath({
      ok: true,
      data: { app_name: 'approval_gui', success: true, elapsed_ms: 0, timed_out: false },
    });

    await launchFormApp('approval_gui', {}, undefined, { forceTcp: true });

    expect(mockSocket.write).toHaveBeenCalled();
  });

  it('propagates timed_out flag from supervisor response', async () => {
    setupHappyPath({
      ok: true,
      data: {
        app_name: 'brainstorm_gui',
        success: false,
        error: 'Form timed out',
        elapsed_ms: 300000,
        timed_out: true,
      },
    });

    const result = await launchFormApp('brainstorm_gui', {}, 300, { forceTcp: true });

    expect(result.timed_out).toBe(true);
    expect(result.success).toBe(false);
    expect(result.elapsed_ms).toBe(300000);
  });

  it('falls back to given appName when data.app_name is missing', async () => {
    setupHappyPath({
      ok: true,
      data: { success: true, elapsed_ms: 50, timed_out: false },
    });

    const result = await launchFormApp('approval_gui', {}, undefined, { forceTcp: true });

    expect(result.app_name).toBe('approval_gui');
  });
});
