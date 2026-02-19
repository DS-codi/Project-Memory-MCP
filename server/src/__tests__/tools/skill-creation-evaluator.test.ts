/**
 * Tests for skill-creation-evaluator.ts
 *
 * Covers:
 * 1. High tool_retries triggers tool-usage recommendation
 * 2. High blockers with recurring pattern triggers pattern-avoidance recommendation
 * 3. High unsolicited reads triggers context-packaging recommendation
 * 4. Skill gaps in difficulty profile trigger gap-filling recommendations
 * 5. Clean profile returns empty array
 * 6. Multiple triggers produce multiple recommendations
 * 7. Incidents with same root cause are grouped (retries summed)
 */

import { describe, it, expect } from 'vitest';
import { evaluateSkillCreationNeed } from '../../tools/skill-creation-evaluator.js';
import type {
  DifficultyProfile,
  IncidentReport,
  HandoffStats,
} from '../../types/index.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStats(overrides: Partial<HandoffStats> = {}): HandoffStats {
  return {
    steps_completed: 0,
    steps_attempted: 0,
    files_read: 0,
    files_modified: 0,
    tool_call_count: 0,
    tool_retries: 0,
    blockers_hit: 0,
    scope_escalations: 0,
    unsolicited_context_reads: 0,
    duration_category: 'quick',
    ...overrides,
  };
}

function makeProfile(overrides: Partial<DifficultyProfile> = {}): DifficultyProfile {
  return {
    plan_id: 'plan_test',
    total_sessions: 1,
    aggregated_stats: makeStats(),
    complexity_score: 0,
    common_blockers: [],
    skill_gaps_identified: [],
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeIncident(overrides: Partial<IncidentReport> = {}): IncidentReport {
  return {
    plan_id: 'plan_test',
    session_id: 'sess_test',
    agent_type: 'Executor',
    timestamp: new Date().toISOString(),
    trigger_reason: 'build failure',
    root_cause_analysis: 'Missing import',
    blocked_steps: [],
    resolution_actions: ['Added import'],
    stats_snapshot: makeStats(),
    recommendations: [],
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('evaluateSkillCreationNeed', () => {
  const WS = 'ws_test';
  const PLAN = 'plan_test';

  it('returns empty array for a clean profile with no incidents', () => {
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), []);
    expect(result).toEqual([]);
  });

  it('returns empty array when metrics are below all thresholds', () => {
    const profile = makeProfile({
      aggregated_stats: makeStats({ tool_retries: 2, unsolicited_context_reads: 3 }),
    });
    const incident = makeIncident({
      stats_snapshot: makeStats({ tool_retries: 2 }),
      blocked_steps: ['step 1'],
    });
    const result = evaluateSkillCreationNeed(WS, PLAN, profile, [incident]);
    expect(result).toEqual([]);
  });

  // ── Tool retries ─────────────────────────────────────────────────────

  it('recommends tool-usage skill when tool_retries > 5 across incidents with same root cause', () => {
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Missing import',
        stats_snapshot: makeStats({ tool_retries: 3 }),
      }),
      makeIncident({
        root_cause_analysis: 'Missing import',
        stats_snapshot: makeStats({ tool_retries: 4 }),
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    expect(result.length).toBeGreaterThanOrEqual(1);
    const toolRec = result.find(r => r.category === 'tool-usage');
    expect(toolRec).toBeDefined();
    expect(toolRec!.evidence[0].value).toBe(7); // 3 + 4
    expect(toolRec!.evidence[0].threshold).toBe(5);
    expect(toolRec!.skill_name).toContain('tool-usage');
  });

  it('does not group incidents with different root causes', () => {
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Missing import',
        stats_snapshot: makeStats({ tool_retries: 3 }),
      }),
      makeIncident({
        root_cause_analysis: 'Wrong type',
        stats_snapshot: makeStats({ tool_retries: 4 }),
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    // Neither group exceeds 5
    const toolRecs = result.filter(r => r.category === 'tool-usage');
    expect(toolRecs).toHaveLength(0);
  });

  it('groups incidents by normalised root cause (case-insensitive, whitespace-collapsed)', () => {
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Missing  Import',
        stats_snapshot: makeStats({ tool_retries: 3 }),
      }),
      makeIncident({
        root_cause_analysis: 'missing import',
        stats_snapshot: makeStats({ tool_retries: 4 }),
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    const toolRec = result.find(r => r.category === 'tool-usage');
    expect(toolRec).toBeDefined();
    expect(toolRec!.evidence[0].value).toBe(7);
  });

  // ── Blocker patterns ────────────────────────────────────────────────

  it('recommends pattern-avoidance skill when blocker pattern count > 2', () => {
    const incidents = [
      makeIncident({
        blocked_steps: ['TypeScript compilation error', 'TypeScript compilation error', 'TypeScript compilation error'],
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    const patternRec = result.find(r => r.category === 'pattern-avoidance');
    expect(patternRec).toBeDefined();
    expect(patternRec!.evidence[0].value).toBe(3);
    expect(patternRec!.reason).toContain('typescript compilation error');
  });

  it('accumulates blocker patterns across multiple incidents', () => {
    const incidents = [
      makeIncident({ blocked_steps: ['build failure'] }),
      makeIncident({ blocked_steps: ['build failure'] }),
      makeIncident({ blocked_steps: ['build failure'] }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    const patternRec = result.find(r => r.category === 'pattern-avoidance');
    expect(patternRec).toBeDefined();
    expect(patternRec!.evidence[0].value).toBe(3);
  });

  // ── Unsolicited context reads ───────────────────────────────────────

  it('recommends context-packaging skill when unsolicited_context_reads > 10', () => {
    const profile = makeProfile({
      aggregated_stats: makeStats({ unsolicited_context_reads: 15 }),
    });
    const result = evaluateSkillCreationNeed(WS, PLAN, profile, []);

    const ctxRec = result.find(r => r.category === 'context-management');
    expect(ctxRec).toBeDefined();
    expect(ctxRec!.skill_name).toBe('context-packaging');
    expect(ctxRec!.evidence[0].value).toBe(15);
    expect(ctxRec!.evidence[0].threshold).toBe(10);
  });

  it('does not recommend context-packaging when reads are at threshold', () => {
    const profile = makeProfile({
      aggregated_stats: makeStats({ unsolicited_context_reads: 10 }),
    });
    const result = evaluateSkillCreationNeed(WS, PLAN, profile, []);

    const ctxRec = result.find(r => r.category === 'context-management');
    expect(ctxRec).toBeUndefined();
  });

  // ── Skill gaps ──────────────────────────────────────────────────────

  it('recommends gap-filling skill for each identified skill gap', () => {
    const profile = makeProfile({
      skill_gaps_identified: ['React hooks', 'Database migrations'],
    });
    const result = evaluateSkillCreationNeed(WS, PLAN, profile, []);

    const gapRecs = result.filter(r => r.category === 'skill-gap');
    expect(gapRecs).toHaveLength(2);
    expect(gapRecs[0].skill_name).toContain('gap-');
    expect(gapRecs[0].reason).toContain('React hooks');
    expect(gapRecs[1].reason).toContain('Database migrations');
  });

  // ── Multiple triggers ──────────────────────────────────────────────

  it('produces multiple recommendations when multiple triggers fire', () => {
    const profile = makeProfile({
      aggregated_stats: makeStats({ unsolicited_context_reads: 20 }),
      skill_gaps_identified: ['Testing patterns'],
    });
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Flaky test setup',
        stats_snapshot: makeStats({ tool_retries: 8 }),
        blocked_steps: ['test setup failed', 'test setup failed', 'test setup failed'],
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, profile, incidents);

    const categories = result.map(r => r.category);
    expect(categories).toContain('tool-usage');
    expect(categories).toContain('pattern-avoidance');
    expect(categories).toContain('context-management');
    expect(categories).toContain('skill-gap');
    expect(result.length).toBe(4);
  });

  // ── Priority ───────────────────────────────────────────────────────

  it('assigns high priority when values far exceed thresholds', () => {
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Bad API call',
        stats_snapshot: makeStats({ tool_retries: 12 }),
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    const toolRec = result.find(r => r.category === 'tool-usage');
    expect(toolRec).toBeDefined();
    expect(toolRec!.priority).toBe('high');
  });

  it('assigns medium priority when values just exceed thresholds', () => {
    const incidents = [
      makeIncident({
        root_cause_analysis: 'Minor issue',
        stats_snapshot: makeStats({ tool_retries: 6 }),
      }),
    ];
    const result = evaluateSkillCreationNeed(WS, PLAN, makeProfile(), incidents);

    const toolRec = result.find(r => r.category === 'tool-usage');
    expect(toolRec).toBeDefined();
    expect(toolRec!.priority).toBe('medium');
  });
});
