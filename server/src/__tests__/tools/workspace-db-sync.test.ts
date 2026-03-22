import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { checkWorkspaceDbSync } from '../../tools/workspace-db-sync.js';
import * as agentDb from '../../db/agent-definition-db.js';
import * as instructionDb from '../../db/instruction-db.js';

vi.mock('../../db/agent-definition-db.js');
vi.mock('../../db/instruction-db.js');

describe('workspace-db-sync', () => {
  let tempRoot: string;

  beforeEach(() => {
    tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'pm-db-sync-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports in_sync when disk and DB match', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'hub.agent.md'), 'Hub content');

    vi.mocked(agentDb.getAgent).mockReturnValue({
      id: '1',
      name: 'Hub',
      content: 'Hub content',
      updated_at: '2026-03-22T00:00:00Z',
      created_at: '2026-03-22T00:00:00Z',
      is_permanent: 1
    } as any);

    const report = checkWorkspaceDbSync(tempRoot);
    const hub = report.agents.find(a => a.filename === 'hub.agent.md');
    
    expect(hub?.status).toBe('in_sync');
    expect(report.summary.in_sync).toBe(1);
  });

  it('reports local_only when file on disk is missing from DB', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'extra.agent.md'), 'Extra content');

    // Return null for any agent lookup
    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const extra = report.agents.find(a => a.filename === 'extra.agent.md');
    
    expect(extra?.status).toBe('local_only');
    expect(report.summary.local_only).toBe(1);
  });

  it('reports db_only when mandatory file in DB is missing from disk', () => {
    // No files on disk
    vi.mocked(agentDb.getAgent).mockImplementation((nameLower) => {
      if (nameLower === 'hub') {
        return {
          id: '1',
          name: 'Hub',
          content: 'Hub content',
          updated_at: '2026-03-22T00:00:00Z'
        } as any;
      }
      return null;
    });

    const report = checkWorkspaceDbSync(tempRoot);
    const hub = report.agents.find(a => a.filename === 'hub.agent.md');
    
    expect(hub?.status).toBe('db_only');
    expect(report.summary.db_only).toBe(1);
  });

  it('reports content_mismatch when content differs', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'hub.agent.md'), 'Local content');

    vi.mocked(agentDb.getAgent).mockReturnValue({
      id: '1',
      name: 'Hub',
      content: 'DB content',
      updated_at: '2026-03-22T00:00:00Z'
    } as any);

    const report = checkWorkspaceDbSync(tempRoot);
    const hub = report.agents.find(a => a.filename === 'hub.agent.md');
    
    expect(hub?.status).toBe('content_mismatch');
    expect(hub?.content_mismatch_hint).toBeDefined();
    expect(report.summary.content_mismatch).toBe(1);
  });

  it('handles workspace with no .github folder gracefully', () => {
    // Mock DB returns nothing for mandatory checks
    vi.mocked(agentDb.getAgent).mockReturnValue(null);
    vi.mocked(instructionDb.getInstruction).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    
    expect(report.summary.total).toBe(0);
    expect(report.agents.length).toBe(0);
    expect(report.instructions.length).toBe(0);
  });

  it('performs case-insensitive matching', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'Hub.agent.md'), 'Hub content');

    // DB has lowercase 'hub'
    vi.mocked(agentDb.getAgent).mockImplementation((name) => {
      if (name === 'hub') {
        return {
          id: '1',
          name: 'hub',
          content: 'Hub content',
          updated_at: '2026-03-22T00:00:00Z'
        } as any;
      }
      return null;
    });

    const report = checkWorkspaceDbSync(tempRoot);
    const hub = report.agents.find(a => a.filename === 'Hub.agent.md');
    
    expect(hub?.status).toBe('in_sync');
    expect(vi.mocked(agentDb.getAgent)).toHaveBeenCalledWith('hub');
  });
});
