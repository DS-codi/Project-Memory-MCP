import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import * as fs from 'node:fs';
import { spawn } from 'node:child_process';

vi.mock('node:fs', () => ({
  existsSync: vi.fn(),
}));

vi.mock('node:child_process', () => ({
  spawn: vi.fn(),
}));

describe('terminal.tools shell fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.resetModules();
  });

  function mockSpawnSuccess(stdoutText: string): void {
    vi.mocked(spawn).mockImplementation(() => {
      const child = new EventEmitter() as any;
      child.pid = 4321;
      child.stdout = new EventEmitter();
      child.stderr = new EventEmitter();

      queueMicrotask(() => {
        child.stdout.emit('data', Buffer.from(stdoutText));
        child.emit('close', 0);
      });

      return child;
    });
  }

  it('falls back to direct spawn when /bin/sh is unavailable on non-windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('SHELL', '');
    vi.mocked(fs.existsSync).mockReturnValue(false);
    mockSpawnSuccess('TOKEN\n');

    const mod = await import('../../tools/terminal.tools.js');
    const result = await mod.spawnAndTrackSession({ command: 'echo', args: ['TOKEN'], timeout: 5000 });

    expect(result.success).toBe(true);
    expect(result.data?.stdout).toContain('TOKEN');

    const lastCall = vi.mocked(spawn).mock.calls.at(-1);
    expect(lastCall?.[2]).toMatchObject({ shell: false });
  });

  it('uses configured shell path when available on non-windows', async () => {
    vi.spyOn(process, 'platform', 'get').mockReturnValue('linux');
    vi.stubEnv('SHELL', '/custom/shell');
    vi.mocked(fs.existsSync).mockImplementation((path) => path === '/custom/shell');
    mockSpawnSuccess('hello\n');

    const mod = await import('../../tools/terminal.tools.js');
    const result = await mod.spawnAndTrackSession({ command: 'echo', args: ['hello'], timeout: 5000 });

    expect(result.success).toBe(true);

    const lastCall = vi.mocked(spawn).mock.calls.at(-1);
    expect(lastCall?.[2]).toMatchObject({ shell: '/custom/shell' });
  });
});
