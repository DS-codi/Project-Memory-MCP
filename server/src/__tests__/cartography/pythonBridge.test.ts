import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { spawn } from 'node:child_process';

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

import {
  CartographyBridgeParseError,
  CartographyBridgeTimeoutError,
  CartographyBridgeUnexpectedExitError,
  invokePythonCore,
  type PythonBridgeRequest,
  type PythonBridgeResponse,
} from '../../cartography/runtime/pythonBridge.js';

type MockReadable = EventEmitter;
type MockWritable = EventEmitter & {
  end: ReturnType<typeof vi.fn>;
};

type MockChildProcess = EventEmitter & {
  stdout: MockReadable;
  stderr: MockReadable;
  stdin: MockWritable;
  kill: ReturnType<typeof vi.fn>;
};

function makeRequest(overrides: Partial<PythonBridgeRequest> = {}): PythonBridgeRequest {
  return {
    schema_version: '1.0.0',
    request_id: 'req-001',
    action: 'cartograph',
    args: { scope: 'src' },
    timeout_ms: 250,
    ...overrides,
  };
}

function makeResponse(overrides: Partial<PythonBridgeResponse> = {}): PythonBridgeResponse {
  return {
    schema_version: '1.0.0',
    request_id: 'req-001',
    status: 'ok',
    result: { summary: 'ok' },
    diagnostics: {
      warnings: [],
      errors: [],
      markers: [],
      skipped_paths: [],
    },
    elapsed_ms: 3,
    ...overrides,
  };
}

function createMockChildProcess(): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess;
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();

  const stdin = new EventEmitter() as MockWritable;
  stdin.end = vi.fn();
  child.stdin = stdin;

  child.kill = vi.fn();
  return child;
}

describe('invokePythonCore', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns parsed response on successful subprocess execution', async () => {
    const request = makeRequest({ request_id: 'req-success' });
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = invokePythonCore(request);

    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from(`${JSON.stringify(makeResponse({ request_id: request.request_id }))}\n`));
      child.emit('close', 0);
    });

    const response = await promise;

    expect(response).toEqual(
      makeResponse({
        request_id: request.request_id,
      })
    );
    expect(child.stdin.end).toHaveBeenCalledWith(`${JSON.stringify(request)}\n`, 'utf8');
    expect(vi.mocked(spawn)).toHaveBeenCalledWith(
      'python',
      ['-m', 'memory_cartographer.runtime.entrypoint'],
      expect.objectContaining({
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      })
    );
  });

  it('throws CartographyBridgeTimeoutError and kills process on timeout', async () => {
    vi.useFakeTimers();

    const request = makeRequest({ request_id: 'req-timeout', timeout_ms: 10 });
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = invokePythonCore(request);
    const timeoutRejection = promise.then(
      () => {
        throw new Error('Expected invokePythonCore to reject on timeout');
      },
      (error: unknown) => error
    );

    await vi.advanceTimersByTimeAsync(11);

    const timeoutError = await timeoutRejection;
    expect(timeoutError).toBeInstanceOf(CartographyBridgeTimeoutError);
    expect(timeoutError).toMatchObject({
      errorCode: 'INVOCATION_TIMEOUT',
      requestId: request.request_id,
    });
    expect(child.kill).toHaveBeenCalledWith('SIGKILL');
  });

  it('throws CartographyBridgeParseError on invalid JSON stdout payload', async () => {
    const request = makeRequest({ request_id: 'req-parse' });
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = invokePythonCore(request);

    queueMicrotask(() => {
      child.stdout.emit('data', Buffer.from('not-json\n'));
      child.emit('close', 0);
    });

    await expect(promise).rejects.toBeInstanceOf(CartographyBridgeParseError);
    await expect(promise).rejects.toMatchObject({
      errorCode: 'INVALID_RESPONSE_ENVELOPE',
    });
  });

  it('maps non-zero exit to CartographyBridgeUnexpectedExitError with stderr', async () => {
    const request = makeRequest({ request_id: 'req-exit' });
    const child = createMockChildProcess();
    vi.mocked(spawn).mockReturnValue(child as never);

    const promise = invokePythonCore(request);

    queueMicrotask(() => {
      child.stderr.emit('data', Buffer.from('python traceback'));
      child.emit('close', 7);
    });

    await expect(promise).rejects.toBeInstanceOf(CartographyBridgeUnexpectedExitError);
    await expect(promise).rejects.toMatchObject({
      errorCode: 'UNEXPECTED_EXIT',
    });
    await expect(promise).rejects.toThrow('python traceback');
  });
});
