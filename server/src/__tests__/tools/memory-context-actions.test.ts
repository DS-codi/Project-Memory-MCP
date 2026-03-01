import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryContext } from '../../tools/consolidated/memory_context.js';
import type { MemoryContextParams } from '../../tools/consolidated/memory_context.js';
import * as contextTools from '../../tools/context.tools.js';
import * as workspaceContextTools from '../../tools/workspace-context.tools.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as contextSearchTools from '../../tools/context-search.tools.js';
import * as contextPullTools from '../../tools/context-pull.tools.js';

vi.mock('../../tools/context.tools.js');
vi.mock('../../tools/workspace-context.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../tools/context-search.tools.js');
vi.mock('../../tools/context-pull.tools.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_context_test_123';
const mockPlanId = 'plan_context_test_456';
const mockWorkspaceContext = {
  schema_version: '1.0.0',
  workspace_id: mockWorkspaceId,
  workspace_path: '/test/workspace',
  name: 'Test Workspace',
  created_at: '2026-02-04T10:00:00Z',
  updated_at: '2026-02-04T10:00:00Z',
  sections: {}
};

describe('MCP Tool: memory_context Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  it('should require workspace_id and plan_id', async () => {
    const params = { action: 'list' } as MemoryContextParams;

    const result = await memoryContext(params);

    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_id');
  });

  describe('store action', () => {
    it('should require type and data', async () => {
      const result = await memoryContext({
        action: 'store',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should store context when valid', async () => {
      vi.spyOn(contextTools, 'storeContext').mockResolvedValue({
        success: true,
        data: { path: '/tmp/context.json' }
      });

      const result = await memoryContext({
        action: 'store',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        type: 'decision',
        data: { answer: 'yes' }
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'store') {
        expect(result.data.data.path).toContain('context');
      }
    });
  });

  describe('get action', () => {
    it('should require type', async () => {
      const result = await memoryContext({
        action: 'get',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('type');
    });

    it('should get context when valid', async () => {
      vi.spyOn(contextTools, 'getContext').mockResolvedValue({
        success: true,
        data: { type: 'decision', data: { answer: 'yes' } }
      });

      const result = await memoryContext({
        action: 'get',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        type: 'decision'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get') {
        expect(result.data.data.type).toBe('decision');
      }
    });
  });

  describe('store_initial action', () => {
    it('should require user_request', async () => {
      const result = await memoryContext({
        action: 'store_initial',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('user_request');
    });

    it('should store initial context when valid', async () => {
      vi.spyOn(contextTools, 'storeInitialContext').mockResolvedValue({
        success: true,
        data: { path: '/tmp/original_request.json', context_summary: 'summary' }
      });

      const result = await memoryContext({
        action: 'store_initial',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        user_request: 'Do the thing'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'store_initial') {
        expect(result.data.data.context_summary).toContain('summary');
      }
    });
  });

  describe('list action', () => {
    it('should list context entries', async () => {
      vi.spyOn(contextTools, 'listContext').mockResolvedValue({
        success: true,
        data: ['decision.json']
      });

      const result = await memoryContext({
        action: 'list',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list') {
        expect(result.data.data).toHaveLength(1);
      }
    });
  });

  describe('list_research action', () => {
    it('should list research notes', async () => {
      vi.spyOn(contextTools, 'listResearchNotes').mockResolvedValue({
        success: true,
        data: ['note.md']
      });

      const result = await memoryContext({
        action: 'list_research',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list_research') {
        expect(result.data.data).toHaveLength(1);
      }
    });
  });

  describe('append_research action', () => {
    it('should require filename and content', async () => {
      const result = await memoryContext({
        action: 'append_research',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('filename');
    });

    it('should append research when valid', async () => {
      vi.spyOn(contextTools, 'appendResearch').mockResolvedValue({
        success: true,
        data: {
          path: '/tmp/note.md',
          sanitized: true,
          injection_attempts: [],
          warnings: []
        }
      });

      const result = await memoryContext({
        action: 'append_research',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        filename: 'note.md',
        content: 'notes'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'append_research') {
        expect(result.data.data.path).toContain('note.md');
      }
    });
  });

  describe('generate_instructions action', () => {
    it('should require target_agent and mission', async () => {
      const result = await memoryContext({
        action: 'generate_instructions',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('target_agent');
    });

    it('should generate instructions when valid', async () => {
      vi.spyOn(contextTools, 'generateAgentInstructions').mockResolvedValue({
        success: true,
        data: {
          instruction_file: {
            filename: 'Executor.instructions.md',
            target_agent: 'Executor',
            created_at: '2026-02-04T10:00:00Z',
            mission: 'Do it'
          },
          content: 'content',
          written_to: '/tmp/Executor.instructions.md'
        }
      });

      const result = await memoryContext({
        action: 'generate_instructions',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        target_agent: 'Executor',
        mission: 'Do it'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'generate_instructions') {
        expect(result.data.data.instruction_file.target_agent).toBe('Executor');
      }
    });
  });

  describe('batch_store action', () => {
    it('should require items array', async () => {
      const result = await memoryContext({
        action: 'batch_store',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('items');
    });

    it('should store multiple items and report failures', async () => {
      const storeContext = vi.spyOn(contextTools, 'storeContext');
      storeContext
        .mockResolvedValueOnce({ success: true, data: { path: '/tmp/a.json' } })
        .mockResolvedValueOnce({ success: false, error: 'failed' });

      const result = await memoryContext({
        action: 'batch_store',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        items: [
          { type: 'a', data: { value: 1 } },
          { type: 'b', data: { value: 2 } }
        ]
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'batch_store') {
        expect(result.data.data.stored).toHaveLength(1);
        expect(result.data.data.failed).toHaveLength(1);
      }
    });
  });

  describe('workspace context actions', () => {
    it('should get workspace context when valid', async () => {
      vi.spyOn(workspaceContextTools, 'getWorkspaceContext').mockResolvedValue({
        success: true,
        data: { context: mockWorkspaceContext, path: '/tmp/workspace.context.json' }
      });

      const result = await memoryContext({
        action: 'workspace_get',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'workspace_get') {
        expect(result.data.data.context.workspace_id).toBe(mockWorkspaceId);
      }
    });

    it('should require data for workspace_set', async () => {
      const result = await memoryContext({
        action: 'workspace_set',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('data');
    });

    it('should set workspace context when valid', async () => {
      vi.spyOn(workspaceContextTools, 'setWorkspaceContext').mockResolvedValue({
        success: true,
        data: { context: mockWorkspaceContext, path: '/tmp/workspace.context.json' }
      });

      const result = await memoryContext({
        action: 'workspace_set',
        workspace_id: mockWorkspaceId,
        data: { name: 'Test Workspace' }
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'workspace_set') {
        expect(result.data.data.context.workspace_id).toBe(mockWorkspaceId);
      }
    });

    it('should require data for workspace_update', async () => {
      const result = await memoryContext({
        action: 'workspace_update',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('data');
    });

    it('should update workspace context when valid', async () => {
      vi.spyOn(workspaceContextTools, 'updateWorkspaceContext').mockResolvedValue({
        success: true,
        data: { context: mockWorkspaceContext, path: '/tmp/workspace.context.json' }
      });

      const result = await memoryContext({
        action: 'workspace_update',
        workspace_id: mockWorkspaceId,
        data: { sections: { purpose: { summary: 'Keep focus' } } }
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'workspace_update') {
        expect(result.data.data.context.workspace_id).toBe(mockWorkspaceId);
      }
    });

    it('should delete workspace context when valid', async () => {
      vi.spyOn(workspaceContextTools, 'deleteWorkspaceContext').mockResolvedValue({
        success: true,
        data: { deleted: true, path: '/tmp/workspace.context.json' }
      });

      const result = await memoryContext({
        action: 'workspace_delete',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'workspace_delete') {
        expect(result.data.data.deleted).toBe(true);
      }
    });
  });

  describe('search action', () => {
    it('should forward scope/types/limit and return deterministic truncation payload', async () => {
      const searchSpy = vi.spyOn(contextSearchTools, 'searchContext').mockResolvedValue({
        success: true,
        data: {
          scope: 'workspace',
          query: 'agent',
          types: ['research', 'architecture'],
          limit: 2,
          total: 5,
          truncated: true,
          truncation: {
            requested_limit: 2,
            applied_limit: 2,
            returned: 2,
            total_before_limit: 5,
          },
          results: [
            { id: 'r1', type: 'research', title: 'alpha' },
            { id: 'r2', type: 'architecture', title: 'beta' },
          ],
        },
      } as any);

      const result = await memoryContext({
        action: 'search',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        query: 'agent',
        scope: 'workspace',
        types: ['research', 'architecture'],
        limit: 2,
        _session_id: 'sess_ctx_search',
      });

      expect(result.success).toBe(true);
      expect(searchSpy).toHaveBeenCalledWith({
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        query: 'agent',
        scope: 'workspace',
        types: ['research', 'architecture'],
        limit: 2,
      });

      if (result.data && result.data.action === 'search') {
        expect(result.data.data.scope).toBe('workspace');
        expect(result.data.data.types).toEqual(['research', 'architecture']);
        expect(result.data.data.limit).toBe(2);
        expect(result.data.data.truncated).toBe(true);
        expect(result.data.data.truncation.returned).toBe(2);
        expect(result.data.data.results).toHaveLength(2);
      }
    });
  });

  describe('promptanalyst_discover action', () => {
    it('should require query via preflight validation', async () => {
      const result = await memoryContext({
        action: 'promptanalyst_discover' as any,
        workspace_id: mockWorkspaceId,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('missing required field');
      expect(result.error).toContain('query');
    });

    it('should route to linked-memory discovery and return metadata-only payload', async () => {
      const discoverSpy = vi
        .spyOn(contextSearchTools, 'promptAnalystDiscoverLinkedMemory')
        .mockResolvedValue({
          success: true,
          data: {
            query: 'workspace guard',
            limit: 3,
            total: 1,
            truncated: false,
            linked_workspace_ids: ['ws_root', 'ws_child'],
            related_plan_ids: ['plan_1'],
            results: [
              {
                workspace_id: 'ws_root',
                workspace_relation: 'self',
                plan_id: 'plan_1',
                plan_title: 'Workspace guard fixes',
                context_title: 'architecture',
                context_type: 'plan_context',
                snippet: 'Guard logic tightened for linked workspaces',
                updated_at: '2026-02-28T20:00:00.000Z',
                relevance: {
                  score: 0.92,
                  matched_terms: ['workspace', 'guard'],
                  matched_fields: ['plan_title', 'snippet'],
                },
              },
            ],
          },
        } as any);

      const result = await memoryContext({
        action: 'promptanalyst_discover' as any,
        workspace_id: mockWorkspaceId,
        query: 'workspace guard',
        limit: 3,
      });

      expect(result.success).toBe(true);
      expect(discoverSpy).toHaveBeenCalledWith({
        workspace_id: mockWorkspaceId,
        query: 'workspace guard',
        limit: 3,
      });

      if (result.data && result.data.action === 'promptanalyst_discover') {
        expect(result.data.data.related_plan_ids).toEqual(['plan_1']);
        expect(result.data.data.results).toHaveLength(1);
        const firstResult = result.data.data.results[0] as Record<string, unknown>;
        expect(firstResult).not.toHaveProperty('content');
        expect(firstResult).not.toHaveProperty('payload');
      }
    });
  });

  describe('pull action', () => {
    it('should forward selectors/session id and preserve staged output contract', async () => {
      const pullSpy = vi.spyOn(contextPullTools, 'pullContext').mockResolvedValue({
        success: true,
        data: {
          scope: 'plan',
          selectors: [{ id: 'ctx-2' }, { index: 0 }],
          total: 1,
          staged: [
            {
              id: 'ctx-2',
              source_path: '/tmp/source/context.json',
              staged_path: '/tmp/.projectmemory/active_agents/tester/pull_staging/sess_ctx_pull/001-research-alpha.json',
              bytes: 321,
              type: 'research',
              title: 'alpha',
            },
          ],
        },
      } as any);

      const result = await memoryContext({
        action: 'pull',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        scope: 'plan',
        query: 'alpha',
        types: ['research'],
        selectors: [{ id: 'ctx-2' }, { index: 0 }],
        limit: 5,
        _session_id: 'sess_ctx_pull',
      });

      expect(result.success).toBe(true);
      expect(pullSpy).toHaveBeenCalledWith({
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        scope: 'plan',
        query: 'alpha',
        types: ['research'],
        selectors: [{ id: 'ctx-2' }, { index: 0 }],
        limit: 5,
        session_id: 'sess_ctx_pull',
      });

      if (result.data && result.data.action === 'pull') {
        expect(result.data.data.selectors).toEqual([{ id: 'ctx-2' }, { index: 0 }]);
        expect(result.data.data.total).toBe(1);
        expect(result.data.data.staged).toHaveLength(1);
        expect(result.data.data.staged[0].id).toBe('ctx-2');
        expect(String(result.data.data.staged[0].staged_path)).toContain('.projectmemory');
      }
    });
  });
});
