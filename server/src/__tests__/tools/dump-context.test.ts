/**
 * Tests for handleDumpContext — aggregate all plan context into a single JSON dump
 *
 * Covers:
 * 1. Creates dump file in data/{workspace_id}/plans/{plan_id}/dumps/
 * 2. Dump contains plan_state, context_files, research_notes, workspace_context sections
 * 3. Error handling for missing plan_id or workspace_id
 * 4. Timestamp format in filename
 * 5. Handles missing context files gracefully
 * 6. Handles missing research notes gracefully
 * 7. Handles missing workspace context gracefully
 * 8. Returns correct sections_included list
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../storage/db-store.js');
vi.mock('../../logging/workspace-update-log.js');

import * as store from '../../storage/db-store.js';
import { handleDumpContext } from '../../tools/context.tools.js';

const mockWorkspaceId = 'ws_dump_test_123';
const mockPlanId = 'plan_dump_test_456';

const mockPlanState = {
  id: mockPlanId,
  workspace_id: mockWorkspaceId,
  title: 'Test Plan',
  description: 'A test plan for dump_context',
  category: 'feature',
  priority: 'medium',
  status: 'active',
  current_phase: 'Phase 1',
  steps: [],
  created_at: '2026-02-13T10:00:00Z',
  updated_at: '2026-02-13T10:00:00Z',
};

describe('handleDumpContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default mocks
    vi.mocked(store.getPlanState).mockResolvedValue(mockPlanState as any);
    vi.mocked(store.getPlanPath).mockReturnValue(`/data/${mockWorkspaceId}/plans/${mockPlanId}`);
    vi.mocked(store.getContextPath).mockImplementation(
      (wsId, planId, type) => `/data/${wsId}/plans/${planId}/${type}.json`
    );
    vi.mocked(store.getResearchNotesPath).mockReturnValue(
      `/data/${mockWorkspaceId}/plans/${mockPlanId}/research_notes`
    );
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue(null);
    vi.mocked(store.ensureDir).mockResolvedValue(undefined);
    vi.mocked(store.writeText).mockResolvedValue(undefined);
    vi.mocked(store.nowISO).mockReturnValue('2026-02-13T12:00:00.000Z');
  });

  it('should return error when workspace_id is missing', async () => {
    const result = await handleDumpContext({ workspace_id: '', plan_id: mockPlanId });

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_id');
  });

  it('should return error when plan_id is missing', async () => {
    const result = await handleDumpContext({ workspace_id: mockWorkspaceId, plan_id: '' });

    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('should return error when plan is not found', async () => {
    vi.mocked(store.getPlanState).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: 'nonexistent_plan',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Plan not found');
  });

  it('should create dump file in the dumps directory', async () => {
    // No extra context files, no research notes, no workspace context
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(store.ensureDir).toHaveBeenCalledWith(
      expect.stringContaining('/dumps')
    );
    expect(store.writeText).toHaveBeenCalledWith(
      expect.stringContaining('-context-dump.json'),
      expect.any(String)
    );
  });

  it('should include timestamp in the dump filename', async () => {
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    // The timestamp in filename uses ISO format with colons/dots replaced by dashes
    const writtenPath = vi.mocked(store.writeText).mock.calls[0][0];
    expect(writtenPath).toMatch(/\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/);
    expect(writtenPath).toContain('-context-dump.json');
  });

  it('should always include plan_state in sections_included', async () => {
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.sections_included).toContain('plan_state');
  });

  it('should include context_files when extra JSON files exist', async () => {
    // Simulate fs.readdir returning extra context files in plan dir
    const fsModule = await import('fs');
    vi.spyOn(fsModule.promises, 'readdir').mockResolvedValue(
      ['decision.json', 'state.json', 'analysis.json'] as any
    );

    vi.mocked(store.readText).mockImplementation(async (path: string) => {
      if (path.includes('decision')) return JSON.stringify({ answer: 'yes' });
      if (path.includes('analysis')) return JSON.stringify({ result: 'good' });
      return null;
    });

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.sections_included).toContain('context_files');
  });

  it('should include research_notes when notes exist', async () => {
    // First readdir call is for context files (plan dir), second for research
    const fsModule = await import('fs');
    let callCount = 0;
    vi.spyOn(fsModule.promises, 'readdir').mockImplementation(async () => {
      callCount++;
      if (callCount === 1) return [] as any; // no extra context files
      return ['note1.md', 'note2.md'] as any; // research notes
    });

    vi.mocked(store.readText).mockImplementation(async (path: string) => {
      if (path.includes('note1')) return '# Research Note 1';
      if (path.includes('note2')) return '# Research Note 2';
      return null;
    });

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.sections_included).toContain('research_notes');
  });

  it('should include workspace_context when it exists', async () => {
    const fsModule = await import('fs');
    vi.spyOn(fsModule.promises, 'readdir').mockRejectedValue(new Error('no dir'));

    const workspaceCtx = { sections: { tools: { summary: 'test' } } };
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue(workspaceCtx as never);
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.sections_included).toContain('workspace_context');
  });

  it('should write valid JSON content to the dump file', async () => {
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    const writtenContent = vi.mocked(store.writeText).mock.calls[0][1];
    const parsed = JSON.parse(writtenContent);
    expect(parsed.meta).toBeDefined();
    expect(parsed.meta.workspace_id).toBe(mockWorkspaceId);
    expect(parsed.meta.plan_id).toBe(mockPlanId);
    expect(parsed.plan_state).toEqual(mockPlanState);
  });

  it('should return the dump path and timestamp in the result', async () => {
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    expect(result.data?.path).toContain('-context-dump.json');
    expect(result.data?.timestamp).toBeDefined();
  });

  it('should handle gracefully when plan dir has no extra files', async () => {
    const fsModule = await import('fs');
    vi.spyOn(fsModule.promises, 'readdir').mockRejectedValue(new Error('ENOENT'));
    vi.mocked(store.readText).mockResolvedValue(null);

    const result = await handleDumpContext({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    });

    expect(result.success).toBe(true);
    // Only plan_state should be included
    expect(result.data?.sections_included).toEqual(['plan_state']);
  });
});
