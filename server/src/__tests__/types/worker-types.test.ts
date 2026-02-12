/**
 * Tests for Worker agent type definitions (agent.types.ts).
 *
 * Covers:
 * 1. Worker exists in AgentType (via AGENT_BOUNDARIES key)
 * 2. AGENT_BOUNDARIES.Worker has correct shape and values
 * 3. Worker scope limits (max_steps, max_context_tokens)
 * 4. Worker forbidden_actions
 */

import { describe, it, expect } from 'vitest';
import { AGENT_BOUNDARIES } from '../../types/index.js';

// =============================================================================
// AGENT_BOUNDARIES — Worker existence
// =============================================================================

describe('AGENT_BOUNDARIES.Worker', () => {
  it('should exist in AGENT_BOUNDARIES', () => {
    expect(AGENT_BOUNDARIES).toHaveProperty('Worker');
  });

  it('should have agent_type set to Worker', () => {
    expect(AGENT_BOUNDARIES.Worker.agent_type).toBe('Worker');
  });

  // ===========================================================================
  // Implementation & finalization flags
  // ===========================================================================

  it('should be allowed to implement (can_implement = true)', () => {
    expect(AGENT_BOUNDARIES.Worker.can_implement).toBe(true);
  });

  it('should NOT be allowed to finalize (can_finalize = false)', () => {
    expect(AGENT_BOUNDARIES.Worker.can_finalize).toBe(false);
  });

  // ===========================================================================
  // Handoff targets
  // ===========================================================================

  it('should include Coordinator in must_handoff_to', () => {
    expect(AGENT_BOUNDARIES.Worker.must_handoff_to).toContain('Coordinator');
  });

  it('must_handoff_to should be an array', () => {
    expect(Array.isArray(AGENT_BOUNDARIES.Worker.must_handoff_to)).toBe(true);
  });

  // ===========================================================================
  // Scope limits
  // ===========================================================================

  it('should have max_steps defined', () => {
    expect(AGENT_BOUNDARIES.Worker.max_steps).toBeDefined();
    expect(typeof AGENT_BOUNDARIES.Worker.max_steps).toBe('number');
  });

  it('should have max_steps set to 5', () => {
    expect(AGENT_BOUNDARIES.Worker.max_steps).toBe(5);
  });

  it('should have max_context_tokens defined', () => {
    expect(AGENT_BOUNDARIES.Worker.max_context_tokens).toBeDefined();
    expect(typeof AGENT_BOUNDARIES.Worker.max_context_tokens).toBe('number');
  });

  it('should have max_context_tokens set to 50000', () => {
    expect(AGENT_BOUNDARIES.Worker.max_context_tokens).toBe(50000);
  });

  // ===========================================================================
  // Forbidden actions
  // ===========================================================================

  it('should have forbidden_actions as a non-empty array', () => {
    const { forbidden_actions } = AGENT_BOUNDARIES.Worker;
    expect(Array.isArray(forbidden_actions)).toBe(true);
    expect(forbidden_actions.length).toBeGreaterThan(0);
  });

  it('should forbid spawning subagents', () => {
    expect(AGENT_BOUNDARIES.Worker.forbidden_actions).toContain('spawn subagents');
  });

  it('should forbid creating plans', () => {
    expect(AGENT_BOUNDARIES.Worker.forbidden_actions).toContain('create plans');
  });

  it('should forbid archiving', () => {
    expect(AGENT_BOUNDARIES.Worker.forbidden_actions).toContain('archive');
  });

  it('should forbid modifying plan steps', () => {
    expect(AGENT_BOUNDARIES.Worker.forbidden_actions).toContain('modify plan steps');
  });

  // ===========================================================================
  // Primary responsibility
  // ===========================================================================

  it('should have a primary_responsibility mentioning sub-tasks or delegation', () => {
    const resp = AGENT_BOUNDARIES.Worker.primary_responsibility;
    expect(resp.toLowerCase()).toMatch(/sub-task|delegat/);
  });

  // ===========================================================================
  // Structural: Worker vs other agents
  // ===========================================================================

  it('should have the same shape keys as other agents (Executor)', () => {
    const workerKeys = Object.keys(AGENT_BOUNDARIES.Worker).sort();
    const executorKeys = Object.keys(AGENT_BOUNDARIES.Executor).sort();

    // Worker has extra keys (max_steps, max_context_tokens), so it should be a superset
    for (const key of executorKeys) {
      expect(workerKeys).toContain(key);
    }
  });

  it('should have Worker-only scope limit keys not present on non-Worker agents', () => {
    // Executor should NOT have max_steps or max_context_tokens
    expect(AGENT_BOUNDARIES.Executor.max_steps).toBeUndefined();
    expect(AGENT_BOUNDARIES.Executor.max_context_tokens).toBeUndefined();
  });
});
