import { describe, it, expect, vi, beforeEach } from 'vitest';
import { memoryTerminal } from '../../tools/consolidated/memory_terminal.js';

const mockConnect = vi.fn().mockResolvedValue(undefined);
const mockClose = vi.fn();
const mockSendAndAwait = vi.fn();

vi.mock('../../tools/terminal-tcp-adapter.js', () => ({
  TcpTerminalAdapter: vi.fn().mockImplementation(() => ({
    connect: mockConnect,
    close: mockClose,
    sendAndAwait: mockSendAndAwait,
  })),
}));

vi.mock('../../storage/db-store.js', () => ({
  getAllWorkspaces: vi.fn().mockResolvedValue([]),
}));

vi.mock('node:fs/promises', () => ({
  readFile: vi.fn().mockRejectedValue(new Error('ENOENT')),
  writeFile: vi.fn().mockResolvedValue(undefined),
  mkdir: vi.fn().mockResolvedValue(undefined),
}));

function expectedSpawnMcpServerUrl(): string {
  const candidates = [
    process.env.PM_MCP_SERVER_URL,
    process.env.PROJECT_MEMORY_MCP_SERVER_URL,
    process.env.MBS_HOST_MCP_URL,
  ];

  for (const candidate of candidates) {
    if (typeof candidate === 'string' && candidate.trim().length > 0) {
      return candidate.trim();
    }
  }

  return 'http://127.0.0.1:3467/mcp';
}

function expectedSpawnMcpTransport(): string {
  const value = process.env.PM_MCP_TRANSPORT;
  if (typeof value === 'string' && value.trim().length > 0) {
    return value.trim();
  }
  return 'streamable_http';
}

describe('memory_terminal spawn_cli_session action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockConnect.mockResolvedValue(undefined);
    mockSendAndAwait.mockResolvedValue({
      type: 'command_response',
      id: 'sess-spawn-1',
      status: 'approved',
      output: 'spawned',
      exit_code: 0,
    });
  });

  it('rejects missing provider', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('provider is required');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('rejects unsupported provider', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'claude',
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('Invalid provider');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('rejects invalid resume payload in context', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'gemini',
      context: {
        session_mode: 'resume',
      },
    } as any);

    expect(result.success).toBe(false);
    expect(result.error).toContain('context is invalid');
    expect(mockConnect).not.toHaveBeenCalled();
  });

  it('normalizes provider/cwd/prompt/context and routes via run contract', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'C:\\Tools\\Copilot.cmd',
      cwd: '/tmp/workspace',
      prompt: 'Summarize current repo state',
      workspace_id: 'ws-spawn-1',
      context: {
        requesting_agent: 'Executor',
        plan_id: 'plan_abc123',
        session_id: 'sess_xyz987',
        step_notes: 'Spawn requested from implementation step',
        relevant_files: [{ path: 'src/main.ts', snippet: 'console.log(42);' }],
      },
    } as any);

    expect(result.success).toBe(true);
    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockSendAndAwait).toHaveBeenCalledTimes(1);

    const request = mockSendAndAwait.mock.calls[0][0];
    expect(request.command).toBe('copilot');
    expect(request.working_directory).toBe('/tmp/workspace');
    expect(request.workspace_id).toBe('ws-spawn-1');

    const contextEnvelope = JSON.parse(request.context);
    expect(contextEnvelope.source.launch_kind).toBe('agent_cli_launch');
    expect(contextEnvelope.context_pack.requesting_agent).toBe('Executor');
    expect(contextEnvelope.context_pack.plan_id).toBe('plan_abc123');
    expect(contextEnvelope.context_pack.session_id).toBe('sess_xyz987');
    expect(contextEnvelope.context_pack.step_notes).toBe(
      'Spawn requested from implementation step'
    );
    expect(contextEnvelope.context_pack.startup_prompt).toBe(
      'Summarize current repo state'
    );
    expect(contextEnvelope.context_pack.relevant_files).toEqual([
      {
        path: 'src/main.ts',
        snippet: 'console.log(42);',
      },
    ]);
  });

  it('injects PM MCP defaults for spawned sessions when no user override is provided', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'gemini',
      workspace_id: 'ws-default-env',
      context: {
        plan_id: 'plan_default',
        session_id: 'sess_default',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(mockSendAndAwait).toHaveBeenCalledTimes(1);

    const request = mockSendAndAwait.mock.calls[0][0];
    const expectedServerUrl = expectedSpawnMcpServerUrl();
    const expectedTransport = expectedSpawnMcpTransport();

    expect(request.env.PM_MCP_SERVER_URL).toBe(expectedServerUrl);
    expect(request.env.PROJECT_MEMORY_MCP_SERVER_URL).toBe(expectedServerUrl);
    expect(request.env.PM_MCP_TRANSPORT).toBe(expectedTransport);
    expect(request.env.PM_CLI_SPAWN_SOURCE).toBe(
      'memory_terminal.spawn_cli_session'
    );
    expect(request.env.PM_CLI_PROVIDER).toBe('gemini');
    expect(request.env.PM_WORKSPACE_ID).toBe('ws-default-env');
    expect(request.env.PM_PLAN_ID).toBe('plan_default');
    expect(request.env.PM_AGENT_SESSION_ID).toBe('sess_default');
  });

  it('applies explicit user MCP overrides with deterministic key precedence', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'copilot',
      env: {
        PM_MCP_SERVER_URL: 'https://priority.example/mcp',
        PROJECT_MEMORY_MCP_SERVER_URL: 'https://secondary.example/mcp',
        PM_MCP_TRANSPORT: 'sse',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(mockSendAndAwait).toHaveBeenCalledTimes(1);

    const request = mockSendAndAwait.mock.calls[0][0];
    expect(request.env.PM_MCP_SERVER_URL).toBe('https://priority.example/mcp');
    expect(request.env.PROJECT_MEMORY_MCP_SERVER_URL).toBe(
      'https://priority.example/mcp'
    );
    expect(request.env.PM_MCP_TRANSPORT).toBe('sse');
  });

  it('ignores blank MCP overrides and preserves auto defaults', async () => {
    const result = await memoryTerminal({
      action: 'spawn_cli_session',
      provider: 'gemini',
      env: {
        PM_MCP_SERVER_URL: '   ',
        PROJECT_MEMORY_MCP_SERVER_URL: '',
        PM_MCP_TRANSPORT: ' ',
        CUSTOM_FLAG: 'keep-me',
      },
    } as any);

    expect(result.success).toBe(true);
    expect(mockSendAndAwait).toHaveBeenCalledTimes(1);

    const request = mockSendAndAwait.mock.calls[0][0];
    const expectedServerUrl = expectedSpawnMcpServerUrl();
    const expectedTransport = expectedSpawnMcpTransport();

    expect(request.env.PM_MCP_SERVER_URL).toBe(expectedServerUrl);
    expect(request.env.PROJECT_MEMORY_MCP_SERVER_URL).toBe(expectedServerUrl);
    expect(request.env.PM_MCP_TRANSPORT).toBe(expectedTransport);
    expect(request.env.CUSTOM_FLAG).toBe('keep-me');
  });
});