import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';
import { archiveWorkspaceAgents } from './deploy.js';

describe('archiveWorkspaceAgents', () => {
  let tempRoot: string;

  beforeEach(async () => {
    tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'pm-deploy-archive-'));
  });

  afterEach(async () => {
    await fs.rm(tempRoot, { recursive: true, force: true });
    vi.useRealTimers();
  });

  it('returns warning when .github/agents does not exist', async () => {
    const result = await archiveWorkspaceAgents(tempRoot);

    expect(result.archive_path).toBeNull();
    expect(result.moved_files_count).toBe(0);
    expect(result.warnings[0]).toContain('No existing .github/agents directory found');
  });

  it('archives existing agents into timestamped folder and returns moved file metadata', async () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    const nestedDir = path.join(agentsDir, 'sessions');

    await fs.mkdir(nestedDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'executor.agent.md'), 'executor');
    await fs.writeFile(path.join(nestedDir, 'reviewer.agent.md'), 'reviewer');

    const result = await archiveWorkspaceAgents(tempRoot);

    expect(result.archive_path).toBeTruthy();
    expect(result.archive_path!).toContain(path.join('.archived_github', 'agents'));
    expect(result.moved_files_count).toBe(2);
    expect(result.moved_files).toContain('executor.agent.md');
    expect(result.moved_files).toContain('sessions/reviewer.agent.md');

    const sourceExists = await fs.access(agentsDir).then(() => true).catch(() => false);
    expect(sourceExists).toBe(false);
  });

  it('uses conflict-safe archive path when timestamp directory already exists', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-28T10:00:00.000Z'));

    const agentsDir = path.join(tempRoot, '.github', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });
    await fs.writeFile(path.join(agentsDir, 'executor.agent.md'), 'executor');

    const fixedTimestamp = '2026-02-28T10-00-00-000Z';
    const conflictingArchivePath = path.join(tempRoot, '.archived_github', 'agents', fixedTimestamp);
    await fs.mkdir(conflictingArchivePath, { recursive: true });

    const result = await archiveWorkspaceAgents(tempRoot);

    expect(result.conflicts.length).toBeGreaterThan(0);
    expect(result.conflicts[0]).toContain('Archive folder already existed');
    expect(result.archive_path).toBe(path.join(tempRoot, '.archived_github', 'agents', `${fixedTimestamp}-1`));
  });
});
