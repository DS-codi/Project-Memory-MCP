import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  memoryTerminal,
  classifyCommand,
  splitOutputIntoStreams,
  summarizeOutput,
  type MemoryTerminalParams,
  type McpToolExtra,
} from '../../tools/consolidated/memory_terminal.js';

// Mock file-store so disk operations don't touch real filesystem
vi.mock('../../storage/db-store.js', () => ({
  getWorkspacePath: (wsId: string) => `/tmp/test-data/${wsId}`,
  getWorkspace: vi.fn().mockResolvedValue(null),
}));

// Mock node:fs/promises to avoid real disk I/O
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

const mockAdapterConnect = vi
  .fn()
  .mockRejectedValue(new Error('TCP connect failed: connect ECONNREFUSED 127.0.0.1:9100'));
const mockAdapterSendAndAwait = vi.fn();
const mockAdapterSendReadOutput = vi.fn();
const mockAdapterSendKill = vi.fn();
const mockAdapterClose = vi.fn();
const adapterOptionsHistory: any[] = [];

// Mock TcpTerminalAdapter so tests don't require a running GUI on port 9100.
// This simulates the expected "no GUI running" environment so all TCP-dependent
// tests get immediate ECONNREFUSED errors instead of live execution.
vi.mock('../../tools/terminal-tcp-adapter.js', () => ({
  TcpTerminalAdapter: vi.fn().mockImplementation((options?: unknown) => {
    adapterOptionsHistory.push(options);
    return {
      connect: mockAdapterConnect,
      sendAndAwait: mockAdapterSendAndAwait,
      sendReadOutput: mockAdapterSendReadOutput,
      sendKill: mockAdapterSendKill,
      close: mockAdapterClose,
    };
  }),
}));

// ---------------------------------------------------------------------------
// Action Routing
// ---------------------------------------------------------------------------

describe('memoryTerminal action routing', () => {
  it('returns error for unknown action', async () => {
    const result = await memoryTerminal({ action: 'nonexistent' as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Unknown action');
    expect(result.error).toContain('nonexistent');
  });

  it('returns error for run without command', async () => {
    const result = await memoryTerminal({ action: 'run' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('command is required');
  });

  it('returns error for read_output without session_id', async () => {
    const result = await memoryTerminal({ action: 'read_output' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id is required');
  });

  it('returns error for kill without session_id', async () => {
    const result = await memoryTerminal({ action: 'kill' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id is required');
  });

  it('returns error for update_allowlist without patterns', async () => {
    const result = await memoryTerminal({ action: 'update_allowlist' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('patterns and operation are required');
  });

  it('returns error for update_allowlist without operation', async () => {
    const result = await memoryTerminal({
      action: 'update_allowlist',
      patterns: ['echo *'],
    } as MemoryTerminalParams);
    expect(result.success).toBe(false);
    expect(result.error).toContain('patterns and operation are required');
  });

  it('get_allowlist succeeds without workspace_id', async () => {
    const result = await memoryTerminal({ action: 'get_allowlist' });
    expect(result.success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// classifyCommand() three-way authorization
// ---------------------------------------------------------------------------

describe('classifyCommand three-way authorization', () => {
  it('blocks destructive command (rm -rf /)', async () => {
    const result = await classifyCommand('rm', ['-rf', '/']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toContain('Destructive');
    }
  });

  it('blocks destructive command (Remove-Item)', async () => {
    const result = await classifyCommand('Remove-Item', ['file.txt']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toContain('Destructive');
    }
  });

  it('blocks destructive command (shutdown)', async () => {
    const result = await classifyCommand('shutdown', ['/s']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toContain('Destructive');
    }
  });

  it('blocks shell operators (pipe)', async () => {
    const result = await classifyCommand('echo', ['foo', '|', 'cat']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toBe('Shell operators not allowed');
    }
  });

  it('blocks shell operators (redirect >)', async () => {
    const result = await classifyCommand('echo', ['foo', '>', 'file.txt']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toBe('Shell operators not allowed');
    }
  });

  it('blocks shell operators (backtick)', async () => {
    const result = await classifyCommand('echo', ['`whoami`']);
    expect(result.decision).toBe('blocked');
    if (result.decision === 'blocked') {
      expect(result.reason).toBe('Shell operators not allowed');
    }
  });

  it('blocks shell operators (semicolon in command string)', async () => {
    const result = await classifyCommand('echo hello; rm -rf /', []);
    expect(result.decision).toBe('blocked');
  });

  it('allows allowlisted command (git status)', async () => {
    const result = await classifyCommand('git', ['status']);
    expect(result.decision).toBe('allowed');
  });

  it('allows allowlisted command (npm test)', async () => {
    const result = await classifyCommand('npm', ['test']);
    expect(result.decision).toBe('allowed');
  });

  it('allows allowlisted command (echo)', async () => {
    const result = await classifyCommand('echo', ['hello']);
    expect(result.decision).toBe('allowed');
  });

  it('allows allowlisted command (npx vitest)', async () => {
    const result = await classifyCommand('npx', ['vitest']);
    expect(result.decision).toBe('allowed');
  });

  it('returns needs_approval for non-allowlisted, non-destructive command', async () => {
    const result = await classifyCommand('some-custom-tool', ['--verbose']);
    expect(result.decision).toBe('needs_approval');
  });

  it('returns needs_approval for unknown command without args', async () => {
    const result = await classifyCommand('my-internal-script', []);
    expect(result.decision).toBe('needs_approval');
  });

  it('destructive check takes priority over allowlist', async () => {
    const result = await classifyCommand('rm', ['some-file.txt']);
    expect(result.decision).toBe('blocked');
  });
});

// ---------------------------------------------------------------------------
// Output summary helpers
// ---------------------------------------------------------------------------

describe('memoryTerminal output summary helpers', () => {
  it('splits mixed output into stdout/stderr streams', () => {
    const combined = [
      'stdout line 1',
      '[stderr] stderr line 1',
      'stdout line 2',
      '[stderr] stderr line 2',
    ].join('\n');

    const result = splitOutputIntoStreams(combined);

    expect(result.stdout).toBe('stdout line 1\nstdout line 2');
    expect(result.stderr).toBe('stderr line 1\nstderr line 2');
  });

  it('summarizes output to first 2000 chars by default', () => {
    const longText = 'x'.repeat(2500);
    const result = summarizeOutput(longText);

    expect(result.summary).toHaveLength(2000);
    expect(result.truncated).toBe(true);
  });

  it('does not truncate when output length is within limit', () => {
    const shortText = 'short output';
    const result = summarizeOutput(shortText);

    expect(result.summary).toBe(shortText);
    expect(result.truncated).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Heartbeat lifecycle
// ---------------------------------------------------------------------------

describe('heartbeat lifecycle', () => {
  let setIntervalSpy: ReturnType<typeof vi.spyOn>;
  let clearIntervalSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    setIntervalSpy = vi.spyOn(global, 'setInterval');
    clearIntervalSpy = vi.spyOn(global, 'clearInterval');
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    clearIntervalSpy.mockRestore();
  });

  it('blocked command does NOT start heartbeat', async () => {
    const sendNotification = vi.fn();
    const extra: McpToolExtra = { sendNotification };

    await memoryTerminal(
      { action: 'run', command: 'rm', args: ['-rf', '/'] },
      extra,
    );

    // setInterval should NOT have been called for a blocked command
    expect(setIntervalSpy).not.toHaveBeenCalled();
    expect(sendNotification).not.toHaveBeenCalled();
  });

  it('allowed command starts and stops heartbeat (setInterval + clearInterval)', async () => {
    const sendNotification = vi.fn();
    const extra: McpToolExtra = { sendNotification };

    await memoryTerminal(
      { action: 'run', command: 'git', args: ['status'] },
      extra,
    );

    // startHeartbeat should have called setInterval
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(setIntervalSpy).toHaveBeenCalledWith(expect.any(Function), 10_000);

    // stopHeartbeat should have called clearInterval
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('needs_approval command also starts heartbeat', async () => {
    const sendNotification = vi.fn();
    const extra: McpToolExtra = { sendNotification };

    await memoryTerminal(
      { action: 'run', command: 'some-custom-tool', args: ['--flag'] },
      extra,
    );

    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    expect(clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  it('heartbeat does not start when sendNotification is missing', async () => {
    const extra: McpToolExtra = {};

    await memoryTerminal(
      { action: 'run', command: 'git', args: ['status'] },
      extra,
    );

    // No sendNotification -> startHeartbeat should be a no-op
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('AbortSignal registers abort listener for cleanup', async () => {
    const sendNotification = vi.fn();
    const controller = new AbortController();
    const extra: McpToolExtra = {
      sendNotification,
      signal: controller.signal,
    };

    const addEventSpy = vi.spyOn(controller.signal, 'addEventListener');

    await memoryTerminal(
      { action: 'run', command: 'git', args: ['status'] },
      extra,
    );

    // Abort listener should have been registered
    expect(addEventSpy).toHaveBeenCalledWith(
      'abort',
      expect.any(Function),
      { once: true },
    );

    addEventSpy.mockRestore();
  });

  it('heartbeat calls sendNotification when interval fires', async () => {
    vi.useFakeTimers();
    const sendNotification = vi.fn();
    const extra: McpToolExtra = { sendNotification };

    // Capture the heartbeat callback via setInterval spy
    const originalSetInterval = global.setInterval;
    let heartbeatCallback: (() => void) | undefined;

    setIntervalSpy.mockImplementation(((fn: () => void, ms: number) => {
      heartbeatCallback = fn;
      return originalSetInterval(fn, ms);
    }) as typeof global.setInterval);

    await memoryTerminal(
      { action: 'run', command: 'git', args: ['status'] },
      extra,
    );

    // The heartbeat was started and stopped, but we captured the callback
    if (heartbeatCallback) {
      heartbeatCallback();
      expect(sendNotification).toHaveBeenCalledTimes(1);
      expect(sendNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          method: 'notifications/progress',
          params: expect.objectContaining({
            message: 'Waiting for terminal command response...',
          }),
        }),
      );
    }

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// Run action integration
// ---------------------------------------------------------------------------

describe('memoryTerminal run action integration', () => {
  beforeEach(() => {
    mockAdapterConnect.mockReset();
    mockAdapterSendAndAwait.mockReset();
    mockAdapterSendReadOutput.mockReset();
    mockAdapterSendKill.mockReset();
    mockAdapterClose.mockReset();
    adapterOptionsHistory.length = 0;

    mockAdapterConnect.mockRejectedValue(
      new Error('TCP connect failed: connect ECONNREFUSED 127.0.0.1:9100'),
    );
  });

  it('blocked command returns error and does NOT mention TCP adapter', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'rm',
      args: ['-rf', '/'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Command blocked');
    expect(result.error).toContain('Destructive');
    // Blocked before reaching TCP adapter placeholder
    expect(result.error).not.toContain('TCP adapter');
  });

  it('allowed command attempts TCP connection to GUI', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'git',
      args: ['status'],
      workspace_id: 'ws_test_123',
    });

    // With no GUI running, the TCP adapter should fail to connect
    expect(result.success).toBe(false);
    expect(result.error).toContain('TCP connect failed');
  });

  it('needs_approval command attempts TCP connection to GUI', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'some-custom-tool',
      args: ['--flag'],
      workspace_id: 'ws_test_456',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('TCP connect failed');
  });

  it('run action returns TCP connect error when GUI is not running', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'echo',
      args: ['hello'],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Terminal run error');
    expect(result.error).toContain('127.0.0.1:9100');
  });

  it('run with cwd accepts custom working directory without crashing', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'npm',
      args: ['test'],
      cwd: '/custom/working/dir',
    });

    expect(result.success).toBe(false);
    // Should fail at TCP connect, not at parameter validation
    expect(result.error).toContain('Terminal run error');
  });

  it('run without args still attempts TCP connection', async () => {
    const result = await memoryTerminal({
      action: 'run',
      command: 'ls',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Terminal run error');
  });

  it('streams OutputChunk messages via notifications/progress before final response', async () => {
    mockAdapterConnect.mockResolvedValueOnce(undefined);
    mockAdapterSendAndAwait.mockImplementationOnce(async (request: { id: string }) => {
      const options = adapterOptionsHistory[adapterOptionsHistory.length - 1] as {
        progressCallback?: (event: unknown) => void;
      };
      options?.progressCallback?.({
        type: 'output_chunk',
        id: request.id,
        chunk: 'chunk-1',
      });
      options?.progressCallback?.({
        type: 'output_chunk',
        id: request.id,
        chunk: 'chunk-2',
      });
      return {
        type: 'command_response',
        id: request.id,
        status: 'approved',
        output: 'chunk-1chunk-2',
        exit_code: 0,
      };
    });

    const sendNotification = vi.fn();
    const result = await memoryTerminal(
      {
        action: 'run',
        command: 'git',
        args: ['status'],
      },
      { sendNotification },
    );

    expect(result.success).toBe(true);
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'notifications/progress',
        params: expect.objectContaining({ message: 'chunk-1' }),
      }),
    );
    expect(sendNotification).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'notifications/progress',
        params: expect.objectContaining({ message: 'chunk-2' }),
      }),
    );
  });
});

// ---------------------------------------------------------------------------
// Allowlist round-trip behaviors (Step 16)
// ---------------------------------------------------------------------------
// Server-side allowlist logic (get_allowlist / update_allowlist actions).
// GUI visibility of the allowlist panel is a QML feature that cannot be
// automated via unit tests — manually validate that the QML AllowlistPanel
// reflects backend state after add/remove operations in the running app.
// ---------------------------------------------------------------------------

describe('memoryTerminal allowlist round-trip behaviors', () => {
  it('get_allowlist returns a non-empty patterns array for a workspace', async () => {
    const result = await memoryTerminal({
      action: 'get_allowlist',
      workspace_id: 'ws-allowlist-get-001',
    });
    expect(result.success).toBe(true);
    const data = result.data as { patterns: string[]; workspace_id: string; message: string };
    expect(Array.isArray(data.patterns)).toBe(true);
    expect(data.patterns.length).toBeGreaterThan(0);
    expect(data.workspace_id).toBe('ws-allowlist-get-001');
  });

  it('update_allowlist add inserts a new pattern and succeeds', async () => {
    const wsId = 'ws-allowlist-add-001';
    const result = await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: wsId,
      patterns: ['my-custom-tool *'],
      operation: 'add',
    } as MemoryTerminalParams);

    expect(result.success).toBe(true);
    const data = result.data as { patterns: string[]; message: string };
    expect(data.patterns).toContain('my-custom-tool *');
    expect(data.message).toContain('add');
  });

  it('update_allowlist add with a duplicate pattern does not create duplicates', async () => {
    const wsId = 'ws-allowlist-dup-001';

    // Add pattern once
    await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: wsId,
      patterns: ['dedup-tool *'],
      operation: 'add',
    } as MemoryTerminalParams);

    const afterFirst = await memoryTerminal({
      action: 'get_allowlist',
      workspace_id: wsId,
    });
    const countAfterFirst = (afterFirst.data as { patterns: string[] }).patterns.length;

    // Add the same pattern again
    await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: wsId,
      patterns: ['dedup-tool *'],
      operation: 'add',
    } as MemoryTerminalParams);

    const afterSecond = await memoryTerminal({
      action: 'get_allowlist',
      workspace_id: wsId,
    });
    const patternsAfterSecond = (afterSecond.data as { patterns: string[] }).patterns;

    // Pattern count must not have grown
    expect(patternsAfterSecond.length).toBe(countAfterFirst);
    // Pattern appears exactly once
    expect(patternsAfterSecond.filter((p) => p === 'dedup-tool *').length).toBe(1);
  });

  it('update_allowlist remove of a known pattern removes it', async () => {
    const wsId = 'ws-allowlist-remove-001';

    // Add then remove
    await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: wsId,
      patterns: ['removable-tool *'],
      operation: 'add',
    } as MemoryTerminalParams);

    const removeResult = await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: wsId,
      patterns: ['removable-tool *'],
      operation: 'remove',
    } as MemoryTerminalParams);

    expect(removeResult.success).toBe(true);
    const data = removeResult.data as { patterns: string[] };
    expect(data.patterns).not.toContain('removable-tool *');
  });

  it('update_allowlist remove of a non-existent pattern is silently handled', async () => {
    const result = await memoryTerminal({
      action: 'update_allowlist',
      workspace_id: 'ws-allowlist-nonexist-001',
      patterns: ['pattern-that-does-not-exist *'],
      operation: 'remove',
    } as MemoryTerminalParams);

    expect(result.success).toBe(true);
    const data = result.data as { patterns: string[] };
    expect(data.patterns).not.toContain('pattern-that-does-not-exist *');
  });
});
