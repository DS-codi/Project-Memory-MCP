import { beforeEach, describe, expect, it, vi } from 'vitest';
import { promptAnalystDiscoverLinkedMemory } from '../../tools/context-search.tools.js';
import * as store from '../../storage/db-store.js';

vi.mock('../../storage/db-store.js', () => ({
  getWorkspace: vi.fn(),
  getWorkspacePlans: vi.fn(),
  listPlanContextTypesFromDb: vi.fn(),
  getPlanContextFromDb: vi.fn(),
  listPlanResearchNotesFromDb: vi.fn(),
  listProgramSearchArtifacts: vi.fn().mockResolvedValue([]),
  getWorkspaceContextFromDb: vi.fn().mockResolvedValue(null),
}));

vi.mock('../../tools/knowledge.tools.js', () => ({
  listKnowledgeFiles: vi.fn().mockResolvedValue({ success: true, data: { files: [] } }),
  getKnowledgeFile: vi.fn().mockResolvedValue({ success: false }),
  getKnowledgeFilePath: vi.fn().mockReturnValue(''),
}));

describe('context-search.tools promptAnalystDiscoverLinkedMemory', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes linked workspaces and returns metadata-only results', async () => {
    vi.mocked(store.getWorkspace)
      .mockResolvedValueOnce({
        workspace_id: 'ws_root',
        parent_workspace_id: undefined,
        child_workspace_ids: ['ws_child'],
      } as any)
      .mockResolvedValueOnce({
        workspace_id: 'ws_child',
        parent_workspace_id: 'ws_root',
        child_workspace_ids: [],
      } as any);

    vi.mocked(store.getWorkspacePlans)
      .mockResolvedValueOnce([
        { id: 'plan_root', title: 'Root plan title', updated_at: '2026-02-28T20:10:00.000Z' } as any,
      ])
      .mockResolvedValueOnce([
        { id: 'plan_child', title: 'Child plan title', updated_at: '2026-02-28T20:11:00.000Z' } as any,
      ]);

    vi.mocked(store.listPlanContextTypesFromDb)
      .mockResolvedValueOnce(['architecture'])
      .mockResolvedValueOnce(['notes']);

    vi.mocked(store.getPlanContextFromDb)
      .mockResolvedValueOnce({ summary: 'workspace guard architecture details for root plan' })
      .mockResolvedValueOnce({ summary: 'linked workspace note for child plan' });

    vi.mocked(store.listPlanResearchNotesFromDb)
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          filename: 'child-research.md',
          content: 'research about linked workspace policy guard',
          updated_at: '2026-02-28T20:12:00.000Z',
          size_bytes: 64,
        },
      ] as any);

    const result = await promptAnalystDiscoverLinkedMemory({
      workspace_id: 'ws_root',
      query: 'workspace guard',
      limit: 10,
    });

    expect(result.success).toBe(true);
    if (!result.success || !result.data) {
      throw new Error('Expected success data');
    }

    expect(result.data.linked_workspace_ids.sort()).toEqual(['ws_child', 'ws_root']);
    expect(result.data.related_plan_ids).toContain('plan_root');
    expect(result.data.related_plan_ids).toContain('plan_child');
    expect(result.data.results.length).toBeGreaterThan(0);

    for (const item of result.data.results) {
      expect(item).toHaveProperty('plan_id');
      expect(item).toHaveProperty('plan_title');
      expect(item).toHaveProperty('context_title');
      expect(item).toHaveProperty('snippet');
      expect(item).toHaveProperty('relevance');
      expect(item).not.toHaveProperty('content');
      expect(item).not.toHaveProperty('payload');
    }
  });

  it('does not leak full payload body and limits snippet length', async () => {
    const veryLongPayload = `HEADER ${'x'.repeat(700)} END_OF_SECRET_PAYLOAD`;

    vi.mocked(store.getWorkspace).mockResolvedValue({
      workspace_id: 'ws_root',
      parent_workspace_id: undefined,
      child_workspace_ids: [],
    } as any);

    vi.mocked(store.getWorkspacePlans).mockResolvedValue([
      { id: 'plan_root', title: 'Root plan title', updated_at: '2026-02-28T20:10:00.000Z' } as any,
    ]);

    vi.mocked(store.listPlanContextTypesFromDb).mockResolvedValue(['architecture']);
    vi.mocked(store.getPlanContextFromDb).mockResolvedValue({
      body: veryLongPayload,
    });
    vi.mocked(store.listPlanResearchNotesFromDb).mockResolvedValue([] as any);

    const result = await promptAnalystDiscoverLinkedMemory({
      workspace_id: 'ws_root',
      query: 'header',
      limit: 5,
    });

    expect(result.success).toBe(true);
    if (!result.success || !result.data) {
      throw new Error('Expected success data');
    }

    expect(result.data.results).toHaveLength(1);
    const snippet = result.data.results[0]!.snippet;
    expect(snippet.length).toBeLessThanOrEqual(320);
    expect(snippet).not.toContain('END_OF_SECRET_PAYLOAD');
  });
});
