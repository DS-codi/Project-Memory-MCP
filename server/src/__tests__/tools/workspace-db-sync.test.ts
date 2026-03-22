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
    // resetAllMocks clears both call history AND mock implementations/return values,
    // preventing mock state leaking between tests.
    vi.resetAllMocks();
  });

  afterEach(() => {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  });

  it('reports in_sync when disk and DB match', () => {
    // Use a non-mandatory, non-controlled agent with pm_sync_managed frontmatter so it
    // participates in sync without the protected-drift rules that mandatory files trigger.
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const content = '---\nname: my-custom\npm_sync_managed: true\n---\nMy custom content';
    fs.writeFileSync(path.join(agentsDir, 'my-custom.agent.md'), content);

    vi.mocked(agentDb.getAgent).mockReturnValue({
      id: '1',
      name: 'my-custom',
      content,
      updated_at: '2026-03-22T00:00:00Z',
      created_at: '2026-03-22T00:00:00Z',
      is_permanent: 0
    } as any);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'my-custom.agent.md');

    expect(entry?.status).toBe('in_sync');
    expect(report.summary.in_sync).toBe(1);
  });

  it('reports local_only when file on disk is missing from DB', () => {
    // A pm_sync_managed file with no DB entry and no pm_import_mode=manual → local_only.
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const content = '---\nname: extra-managed\npm_sync_managed: true\n---\nExtra content';
    fs.writeFileSync(path.join(agentsDir, 'extra-managed.agent.md'), content);

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const extra = report.agents.find(a => a.filename === 'extra-managed.agent.md');

    expect(extra?.status).toBe('local_only');
    expect(report.summary.local_only).toBe(1);
  });

  it('reports db_only when non-controlled DB row has no workspace file', () => {
    // Use a non-mandatory, non-controlled agent in the DB with no workspace copy → db_only.
    // Must mock listAgents so the DB map is populated for the db_only pass.
    vi.mocked(agentDb.listAgents).mockReturnValue([
      {
        id: '1',
        name: 'db-only-agent',
        content: 'DB only content',
        updated_at: '2026-03-22T00:00:00Z',
        created_at: '2026-03-22T00:00:00Z',
        is_permanent: 0
      } as any,
    ]);
    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.canonical_name === 'db-only-agent');

    expect(entry?.status).toBe('db_only');
    expect(report.summary.db_only).toBe(1);
  });

  it('reports content_mismatch when content differs', () => {
    // A pm_sync_managed file where local content differs from DB content → content_mismatch.
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const localContent = '---\nname: drift-agent\npm_sync_managed: true\n---\nLocal content';
    fs.writeFileSync(path.join(agentsDir, 'drift-agent.agent.md'), localContent);

    vi.mocked(agentDb.getAgent).mockReturnValue({
      id: '1',
      name: 'drift-agent',
      content: '---\nname: drift-agent\npm_sync_managed: true\n---\nDB content',
      updated_at: '2026-03-22T00:00:00Z',
      created_at: '2026-03-22T00:00:00Z',
      is_permanent: 0
    } as any);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'drift-agent.agent.md');

    expect(entry?.status).toBe('content_mismatch');
    expect(entry?.content_mismatch_hint).toBeDefined();
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

  // ---------------------------------------------------------------------------
  // Frontmatter parsing tests
  // ---------------------------------------------------------------------------

  it('frontmatter pm_controlled=true sets policy.controlled to true', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const content = [
      '---',
      'name: custom-agent',
      'pm_controlled: true',
      'pm_import_mode: never',
      'pm_canonical_source: database_seed_resources',
      'pm_canonical_path: agents/core/custom-agent.agent.md',
      '---',
      'Custom agent content',
    ].join('\n');
    fs.writeFileSync(path.join(agentsDir, 'custom-agent.agent.md'), content);

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'custom-agent.agent.md');

    expect(entry).toBeDefined();
    expect(entry?.policy.controlled).toBe(true);
  });

  it('frontmatter pm_sync_managed=true + pm_import_mode=manual with no DB row yields import_candidate', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const content = [
      '---',
      'name: community-agent',
      'pm_sync_managed: true',
      'pm_import_mode: manual',
      '---',
      'Community agent content',
    ].join('\n');
    fs.writeFileSync(path.join(agentsDir, 'community-agent.agent.md'), content);

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'community-agent.agent.md');

    expect(entry).toBeDefined();
    expect(entry?.status).toBe('import_candidate');
  });

  it('report is read-only: writes_performed=false, report_mode=read_only, no storeAgent calls', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    fs.writeFileSync(path.join(agentsDir, 'any.agent.md'), 'content');

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);

    expect(report.writes_performed).toBe(false);
    expect(report.report_mode).toBe('read_only');
    // No write functions should have been invoked during a passive check
    expect(vi.mocked(agentDb.storeAgent)).not.toHaveBeenCalled();
    expect(vi.mocked(instructionDb.storeInstruction)).not.toHaveBeenCalled();
  });

  it('mandatory agent file with no DB row yields protected_drift', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    // hub.agent.md is a mandatory PM-controlled agent
    fs.writeFileSync(path.join(agentsDir, 'hub.agent.md'), 'Hub content');

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const hub = report.agents.find(a => a.filename === 'hub.agent.md');

    expect(hub).toBeDefined();
    expect(hub?.status).toBe('protected_drift');
  });

  it('agent file without any pm_* frontmatter is ignored_local', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    // Plain file with no frontmatter and not in mandatory list
    fs.writeFileSync(path.join(agentsDir, 'unmanaged-helper.agent.md'), 'Just some helper content, no frontmatter.');

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'unmanaged-helper.agent.md');

    expect(entry).toBeDefined();
    expect(entry?.status).toBe('ignored_local');
  });

  it('pm_controlled=true overrides pm_import_mode=manual and rejects import_candidate', () => {
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    fs.mkdirSync(agentsDir, { recursive: true });
    const content = [
      '---',
      'name: controlled-agent',
      'pm_sync_managed: true',
      'pm_controlled: true',
      'pm_import_mode: manual',
      'pm_canonical_source: database_seed_resources',
      'pm_canonical_path: agents/core/controlled-agent.agent.md',
      '---',
      'Controlled agent content',
    ].join('\n');
    fs.writeFileSync(path.join(agentsDir, 'controlled-agent.agent.md'), content);

    vi.mocked(agentDb.getAgent).mockReturnValue(null);

    const report = checkWorkspaceDbSync(tempRoot);
    const entry = report.agents.find(a => a.filename === 'controlled-agent.agent.md');

    expect(entry).toBeDefined();
    expect(entry?.status).not.toBe('import_candidate');
    expect(entry?.policy.controlled).toBe(true);
  });
});
