import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import {
  commandRequiresShell,
  parseCommandTokens,
  resolveBuildScriptShellCandidates,
  resolveDirectCommand
} from '../../storage/file-store.js';

describe('resolveBuildScriptShellCandidates()', () => {
  it('uses COMSPEC when provided on Windows', () => {
    const env = { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' } as NodeJS.ProcessEnv;

    const result = resolveBuildScriptShellCandidates('win32', env);

    expect(result.primary).toBe(env.COMSPEC);
    expect(result.fallback).toBeUndefined();
  });

  it('does not add a fallback when COMSPEC is not cmd.exe', () => {
    const env = { COMSPEC: 'C:\\Tools\\customshell.exe' } as NodeJS.ProcessEnv;

    const result = resolveBuildScriptShellCandidates('win32', env);

    expect(result.primary).toBe(env.COMSPEC);
    expect(result.fallback).toBeUndefined();
  });

  it('returns no shells on non-Windows platforms', () => {
    const env = { COMSPEC: 'C:\\Windows\\System32\\cmd.exe' } as NodeJS.ProcessEnv;

    const result = resolveBuildScriptShellCandidates('linux', env);

    expect(result.primary).toBeUndefined();
    expect(result.fallback).toBeUndefined();
  });
});

describe('parseCommandTokens()', () => {
  it('splits command strings while respecting quotes', () => {
    const tokens = parseCommandTokens('"./scripts/build.sh" --flag "with space"');

    expect(tokens).toEqual(['./scripts/build.sh', '--flag', 'with space']);
  });
});

describe('commandRequiresShell()', () => {
  it('returns false for simple commands', () => {
    expect(commandRequiresShell('npm run build')).toBe(false);
  });

  it('returns true when shell operators are present', () => {
    expect(commandRequiresShell('npm run build && npm test')).toBe(true);
  });
});

describe('resolveDirectCommand()', () => {
  it('resolves a relative script path to an absolute path', async () => {
    const cwd = path.join('C:', 'work', 'project');
    const existsSpy = vi.spyOn(await import('../../storage/file-store.js'), 'exists');
    existsSpy.mockResolvedValue(true);

    const result = await resolveDirectCommand('./scripts/build.sh --flag', cwd);

    expect(result).toEqual({
      command: path.resolve(cwd, './scripts/build.sh'),
      args: ['--flag']
    });
  });

  it('returns the executable token when no path separators exist', async () => {
    const result = await resolveDirectCommand('npm run build', '/repo');

    expect(result).toEqual({
      command: 'npm',
      args: ['run', 'build']
    });
  });
});
