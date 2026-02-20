import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryContext } from '../../tools/consolidated/memory_context.js';
import type { MemoryContextParams } from '../../tools/consolidated/memory_context.js';
import * as contextTools from '../../tools/context.tools.js';
import * as workspaceContextTools from '../../tools/workspace-context.tools.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

vi.mock('../../tools/context.tools.js');
vi.mock('../../tools/workspace-context.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
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
});
