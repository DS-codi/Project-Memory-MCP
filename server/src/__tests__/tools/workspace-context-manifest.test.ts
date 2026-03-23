import { describe, it, expect, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkWorkspaceContextHealth, resolveWorkspaceFilePolicy } from '../../tools/workspace-context-manifest.js';

describe('workspace-context-manifest', () => {
  let tempRoot: string | undefined;

  afterEach(() => {
    if (tempRoot) {
      fs.rmSync(tempRoot, { recursive: true, force: true });
      tempRoot = undefined;
    }
  });

  it('preserves workspace-local skills in context health checks', () => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-context-manifest-test-'));
    const skillPath = path.join(tempRoot, '.github', 'skills', 'local-skill', 'SKILL.md');
    fs.mkdirSync(path.dirname(skillPath), { recursive: true });
    fs.writeFileSync(skillPath, '# Local skill', 'utf-8');

    const health = checkWorkspaceContextHealth(tempRoot);

    expect(health.cull_detected).toEqual([]);
  });

  it('does not mark skill files as DB-only cull candidates by default', () => {
    const policy = resolveWorkspaceFilePolicy({
      kind: 'skill',
      canonical_filename: 'SKILL.md',
      relative_path: 'skills/local-skill/SKILL.md',
      content: '# Local skill',
      db_present: false,
    });

    expect(policy.cull_reason).toBeUndefined();
    expect(policy.sync_managed).toBe(false);
  });
});