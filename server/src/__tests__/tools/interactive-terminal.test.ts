import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  handleInteractiveTerminalRun,
  handleListSessions,
  executeCanonicalInteractiveRequest,
} from '../../tools/interactive-terminal.tools.js';
import { spawn } from 'node:child_process';
import { parseInteractiveTerminalRequest } from '../../tools/interactive-terminal-contract.js';
import {
  serializeCommandRequestToNdjson,
  serializeHeartbeatToNdjson,
  parseNdjsonMessage,
  mapCommandResponseFromNdjson,
} from '../../tools/interactive-terminal-protocol.js';
import { orchestrateInteractiveLifecycle } from '../../tools/interactive-terminal-orchestration.js';

// Mock file-store so disk operations don't touch real filesystem
vi.mock('../../storage/file-store.js', () => ({
  getWorkspacePath: (wsId: string) => `/tmp/test-data/${wsId}`,
  getWorkspace: vi.fn().mockResolvedValue(null),
}));

// Mock node:fs/promises to avoid real disk I/O
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

// Mock child_process.spawn to avoid executing real commands
vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events');
  const { Readable } = require('node:stream');

  return {
    spawn: vi.fn((_cmd: string, _args: string[], _opts: unknown) => {
      const child = new EventEmitter();
      child.pid = 12345;
      child.stdout = new Readable({ read() {} });
      child.stderr = new Readable({ read() {} });
      child.kill = vi.fn();

      // Simulate successful completion after a tick
      process.nextTick(() => {
        child.stdout.push('mock output\n');
        child.stdout.push(null);
        child.stderr.push(null);
        child.emit('close', 0);
      });

      return child;
    }),
  };
});

// ---------------------------------------------------------------------------
// handleInteractiveTerminalRun
// ---------------------------------------------------------------------------

describe('handleInteractiveTerminalRun', () => {
  it('allows an allowlisted command without warning', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'git',
      args: ['status'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed');
    expect(result.data?.warning).toBeUndefined();
    expect(result.data?.session_id).toBeTruthy();
  });

  it('allows a non-allowlisted command with a warning', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'some-random-tool',
      args: ['--flag'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('not on the allowlist');
    expect(result.data?.session_id).toBeTruthy();
  });

  it('allows shell operators with a warning (NOT blocked like memory_terminal)', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['hello', '|', 'cat'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('shell operators');
    expect(result.data?.session_id).toBeTruthy();
  });

  it('blocks destructive commands', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'rm',
      args: ['-rf', '/'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
    expect(result.data?.reason).toContain('destructive');
  });

  it('blocks Remove-Item as destructive', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'Remove-Item',
      args: ['file.txt'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
  });

  it('blocks shutdown as destructive', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'shutdown',
      args: ['/s'],
    });

    expect(result.success).toBe(false);
    expect(result.data?.authorization).toBe('blocked');
  });

  it('shows both warnings when non-allowlisted AND has shell operators', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'some-tool',
      args: ['data', '|', 'other-tool'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.authorization).toBe('allowed_with_warning');
    expect(result.data?.warning).toContain('not on the allowlist');
    expect(result.data?.warning).toContain('shell operators');
  });

  it('returns session_id and output for successful commands', async () => {
    const result = await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['hello'],
    });

    expect(result.success).toBe(true);
    expect(result.data?.session_id).toBeTruthy();
    expect(result.data?.pid).toBe(12345);
    expect(result.data?.running).toBe(false);
    expect(result.data?.exit_code).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// handleListSessions
// ---------------------------------------------------------------------------

describe('handleListSessions', () => {
  it('returns a list of sessions', async () => {
    // First run a command to populate the session store
    await handleInteractiveTerminalRun({
      command: 'echo',
      args: ['test-list'],
    });

    const result = await handleListSessions();

    expect(result.success).toBe(true);
    expect(result.data?.sessions).toBeDefined();
    expect(Array.isArray(result.data?.sessions)).toBe(true);
    expect(result.data!.count).toBeGreaterThanOrEqual(1);

    // Verify session structure
    const session = result.data!.sessions[0];
    expect(session).toHaveProperty('session_id');
    expect(session).toHaveProperty('command');
    expect(session).toHaveProperty('running');
    expect(session).toHaveProperty('created_at');
  });
});

// ---------------------------------------------------------------------------
// Consolidated router (memoryTerminalInteractive)
// ---------------------------------------------------------------------------

describe('memoryTerminalInteractive (consolidated router)', () => {
  // Import the consolidated router
  let memoryTerminalInteractive: typeof import('../../tools/consolidated/memory_terminal_interactive.js').memoryTerminalInteractive;

  beforeEach(async () => {
    const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
    memoryTerminalInteractive = mod.memoryTerminalInteractive;
  });

  it('returns error when action is missing', async () => {
    const result = await memoryTerminalInteractive({} as any);
    expect(result.success).toBe(false);
    expect(result.error).toContain('action is required');
  });

  it('returns error for execute without command', async () => {
    const result = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('execution.command is required');
  });

  it('returns error for read_output without session_id', async () => {
    const result = await memoryTerminalInteractive({ action: 'read_output' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires target.session_id or target.terminal_id');
  });

  it('returns error for terminate without session_id', async () => {
    const result = await memoryTerminalInteractive({ action: 'terminate' as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain('requires target.session_id or target.terminal_id');
  });

  it('returns error for unknown action', async () => {
    const result = await memoryTerminalInteractive({ action: 'nonexistent' as any });
    expect(result.success).toBe(false);
    expect(result.error).toContain('action is required');
  });

  it('execute action routes to canonical handler', async () => {
    const result = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: {
        command: 'echo',
        args: ['router-test'],
      },
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'execute');
  });

  it('uses interactive execute path with lifecycle semantics (viewer/session flow) via MCP tool entrypoint', async () => {
    const result = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'execute_command' },
      execution: { command: 'echo', args: ['interactive-viewer-flow'] },
    });

    expect(result.success).toBe(true);
    expect((result.data as any)?.action).toBe('execute');
    expect((result.data as any)?.resolved?.mode).toBe('interactive');
    expect((result.data as any)?.identity?.session_id).toBeTruthy();
    expect((result.data as any)?.result?.lifecycle).toEqual([
      'spawn',
      'ready',
      'request_sent',
      'user_decision',
      'response_returned',
    ]);
  });

  it('blocks non-allowlisted commands in headless mode', async () => {
    const result = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'non-allowlisted-headless', args: ['test'] },
    });

    expect(result.success).toBe(false);
    expect((result.data as any)?.error?.message).toContain('allowlist');
  });

  it('marks interactive execute as attached when explicit target identity is provided', async () => {
    const result = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'execute_command' },
      target: { terminal_id: 'term_existing_01' },
      execution: { command: 'echo', args: ['attach-explicit-target'] },
    });

    expect(result.success).toBe(true);
    expect((result.data as any)?.identity?.session_id).toBe('term_existing_01');
  });

  it('legacy run alias maps to execute', async () => {
    const result = await memoryTerminalInteractive({
      action: 'run',
      command: 'echo',
      args: ['legacy-run'],
    });
    expect(result.success).toBe(true);
    expect((result.data as any).resolved.canonical_action).toBe('execute');
    expect((result.data as any).resolved.alias_applied).toBe(true);
  });

  it('list action returns sessions', async () => {
    const result = await memoryTerminalInteractive({ action: 'list' });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'list');
  });

  it('read_output with valid session_id returns output', async () => {
    // First create a session
    const runResult = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'echo', args: ['read-test'] },
    });

    const sessionId = (runResult.data as any)?.identity?.session_id;
    expect(sessionId).toBeTruthy();

    const result = await memoryTerminalInteractive({
      action: 'read_output',
      session_id: sessionId,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'read_output');
  });

  it('terminate with valid session_id succeeds', async () => {
    // First create a session
    const runResult = await memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'echo', args: ['kill-test'] },
    });

    const sessionId = (runResult.data as any)?.identity?.session_id;
    expect(sessionId).toBeTruthy();

    const result = await memoryTerminalInteractive({
      action: 'terminate',
      session_id: sessionId,
    });
    expect(result.success).toBe(true);
    expect(result.data).toHaveProperty('action', 'terminate');
  });
});

describe('interactive terminal canonical parser', () => {
  it('accepts canonical execute payload and normalizes runtime/correlation fields', () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      correlation: {
        request_id: 'req_schema_ok',
        trace_id: 'trace_schema_ok',
        client_request_id: 'client_schema_ok',
      },
      runtime: {
        workspace_id: 'ws_schema',
        cwd: '/tmp/schema',
        timeout_ms: 9876,
        adapter_override: 'bundled',
      },
      execution: {
        command: 'echo',
        args: ['schema-ok'],
        env: { PM_TEST: '1' },
      },
      compat: { caller_surface: 'chat_button' },
    });

    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    expect(parsed.request.action).toBe('execute');
    expect(parsed.request.invocation.mode).toBe('headless');
    expect(parsed.request.invocation.intent).toBe('execute_command');
    expect(parsed.request.correlation).toEqual({
      request_id: 'req_schema_ok',
      trace_id: 'trace_schema_ok',
      client_request_id: 'client_schema_ok',
    });
    expect(parsed.request.runtime).toEqual({
      workspace_id: 'ws_schema',
      cwd: '/tmp/schema',
      timeout_ms: 9876,
      adapter_override: 'bundled',
    });
    expect(parsed.request.execution).toEqual({
      command: 'echo',
      args: ['schema-ok'],
      env: { PM_TEST: '1' },
    });
    expect(parsed.request.compat).toEqual({
      legacy_action: undefined,
      caller_surface: 'chat_button',
    });
  });

  it('maps backward-compat aliases to canonical actions with expected invocation defaults', () => {
    const legacyRun = parseInteractiveTerminalRequest({ action: 'run', command: 'echo', args: ['legacy'] });
    const legacyKill = parseInteractiveTerminalRequest({ action: 'kill', session_id: 'sess_legacy' });
    const legacyClose = parseInteractiveTerminalRequest({ action: 'close', terminal_id: 'term_legacy' });
    const legacySend = parseInteractiveTerminalRequest({ action: 'send', command: 'echo', args: ['send'] });

    expect(legacyRun.ok).toBe(true);
    if (legacyRun.ok) {
      expect(legacyRun.request.action).toBe('execute');
      expect(legacyRun.request.invocation.mode).toBe('headless');
      expect(legacyRun.request.invocation.intent).toBe('execute_command');
      expect(legacyRun.resolved.alias_applied).toBe(true);
      expect(legacyRun.resolved.legacy_action).toBe('run');
    }

    expect(legacyKill.ok).toBe(true);
    if (legacyKill.ok) {
      expect(legacyKill.request.action).toBe('terminate');
      expect(legacyKill.request.target?.session_id).toBe('sess_legacy');
      expect(legacyKill.resolved.legacy_action).toBe('kill');
    }

    expect(legacyClose.ok).toBe(true);
    if (legacyClose.ok) {
      expect(legacyClose.request.action).toBe('terminate');
      expect(legacyClose.request.target?.terminal_id).toBe('term_legacy');
      expect(legacyClose.resolved.legacy_action).toBe('close');
    }

    expect(legacySend.ok).toBe(true);
    if (legacySend.ok) {
      expect(legacySend.request.action).toBe('execute');
      expect(legacySend.request.invocation.mode).toBe('interactive');
      expect(legacySend.request.invocation.intent).toBe('execute_command');
      expect(legacySend.resolved.legacy_action).toBe('send');
    }
  });

  it('returns structured canonical error payload for invalid execute payload', () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'open_only' },
      execution: { command: 'echo' },
    });

    expect(parsed.ok).toBe(false);
    if (parsed.ok) return;

    expect(parsed.response.success).toBe(false);
    expect(parsed.response.status).toBe('failed');
    expect(parsed.response.action).toBe('execute');
    expect(parsed.response.error.code).toBe('PM_TERM_INVALID_PAYLOAD');
    expect(parsed.response.error.category).toBe('validation');
    expect(parsed.response.error.retriable).toBe(false);
    expect(parsed.response.resolved.canonical_action).toBe('execute');
    expect(parsed.response.resolved.mode).toBe('interactive');
    expect(parsed.response.fallback.strategy).toBe('reject_no_retry');
    expect(parsed.response.fallback.next_action).toBe('execute');
    expect(parsed.response.correlation.request_id).toMatch(/^req_/);
    expect(parsed.response.correlation.trace_id).toMatch(/^trace_/);
  });

  it('maps legacy create alias to interactive open_only execute', () => {
    const parsed = parseInteractiveTerminalRequest({ action: 'create' });
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.request.action).toBe('execute');
      expect(parsed.request.invocation.mode).toBe('interactive');
      expect(parsed.request.invocation.intent).toBe('open_only');
      expect(parsed.resolved.alias_applied).toBe(true);
    }
  });

  it('rejects headless execute when terminal_id is provided', () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'echo' },
      target: { terminal_id: 'term_1' },
    });
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.response.error.code).toBe('PM_TERM_INVALID_MODE');
    }
  });
});

describe('interactive terminal protocol serialization', () => {
  it('normalizes /bin/sh to Windows shell for interactive execute path on win32', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const spawnMock = vi.mocked(spawn);
    spawnMock.mockClear();

    try {
      const parsed = parseInteractiveTerminalRequest({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: '/bin/sh', args: ['-lc', 'echo windows-shell'] },
      });
      expect(parsed.ok).toBe(true);
      if (!parsed.ok) return;

      const result = await executeCanonicalInteractiveRequest(parsed.request, {
        alias_applied: false,
        legacy_action: null,
      });

      expect(result.success).toBe(true);
      expect(spawnMock).toHaveBeenCalled();

      const lastCall = spawnMock.mock.calls.at(-1);
      expect(lastCall?.[0]).toBe(process.env.ComSpec?.trim() || 'cmd.exe');
      expect(lastCall?.[1]).toEqual(['/d', '/s', '/c', 'echo windows-shell']);
    } finally {
      platformSpy.mockRestore();
    }
  });

  it('serializes command_request and parses it back', () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'echo', args: ['hello'] },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const line = serializeCommandRequestToNdjson(parsed.request);
    const frame = parseNdjsonMessage(line);
    expect(frame?.type).toBe('command_request');
    if (frame?.type === 'command_request') {
      expect(frame.payload.command).toBe('echo');
      expect(frame.payload.args).toEqual(['hello']);
    }
  });

  it('serializes heartbeat frame', () => {
    const line = serializeHeartbeatToNdjson({
      request_id: 'req_1',
      trace_id: 'trace_1',
    });
    const frame = parseNdjsonMessage(line);
    expect(frame?.type).toBe('heartbeat');
  });

  it('maps command_response frame to canonical mapped response', () => {
    const mapped = mapCommandResponseFromNdjson({
      type: 'command_response',
      trace_id: 'trace_x',
      request_id: 'req_x',
      payload: {
        decision: 'approved',
        result: {
          session_id: 'sess_1',
          stdout: 'ok',
          exit_code: 0,
          running: false,
          authorization: 'allowed',
        },
      },
    });

    expect(mapped).toBeTruthy();
    expect(mapped?.user_decision).toBe('approved');
    expect(mapped?.result.session_id).toBe('sess_1');
  });
});

describe('interactive lifecycle recovery', () => {
  it('does not fall back to headless execution when interactive container bridge is unavailable', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_TERM_ADAPTER_MODE = 'container_bridge';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = '1';
    process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS = '50';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');

      const before = await mod.memoryTerminalInteractive({ action: 'list' });
      const beforeCount = ((before.data as any)?.result?.items?.length ?? 0) as number;

      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['must-not-headless-fallback'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_GUI_UNAVAILABLE');
      expect((result.data as any)?.fallback?.strategy).toBe('reject_no_retry');

      const after = await mod.memoryTerminalInteractive({ action: 'list' });
      const afterCount = ((after.data as any)?.result?.items?.length ?? 0) as number;
      expect(afterCount).toBe(beforeCount);
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
      delete process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS;
    }
  });

  it('fails closed when adapter_override=auto resolves to container bridge and preflight fails', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_TERM_ADAPTER_MODE = 'container_bridge';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = '1';
    process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS = '50';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');

      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        runtime: { adapter_override: 'auto' },
        execution: { command: 'echo', args: ['auto-override-fallback'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_GUI_UNAVAILABLE');
      expect((result.data as any)?.fallback?.strategy).toBe('reject_no_retry');
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
      delete process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS;
    }
  });

  it('rejects default container bridge when preflight is unavailable but still supports explicit local override', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = '1';
    process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS = '50';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');

      const defaultContainerResult = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['adapter-default-container'] },
      });

      expect(defaultContainerResult.success).toBe(false);
      expect((defaultContainerResult.data as any)?.error?.code).toBe('PM_TERM_GUI_UNAVAILABLE');
      expect((defaultContainerResult.data as any)?.fallback?.strategy).toBe('reject_no_retry');

      const forcedLocalResult = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        runtime: { adapter_override: 'local' },
        execution: { command: 'echo', args: ['adapter-forced-local'] },
      });

      expect(forcedLocalResult.success).toBe(true);
      expect((forcedLocalResult.data as any)?.resolved?.mode).toBe('interactive');
      expect((forcedLocalResult.data as any)?.result?.lifecycle).toEqual([
        'spawn',
        'ready',
        'request_sent',
        'user_decision',
        'response_returned',
      ]);
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
      delete process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS;
    }
  });

  it('uses env adapter mode bundled unless explicitly overridden to container_bridge', async () => {
    process.env.PM_TERM_ADAPTER_MODE = 'bundled';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = 'not-a-number';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');

      const bundledResult = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['adapter-env-bundled'] },
      });

      expect(bundledResult.success).toBe(true);

      const forcedContainerResult = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        runtime: { adapter_override: 'container_bridge' },
        execution: { command: 'echo', args: ['adapter-forced-container'] },
      });

      expect(forcedContainerResult.success).toBe(false);
      expect((forcedContainerResult.data as any)?.error?.code).toBe('PM_TERM_INVALID_MODE');
      expect((forcedContainerResult.data as any)?.error?.details?.adapter_mode).toBe('container_bridge');
      expect((forcedContainerResult.data as any)?.error?.details?.invalid_env?.[0]?.variable).toBe(
        'PM_INTERACTIVE_TERMINAL_HOST_PORT',
      );
    } finally {
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
    }
  });

  it('returns structured declined payload when interactive approval is declined', async () => {
    process.env.PM_INTERACTIVE_TERMINAL_AUTO_DECLINE = '1';
    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['force-decline'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_DECLINED');
      expect((result.data as any)?.error?.category).toBe('user_decision');
      expect((result.data as any)?.fallback?.strategy).toBe('report_decline');
      expect((result.data as any)?.resolved?.mode).toBe('interactive');
    } finally {
      delete process.env.PM_INTERACTIVE_TERMINAL_AUTO_DECLINE;
    }
  });

  it('maintains parity for shared execute result fields between interactive and headless paths', async () => {
    const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');

    const interactiveResult = await mod.memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'execute_command' },
      execution: { command: 'echo', args: ['parity-check'] },
    });

    const headlessResult = await mod.memoryTerminalInteractive({
      action: 'execute',
      invocation: { mode: 'headless', intent: 'execute_command' },
      execution: { command: 'echo', args: ['parity-check'] },
    });

    expect(interactiveResult.success).toBe(true);
    expect(headlessResult.success).toBe(true);

    const interactiveData = interactiveResult.data as any;
    const headlessData = headlessResult.data as any;

    expect(interactiveData.resolved.canonical_action).toBe('execute');
    expect(headlessData.resolved.canonical_action).toBe('execute');
    expect(interactiveData.result.authorization).toBe(headlessData.result.authorization);
    expect(interactiveData.result.exit_code).toBe(headlessData.result.exit_code);
    expect(interactiveData.result.running).toBe(headlessData.result.running);
    expect(Array.isArray(interactiveData.result.lifecycle)).toBe(true);
    expect(headlessData.result.lifecycle).toBeUndefined();
  });

  it('recovers from timeout and returns structured approved response', async () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'execute_command' },
      execution: { command: 'echo', args: ['recover-timeout'] },
      runtime: { timeout_ms: 25 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const close = vi.fn(async () => undefined);
    const recover = vi.fn(async () => ({ ok: true as const, recovered: true }));
    const awaitResponse = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'timeout' as const })
      .mockResolvedValueOnce({
        ok: true as const,
        decision: 'approved' as const,
        response: {
          session_id: 'sess_recovered_timeout',
          stdout: 'ok',
          exit_code: 0,
          running: false,
          authorization: 'allowed' as const,
        },
      });

    const orchestration = await orchestrateInteractiveLifecycle({
      request: parsed.request,
      adapter: {
        adapter_type: 'inprocess',
        connect: async () => ({ ok: true, runtime_session_id: 'runtime_1' }),
        sendRequest: async () => ({ ok: true }),
        awaitResponse,
        recover,
        close,
      },
    });

    expect(orchestration.ok).toBe(true);
    expect(orchestration.response?.session_id).toBe('sess_recovered_timeout');
    expect(orchestration.lifecycle.map((entry) => entry.stage)).toEqual([
      'spawn',
      'ready',
      'request_sent',
      'user_decision',
      'response_returned',
    ]);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'timeout' }),
    );
    expect(awaitResponse).toHaveBeenCalledTimes(2);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('returns disconnected when recovery cannot restore lifecycle', async () => {
    const parsed = parseInteractiveTerminalRequest({
      action: 'execute',
      invocation: { mode: 'interactive', intent: 'execute_command' },
      execution: { command: 'echo', args: ['recover-disconnect'] },
      runtime: { timeout_ms: 25 },
    });
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const close = vi.fn(async () => undefined);
    const recover = vi.fn(async () => ({ ok: true as const, recovered: false }));
    const awaitResponse = vi
      .fn()
      .mockResolvedValueOnce({ ok: false as const, error: 'disconnected' as const });

    const orchestration = await orchestrateInteractiveLifecycle({
      request: parsed.request,
      adapter: {
        adapter_type: 'inprocess',
        connect: async () => ({ ok: true, runtime_session_id: 'runtime_2' }),
        sendRequest: async () => ({ ok: true }),
        awaitResponse,
        recover,
        close,
      },
    });

    expect(orchestration.ok).toBe(false);
    expect(orchestration.error).toBe('disconnected');
    expect(orchestration.lifecycle.map((entry) => entry.stage)).toEqual([
      'spawn',
      'ready',
      'request_sent',
    ]);
    expect(recover).toHaveBeenCalledTimes(1);
    expect(recover).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'disconnected' }),
    );
    expect(awaitResponse).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('maps timeout to deterministic canonical error payload', async () => {
    process.env.PM_INTERACTIVE_TERMINAL_FORCE_TIMEOUT = '1';
    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['force-timeout'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_TIMEOUT');
      expect((result.data as any)?.fallback?.strategy).toBe(
        'suggest_retry_headless_or_interactive',
      );
    } finally {
      delete process.env.PM_INTERACTIVE_TERMINAL_FORCE_TIMEOUT;
    }
  });

  it('maps disconnect to deterministic canonical error payload', async () => {
    process.env.PM_INTERACTIVE_TERMINAL_FORCE_DISCONNECT = '1';
    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['force-disconnect'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_DISCONNECTED');
      expect((result.data as any)?.fallback?.strategy).toBe('suggest_reconnect_retry');
    } finally {
      delete process.env.PM_INTERACTIVE_TERMINAL_FORCE_DISCONNECT;
    }
  });

  it('returns PM_TERM_INVALID_MODE when container bridge preflight env is invalid', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_TERM_ADAPTER_MODE = 'container_bridge';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = 'not-a-number';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['invalid-preflight-config'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_INVALID_MODE');
      expect((result.data as any)?.error?.details?.invalid_env?.[0]?.variable).toBe(
        'PM_INTERACTIVE_TERMINAL_HOST_PORT',
      );
      expect((result.data as any)?.fallback?.strategy).toBe('reject_no_retry');
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
    }
  });

  it('returns PM_TERM_GUI_UNAVAILABLE with connectivity diagnostics when bridge host is unreachable', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_TERM_ADAPTER_MODE = 'container_bridge';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS = '127.0.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = '1';
    process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS = '50';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['bridge-unreachable'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_GUI_UNAVAILABLE');
      expect((result.data as any)?.error?.details?.bridge_port).toBe(1);
      expect(Array.isArray((result.data as any)?.error?.details?.attempts)).toBe(true);
      expect((result.data as any)?.fallback?.strategy).toBe('reject_no_retry');
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
      delete process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS;
    }
  });

  it('includes explicit gateway host in bridge candidate diagnostics', async () => {
    process.env.PM_RUNNING_IN_CONTAINER = 'true';
    process.env.PM_TERM_ADAPTER_MODE = 'container_bridge';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS = 'unreachable-primary.invalid';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS = 'unreachable-fallback.invalid';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY = '10.88.0.1';
    process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT = '1';
    process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS = '50';

    try {
      const mod = await import('../../tools/consolidated/memory_terminal_interactive.js');
      const result = await mod.memoryTerminalInteractive({
        action: 'execute',
        invocation: { mode: 'interactive', intent: 'execute_command' },
        execution: { command: 'echo', args: ['bridge-gateway-diagnostics'] },
      });

      expect(result.success).toBe(false);
      expect((result.data as any)?.error?.code).toBe('PM_TERM_GUI_UNAVAILABLE');
      expect((result.data as any)?.error?.details?.bridge_gateway_host).toBe('10.88.0.1');
      expect((result.data as any)?.error?.details?.bridge_candidate_hosts).toContain('10.88.0.1');
    } finally {
      delete process.env.PM_RUNNING_IN_CONTAINER;
      delete process.env.PM_TERM_ADAPTER_MODE;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_FALLBACK_ALIAS;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_GATEWAY;
      delete process.env.PM_INTERACTIVE_TERMINAL_HOST_PORT;
      delete process.env.PM_INTERACTIVE_TERMINAL_CONNECT_TIMEOUT_MS;
    }
  });
});
