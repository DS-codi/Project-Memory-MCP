import { describe, it, expect } from 'vitest';
import { z } from 'zod';

/**
 * Test suite for AgentTypeSchema Hub→Coordinator alias normalization.
 *
 * Mirrors the z.preprocess() wrapping defined in server/src/index.ts.
 * If the canonical schema changes, update this mirror accordingly.
 */

const AgentTypeSchema = z.preprocess(
  (val) => val === 'Hub' ? 'Coordinator' : val,
  z.enum([
    'Coordinator', 'Analyst', 'Researcher', 'Architect', 'Executor',
    'Reviewer', 'Tester', 'Revisionist', 'Archivist',
    'Brainstorm', 'Runner', 'SkillWriter', 'Worker', 'TDDDriver', 'Cognition',
    'Migrator',
  ])
);

describe('AgentTypeSchema Hub→Coordinator alias', () => {

  it('maps Hub to Coordinator', () => {
    expect(AgentTypeSchema.parse('Hub')).toBe('Coordinator');
  });

  it('passes Coordinator through unchanged', () => {
    expect(AgentTypeSchema.parse('Coordinator')).toBe('Coordinator');
  });

  it('passes other valid agent types through unchanged', () => {
    const types = [
      'Analyst', 'Researcher', 'Architect', 'Executor',
      'Reviewer', 'Tester', 'Revisionist', 'Archivist',
      'Brainstorm', 'Runner', 'SkillWriter', 'Worker',
      'TDDDriver', 'Cognition', 'Migrator',
    ];
    for (const t of types) {
      expect(AgentTypeSchema.parse(t)).toBe(t);
    }
  });

  it('rejects invalid agent types', () => {
    expect(() => AgentTypeSchema.parse('InvalidType')).toThrow();
    expect(() => AgentTypeSchema.parse('')).toThrow();
    expect(() => AgentTypeSchema.parse(123)).toThrow();
  });

  it('Hub alias works through safeParse', () => {
    const result = AgentTypeSchema.safeParse('Hub');
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toBe('Coordinator');
    }
  });
});
