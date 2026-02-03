import { describe, it, expect } from 'vitest';
import {
  StepType,
  StepTypeMetadata,
  STEP_TYPE_BEHAVIORS,
  PlanStep,
  OrderValidationWarning,
  PlanOperationResult,
} from '../../types/index.js';

/**
 * Test suite for Phase 1: Core Types & Interfaces
 * 
 * Coverage:
 * 1. Type defaults and backwards compatibility
 * 2. STEP_TYPE_BEHAVIORS lookups
 * 3. Optional field handling
 */
describe('Phase 1: Step Types - Core Types & Interfaces', () => {
  
  // =========================================================================
  // 1. Type Defaults and Backwards Compatibility
  // =========================================================================
  
  describe('Type defaults and backwards compatibility', () => {
    
    it('should allow PlanStep creation without type field', () => {
      const step: PlanStep = {
        index: 0,
        phase: 'phase-1',
        task: 'Implement feature',
        status: 'pending'
      };
      
      expect(step.type).toBeUndefined();
      expect(step).toMatchObject({
        index: 0,
        phase: 'phase-1',
        task: 'Implement feature',
        status: 'pending'
      });
    });
    
    it('should treat steps without type field as standard type when defaulted', () => {
      const step: PlanStep = {
        index: 0,
        phase: 'phase-1',
        task: 'Implement feature',
        status: 'pending'
      };
      
      // When accessing type, default to 'standard' in business logic
      const effectiveType: StepType = step.type ?? 'standard';
      
      expect(effectiveType).toBe('standard');
      expect(STEP_TYPE_BEHAVIORS[effectiveType].auto_completable).toBe(true);
      expect(STEP_TYPE_BEHAVIORS[effectiveType].blocking).toBe(false);
    });
    
    it('should support old plan format with only required fields', () => {
      // Simulate loading an old plan with minimal step data
      const oldFormatStep: PlanStep = {
        index: 1,
        phase: 'implementation',
        task: 'Add tests',
        status: 'done',
        notes: 'Completed successfully'
      };
      
      expect(oldFormatStep.type).toBeUndefined();
      expect(oldFormatStep.requires_validation).toBeUndefined();
      expect(oldFormatStep.assignee).toBeUndefined();
      expect(oldFormatStep).toBeTruthy();
    });
    
    it('should support new plan format with all optional fields', () => {
      const newFormatStep: PlanStep = {
        index: 0,
        phase: 'phase-1',
        task: 'User approval checkpoint',
        status: 'pending',
        type: 'user_validation',
        requires_validation: true,
        assignee: 'Tester'
      };
      
      expect(newFormatStep.type).toBe('user_validation');
      expect(newFormatStep.requires_validation).toBe(true);
      expect(newFormatStep.assignee).toBe('Tester');
    });
  });
  
  // =========================================================================
  // 2. STEP_TYPE_BEHAVIORS Metadata Lookups
  // =========================================================================
  
  describe('STEP_TYPE_BEHAVIORS lookups', () => {
    
    it('should contain metadata for all 10 step types', () => {
      const expectedTypes: StepType[] = [
        'standard',
        'analysis',
        'validation',
        'user_validation',
        'complex',
        'critical',
        'build',
        'fix',
        'refactor',
        'confirmation'
      ];
      
      expectedTypes.forEach(type => {
        expect(STEP_TYPE_BEHAVIORS[type]).toBeDefined();
        expect(STEP_TYPE_BEHAVIORS[type].id).toBe(type);
      });
      
      // Verify exactly 10 types exist
      expect(Object.keys(STEP_TYPE_BEHAVIORS)).toHaveLength(10);
    });
    
    it('should have correct metadata structure for each type', () => {
      Object.values(STEP_TYPE_BEHAVIORS).forEach(metadata => {
        expect(metadata).toHaveProperty('id');
        expect(metadata).toHaveProperty('auto_completable');
        expect(metadata).toHaveProperty('blocking');
        expect(metadata).toHaveProperty('description');
        
        expect(typeof metadata.id).toBe('string');
        expect(typeof metadata.auto_completable).toBe('boolean');
        expect(typeof metadata.blocking).toBe('boolean');
        expect(typeof metadata.description).toBe('string');
      });
    });
    
    describe('auto_completable flag correctness', () => {
      
      it('should mark user_validation as NOT auto_completable', () => {
        const metadata = STEP_TYPE_BEHAVIORS.user_validation;
        expect(metadata.auto_completable).toBe(false);
        expect(metadata.blocking).toBe(true);
      });
      
      it('should mark confirmation as NOT auto_completable', () => {
        const metadata = STEP_TYPE_BEHAVIORS.confirmation;
        expect(metadata.auto_completable).toBe(false);
        expect(metadata.blocking).toBe(true);
      });
      
      it('should mark standard steps as auto_completable', () => {
        const autoCompletableTypes: StepType[] = [
          'standard',
          'analysis',
          'validation',
          'complex',
          'critical',
          'build',
          'fix',
          'refactor'
        ];
        
        autoCompletableTypes.forEach(type => {
          expect(STEP_TYPE_BEHAVIORS[type].auto_completable).toBe(true);
        });
      });
    });
    
    describe('blocking flag correctness', () => {
      
      it('should mark user_validation as blocking', () => {
        expect(STEP_TYPE_BEHAVIORS.user_validation.blocking).toBe(true);
      });
      
      it('should mark confirmation as blocking', () => {
        expect(STEP_TYPE_BEHAVIORS.confirmation.blocking).toBe(true);
      });
      
      it('should mark critical as blocking', () => {
        expect(STEP_TYPE_BEHAVIORS.critical.blocking).toBe(true);
      });
      
      it('should mark non-critical steps as non-blocking', () => {
        const nonBlockingTypes: StepType[] = [
          'standard',
          'analysis',
          'validation',
          'complex',
          'build',
          'fix',
          'refactor'
        ];
        
        nonBlockingTypes.forEach(type => {
          expect(STEP_TYPE_BEHAVIORS[type].blocking).toBe(false);
        });
      });
    });
    
    describe('behavioral combinations', () => {
      
      it('should correctly identify types that require user intervention', () => {
        // Types that cannot be auto-completed AND block progress
        const userInterventionTypes = Object.values(STEP_TYPE_BEHAVIORS)
          .filter(m => !m.auto_completable && m.blocking)
          .map(m => m.id);
        
        expect(userInterventionTypes).toContain('user_validation');
        expect(userInterventionTypes).toContain('confirmation');
        expect(userInterventionTypes).toHaveLength(2);
      });
      
      it('should correctly identify types that are critical but auto-completable', () => {
        // Critical type should block but still be auto-completable
        const critical = STEP_TYPE_BEHAVIORS.critical;
        expect(critical.blocking).toBe(true);
        expect(critical.auto_completable).toBe(true);
      });
      
      it('should correctly identify routine automation types', () => {
        // Types that are auto-completable and non-blocking
        const routineTypes = Object.values(STEP_TYPE_BEHAVIORS)
          .filter(m => m.auto_completable && !m.blocking)
          .map(m => m.id);
        
        expect(routineTypes).toContain('standard');
        expect(routineTypes).toContain('analysis');
        expect(routineTypes).toContain('validation');
        expect(routineTypes).toContain('build');
        expect(routineTypes).toContain('fix');
        expect(routineTypes).toContain('refactor');
        expect(routineTypes).toContain('complex');
      });
    });
  });
  
  // =========================================================================
  // 3. Optional Field Handling
  // =========================================================================
  
  describe('Optional field handling', () => {
    
    describe('type field', () => {
      
      it('should accept PlanStep with type field', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Review code',
          status: 'pending',
          type: 'validation'
        };
        
        expect(step.type).toBe('validation');
      });
      
      it('should accept PlanStep without type field', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Review code',
          status: 'pending'
        };
        
        expect(step.type).toBeUndefined();
      });
      
      it('should accept all valid StepType values', () => {
        const types: StepType[] = [
          'standard',
          'analysis',
          'validation',
          'user_validation',
          'complex',
          'critical',
          'build',
          'fix',
          'refactor',
          'confirmation'
        ];
        
        types.forEach(type => {
          const step: PlanStep = {
            index: 0,
            phase: 'test',
            task: 'test',
            status: 'pending',
            type: type
          };
          
          expect(step.type).toBe(type);
        });
      });
    });
    
    describe('requires_validation field', () => {
      
      it('should accept PlanStep with requires_validation true', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Deploy to production',
          status: 'pending',
          requires_validation: true
        };
        
        expect(step.requires_validation).toBe(true);
      });
      
      it('should accept PlanStep with requires_validation false', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Run linter',
          status: 'pending',
          requires_validation: false
        };
        
        expect(step.requires_validation).toBe(false);
      });
      
      it('should accept PlanStep without requires_validation field', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Run linter',
          status: 'pending'
        };
        
        expect(step.requires_validation).toBeUndefined();
      });
    });
    
    describe('assignee field', () => {
      
      it('should accept PlanStep with assignee', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Write tests',
          status: 'pending',
          assignee: 'Tester'
        };
        
        expect(step.assignee).toBe('Tester');
      });
      
      it('should accept PlanStep without assignee', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Write tests',
          status: 'pending'
        };
        
        expect(step.assignee).toBeUndefined();
      });
      
      it('should accept various agent types as assignee values', () => {
        const assignees = [
          'Coordinator',
          'Researcher',
          'Architect',
          'Executor',
          'Reviewer',
          'Tester',
          'Archivist',
          'Revisionist'
        ];
        
        assignees.forEach(assignee => {
          const step: PlanStep = {
            index: 0,
            phase: 'test',
            task: 'test',
            status: 'pending',
            assignee: assignee
          };
          
          expect(step.assignee).toBe(assignee);
        });
      });
    });
    
    describe('combined optional fields', () => {
      
      it('should accept PlanStep with all optional fields', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Critical user approval',
          status: 'pending',
          type: 'user_validation',
          requires_validation: true,
          assignee: 'Reviewer',
          notes: 'Awaiting stakeholder approval'
        };
        
        expect(step.type).toBe('user_validation');
        expect(step.requires_validation).toBe(true);
        expect(step.assignee).toBe('Reviewer');
        expect(step.notes).toBe('Awaiting stakeholder approval');
      });
      
      it('should accept PlanStep with no optional fields', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Simple task',
          status: 'done'
        };
        
        expect(step.type).toBeUndefined();
        expect(step.requires_validation).toBeUndefined();
        expect(step.assignee).toBeUndefined();
        expect(step.notes).toBeUndefined();
        expect(step.completed_at).toBeUndefined();
      });
      
      it('should accept PlanStep with mixed optional fields', () => {
        const step: PlanStep = {
          index: 0,
          phase: 'phase-1',
          task: 'Build project',
          status: 'active',
          type: 'build',
          assignee: 'Executor'
          // requires_validation intentionally omitted
        };
        
        expect(step.type).toBe('build');
        expect(step.assignee).toBe('Executor');
        expect(step.requires_validation).toBeUndefined();
      });
    });
  });
  
  // =========================================================================
  // 4. OrderValidationWarning Interface
  // =========================================================================
  
  describe('OrderValidationWarning interface', () => {
    
    it('should accept valid OrderValidationWarning structure', () => {
      const warning: OrderValidationWarning = {
        step_completed: 5,
        prior_pending: [2, 3, 4],
        message: 'Step 5 completed before steps 2, 3, 4'
      };
      
      expect(warning.step_completed).toBe(5);
      expect(warning.prior_pending).toEqual([2, 3, 4]);
      expect(warning.message).toBe('Step 5 completed before steps 2, 3, 4');
    });
    
    it('should accept warning with single prior pending step', () => {
      const warning: OrderValidationWarning = {
        step_completed: 3,
        prior_pending: [1],
        message: 'Step 3 completed before step 1'
      };
      
      expect(warning.prior_pending).toHaveLength(1);
      expect(warning.prior_pending[0]).toBe(1);
    });
    
    it('should accept warning with empty prior_pending array', () => {
      const warning: OrderValidationWarning = {
        step_completed: 0,
        prior_pending: [],
        message: 'First step completed in order'
      };
      
      expect(warning.prior_pending).toHaveLength(0);
    });
  });
  
  // =========================================================================
  // 5. PlanOperationResult Interface Updates
  // =========================================================================
  
  describe('PlanOperationResult with order_warning field', () => {
    
    it('should accept PlanOperationResult without order_warning', () => {
      // Note: This test only validates the type structure, not actual implementation
      // Actual PlanOperationResult would need plan_state, role_boundaries, next_action
      // For type testing purposes, we focus on the order_warning field
      
      const mockResult = {
        order_warning: undefined
      };
      
      expect(mockResult.order_warning).toBeUndefined();
    });
    
    it('should accept PlanOperationResult with order_warning', () => {
      const warning: OrderValidationWarning = {
        step_completed: 5,
        prior_pending: [2, 3],
        message: 'Out of order completion detected'
      };
      
      const mockResult = {
        order_warning: warning
      };
      
      expect(mockResult.order_warning).toBeDefined();
      expect(mockResult.order_warning?.step_completed).toBe(5);
      expect(mockResult.order_warning?.prior_pending).toEqual([2, 3]);
    });
  });
  
  // =========================================================================
  // 6. Integration Tests - Type System Behavior
  // =========================================================================
  
  describe('Integration: Type system behavior patterns', () => {
    
    it('should allow querying step behavior based on type', () => {
      const steps: PlanStep[] = [
        { index: 0, phase: 'setup', task: 'Install deps', status: 'done', type: 'build' },
        { index: 1, phase: 'setup', task: 'Review plan', status: 'pending', type: 'user_validation' },
        { index: 2, phase: 'impl', task: 'Add feature', status: 'pending', type: 'complex' },
        { index: 3, phase: 'impl', task: 'Run tests', status: 'pending', type: 'validation' }
      ];
      
      // Find steps requiring user approval
      const userApprovalSteps = steps.filter(step => {
        const type = step.type ?? 'standard';
        return !STEP_TYPE_BEHAVIORS[type].auto_completable;
      });
      
      expect(userApprovalSteps).toHaveLength(1);
      expect(userApprovalSteps[0].task).toBe('Review plan');
    });
    
    it('should allow identifying blocking steps', () => {
      const steps: PlanStep[] = [
        { index: 0, phase: 'phase-1', task: 'Setup', status: 'done', type: 'standard' },
        { index: 1, phase: 'phase-1', task: 'Critical deploy', status: 'pending', type: 'critical' },
        { index: 2, phase: 'phase-2', task: 'Cleanup', status: 'pending', type: 'standard' }
      ];
      
      const blockingSteps = steps.filter(step => {
        const type = step.type ?? 'standard';
        return STEP_TYPE_BEHAVIORS[type].blocking && step.status !== 'done';
      });
      
      expect(blockingSteps).toHaveLength(1);
      expect(blockingSteps[0].task).toBe('Critical deploy');
    });
    
    it('should support migration from untyped to typed steps', () => {
      // Old step format (no type)
      const oldStep: PlanStep = {
        index: 0,
        phase: 'phase-1',
        task: 'Old task',
        status: 'done'
      };
      
      // Upgrade to new format
      const upgradedStep: PlanStep = {
        ...oldStep,
        type: 'standard'
      };
      
      expect(upgradedStep.type).toBe('standard');
      expect(upgradedStep.index).toBe(oldStep.index);
      expect(upgradedStep.task).toBe(oldStep.task);
    });
  });
});
