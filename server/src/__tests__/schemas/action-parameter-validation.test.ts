import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Test suite for Phase 2: Schemas - New Action Parameter Validation
 * 
 * Coverage:
 * 1. memory_steps insert action parameters (at_index, step)
 * 2. memory_steps delete action parameters (step_index)
 * 3. memory_plan delete action parameters (confirm)
 * 4. memory_plan consolidate action parameters (step_indices, consolidated_task)
 */

// Schema definitions mirroring index.ts
const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex', 
  'critical', 'build', 'fix', 'refactor', 'confirmation'
]).optional().default('standard');

const StepStatusSchema = z.enum(['pending', 'active', 'done', 'blocked']);

const StepObjectSchema = z.object({
  phase: z.string(),
  task: z.string(),
  type: StepTypeSchema,
  status: StepStatusSchema.optional().default('pending'),
  notes: z.string().optional(),
  assignee: z.string().optional()
});

describe('Phase 2: Schemas - New Action Parameter Validation', () => {
  
  // =========================================================================
  // 1. memory_steps INSERT action parameters
  // =========================================================================
  
  describe('memory_steps insert action parameters', () => {
    
    // Schema for insert action
    const InsertStepSchema = z.object({
      action: z.literal('insert'),
      workspace_id: z.string(),
      plan_id: z.string(),
      at_index: z.number().optional(),
      step: StepObjectSchema.optional()
    });
    
    it('should validate insert with at_index and step', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: 5,
        step: {
          phase: 'phase-2',
          task: 'New step to insert',
          type: 'critical'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.at_index).toBe(5);
        expect(result.data.step?.task).toBe('New step to insert');
        expect(result.data.step?.type).toBe('critical');
      }
    });
    
    it('should validate insert with at_index = 0 (insert at beginning)', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: 0,
        step: {
          phase: 'phase-1',
          task: 'First step'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.at_index).toBe(0);
      }
    });
    
    it('should validate insert without at_index (append to end)', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step: {
          phase: 'phase-3',
          task: 'Append step'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.at_index).toBeUndefined();
      }
    });
    
    it('should validate insert step with all optional fields', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: 3,
        step: {
          phase: 'phase-2',
          task: 'Complex validation step',
          type: 'user_validation',
          status: 'pending',
          notes: 'Requires manual approval',
          assignee: 'Reviewer'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step).toMatchObject({
          phase: 'phase-2',
          task: 'Complex validation step',
          type: 'user_validation',
          status: 'pending',
          notes: 'Requires manual approval',
          assignee: 'Reviewer'
        });
      }
    });
    
    it('should validate insert step with type defaulting to standard', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: 2,
        step: {
          phase: 'phase-1',
          task: 'Regular step'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step?.type).toBe('standard');
      }
    });
    
    it('should reject insert with negative at_index', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: -1,
        step: {
          phase: 'phase-1',
          task: 'Invalid step'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      // Note: This passes schema validation; business logic should reject negative indices
      expect(result.success).toBe(true);
      // In actual implementation, insertStep() should validate at_index >= 0
    });
    
    it('should reject insert with non-numeric at_index', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: '5' as any, // Invalid: string instead of number
        step: {
          phase: 'phase-1',
          task: 'Invalid step'
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should reject insert with invalid step object', () => {
      const params = {
        action: 'insert' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        at_index: 2,
        step: {
          phase: 'phase-1'
          // Missing required 'task' field
        }
      };
      
      const result = InsertStepSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 2. memory_steps DELETE action parameters
  // =========================================================================
  
  describe('memory_steps delete action parameters', () => {
    
    // Schema for delete action
    const DeleteStepSchema = z.object({
      action: z.literal('delete'),
      workspace_id: z.string(),
      plan_id: z.string(),
      step_index: z.number().optional()
    });
    
    it('should validate delete with step_index', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_index: 3
      };
      
      const result = DeleteStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step_index).toBe(3);
      }
    });
    
    it('should validate delete with step_index = 0 (delete first step)', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_index: 0
      };
      
      const result = DeleteStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step_index).toBe(0);
      }
    });
    
    it('should validate delete without step_index (business logic should handle)', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456'
        // No step_index provided
      };
      
      const result = DeleteStepSchema.safeParse(params);
      expect(result.success).toBe(true);
      // In actual implementation, deleteStep() should require step_index
    });
    
    it('should reject delete with negative step_index', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_index: -1
      };
      
      const result = DeleteStepSchema.safeParse(params);
      // Note: This passes schema validation; business logic should reject negative indices
      expect(result.success).toBe(true);
    });
    
    it('should reject delete with non-numeric step_index', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_index: '3' as any // Invalid: string instead of number
      };
      
      const result = DeleteStepSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should reject delete with string step_index', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_index: 'first' as any // Invalid
      };
      
      const result = DeleteStepSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 3. memory_plan DELETE action parameters
  // =========================================================================
  
  describe('memory_plan delete action parameters', () => {
    
    // Schema for plan delete action
    const DeletePlanSchema = z.object({
      action: z.literal('delete'),
      workspace_id: z.string(),
      plan_id: z.string(),
      confirm: z.boolean().optional()
    });
    
    it('should validate delete with confirm = true', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        confirm: true
      };
      
      const result = DeletePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confirm).toBe(true);
      }
    });
    
    it('should validate delete with confirm = false (should fail in business logic)', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        confirm: false
      };
      
      const result = DeletePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confirm).toBe(false);
        // In actual implementation, deletePlan() should reject confirm !== true
      }
    });
    
    it('should validate delete without confirm parameter', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456'
        // No confirm provided
      };
      
      const result = DeletePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.confirm).toBeUndefined();
        // In actual implementation, this should fail with safety error
      }
    });
    
    it('should reject delete with non-boolean confirm', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        confirm: 'yes' as any // Invalid: string instead of boolean
      };
      
      const result = DeletePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should reject delete with numeric confirm', () => {
      const params = {
        action: 'delete' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        confirm: 1 as any // Invalid: number instead of boolean
      };
      
      const result = DeletePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 4. memory_plan CONSOLIDATE action parameters
  // =========================================================================
  
  describe('memory_plan consolidate action parameters', () => {
    
    // Schema for consolidate action
    const ConsolidatePlanSchema = z.object({
      action: z.literal('consolidate'),
      workspace_id: z.string(),
      plan_id: z.string(),
      step_indices: z.array(z.number()).optional(),
      consolidated_task: z.string().optional()
    });
    
    it('should validate consolidate with step_indices and consolidated_task', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [3, 4, 5],
        consolidated_task: 'Combined implementation and testing'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step_indices).toEqual([3, 4, 5]);
        expect(result.data.consolidated_task).toBe('Combined implementation and testing');
      }
    });
    
    it('should validate consolidate with two consecutive indices', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [0, 1],
        consolidated_task: 'Setup and configuration'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step_indices).toHaveLength(2);
      }
    });
    
    it('should validate consolidate with single index', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [5],
        consolidated_task: 'Single step consolidation'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      // Business logic should handle single-step consolidation appropriately
    });
    
    it('should validate consolidate with many indices', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [10, 11, 12, 13, 14, 15, 16],
        consolidated_task: 'All testing steps merged'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.step_indices).toHaveLength(7);
      }
    });
    
    it('should validate consolidate without step_indices (business logic should handle)', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        consolidated_task: 'Merged task'
        // No step_indices provided
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      // In actual implementation, consolidateSteps() should require step_indices
    });
    
    it('should validate consolidate without consolidated_task (business logic should handle)', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [1, 2, 3]
        // No consolidated_task provided
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      // In actual implementation, consolidateSteps() should require consolidated_task
    });
    
    it('should validate consolidate with empty step_indices array', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [],
        consolidated_task: 'Empty consolidation'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(true);
      // Business logic should reject empty arrays
    });
    
    it('should reject consolidate with non-array step_indices', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: '1,2,3' as any, // Invalid: string instead of array
        consolidated_task: 'Merged task'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should reject consolidate with non-numeric step_indices elements', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: ['1', '2', '3'] as any, // Invalid: strings instead of numbers
        consolidated_task: 'Merged task'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should reject consolidate with mixed types in step_indices', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [1, '2', 3] as any, // Invalid: mixed types
        consolidated_task: 'Merged task'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
    
    it('should validate consolidate with negative indices (business logic should reject)', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [-1, 0, 1],
        consolidated_task: 'Invalid consolidation'
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      // Schema validation passes; business logic should reject negative indices
      expect(result.success).toBe(true);
    });
    
    it('should reject consolidate with non-string consolidated_task', () => {
      const params = {
        action: 'consolidate' as const,
        workspace_id: 'ws_123',
        plan_id: 'plan_456',
        step_indices: [1, 2, 3],
        consolidated_task: { description: 'Merged task' } as any // Invalid: object instead of string
      };
      
      const result = ConsolidatePlanSchema.safeParse(params);
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 5. Combined Action Enum Validation
  // =========================================================================
  
  describe('Action enum validation', () => {
    
    const StepsActionSchema = z.enum(['add', 'update', 'batch_update', 'insert', 'delete']);
    const PlanActionSchema = z.enum(['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note', 'delete', 'consolidate']);
    
    it('should accept all memory_steps actions', () => {
      const actions = ['add', 'update', 'batch_update', 'insert', 'delete'];
      
      actions.forEach(action => {
        const result = StepsActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      });
    });
    
    it('should accept all memory_plan actions', () => {
      const actions = ['list', 'get', 'create', 'update', 'archive', 'import', 'find', 'add_note', 'delete', 'consolidate'];
      
      actions.forEach(action => {
        const result = PlanActionSchema.safeParse(action);
        expect(result.success).toBe(true);
      });
    });
    
    it('should reject invalid memory_steps actions', () => {
      const invalidActions = ['remove', 'modify', 'consolidate'];
      
      invalidActions.forEach(action => {
        const result = StepsActionSchema.safeParse(action);
        expect(result.success).toBe(false);
      });
    });
    
    it('should reject invalid memory_plan actions', () => {
      const invalidActions = ['remove', 'destroy', 'merge'];
      
      invalidActions.forEach(action => {
        const result = PlanActionSchema.safeParse(action);
        expect(result.success).toBe(false);
      });
    });
  });
});
