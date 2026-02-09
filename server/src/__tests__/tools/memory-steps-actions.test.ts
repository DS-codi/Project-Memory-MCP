import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memorySteps } from '../../tools/consolidated/memory_steps.js';
import type { MemoryStepsParams } from '../../tools/consolidated/memory_steps.js';
import * as fileStore from '../../storage/file-store.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

vi.mock('../../storage/file-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

const mockWorkspaceId = 'ws_steps_actions_123';
const mockPlanId = 'plan_steps_actions_456';

function createMockPlanState(stepCount: number = 3) {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Steps Action Test Plan',
    description: 'A plan to test memory_steps actions',
    category: 'feature' as const,
    priority: 'medium' as const,
    status: 'active' as const,
    current_phase: 'Phase 1',
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

describe('MCP Tool: memory_steps Add/Update/Batch/Insert/Delete/Replace Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  describe('add action', () => {
    it('should append steps with sequential indices and default status', async () => {
      const mockPlanState = createMockPlanState(2);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'add',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        steps: [
          { phase: 'Phase 2', task: 'New Task A', status: 'pending', type: 'standard' },
          { phase: 'Phase 2', task: 'New Task B', type: 'standard' },
        ]
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'add') {
        const steps = result.data.data.plan_state.steps;
        expect(steps).toHaveLength(4);
        expect(steps[2].index).toBe(2);
        expect(steps[3].index).toBe(3);
        expect(steps[3].status).toBe('pending');
      }
    });
  });

  describe('update action', () => {
    it('should update step status and notes and set completed_at when done', async () => {
      const mockPlanState = createMockPlanState(3);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');
      vi.spyOn(fileStore, 'nowISO').mockReturnValue('2026-02-08T00:00:00Z');

      const params: MemoryStepsParams = {
        action: 'update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 1,
        status: 'done',
        notes: 'Completed in tests'
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'update') {
        const step = result.data.data.plan_state.steps.find(s => s.index === 1);
        expect(step?.status).toBe('done');
        expect(step?.notes).toBe('Completed in tests');
        expect(step?.completed_at).toBe('2026-02-08T00:00:00Z');
      }
    });
  });

  describe('batch_update action', () => {
    it('should update multiple steps and report errors for missing steps', async () => {
      const mockPlanState = createMockPlanState(3);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');
      vi.spyOn(fileStore, 'nowISO').mockReturnValue('2026-02-08T00:00:00Z');

      const params: MemoryStepsParams = {
        action: 'batch_update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        updates: [
          { index: 0, status: 'done' },
          { index: 2, status: 'done', notes: 'Wrapped up' },
          { index: 10, status: 'done' },
        ]
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'batch_update') {
        expect(result.data.data.updated_count).toBe(2);
        expect(result.data.data.next_action.message).toContain('errors');
        const step0 = result.data.data.plan_state.steps.find(s => s.index === 0);
        const step2 = result.data.data.plan_state.steps.find(s => s.index === 2);
        expect(step0?.status).toBe('done');
        expect(step2?.notes).toBe('Wrapped up');
      }
    });
  });

  describe('insert action', () => {
    it('should normalize indices and shift depends_on when inserting', async () => {
      const mockPlanState = createMockPlanState(0);
      mockPlanState.steps = [
        { index: 0, phase: 'Phase 1', task: 'Task A', status: 'pending', type: 'standard' },
        { index: 2, phase: 'Phase 1', task: 'Task B', status: 'pending', type: 'standard', depends_on: [0] },
        { index: 4, phase: 'Phase 1', task: 'Task C', status: 'pending', type: 'standard', depends_on: [2] },
      ];

      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');
      vi.spyOn(fileStore, 'nowISO').mockReturnValue('2026-02-08T00:00:00Z');

      const params: MemoryStepsParams = {
        action: 'insert',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        at_index: 1,
        step: {
          phase: 'Phase 1',
          task: 'Inserted Task',
          status: 'pending',
          type: 'standard',
          depends_on: [4]
        }
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'insert') {
        const steps = result.data.data.plan_state.steps;
        expect(steps.map(s => s.index)).toEqual([0, 1, 2, 3]);
        const inserted = steps.find(s => s.task === 'Inserted Task');
        const taskC = steps.find(s => s.task === 'Task C');
        expect(inserted?.depends_on).toEqual([3]);
        expect(taskC?.depends_on).toEqual([2]);
      }
    });
  });

  describe('delete action', () => {
    it('should delete a step and reindex remaining steps', async () => {
      const mockPlanState = createMockPlanState(4);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'delete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 1,
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'delete') {
        const steps = result.data.data.plan_state.steps;
        expect(steps).toHaveLength(3);
        expect(steps.map(s => s.index)).toEqual([0, 1, 2]);
        expect(steps.find(s => s.task === 'Task 2')).toBeUndefined();
      }
    });
  });

  describe('replace action', () => {
    it('should replace all steps and reset indices', async () => {
      const mockPlanState = createMockPlanState(2);
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(mockPlanState);
      vi.spyOn(fileStore, 'savePlanState').mockResolvedValue();
      vi.spyOn(fileStore, 'generatePlanMd').mockResolvedValue('/path/to/plan.md');

      const params: MemoryStepsParams = {
        action: 'replace',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        replacement_steps: [
          { phase: 'Phase A', task: 'Replacement 1', status: 'pending', type: 'standard' },
          { phase: 'Phase B', task: 'Replacement 2', status: 'pending', type: 'standard' },
        ]
      };

      const result = await memorySteps(params);

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'replace') {
        const steps = result.data.data.plan_state.steps;
        expect(steps).toHaveLength(2);
        expect(steps[0].index).toBe(0);
        expect(steps[1].index).toBe(1);
        expect(result.data.data.plan_state.current_phase).toBe('Phase A');
      }
    });
  });
});
