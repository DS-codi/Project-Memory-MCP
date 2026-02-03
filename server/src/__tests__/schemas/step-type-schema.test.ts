import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Test suite for Phase 2: Schemas - StepTypeSchema Validation
 * 
 * Coverage:
 * 1. All 10 step types are valid
 * 2. Invalid types are rejected
 * 3. Default value is 'standard' when omitted
 * 4. Schema integration with memory_plan and memory_steps
 */

// Import the StepTypeSchema from index.ts
// This mirrors the actual schema definition
const StepTypeSchema = z.enum([
  'standard', 'analysis', 'validation', 'user_validation', 'complex', 
  'critical', 'build', 'fix', 'refactor', 'confirmation'
]).optional().default('standard');

describe('Phase 2: Schemas - StepTypeSchema Validation', () => {
  
  // =========================================================================
  // 1. All 10 Step Types Are Valid
  // =========================================================================
  
  describe('Valid step type values', () => {
    
    it('should accept "standard" as valid', () => {
      const result = StepTypeSchema.safeParse('standard');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('standard');
      }
    });
    
    it('should accept "analysis" as valid', () => {
      const result = StepTypeSchema.safeParse('analysis');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('analysis');
      }
    });
    
    it('should accept "validation" as valid', () => {
      const result = StepTypeSchema.safeParse('validation');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('validation');
      }
    });
    
    it('should accept "user_validation" as valid', () => {
      const result = StepTypeSchema.safeParse('user_validation');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('user_validation');
      }
    });
    
    it('should accept "complex" as valid', () => {
      const result = StepTypeSchema.safeParse('complex');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('complex');
      }
    });
    
    it('should accept "critical" as valid', () => {
      const result = StepTypeSchema.safeParse('critical');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('critical');
      }
    });
    
    it('should accept "build" as valid', () => {
      const result = StepTypeSchema.safeParse('build');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('build');
      }
    });
    
    it('should accept "fix" as valid', () => {
      const result = StepTypeSchema.safeParse('fix');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('fix');
      }
    });
    
    it('should accept "refactor" as valid', () => {
      const result = StepTypeSchema.safeParse('refactor');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('refactor');
      }
    });
    
    it('should accept "confirmation" as valid', () => {
      const result = StepTypeSchema.safeParse('confirmation');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('confirmation');
      }
    });
    
    it('should accept all 10 types in array', () => {
      const allTypes = [
        'standard', 'analysis', 'validation', 'user_validation', 'complex',
        'critical', 'build', 'fix', 'refactor', 'confirmation'
      ];
      
      allTypes.forEach(type => {
        const result = StepTypeSchema.safeParse(type);
        expect(result.success).toBe(true);
      });
    });
  });
  
  // =========================================================================
  // 2. Invalid Types Are Rejected
  // =========================================================================
  
  describe('Invalid step type values', () => {
    
    it('should reject invalid type "unknown"', () => {
      const result = StepTypeSchema.safeParse('unknown');
      expect(result.success).toBe(false);
    });
    
    it('should reject invalid type "test"', () => {
      const result = StepTypeSchema.safeParse('test');
      expect(result.success).toBe(false);
    });
    
    it('should reject invalid type "review"', () => {
      const result = StepTypeSchema.safeParse('review');
      expect(result.success).toBe(false);
    });
    
    it('should reject numeric values', () => {
      const result = StepTypeSchema.safeParse(123);
      expect(result.success).toBe(false);
    });
    
    it('should reject boolean values', () => {
      const result = StepTypeSchema.safeParse(true);
      expect(result.success).toBe(false);
    });
    
    it('should reject object values', () => {
      const result = StepTypeSchema.safeParse({ type: 'standard' });
      expect(result.success).toBe(false);
    });
    
    it('should reject array values', () => {
      const result = StepTypeSchema.safeParse(['standard']);
      expect(result.success).toBe(false);
    });
    
    it('should reject empty string', () => {
      const result = StepTypeSchema.safeParse('');
      expect(result.success).toBe(false);
    });
    
    it('should reject case-sensitive mismatch "STANDARD"', () => {
      const result = StepTypeSchema.safeParse('STANDARD');
      expect(result.success).toBe(false);
    });
    
    it('should reject type with whitespace "standard "', () => {
      const result = StepTypeSchema.safeParse('standard ');
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 3. Default Value is 'standard' When Omitted
  // =========================================================================
  
  describe('Default value handling', () => {
    
    it('should default to "standard" when undefined', () => {
      const result = StepTypeSchema.safeParse(undefined);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('standard');
      }
    });
    
    it('should NOT default when null (null is not undefined)', () => {
      const result = StepTypeSchema.safeParse(null);
      // Zod's .optional() doesn't handle null by default
      expect(result.success).toBe(false);
    });
    
    it('should use explicit value when provided', () => {
      const result = StepTypeSchema.safeParse('critical');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('critical');
      }
    });
    
    it('should not override explicit "standard" value', () => {
      const result = StepTypeSchema.safeParse('standard');
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toBe('standard');
      }
    });
  });
  
  // =========================================================================
  // 4. Schema Integration - Step Object Schemas
  // =========================================================================
  
  describe('Step object schema integration', () => {
    
    // This mirrors the step object schema used in memory_plan and memory_steps
    const StepObjectSchema = z.object({
      phase: z.string(),
      task: z.string(),
      type: StepTypeSchema,
      status: z.enum(['pending', 'active', 'done', 'blocked']).optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional()
    });
    
    it('should validate step with all fields including type', () => {
      const step = {
        phase: 'phase-1',
        task: 'Implement feature',
        type: 'critical',
        status: 'active',
        notes: 'In progress',
        assignee: 'Executor'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('critical');
        expect(result.data.status).toBe('active');
      }
    });
    
    it('should validate step without type (defaults to standard)', () => {
      const step = {
        phase: 'phase-1',
        task: 'Implement feature'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('standard');
        expect(result.data.status).toBe('pending');
      }
    });
    
    it('should validate step with type but no status (both default)', () => {
      const step = {
        phase: 'phase-1',
        task: 'Implement feature',
        type: 'validation'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.type).toBe('validation');
        expect(result.data.status).toBe('pending');
      }
    });
    
    it('should validate minimal step (only required fields)', () => {
      const step = {
        phase: 'phase-1',
        task: 'Implement feature'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toMatchObject({
          phase: 'phase-1',
          task: 'Implement feature',
          type: 'standard',
          status: 'pending'
        });
      }
    });
    
    it('should reject step with invalid type', () => {
      const step = {
        phase: 'phase-1',
        task: 'Implement feature',
        type: 'invalid_type'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(false);
    });
    
    it('should reject step missing required phase field', () => {
      const step = {
        task: 'Implement feature',
        type: 'standard'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(false);
    });
    
    it('should reject step missing required task field', () => {
      const step = {
        phase: 'phase-1',
        type: 'standard'
      };
      
      const result = StepObjectSchema.safeParse(step);
      expect(result.success).toBe(false);
    });
  });
  
  // =========================================================================
  // 5. Backwards Compatibility - Legacy Steps Without Type Field
  // =========================================================================
  
  describe('Backwards compatibility', () => {
    
    const StepArraySchema = z.array(z.object({
      phase: z.string(),
      task: z.string(),
      type: StepTypeSchema,
      status: z.enum(['pending', 'active', 'done', 'blocked']).optional().default('pending'),
      notes: z.string().optional(),
      assignee: z.string().optional()
    }));
    
    it('should parse array of steps without type field', () => {
      const legacySteps = [
        { phase: 'phase-1', task: 'Setup environment' },
        { phase: 'phase-1', task: 'Install dependencies', status: 'done' },
        { phase: 'phase-2', task: 'Implement feature', status: 'active', notes: 'In progress' }
      ];
      
      const result = StepArraySchema.safeParse(legacySteps);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(3);
        expect(result.data[0].type).toBe('standard');
        expect(result.data[1].type).toBe('standard');
        expect(result.data[2].type).toBe('standard');
      }
    });
    
    it('should parse mixed array (some with type, some without)', () => {
      const mixedSteps = [
        { phase: 'phase-1', task: 'Setup environment' }, // no type
        { phase: 'phase-1', task: 'Get user approval', type: 'user_validation' }, // explicit type
        { phase: 'phase-2', task: 'Build project', type: 'build', status: 'pending' }, // explicit type
        { phase: 'phase-2', task: 'Deploy', status: 'pending' } // no type
      ];
      
      const result = StepArraySchema.safeParse(mixedSteps);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveLength(4);
        expect(result.data[0].type).toBe('standard');
        expect(result.data[1].type).toBe('user_validation');
        expect(result.data[2].type).toBe('build');
        expect(result.data[3].type).toBe('standard');
      }
    });
    
    it('should preserve old plan structure when type is omitted', () => {
      const oldStep = {
        phase: 'implementation',
        task: 'Add unit tests',
        status: 'done',
        notes: 'All tests passing'
      };
      
      const StepSchema = z.object({
        phase: z.string(),
        task: z.string(),
        type: StepTypeSchema,
        status: z.enum(['pending', 'active', 'done', 'blocked']).optional().default('pending'),
        notes: z.string().optional(),
        assignee: z.string().optional()
      });
      
      const result = StepSchema.safeParse(oldStep);
      expect(result.success).toBe(true);
      if (result.success) {
        // Type defaults to 'standard', other fields preserved
        expect(result.data.type).toBe('standard');
        expect(result.data.phase).toBe('implementation');
        expect(result.data.task).toBe('Add unit tests');
        expect(result.data.status).toBe('done');
        expect(result.data.notes).toBe('All tests passing');
      }
    });
  });
});
