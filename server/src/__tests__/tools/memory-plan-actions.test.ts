import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import type { MemoryPlanParams } from '../../tools/consolidated/memory_plan.js';
import * as planTools from '../../tools/plan/index.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

vi.mock('../../tools/plan.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_plan_actions_123';
const mockPlanId = 'plan_actions_456';

describe('MCP Tool: memory_plan Core Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  describe('list action', () => {
    it('should require workspace_id or workspace_path', async () => {
      const result = await memoryPlan({ action: 'list' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id or workspace_path');
    });

    it('should list plans when valid', async () => {
      vi.spyOn(planTools, 'listPlans').mockResolvedValue({
        success: true,
        data: {
          workspace_id: mockWorkspaceId,
          workspace_name: 'Test Workspace',
          workspace_path: '/test/workspace',
          active_plans: [],
          archived_plans: [],
          message: 'ok'
        }
      });

      const result = await memoryPlan({
        action: 'list',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list') {
        expect(result.data.data.workspace_id).toBe(mockWorkspaceId);
      }
    });
  });

  describe('get action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryPlan({ action: 'get', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should return plan state when valid', async () => {
      vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'get',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('create action', () => {
    it('should require workspace_id, title, description, and category', async () => {
      const result = await memoryPlan({
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Plan'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('description');
    });

    it('should create plan when valid', async () => {
      vi.spyOn(planTools, 'createPlan').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Plan',
        description: 'Plan desc',
        category: 'feature'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'create') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('update action', () => {
    it('should require workspace_id, plan_id, and steps', async () => {
      const result = await memoryPlan({
        action: 'update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('steps');
    });

    it('should update plan steps when valid', async () => {
      vi.spyOn(planTools, 'modifyPlan').mockResolvedValue({
        success: true,
        data: {
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          role_boundaries: {
            agent_type: 'Executor',
            can_implement: true,
            can_finalize: true,
            must_handoff_to: [],
            forbidden_actions: [],
            primary_responsibility: 'Implement changes'
          },
          next_action: {
            should_handoff: false,
            message: 'ok'
          }
        }
      });

      const result = await memoryPlan({
        action: 'update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        steps: [{ phase: 'Phase 1', task: 'Task 1', status: 'pending' }]
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'update') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('archive action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryPlan({ action: 'archive', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should archive plan when valid', async () => {
      vi.spyOn(planTools, 'archivePlan').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'archived',
          current_phase: 'complete',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'archive',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'archive') {
        expect(result.data.data.status).toBe('archived');
      }
    });
  });

  describe('import action', () => {
    it('should require workspace_id, plan_file_path, and category', async () => {
      const result = await memoryPlan({
        action: 'import',
        workspace_id: mockWorkspaceId,
        plan_file_path: '/tmp/plan.md'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('category');
    });

    it('should import plan when valid', async () => {
      vi.spyOn(planTools, 'importPlan').mockResolvedValue({
        success: true,
        data: {
          plan_id: mockPlanId,
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Imported Plan',
            description: 'Imported',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          warnings: []
        }
      });

      const result = await memoryPlan({
        action: 'import',
        workspace_id: mockWorkspaceId,
        plan_file_path: '/tmp/plan.md',
        category: 'feature'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'import') {
        expect(result.data.data.plan_id).toBe(mockPlanId);
      }
    });
  });

  describe('find action', () => {
    it('should require plan_id', async () => {
      const result = await memoryPlan({ action: 'find' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should find plan when valid', async () => {
      vi.spyOn(planTools, 'findPlan').mockResolvedValue({
        success: true,
        data: {
          workspace_id: mockWorkspaceId,
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          workspace_path: '/test/workspace',
          resume_instruction: 'resume'
        }
      });

      const result = await memoryPlan({
        action: 'find',
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'find') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('add_note action', () => {
    it('should require workspace_id, plan_id, and note', async () => {
      const result = await memoryPlan({
        action: 'add_note',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('note');
    });

    it('should add plan note when valid', async () => {
      vi.spyOn(planTools, 'addPlanNote').mockResolvedValue({
        success: true,
        data: {
          plan_id: mockPlanId,
          notes_count: 1
        }
      });

      const result = await memoryPlan({
        action: 'add_note',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        note: 'Note'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'add_note') {
        expect(result.data.data.notes_count).toBe(1);
      }
    });
  });

  describe('delete action', () => {
    it('should require confirm=true', async () => {
      const result = await memoryPlan({
        action: 'delete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirm');
    });

    it('should delete plan when confirm=true', async () => {
      vi.spyOn(planTools, 'deletePlan').mockResolvedValue({
        success: true,
        data: {
          deleted: true,
          plan_id: mockPlanId
        }
      });

      const result = await memoryPlan({
        action: 'delete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        confirm: true
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'delete') {
        expect(result.data.data.deleted).toBe(true);
      }
    });
  });

  describe('consolidate action', () => {
    it('should require workspace_id, plan_id, step_indices, and consolidated_task', async () => {
      const result = await memoryPlan({
        action: 'consolidate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('step_indices');
    });

    it('should consolidate steps when valid', async () => {
      vi.spyOn(planTools, 'consolidateSteps').mockResolvedValue({
        success: true,
        data: {
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          role_boundaries: {
            agent_type: 'Executor',
            can_implement: true,
            can_finalize: true,
            must_handoff_to: [],
            forbidden_actions: [],
            primary_responsibility: 'Implement changes'
          },
          next_action: {
            should_handoff: false,
            message: 'ok'
          }
        }
      });

      const result = await memoryPlan({
        action: 'consolidate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_indices: [0, 1],
        consolidated_task: 'Merged'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'consolidate') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('create_from_template action', () => {
    it('should require workspace_id, template, title, and description', async () => {
      const result = await memoryPlan({
        action: 'create_from_template',
        workspace_id: mockWorkspaceId,
        template: 'feature'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should create plan from template when valid', async () => {
      vi.spyOn(planTools, 'createPlanFromTemplate').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Template Plan',
          description: 'From template',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'create_from_template',
        workspace_id: mockWorkspaceId,
        template: 'feature',
        title: 'Template Plan',
        description: 'From template'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'create_from_template') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('list_templates action', () => {
    it('should list templates', async () => {
      vi.spyOn(planTools, 'getTemplates').mockReturnValue([
        { template: 'feature', steps: [] }
      ]);

      const result = await memoryPlan({ action: 'list_templates' });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list_templates') {
        expect(result.data.data).toHaveLength(1);
        expect(result.data.data[0].template).toBe('feature');
      }
    });
  });
});
