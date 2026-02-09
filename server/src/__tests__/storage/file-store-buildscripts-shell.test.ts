import { describe, it, expect } from 'vitest';
import {
  parseCommandTokens,
} from '../../storage/file-store.js';

describe('parseCommandTokens()', () => {
  it('splits command strings while respecting quotes', () => {
    const tokens = parseCommandTokens('"./scripts/build.sh" --flag "with space"');

    expect(tokens).toEqual(['./scripts/build.sh', '--flag', 'with space']);
  });

  it('handles simple command without quotes', () => {
    const tokens = parseCommandTokens('npm run build');
    expect(tokens).toEqual(['npm', 'run', 'build']);
  });

  it('returns empty array for empty string', () => {
    const tokens = parseCommandTokens('');
    expect(tokens).toEqual([]);
  });

  it('handles single-quoted strings', () => {
    const tokens = parseCommandTokens("echo 'hello world'");
    expect(tokens).toEqual(['echo', 'hello world']);
  });
});
