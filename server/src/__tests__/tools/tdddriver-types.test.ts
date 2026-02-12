import { describe, it, expect } from 'vitest';
import {
  type AgentType,
  AGENT_BOUNDARIES,
  type AgentRoleBoundaries,
} from '../../types/index.js';

describe('TDDDriver type definitions', () => {
  describe('AgentType enum', () => {
    it('TDDDriver is a valid AgentType value', () => {
      // AgentType is a union type — verify by assigning it
      const agentType: AgentType = 'TDDDriver';
      expect(agentType).toBe('TDDDriver');
    });
  });

  describe('AGENT_BOUNDARIES', () => {
    it('has a TDDDriver entry', () => {
      expect(AGENT_BOUNDARIES).toHaveProperty('TDDDriver');
    });

    it('TDDDriver agent_type is TDDDriver', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.agent_type).toBe('TDDDriver');
    });

    it('TDDDriver.is_hub is true', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.is_hub).toBe(true);
    });

    it('TDDDriver.can_spawn_subagents is true', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.can_spawn_subagents).toBe(true);
    });

    it('TDDDriver.can_implement is false', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.can_implement).toBe(false);
    });

    it('TDDDriver.can_finalize is false', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.can_finalize).toBe(false);
    });

    it('primary_responsibility mentions TDD', () => {
      const responsibility = AGENT_BOUNDARIES.TDDDriver.primary_responsibility.toLowerCase();
      expect(responsibility).toContain('tdd');
    });

    it('must_handoff_to includes Coordinator', () => {
      expect(AGENT_BOUNDARIES.TDDDriver.must_handoff_to).toContain('Coordinator');
    });

    it('forbidden_actions prevents direct implementation', () => {
      const forbidden = AGENT_BOUNDARIES.TDDDriver.forbidden_actions;
      expect(forbidden).toContain('create files');
      expect(forbidden).toContain('edit code');
      expect(forbidden).toContain('implement features');
    });

    it('TDDDriver boundaries conform to AgentRoleBoundaries interface', () => {
      const boundaries: AgentRoleBoundaries = AGENT_BOUNDARIES.TDDDriver;
      expect(boundaries).toBeDefined();
      expect(typeof boundaries.can_implement).toBe('boolean');
      expect(typeof boundaries.can_finalize).toBe('boolean');
      expect(Array.isArray(boundaries.must_handoff_to)).toBe(true);
      expect(Array.isArray(boundaries.forbidden_actions)).toBe(true);
      expect(typeof boundaries.primary_responsibility).toBe('string');
    });
  });
});
