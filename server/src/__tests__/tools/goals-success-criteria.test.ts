import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import type { MemoryPlanParams } from '../../tools/consolidated/memory_plan.js';
import * as fileStore from '../../storage/db-store.js';
import * as planTools from '../../tools/plan/index.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

/**
 * Unit Tests for Goals and Success Criteria MCP Tool Actions (Phase 1)
 * 
 * Tests the goals/success_criteria functionality:
 * - memory_plan 'create' action with goals and success_criteria params
 * - memory_plan 'set_goals' action for updating goals on existing plans
 * - set_goals with only goals, only success_criteria, or both
 * - set_goals returns updated plan with new values
 */

// Mock file store
vi.mock('../../storage/db-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_goals_test_123';
const mockPlanId = 'plan_goals_test_456';

describe('MCP Tool: memory_plan Goals and Success Criteria Actions', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  // =========================================================================
  // create action with goals and success_criteria
  // =========================================================================

  describe('create action with goals/success_criteria', () => {
    
    it('should create plan with goals and success_criteria', async () => {
      const mockPlanState = {
        id: mockPlanId,
        workspace_id: mockWorkspaceId,
        title: 'Test Plan with Goals',
        description: 'A plan to test goals functionality',
        category: 'feature' as const,
        priority: 'medium' as const,
        status: 'active' as const,
        current_phase: 'initialization',
        current_agent: null,
        created_at: '2026-02-04T10:00:00Z',
        updated_at: '2026-02-04T10:00:00Z',
        goals: ['Goal 1', 'Goal 2'],
        success_criteria: ['Criteria A', 'Criteria B'],
        steps: [],
        agent_sessions: [],
        lineage: [],
        notes: []
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
        workspace_id: mockWorkspaceId,
        name: 'Test Workspace',
        path: '/test/workspace',
        created_at: '2026-01-01T00:00:00Z',
        active_plans: [],
        archived_plans: [],
      });
      vi.spyOn(fileStore, 'createPlan').mockResolvedValue(mockPlanState);

      const params: MemoryPlanParams = {
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Test Plan with Goals',
        description: 'A plan to test goals functionality',
        category: 'feature',
        goals: ['Goal 1', 'Goal 2'],
        success_criteria: ['Criteria A', 'Criteria B'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'create') {
        expect(result.data.data.goals).toEqual(['Goal 1', 'Goal 2']);
        expect(result.data.data.success_criteria).toEqual(['Criteria A', 'Criteria B']);
      }
      
      expect(fileStore.createPlan).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Test Plan with Goals',
        'A plan to test goals functionality',
        'feature',
        undefined, // priority
        undefined, // categorization
        ['Goal 1', 'Goal 2'],
        ['Criteria A', 'Criteria B']
      );
    });

    it('should create plan with only goals (no success_criteria)', async () => {
      const mockPlanState = {
        id: mockPlanId,
        workspace_id: mockWorkspaceId,
        title: 'Goals Only Plan',
        description: 'A plan with only goals',
        category: 'quick_task' as const,
        priority: 'medium' as const,
        status: 'active' as const,
        current_phase: 'initialization',
        current_agent: null,
        created_at: '2026-02-04T10:00:00Z',
        updated_at: '2026-02-04T10:00:00Z',
        goals: ['Only Goal'],
        success_criteria: undefined,
        steps: [],
        agent_sessions: [],
        lineage: [],
        notes: []
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
        workspace_id: mockWorkspaceId,
        name: 'Test Workspace',
        path: '/test/workspace',
        created_at: '2026-01-01T00:00:00Z',
        active_plans: [],
        archived_plans: [],
      });
      vi.spyOn(fileStore, 'createPlan').mockResolvedValue(mockPlanState);

      const params: MemoryPlanParams = {
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Goals Only Plan',
        description: 'A plan with only goals',
        category: 'quick_task',
        goals: ['Only Goal'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.createPlan).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Goals Only Plan',
        'A plan with only goals',
        'quick_task',
        undefined,
        undefined,
        ['Only Goal'],
        undefined
      );
    });

    it('should create plan with only success_criteria (no goals)', async () => {
      const mockPlanState = {
        id: mockPlanId,
        workspace_id: mockWorkspaceId,
        title: 'Criteria Only Plan',
        description: 'A plan with only success criteria',
        category: 'quick_task' as const,
        priority: 'high' as const,
        status: 'active' as const,
        current_phase: 'initialization',
        current_agent: null,
        created_at: '2026-02-04T10:00:00Z',
        updated_at: '2026-02-04T10:00:00Z',
        goals: undefined,
        success_criteria: ['Must pass all tests'],
        steps: [],
        agent_sessions: [],
        lineage: [],
        notes: []
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
        workspace_id: mockWorkspaceId,
        name: 'Test Workspace',
        path: '/test/workspace',
        created_at: '2026-01-01T00:00:00Z',
        active_plans: [],
        archived_plans: [],
      });
      vi.spyOn(fileStore, 'createPlan').mockResolvedValue(mockPlanState);

      const params: MemoryPlanParams = {
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Criteria Only Plan',
        description: 'A plan with only success criteria',
        category: 'quick_task',
        priority: 'high',
        success_criteria: ['Must pass all tests'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.createPlan).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Criteria Only Plan',
        'A plan with only success criteria',
        'quick_task',
        'high',
        undefined,
        undefined,
        ['Must pass all tests']
      );
    });

    it('should create plan without goals or success_criteria', async () => {
      const mockPlanState = {
        id: mockPlanId,
        workspace_id: mockWorkspaceId,
        title: 'Basic Plan',
        description: 'A plan without goals',
        category: 'quick_task' as const,
        priority: 'low' as const,
        status: 'active' as const,
        current_phase: 'initialization',
        current_agent: null,
        created_at: '2026-02-04T10:00:00Z',
        updated_at: '2026-02-04T10:00:00Z',
        steps: [],
        agent_sessions: [],
        lineage: [],
        notes: []
      };

      vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
        workspace_id: mockWorkspaceId,
        name: 'Test Workspace',
        path: '/test/workspace',
        created_at: '2026-01-01T00:00:00Z',
        active_plans: [],
        archived_plans: [],
      });
      vi.spyOn(fileStore, 'createPlan').mockResolvedValue(mockPlanState);

      const params: MemoryPlanParams = {
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Basic Plan',
        description: 'A plan without goals',
        category: 'quick_task',
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(fileStore.createPlan).toHaveBeenCalledWith(
        mockWorkspaceId,
        'Basic Plan',
        'A plan without goals',
        'quick_task',
        undefined,
        undefined,
        undefined,
        undefined
      );
    });
  });

  // =========================================================================
  // set_goals action - Update goals and success criteria
  // =========================================================================

  describe('set_goals action', () => {
    
    const mockExistingPlanState = {
      id: mockPlanId,
      workspace_id: mockWorkspaceId,
      title: 'Existing Plan',
      description: 'An existing plan',
      category: 'feature' as const,
      priority: 'medium' as const,
      status: 'active' as const,
      current_phase: 'development',
      current_agent: 'Executor',
      created_at: '2026-02-01T10:00:00Z',
      updated_at: '2026-02-01T10:00:00Z',
      goals: ['Original Goal'],
      success_criteria: ['Original Criteria'],
      steps: [],
      agent_sessions: [],
      lineage: [],
      notes: []
    };

    it('should update both goals and success_criteria', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue({ ...mockExistingPlanState });
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        goals: ['New Goal 1', 'New Goal 2'],
        success_criteria: ['New Criteria A', 'New Criteria B'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      if (result.data && result.data.action === 'set_goals') {
        expect(result.data.data.goals).toEqual(['New Goal 1', 'New Goal 2']);
        expect(result.data.data.success_criteria).toEqual(['New Criteria A', 'New Criteria B']);
        expect(result.data.data.message).toContain('goals');
        expect(result.data.data.message).toContain('success_criteria');
      }
    });

    it('should update only goals when success_criteria not provided', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue({ ...mockExistingPlanState });
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        goals: ['Updated Goal Only'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'set_goals') {
        expect(result.data.data.goals).toEqual(['Updated Goal Only']);
        // Original success_criteria should be preserved
        expect(result.data.data.success_criteria).toEqual(['Original Criteria']);
        expect(result.data.data.message).toContain('goals');
        expect(result.data.data.message).not.toContain('success_criteria');
      }
    });

    it('should update only success_criteria when goals not provided', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue({ ...mockExistingPlanState });
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        success_criteria: ['Updated Criteria Only'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'set_goals') {
        // Original goals should be preserved
        expect(result.data.data.goals).toEqual(['Original Goal']);
        expect(result.data.data.success_criteria).toEqual(['Updated Criteria Only']);
        expect(result.data.data.message).toContain('success_criteria');
        expect(result.data.data.message).not.toContain('goals and');
      }
    });

    it('should fail when neither goals nor success_criteria provided', async () => {
      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        // Neither goals nor success_criteria
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('At least one of goals or success_criteria is required');
    });

    it('should fail when workspace_id is missing', async () => {
      const params: MemoryPlanParams = {
        action: 'set_goals',
        plan_id: mockPlanId,
        goals: ['Some Goal'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('should fail when plan_id is missing', async () => {
      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        goals: ['Some Goal'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should fail when plan is not found', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(null);

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: 'non_existent_plan',
        goals: ['Some Goal'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plan not found');
    });

    it('should set goals to empty array when empty array provided', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue({ ...mockExistingPlanState });
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        goals: [],  // Explicitly clearing goals
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'set_goals') {
        expect(result.data.data.goals).toEqual([]);
      }
    });

    it('should return updated plan_id in result', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue({ ...mockExistingPlanState });
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryPlanParams = {
        action: 'set_goals',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        goals: ['Test Goal'],
      };

      const result = await memoryPlan(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'set_goals') {
        expect(result.data.data.plan_id).toBe(mockPlanId);
      }
    });
  });
});
