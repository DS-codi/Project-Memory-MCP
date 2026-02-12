/**
 * Unit tests for compact-plan-state utility
 * Tests: session limiting, context keys-only, lineage limiting,
 * step filtering, plan_summary counts, and budget mode.
 */

import { describe, it, expect } from 'vitest';
import { compactifyPlanState, compactifyWithBudget } from '../../utils/compact-plan-state.js';
import type { PlanState, AgentSession, LineageEntry, PlanStep } from '../../types/index.js';

// ---------------------------------------------------------------------------
// Mock data factory
// ---------------------------------------------------------------------------

function makeSession(index: number, overrides?: Partial<AgentSession>): AgentSession {
  return {
    session_id: `sess_${index}`,
    agent_type: 'Executor',
    started_at: `2026-01-0${(index % 9) + 1}T00:00:00Z`,
    completed_at: `2026-01-0${(index % 9) + 1}T01:00:00Z`,
    context: {
      deployed_by: 'Coordinator',
      reason: `Session ${index} reason`,
      extra_key: `value_${index}`,
      nested: { a: 1, b: 2 }
    },
    summary: `Session ${index} summary`,
    artifacts: [`file_${index}.ts`],
    ...overrides
  };
}

function makeLineageEntry(index: number): LineageEntry {
  return {
    timestamp: `2026-01-0${(index % 9) + 1}T00:00:00Z`,
    from_agent: 'Executor',
    to_agent: 'Coordinator',
    reason: `Handoff ${index}`
  };
}

function makeStep(index: number, status: PlanStep['status'], phase = 'Phase 1'): PlanStep {
  return {
    index,
    phase,
    task: `Task ${index}`,
    status,
    type: 'standard',
    assignee: 'Executor'
  };
}

function makeMockPlanState(overrides?: Partial<PlanState>): PlanState {
  // 10 sessions
  const sessions = Array.from({ length: 10 }, (_, i) => makeSession(i));
  // 15 lineage entries
  const lineage = Array.from({ length: 15 }, (_, i) => makeLineageEntry(i));
  // 20 steps: 12 done, 3 pending, 3 active, 2 blocked
  const steps: PlanStep[] = [
    ...Array.from({ length: 12 }, (_, i) => makeStep(i, 'done')),
    ...Array.from({ length: 3 }, (_, i) => makeStep(12 + i, 'pending')),
    ...Array.from({ length: 3 }, (_, i) => makeStep(15 + i, 'active')),
    ...Array.from({ length: 2 }, (_, i) => makeStep(18 + i, 'blocked'))
  ];

  return {
    id: 'plan_test_001',
    workspace_id: 'ws_test_001',
    title: 'Test Plan',
    description: 'A test plan for compactification',
    priority: 'high',
    status: 'active',
    category: 'feature',
    current_phase: 'Phase 2',
    current_agent: 'Executor',
    recommended_next_agent: 'Reviewer',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-10T00:00:00Z',
    agent_sessions: sessions,
    lineage,
    steps,
    goals: ['Goal 1', 'Goal 2'],
    success_criteria: ['Criteria 1'],
    ...overrides
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('compactifyPlanState', () => {
  it('should limit sessions to default maxSessions (3)', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent).toHaveLength(3);
    expect(compact.agent_sessions.total_count).toBe(10);
    // Should be the LAST 3 sessions (indices 7, 8, 9)
    expect(compact.agent_sessions.recent[0].session_id).toBe('sess_7');
    expect(compact.agent_sessions.recent[2].session_id).toBe('sess_9');
  });

  it('should respect custom maxSessions', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state, { maxSessions: 5 });

    expect(compact.agent_sessions.recent).toHaveLength(5);
    expect(compact.agent_sessions.total_count).toBe(10);
    expect(compact.agent_sessions.recent[0].session_id).toBe('sess_5');
  });

  it('should trim session context to keys-only', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    for (const session of compact.agent_sessions.recent) {
      // Should have context_keys array, not full context object
      expect(session.context_keys).toBeDefined();
      expect(Array.isArray(session.context_keys)).toBe(true);
      expect(session.context_keys).toContain('deployed_by');
      expect(session.context_keys).toContain('reason');
      expect(session.context_keys).toContain('extra_key');
      expect(session.context_keys).toContain('nested');
      // Should NOT have full context values
      expect((session as any).context).toBeUndefined();
    }
  });

  it('should limit lineage to default maxLineage (3)', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    expect(compact.lineage.recent).toHaveLength(3);
    expect(compact.lineage.total_count).toBe(15);
    // Should be the LAST 3 lineage entries (indices 12, 13, 14)
    expect(compact.lineage.recent[0].reason).toBe('Handoff 12');
    expect(compact.lineage.recent[2].reason).toBe('Handoff 14');
  });

  it('should respect custom maxLineage', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state, { maxLineage: 7 });

    expect(compact.lineage.recent).toHaveLength(7);
    expect(compact.lineage.total_count).toBe(15);
  });

  it('should filter steps to only pending/active by default', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    // 3 pending + 3 active = 6 (no done or blocked)
    expect(compact.steps).toHaveLength(6);
    for (const step of compact.steps) {
      expect(['pending', 'active']).toContain(step.status);
    }
  });

  it('should include all steps when includeCompletedSteps=true', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state, { includeCompletedSteps: true });

    // All 20 steps
    expect(compact.steps).toHaveLength(20);
  });

  it('should produce accurate plan_summary counts', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    expect(compact.plan_summary).toEqual({
      total_steps: 20,
      pending_steps: 3,
      active_steps: 3,
      done_steps: 12,
      blocked_steps: 2,
      total_sessions: 10,
      total_handoffs: 15
    });
  });

  it('should preserve core plan metadata', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    expect(compact.id).toBe('plan_test_001');
    expect(compact.workspace_id).toBe('ws_test_001');
    expect(compact.title).toBe('Test Plan');
    expect(compact.description).toBe('A test plan for compactification');
    expect(compact.priority).toBe('high');
    expect(compact.status).toBe('active');
    expect(compact.category).toBe('feature');
    expect(compact.current_phase).toBe('Phase 2');
    expect(compact.current_agent).toBe('Executor');
    expect(compact.recommended_next_agent).toBe('Reviewer');
    expect(compact.goals).toEqual(['Goal 1', 'Goal 2']);
    expect(compact.success_criteria).toEqual(['Criteria 1']);
  });

  it('should handle state with zero sessions', () => {
    const state = makeMockPlanState({ agent_sessions: [] });
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent).toHaveLength(0);
    expect(compact.agent_sessions.total_count).toBe(0);
    expect(compact.plan_summary.total_sessions).toBe(0);
  });

  it('should handle state with zero lineage', () => {
    const state = makeMockPlanState({ lineage: [] });
    const compact = compactifyPlanState(state);

    expect(compact.lineage.recent).toHaveLength(0);
    expect(compact.lineage.total_count).toBe(0);
    expect(compact.plan_summary.total_handoffs).toBe(0);
  });

  it('should handle state with fewer sessions than maxSessions', () => {
    const state = makeMockPlanState({
      agent_sessions: [makeSession(0), makeSession(1)]
    });
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent).toHaveLength(2);
    expect(compact.agent_sessions.total_count).toBe(2);
  });

  it('should handle session with empty context', () => {
    const state = makeMockPlanState({
      agent_sessions: [makeSession(0, { context: {} })]
    });
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent[0].context_keys).toEqual([]);
  });

  it('should handle session with undefined context', () => {
    const state = makeMockPlanState({
      agent_sessions: [makeSession(0, { context: undefined as any })]
    });
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent[0].context_keys).toEqual([]);
  });

  it('should explicitly exclude blocked steps in default mode', () => {
    const state = makeMockPlanState();
    const compact = compactifyPlanState(state);

    const blockedSteps = compact.steps.filter(s => s.status === 'blocked');
    const doneSteps = compact.steps.filter(s => s.status === 'done');
    expect(blockedSteps).toHaveLength(0);
    expect(doneSteps).toHaveLength(0);
    // But plan_summary should still count them
    expect(compact.plan_summary.blocked_steps).toBe(2);
    expect(compact.plan_summary.done_steps).toBe(12);
  });

  it('should return empty steps array when all steps are done', () => {
    const state = makeMockPlanState({
      steps: Array.from({ length: 5 }, (_, i) => makeStep(i, 'done'))
    });
    const compact = compactifyPlanState(state);

    expect(compact.steps).toHaveLength(0);
    expect(compact.plan_summary.total_steps).toBe(5);
    expect(compact.plan_summary.done_steps).toBe(5);
    expect(compact.plan_summary.pending_steps).toBe(0);
  });

  it('should preserve deployment_context, confirmation_state, and build_scripts', () => {
    const state = makeMockPlanState({
      deployment_context: {
        deployed_agent: 'Executor' as any,
        deployed_by: 'Coordinator',
        reason: 'test deploy',
        override_validation: true,
        deployed_at: '2026-01-01T00:00:00Z'
      },
      confirmation_state: {
        phases: { 'Phase 1': { confirmed: true, confirmed_by: 'User', confirmed_at: '2026-01-01T00:00:00Z' } },
        steps: {}
      },
      build_scripts: [
        { id: 'bs_1', name: 'build', description: 'Build the project', command: 'npm run build', directory: '.', workspace_id: 'ws_1', plan_id: 'plan_1', created_at: '2026-01-01T00:00:00Z' }
      ]
    });
    const compact = compactifyPlanState(state);

    expect(compact.deployment_context).toEqual(state.deployment_context);
    expect(compact.confirmation_state).toEqual(state.confirmation_state);
    expect(compact.build_scripts).toEqual(state.build_scripts);
  });

  it('should produce output significantly smaller than full state', () => {
    const state = makeMockPlanState();
    const fullSize = Buffer.byteLength(JSON.stringify(state), 'utf8');
    const compact = compactifyPlanState(state);
    const compactSize = Buffer.byteLength(JSON.stringify(compact), 'utf8');

    // Compact should be meaningfully smaller (at least 30% reduction)
    expect(compactSize).toBeLessThan(fullSize * 0.7);
  });
});

describe('compactifyWithBudget', () => {
  it('should return result within the byte budget', () => {
    const state = makeMockPlanState();
    const budget = 3000; // Small budget to force trimming
    const compact = compactifyWithBudget(state, budget);

    const size = Buffer.byteLength(JSON.stringify(compact), 'utf8');
    expect(size).toBeLessThanOrEqual(budget);
  });

  it('should progressively reduce sessions and lineage', () => {
    const state = makeMockPlanState();
    // Get size with defaults first
    const defaultCompact = compactifyPlanState(state);
    const defaultSize = Buffer.byteLength(JSON.stringify(defaultCompact), 'utf8');

    // Set budget to half the default size to force reduction
    const budget = Math.floor(defaultSize / 2);
    const compact = compactifyWithBudget(state, budget);

    // Should have fewer sessions or lineage than defaults
    const totalReduced = compact.agent_sessions.recent.length + compact.lineage.recent.length;
    const totalDefault = defaultCompact.agent_sessions.recent.length + defaultCompact.lineage.recent.length;
    expect(totalReduced).toBeLessThan(totalDefault);
  });

  it('should not trim below floor of 1 session and 1 lineage', () => {
    const state = makeMockPlanState();
    // Extremely small budget
    const compact = compactifyWithBudget(state, 100);

    expect(compact.agent_sessions.recent.length).toBeGreaterThanOrEqual(1);
    expect(compact.lineage.recent.length).toBeGreaterThanOrEqual(1);
  });

  it('should return default compact if already within budget', () => {
    const state = makeMockPlanState();
    // Very large budget — no trimming needed
    const compact = compactifyWithBudget(state, 1_000_000);
    const defaultCompact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent.length).toBe(defaultCompact.agent_sessions.recent.length);
    expect(compact.lineage.recent.length).toBe(defaultCompact.lineage.recent.length);
  });

  it('should still have valid plan_summary after budget trimming', () => {
    const state = makeMockPlanState();
    const compact = compactifyWithBudget(state, 2000);

    // Summary counts should reflect original state, not the filtered one
    expect(compact.plan_summary.total_steps).toBe(20);
    expect(compact.plan_summary.total_sessions).toBe(10);
    expect(compact.plan_summary.total_handoffs).toBe(15);
  });

  it('should handle budget of 0 without throwing', () => {
    const state = makeMockPlanState();
    // Budget of 0 is impossible to meet — should return floor result
    const compact = compactifyWithBudget(state, 0);

    expect(compact.agent_sessions.recent.length).toBe(1);
    expect(compact.lineage.recent.length).toBe(1);
    // Summary should still be accurate
    expect(compact.plan_summary.total_steps).toBe(20);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Progressive session trimming (>10 sessions)
// ---------------------------------------------------------------------------

describe('compactifyPlanState — progressive session trimming', () => {
  it('should give last 3 sessions full context, summarize 4-10, omit >10', () => {
    // 15 sessions → 12,13,14 full; 5-11 summarized; 0-4 omitted
    const sessions = Array.from({ length: 15 }, (_, i) => makeSession(i));
    const state = makeMockPlanState({ agent_sessions: sessions });
    const compact = compactifyPlanState(state);

    // Recent: last 3 with full context (sess_12, sess_13, sess_14)
    expect(compact.agent_sessions.recent).toHaveLength(3);
    expect(compact.agent_sessions.recent[0].session_id).toBe('sess_12');
    expect(compact.agent_sessions.recent[2].session_id).toBe('sess_14');

    // Summarized: sessions 5-11 (7 one-liner summaries)
    expect(compact.agent_sessions.summarized).toBeDefined();
    expect(compact.agent_sessions.summarized!).toHaveLength(7);
    for (const s of compact.agent_sessions.summarized!) {
      expect(s).toHaveProperty('agent_type');
      expect(s).toHaveProperty('summary_line');
      expect(s).toHaveProperty('timestamp');
      // Should NOT have full session fields
      expect((s as any).session_id).toBeUndefined();
      expect((s as any).context_keys).toBeUndefined();
    }

    // Total count reflects all sessions
    expect(compact.agent_sessions.total_count).toBe(15);
  });

  it('should omit sessions beyond index 10 from the end entirely', () => {
    const sessions = Array.from({ length: 20 }, (_, i) => makeSession(i));
    const state = makeMockPlanState({ agent_sessions: sessions });
    const compact = compactifyPlanState(state);

    // Recent: 3, Summarized: 7 (sessions 10-16), Omitted: 10 (sessions 0-9)
    expect(compact.agent_sessions.recent).toHaveLength(3);
    expect(compact.agent_sessions.summarized!).toHaveLength(7);

    // Verify summarized sessions are in the 4-10 range from end
    const summarizedAgentTypes = compact.agent_sessions.summarized!.map(s => s.agent_type);
    // All should be 'Executor' (from makeSession default)
    expect(summarizedAgentTypes.every(t => t === 'Executor')).toBe(true);

    // Total count is accurate even though many are omitted
    expect(compact.agent_sessions.total_count).toBe(20);
  });

  it('should produce no summarized sessions when total <= maxSessions', () => {
    const sessions = [makeSession(0), makeSession(1)];
    const state = makeMockPlanState({ agent_sessions: sessions });
    const compact = compactifyPlanState(state);

    expect(compact.agent_sessions.recent).toHaveLength(2);
    expect(compact.agent_sessions.summarized).toBeUndefined();
    expect(compact.agent_sessions.total_count).toBe(2);
  });

  it('should truncate long summaries in summarized sessions to 120 chars', () => {
    const longSummary = 'A'.repeat(200);
    const sessions = Array.from({ length: 12 }, (_, i) =>
      makeSession(i, { summary: i < 5 ? longSummary : `Short ${i}` })
    );
    const state = makeMockPlanState({ agent_sessions: sessions });
    const compact = compactifyPlanState(state);

    // Summarized sessions (indices 2-8) should have truncated summaries
    for (const s of compact.agent_sessions.summarized || []) {
      expect(s.summary_line.length).toBeLessThanOrEqual(120);
    }
  });
});

// ---------------------------------------------------------------------------
// Phase 6: Phase-based step filtering
// ---------------------------------------------------------------------------

describe('compactifyPlanState — phase-based step filtering', () => {
  function makeMultiPhaseSteps(): PlanStep[] {
    return [
      makeStep(0, 'done', 'Phase 1'),
      makeStep(1, 'pending', 'Phase 1'),
      makeStep(2, 'done', 'Phase 2'),
      makeStep(3, 'pending', 'Phase 2'),
      makeStep(4, 'active', 'Phase 3'),
      makeStep(5, 'pending', 'Phase 3'),
      makeStep(6, 'pending', 'Phase 4'),
      makeStep(7, 'pending', 'Phase 5'),
    ];
  }

  it('should include current phase + one adjacent phase only', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 3',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state);

    // Phase 3 (active + pending) + Phase 2 (pending) + Phase 4 (pending) — adjacent phases
    // Phase 1 and Phase 5 should be excluded
    const phases = new Set(compact.steps.map(s => s.phase));
    expect(phases.has('Phase 3')).toBe(true);
    // Phase 2 adjacent (before), Phase 4 adjacent (after)
    expect(phases.has('Phase 2')).toBe(true);
    expect(phases.has('Phase 4')).toBe(true);
    // Phase 1 too far, Phase 5 too far
    expect(phases.has('Phase 1')).toBe(false);
    expect(phases.has('Phase 5')).toBe(false);
  });

  it('should still filter out done steps even in adjacent phases', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 3',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state);

    // Phase 2 has one done (step 2) and one pending (step 3)
    // Only step 3 should appear (done filtered out by status)
    const phase2Steps = compact.steps.filter(s => s.phase === 'Phase 2');
    expect(phase2Steps.every(s => s.status !== 'done')).toBe(true);
  });

  it('should return all status-filtered steps when current phase not in any step', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 99',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state);

    // Since Phase 99 doesn't exist in steps, all pending/active steps returned
    const allNonDone = makeMultiPhaseSteps().filter(
      s => s.status === 'pending' || s.status === 'active'
    );
    expect(compact.steps).toHaveLength(allNonDone.length);
  });

  it('should handle single phase correctly', () => {
    const singlePhaseSteps: PlanStep[] = [
      makeStep(0, 'done', 'Only Phase'),
      makeStep(1, 'active', 'Only Phase'),
      makeStep(2, 'pending', 'Only Phase'),
    ];
    const state = makeMockPlanState({
      current_phase: 'Only Phase',
      steps: singlePhaseSteps
    });
    const compact = compactifyPlanState(state);

    // Only active + pending from the single phase
    expect(compact.steps).toHaveLength(2);
    expect(compact.steps.every(s => s.phase === 'Only Phase')).toBe(true);
  });

  it('should include first phase when current is at the beginning', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 1',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state);

    const phases = new Set(compact.steps.map(s => s.phase));
    expect(phases.has('Phase 1')).toBe(true);
    expect(phases.has('Phase 2')).toBe(true);
    // Phase 3+ should be excluded
    expect(phases.has('Phase 3')).toBe(false);
  });

  it('should include last phase when current is at the end', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 5',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state);

    const phases = new Set(compact.steps.map(s => s.phase));
    expect(phases.has('Phase 5')).toBe(true);
    expect(phases.has('Phase 4')).toBe(true);
    // Phase 1-3 should be excluded
    expect(phases.has('Phase 1')).toBe(false);
    expect(phases.has('Phase 2')).toBe(false);
    expect(phases.has('Phase 3')).toBe(false);
  });

  it('should disable phase filtering with phaseFilterSteps=false', () => {
    const state = makeMockPlanState({
      current_phase: 'Phase 3',
      steps: makeMultiPhaseSteps()
    });
    const compact = compactifyPlanState(state, { phaseFilterSteps: false });

    // All pending/active from ALL phases, not just adjacent
    const allNonDone = makeMultiPhaseSteps().filter(
      s => s.status === 'pending' || s.status === 'active'
    );
    expect(compact.steps).toHaveLength(allNonDone.length);
  });
});

// ---------------------------------------------------------------------------
// Phase 6: context_priority 'high' bypasses phase filtering
// ---------------------------------------------------------------------------

describe('compactifyPlanState — context_priority high', () => {
  it('should include high-priority steps even outside adjacent phases', () => {
    const steps: PlanStep[] = [
      makeStep(0, 'pending', 'Phase 1'),
      makeStep(1, 'active', 'Phase 2'),
      makeStep(2, 'pending', 'Phase 3'),
      { ...makeStep(3, 'pending', 'Phase 5'), context_priority: 'high' as const },
    ];
    const state = makeMockPlanState({
      current_phase: 'Phase 2',
      steps
    });
    const compact = compactifyPlanState(state);

    // Phase 5 is NOT adjacent to Phase 2, but step 3 has context_priority='high'
    const phase5Steps = compact.steps.filter(s => s.phase === 'Phase 5');
    expect(phase5Steps).toHaveLength(1);
    expect(phase5Steps[0].context_priority).toBe('high');
  });

  it('should include normal-priority steps only from current + adjacent phases', () => {
    const steps: PlanStep[] = [
      makeStep(0, 'pending', 'Phase 1'),
      makeStep(1, 'active', 'Phase 2'),
      makeStep(2, 'pending', 'Phase 3'),
      { ...makeStep(3, 'pending', 'Phase 5'), context_priority: 'normal' as const },
    ];
    const state = makeMockPlanState({
      current_phase: 'Phase 2',
      steps
    });
    const compact = compactifyPlanState(state);

    // Phase 5 step has context_priority='normal' — should be excluded
    const phase5Steps = compact.steps.filter(s => s.phase === 'Phase 5');
    expect(phase5Steps).toHaveLength(0);
  });

  it('should include multiple high-priority steps from distant phases', () => {
    const steps: PlanStep[] = [
      makeStep(0, 'active', 'Phase 1'),
      { ...makeStep(1, 'pending', 'Phase 4'), context_priority: 'high' as const },
      { ...makeStep(2, 'pending', 'Phase 6'), context_priority: 'high' as const },
      makeStep(3, 'pending', 'Phase 8'),
    ];
    const state = makeMockPlanState({
      current_phase: 'Phase 1',
      steps
    });
    const compact = compactifyPlanState(state);

    // Phase 4 and Phase 6 are distant but high-priority
    expect(compact.steps.filter(s => s.phase === 'Phase 4')).toHaveLength(1);
    expect(compact.steps.filter(s => s.phase === 'Phase 6')).toHaveLength(1);
    // Phase 8 normal priority, distant — excluded
    expect(compact.steps.filter(s => s.phase === 'Phase 8')).toHaveLength(0);
  });
});
