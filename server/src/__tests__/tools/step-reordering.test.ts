import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memorySteps } from '../../tools/consolidated/memory_steps.js';
import type { MemoryStepsParams } from '../../tools/consolidated/memory_steps.js';
import * as fileStore from '../../storage/file-store.js';

/**
 * Unit Tests for Step Reordering MCP Tool Actions (Phase 1)
 * 
 * Tests the step reordering functionality:
 * - memory_steps 'reorder' action with direction 'up'
 * - memory_steps 'reorder' action with direction 'down'
 * - reorder boundary cases (first step can't go up, last can't go down)
 * - memory_steps 'move' action from index A to index B
 * - move re-indexes all affected steps correctly
 */

// Mock file store
vi.mock('../../storage/file-store.js');

const mockWorkspaceId = 'ws_reorder_test_123';
const mockPlanId = 'plan_reorder_test_456';

// Helper to create mock plan state with steps
function createMockPlanState(stepCount: number = 5) {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Reorder Test Plan',
    description: 'A plan to test step reordering',
    category: 'feature' as const,
    priority: 'medium' as const,
    status: 'active' as const,
    current_phase: 'development',
    current_agent: 'Executor',
    created_at: '2026-02-04T10:00:00Z',
    updated_at: '2026-02-04T10:00:00Z',
    steps: Array.from({ length: stepCount }, (_, i) => ({
      index: i,
      phase: 'Phase 1',
      task: `Task ${i + 1}`,
      status: 'pending' as const,
      type: 'standard' as const,
    })),
    agent_sessions: [],
    lineage: [],
    notes: [],
  };
}

describe('MCP Tool: memory_steps Reorder and Move Actions', () => {
  
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // =========================================================================
  // reorder action - Move step up or down
  // =========================================================================

  describe('reorder action with direction "up"', () => {
    
    it('should swap step with the previous step when moving up', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 2,
        direction: 'up',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      if (result.data && result.data.action === 'reorder') {
        const steps = result.data.data.plan_state.steps;
        // Step that was at index 2 should now be at index 1
        expect(steps.find(s => s.task === 'Task 3')?.index).toBe(1);
        // Step that was at index 1 should now be at index 2
        expect(steps.find(s => s.task === 'Task 2')?.index).toBe(2);
      }
    });

    it('should fail when trying to move the first step up', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 0,
        direction: 'up',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already at the top');
    });

    it('should move second step to first position', async () => {
      const mockPlanState = createMockPlanState(3);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 1,
        direction: 'up',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'reorder') {
        const steps = result.data.data.plan_state.steps;
        // Task 2 should now be at index 0
        expect(steps[0].task).toBe('Task 2');
        // Task 1 should now be at index 1
        expect(steps[1].task).toBe('Task 1');
      }
    });
  });

  describe('reorder action with direction "down"', () => {
    
    it('should swap step with the next step when moving down', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 2,
        direction: 'down',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      expect(result.data).toBeDefined();
      
      if (result.data && result.data.action === 'reorder') {
        const steps = result.data.data.plan_state.steps;
        // Step that was at index 2 should now be at index 3
        expect(steps.find(s => s.task === 'Task 3')?.index).toBe(3);
        // Step that was at index 3 should now be at index 2
        expect(steps.find(s => s.task === 'Task 4')?.index).toBe(2);
      }
    });

    it('should fail when trying to move the last step down', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 4,  // Last step (index 4 in 5-step plan)
        direction: 'down',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('already at the bottom');
    });

    it('should move second-to-last step to last position', async () => {
      const mockPlanState = createMockPlanState(3);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 1,
        direction: 'down',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'reorder') {
        const steps = result.data.data.plan_state.steps;
        // Task 2 should now be at index 2 (last)
        expect(steps[2].task).toBe('Task 2');
        // Task 3 should now be at index 1
        expect(steps[1].task).toBe('Task 3');
      }
    });
  });

  describe('reorder action validation', () => {
    
    it('should fail when step_index is missing', async () => {
      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        direction: 'up',
        // step_index missing
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('step_index and direction');
    });

    it('should fail when direction is missing', async () => {
      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 2,
        // direction missing
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('step_index and direction');
    });

    it('should fail when plan is not found', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(null);

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: 'non_existent_plan',
        step_index: 0,
        direction: 'down',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plan not found');
    });

    it('should fail when step_index is not found in plan', async () => {
      const mockPlanState = createMockPlanState(3);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'reorder',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 10,  // Invalid index
        direction: 'up',
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  // =========================================================================
  // move action - Move step from one index to another
  // =========================================================================

  describe('move action', () => {
    
    it('should move step from higher index to lower index', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 4,  // Move last step
        to_index: 1,    // To second position
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const steps = result.data.data.plan_state.steps;
        // Verify the moved step is now at index 1
        expect(steps[1].task).toBe('Task 5');
        // Verify other steps shifted down
        expect(steps[0].task).toBe('Task 1');  // Unchanged
        expect(steps[2].task).toBe('Task 2');  // Was at 1, now at 2
        expect(steps[3].task).toBe('Task 3');  // Was at 2, now at 3
        expect(steps[4].task).toBe('Task 4');  // Was at 3, now at 4
      }
    });

    it('should move step from lower index to higher index', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 1,  // Move second step
        to_index: 4,    // To last position
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const steps = result.data.data.plan_state.steps;
        // Verify the moved step is now at index 4
        expect(steps[4].task).toBe('Task 2');
        // Verify other steps shifted up
        expect(steps[0].task).toBe('Task 1');  // Unchanged
        expect(steps[1].task).toBe('Task 3');  // Was at 2, now at 1
        expect(steps[2].task).toBe('Task 4');  // Was at 3, now at 2
        expect(steps[3].task).toBe('Task 5');  // Was at 4, now at 3
      }
    });

    it('should move first step to last position', async () => {
      const mockPlanState = createMockPlanState(4);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 0,
        to_index: 3,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const steps = result.data.data.plan_state.steps;
        // Task 1 should be at the end
        expect(steps[3].task).toBe('Task 1');
        // All other steps shift up
        expect(steps[0].task).toBe('Task 2');
        expect(steps[1].task).toBe('Task 3');
        expect(steps[2].task).toBe('Task 4');
      }
    });

    it('should move last step to first position', async () => {
      const mockPlanState = createMockPlanState(4);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 3,
        to_index: 0,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const steps = result.data.data.plan_state.steps;
        // Task 4 should be at the start
        expect(steps[0].task).toBe('Task 4');
        // All other steps shift down
        expect(steps[1].task).toBe('Task 1');
        expect(steps[2].task).toBe('Task 2');
        expect(steps[3].task).toBe('Task 3');
      }
    });

    it('should re-index all steps correctly after move', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 2,
        to_index: 0,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const steps = result.data.data.plan_state.steps;
        // All indices should be sequential 0,1,2,3,4
        steps.forEach((step, i) => {
          expect(step.index).toBe(i);
        });
        // Steps should be sorted by index
        expect(steps.map(s => s.index)).toEqual([0, 1, 2, 3, 4]);
      }
    });
  });

  describe('move action validation', () => {
    
    it('should fail when from_index is missing', async () => {
      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        to_index: 2,
        // from_index missing
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('from_index and to_index are required');
    });

    it('should fail when to_index is missing', async () => {
      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 1,
        // to_index missing
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('from_index and to_index are required');
    });

    it('should fail when from_index equals to_index', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 2,
        to_index: 2,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('cannot be the same');
    });

    it('should fail when from_index is out of bounds (negative)', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: -1,
        to_index: 2,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid from_index');
    });

    it('should fail when from_index is out of bounds (too high)', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 10,
        to_index: 2,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid from_index');
    });

    it('should fail when to_index is out of bounds', async () => {
      const mockPlanState = createMockPlanState(5);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 2,
        to_index: 100,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid to_index');
    });

    it('should fail when plan is not found', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(null);

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: 'non_existent_plan',
        from_index: 0,
        to_index: 2,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Plan not found');
    });
  });

  describe('move action preserves step data', () => {
    
    it('should preserve step status and notes during move', async () => {
      const mockPlanState = createMockPlanState(3);
      // Add custom status and notes to step being moved
      mockPlanState.steps[0].status = 'done';
      mockPlanState.steps[0].notes = 'Important notes';
      mockPlanState.steps[0].completed_at = '2026-02-04T12:00:00Z';
      
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'move',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        from_index: 0,
        to_index: 2,
      };

      const result = await memorySteps(params);
      
      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'move') {
        const movedStep = result.data.data.plan_state.steps[2];
        expect(movedStep.task).toBe('Task 1');
        expect(movedStep.status).toBe('done');
        expect(movedStep.notes).toBe('Important notes');
        expect(movedStep.completed_at).toBe('2026-02-04T12:00:00Z');
      }
    });
  });
});
