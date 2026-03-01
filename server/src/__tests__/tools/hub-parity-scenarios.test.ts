import { beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveHubAliasRouting, type CanonicalHubMode, type LegacyHubLabel } from '../../tools/orchestration/hub-alias-routing.js';
import { evaluateHubDispatchPolicy, validateHubPolicy } from '../../tools/orchestration/hub-policy-enforcement.js';
import {
  buildHubTelemetrySnapshot,
  evaluateHubPromotionGates,
} from '../../tools/orchestration/hub-telemetry-dashboard.js';
import {
  evaluateDirectOptionAProgress,
  getDirectOptionAMigrationPlan,
} from '../../tools/orchestration/hub-migration-plan.js';
import { buildLegacyDeprecationWorkflowReport } from '../../tools/orchestration/hub-deprecation-workflow.js';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

vi.mock('../../events/event-emitter.js', () => ({
  getRecentEvents: vi.fn(),
}));

vi.mock('../../db/workspace-session-registry-db.js', () => ({
  getAllWorkspaceSessions: vi.fn(),
}));

import { getRecentEvents } from '../../events/event-emitter.js';
import { getAllWorkspaceSessions } from '../../db/workspace-session-registry-db.js';

const mockGetRecentEvents = vi.mocked(getRecentEvents);
const mockGetAllWorkspaceSessions = vi.mocked(getAllWorkspaceSessions);

describe('Dynamic Hub scenario parity suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('resolves legacy labels to canonical modes with strict parity', () => {
    const cases: Array<{ label: LegacyHubLabel; mode: CanonicalHubMode; allowedTarget: string }> = [
      { label: 'Coordinator', mode: 'standard_orchestration', allowedTarget: 'Executor' },
      { label: 'Analyst', mode: 'investigation', allowedTarget: 'Researcher' },
      { label: 'Runner', mode: 'adhoc_runner', allowedTarget: 'Worker' },
      { label: 'TDDDriver', mode: 'tdd_cycle', allowedTarget: 'Tester' },
    ];

    for (const testCase of cases) {
      const legacyAlias = resolveHubAliasRouting(testCase.label);
      const canonicalAlias = resolveHubAliasRouting('Hub', testCase.mode);

      const legacyPolicy = validateHubPolicy(
        {
          target_agent_type: testCase.allowedTarget,
          requested_hub_label: testCase.label,
          requested_hub_mode: testCase.mode,
          prompt_analyst_enrichment_applied: true,
        },
        legacyAlias,
      );

      const canonicalPolicy = validateHubPolicy(
        {
          target_agent_type: testCase.allowedTarget,
          requested_hub_label: 'Hub',
          requested_hub_mode: testCase.mode,
          prompt_analyst_enrichment_applied: true,
        },
        canonicalAlias,
      );

      expect(legacyAlias.resolved_mode).toBe(testCase.mode);
      expect(canonicalAlias.resolved_mode).toBe(testCase.mode);
      expect(legacyPolicy.valid).toBe(canonicalPolicy.valid);
      expect(legacyPolicy.code).toBe(canonicalPolicy.code);
    }
  });

  it('enforces transition parity for legacy and canonical routing paths', () => {
    const legacyAlias = resolveHubAliasRouting('Coordinator');
    const canonicalAlias = resolveHubAliasRouting('Hub', 'standard_orchestration');

    const legacyPolicy = validateHubPolicy(
      {
        target_agent_type: 'Executor',
        previous_hub_mode: 'investigation',
        requested_hub_label: 'Coordinator',
        requested_hub_mode: 'standard_orchestration',
        prompt_analyst_enrichment_applied: true,
      },
      legacyAlias,
    );

    const canonicalPolicy = validateHubPolicy(
      {
        target_agent_type: 'Executor',
        previous_hub_mode: 'investigation',
        requested_hub_label: 'Hub',
        requested_hub_mode: 'standard_orchestration',
        prompt_analyst_enrichment_applied: true,
      },
      canonicalAlias,
    );

    expect(legacyPolicy.valid).toBe(false);
    expect(canonicalPolicy.valid).toBe(false);
    expect(legacyPolicy.code).toBe('POLICY_TRANSITION_EVENT_REQUIRED');
    expect(canonicalPolicy.code).toBe('POLICY_TRANSITION_EVENT_REQUIRED');
  });

  it('supports Prompt Analyst unavailable fallback when explicit bypass is set', () => {
    const alias = resolveHubAliasRouting('Coordinator');

    const blockedWithoutBypass = validateHubPolicy(
      {
        target_agent_type: 'Executor',
        requested_hub_mode: 'standard_orchestration',
        transition_event: 'new_prompt',
        prompt_analyst_enrichment_applied: false,
      },
      alias,
    );

    const allowedWithBypass = validateHubPolicy(
      {
        target_agent_type: 'Executor',
        requested_hub_mode: 'standard_orchestration',
        prompt_analyst_enrichment_applied: false,
        bypass_prompt_analyst_policy: true,
      },
      alias,
    );

    expect(blockedWithoutBypass.valid).toBe(false);
    expect(blockedWithoutBypass.code).toBe('POLICY_PROMPT_ANALYST_REQUIRED');
    expect(allowedWithBypass.valid).toBe(true);
  });

  it('allows reuse of existing Prompt Analyst context for in-scope continuation', () => {
    const alias = resolveHubAliasRouting('Coordinator');

    const continuationPolicy = validateHubPolicy(
      {
        target_agent_type: 'Executor',
        requested_hub_mode: 'standard_orchestration',
        prompt_analyst_enrichment_applied: false,
      },
      alias,
    );

    expect(continuationPolicy.valid).toBe(true);
  });

  it('requires explicit bundle decision contract for strict non-Analyst dispatches', () => {
    const blocked = evaluateHubDispatchPolicy({
      target_agent_type: 'Executor',
      requested_hub_mode: 'standard_orchestration',
      prompt_analyst_enrichment_applied: true,
      strict_bundle_resolution: true,
    });

    expect(blocked.policy.valid).toBe(false);
    expect(blocked.policy.code).toBe('POLICY_BUNDLE_DECISION_REQUIRED');

    const allowed = evaluateHubDispatchPolicy({
      target_agent_type: 'Executor',
      requested_hub_mode: 'standard_orchestration',
      prompt_analyst_enrichment_applied: true,
      strict_bundle_resolution: true,
      hub_decision_payload: {
        bundle_decision_id: 'decision-1',
        bundle_decision_version: 'v1',
        spoke_instruction_bundle: {
          bundle_id: 'instr-bundle',
          resolution_mode: 'strict',
        },
      },
    });

    expect(allowed.policy.valid).toBe(true);
  });

  it('prioritizes mode-boundary ownership checks over bundle-decision checks for Analyst dispatches', () => {
    const analystDispatch = evaluateHubDispatchPolicy({
      target_agent_type: 'Analyst',
      requested_hub_mode: 'standard_orchestration',
      prompt_analyst_enrichment_applied: false,
      strict_bundle_resolution: true,
      provisioning_mode: 'on_demand',
      requested_scope: 'task',
    });

    expect(analystDispatch.policy.valid).toBe(false);
    expect(analystDispatch.policy.code).toBe('POLICY_MODE_BOUNDARY_VIOLATION');
  });

  it('rejects invalid hub decision payloads when bundle contract is required', () => {
    const invalid = evaluateHubDispatchPolicy({
      target_agent_type: 'Executor',
      requested_hub_mode: 'standard_orchestration',
      prompt_analyst_enrichment_applied: true,
      strict_bundle_resolution: true,
      hub_decision_payload: {
        bundle_decision_id: 'decision-1',
        bundle_decision_version: 'v1',
      },
    });

    expect(invalid.policy.valid).toBe(false);
    expect(invalid.policy.code).toBe('POLICY_BUNDLE_DECISION_INVALID');
  });

  it('aggregates telemetry for concurrent sessions, stale registry rows, and conflict triggers', async () => {
    const now = new Date();
    const staleUpdatedAt = new Date(now.getTime() - 90 * 60 * 1000).toISOString();
    const freshUpdatedAt = new Date(now.getTime() - 3 * 60 * 1000).toISOString();

    mockGetRecentEvents.mockResolvedValue([
      {
        id: 'evt1',
        type: 'hub_routing_decision',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: {
          requested_hub_label: 'Coordinator',
          alias_resolution_applied: true,
          transition_event: 'manual_switch',
          target_agent_type: 'Executor',
          prompt_analyst_enrichment_applied: true,
          prompt_analyst_outcome: 'rerun',
          prompt_analyst_latency_ms: 120,
        },
      },
      {
        id: 'evt2',
        type: 'hub_routing_decision',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planB',
        data: {
          requested_hub_label: 'Hub',
          alias_resolution_applied: false,
          target_agent_type: 'Reviewer',
          prompt_analyst_enrichment_applied: false,
          prompt_analyst_outcome: 'reuse',
        },
      },
      {
        id: 'evt3',
        type: 'hub_policy_blocked',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: { code: 'POLICY_MODE_BOUNDARY_VIOLATION' },
      },
      {
        id: 'evt4',
        type: 'step_updated',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: { newStatus: 'blocked' },
      },
      {
        id: 'evt5',
        type: 'handoff',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: { reason: 'loop' },
      },
      {
        id: 'evt6',
        type: 'handoff',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planB',
        data: { reason: 'loop' },
      },
      {
        id: 'evt7',
        type: 'session_scope_conflict',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: { session_id: 'sessConflict' },
      },
      {
        id: 'evt8',
        type: 'prompt_analyst_enrichment',
        timestamp: now.toISOString(),
        workspace_id: 'ws1',
        plan_id: 'planA',
        data: { latency_ms: 200, outcome_label: 'fallback' },
      },
    ] as any);

    mockGetAllWorkspaceSessions.mockReturnValue([
      {
        id: 'sess_fresh',
        workspace_id: 'ws1',
        plan_id: 'planA',
        agent_type: 'Executor',
        current_phase: 'p1',
        step_indices_claimed: '[]',
        files_in_scope: '[]',
        materialised_path: '/a',
        status: 'active',
        started_at: now.toISOString(),
        updated_at: freshUpdatedAt,
      },
      {
        id: 'sess_stale',
        workspace_id: 'ws1',
        plan_id: 'planB',
        agent_type: 'Reviewer',
        current_phase: 'p2',
        step_indices_claimed: '[]',
        files_in_scope: '[]',
        materialised_path: '/b',
        status: 'active',
        started_at: now.toISOString(),
        updated_at: staleUpdatedAt,
      },
      {
        id: 'sess_done',
        workspace_id: 'ws1',
        plan_id: 'planA',
        agent_type: 'Tester',
        current_phase: 'p3',
        step_indices_claimed: '[]',
        files_in_scope: '[]',
        materialised_path: '/c',
        status: 'completed',
        started_at: now.toISOString(),
        updated_at: freshUpdatedAt,
      },
    ] as any);

    const snapshot = await buildHubTelemetrySnapshot('ws1', {
      window_hours: 24,
      stale_threshold_minutes: 30,
      event_limit: 200,
    });

    expect(snapshot.mode_selection_accuracy.total_decisions).toBe(2);
    expect(snapshot.mode_selection_accuracy.blocked_decisions).toBe(1);
    expect(snapshot.mode_selection_accuracy.accuracy_percent).toBe(50);

    expect(snapshot.alias_usage_decay.legacy_alias_count).toBe(1);
    expect(snapshot.alias_usage_decay.alias_usage_percent).toBe(50);
    expect(snapshot.alias_usage_decay.by_label.Coordinator).toBe(1);

    expect(snapshot.blocked_step_rate.blocked_steps).toBe(1);
    expect(snapshot.blocked_step_rate.rate_percent).toBe(100);

    expect(snapshot.handoff_churn.handoff_events).toBe(2);
    expect(snapshot.handoff_churn.distinct_plans).toBe(2);
    expect(snapshot.handoff_churn.average_handoffs_per_plan).toBe(1);

    expect(snapshot.prompt_analyst.applied_count).toBe(1);
    expect(snapshot.prompt_analyst.expected_count).toBe(2);
    expect(snapshot.prompt_analyst.enrichment_hit_rate_percent).toBe(50);
    expect(snapshot.prompt_analyst.avg_latency_ms).toBe(160);
    expect(snapshot.prompt_analyst.p95_latency_ms).toBe(200);
    expect(snapshot.prompt_analyst.outcomes.rerun).toBe(1);
    expect(snapshot.prompt_analyst.outcomes.reuse).toBe(1);
    expect(snapshot.prompt_analyst.outcomes.fallback).toBe(1);

    expect(snapshot.cross_session_conflict_detection.conflict_events).toBe(1);
    expect(snapshot.cross_session_conflict_detection.rate_percent).toBe(50);

    expect(snapshot.session_registry_accuracy.active_count).toBe(2);
    expect(snapshot.session_registry_accuracy.completed_count).toBe(1);
    expect(snapshot.session_registry_accuracy.stale_active_count).toBe(1);
    expect(snapshot.session_registry_accuracy.stale_active_rate_percent).toBe(50);
  });

  it('passes hard promotion gates when non-regression and thresholds are satisfied', () => {
    const report = evaluateHubPromotionGates(
      {
        generated_at: '2026-02-27T00:00:00.000Z',
        window_since: '2026-02-26T00:00:00.000Z',
        window_hours: 24,
        mode_selection_accuracy: { total_decisions: 100, blocked_decisions: 1, accuracy_percent: 99 },
        transition_frequency: { transitions: 4, per_100_decisions: 4 },
        alias_usage_decay: { legacy_alias_count: 20, canonical_mode_count: 80, alias_usage_percent: 20, by_label: {} },
        blocked_step_rate: { blocked_steps: 2, total_step_updates: 100, rate_percent: 2 },
        handoff_churn: { handoff_events: 20, distinct_plans: 20, average_handoffs_per_plan: 1 },
        prompt_analyst: {
          applied_count: 90,
          expected_count: 100,
          enrichment_hit_rate_percent: 90,
          avg_latency_ms: 120,
          p95_latency_ms: 220,
          outcomes: {
            rerun: 90,
            reuse: 10,
            fallback: 0,
          },
        },
        cross_session_conflict_detection: { conflict_events: 1, total_routes: 100, rate_percent: 1 },
        session_registry_accuracy: {
          active_count: 10,
          completed_count: 50,
          stale_active_count: 0,
          stale_active_rate_percent: 0,
          stale_threshold_minutes: 30,
        },
      },
      {
        baseline: {
          blocked_step_rate_percent: 3,
          average_handoffs_per_plan: 1.2,
        },
        scenario_parity_passed: true,
      },
    );

    expect(report.passed).toBe(true);
    expect(report.blockers).toHaveLength(0);
    expect(report.gates.blocker_rate_non_regression.passed).toBe(true);
    expect(report.gates.handoff_churn_reduction.passed).toBe(true);
    expect(report.gates.prompt_analyst_hit_rate.passed).toBe(true);
    expect(report.gates.cross_session_conflict_rate.passed).toBe(true);
  });

  it('fails hard promotion gates when parity/baseline/threshold conditions are not met', () => {
    const report = evaluateHubPromotionGates(
      {
        generated_at: '2026-02-27T00:00:00.000Z',
        window_since: '2026-02-26T00:00:00.000Z',
        window_hours: 24,
        mode_selection_accuracy: { total_decisions: 10, blocked_decisions: 5, accuracy_percent: 50 },
        transition_frequency: { transitions: 8, per_100_decisions: 80 },
        alias_usage_decay: { legacy_alias_count: 9, canonical_mode_count: 1, alias_usage_percent: 90, by_label: {} },
        blocked_step_rate: { blocked_steps: 4, total_step_updates: 10, rate_percent: 40 },
        handoff_churn: { handoff_events: 20, distinct_plans: 5, average_handoffs_per_plan: 4 },
        prompt_analyst: {
          applied_count: 10,
          expected_count: 100,
          enrichment_hit_rate_percent: 10,
          avg_latency_ms: 300,
          p95_latency_ms: 500,
          outcomes: {
            rerun: 10,
            reuse: 80,
            fallback: 10,
          },
        },
        cross_session_conflict_detection: { conflict_events: 3, total_routes: 10, rate_percent: 30 },
        session_registry_accuracy: {
          active_count: 3,
          completed_count: 1,
          stale_active_count: 2,
          stale_active_rate_percent: 66.67,
          stale_threshold_minutes: 30,
        },
      },
      {
        baseline: {
          blocked_step_rate_percent: 5,
          average_handoffs_per_plan: 2,
        },
        scenario_parity_passed: false,
      },
    );

    expect(report.passed).toBe(false);
    expect(report.blockers).toContain('scenario_parity_failed');
    expect(report.blockers).toContain('blocker_rate_non_regression_failed');
    expect(report.blockers).toContain('handoff_churn_reduction_failed');
    expect(report.blockers).toContain('prompt_analyst_hit_rate_failed');
    expect(report.blockers).toContain('cross_session_conflict_rate_failed');
  });

  it('defines Direct Option A migration milestones with strict gate and rollback checkpoints', () => {
    const plan = getDirectOptionAMigrationPlan();

    expect(plan.strategy).toBe('direct_option_a');
    expect(plan.session_scoped_from_day_one).toBe(true);
    expect(plan.milestones).toHaveLength(5);
    expect(plan.milestones.map((milestone) => milestone.order)).toEqual([1, 2, 3, 4, 5]);
    for (const milestone of plan.milestones) {
      expect(milestone.strict_gate_checkpoint).toContain('gate_');
      expect(milestone.rollback_checkpoint).toContain('rollback_');
    }
  });

  it('evaluates Direct Option A migration progress with hard blockers when checkpoints are unmet', () => {
    const blocked = evaluateDirectOptionAProgress({
      permanent_files_ready: false,
      session_registry_active: true,
      deprecated_legacy_labels: ['Coordinator'],
      dynamic_spoke_materialisation_active: false,
      legacy_static_files_remaining: 5,
      promotion_gates_passed: false,
      rollback_ready: false,
    });

    expect(blocked.ready_for_full_cutover).toBe(false);
    expect(blocked.milestones.filter((milestone) => milestone.status === 'blocked').length).toBeGreaterThan(0);
    expect(blocked.blockers).toContain('Permanent file pair (hub + prompt-analyst) is not ready.');
    expect(blocked.blockers).toContain('Promotion gates must pass before dynamic cutover.');

    const ready = evaluateDirectOptionAProgress({
      permanent_files_ready: true,
      session_registry_active: true,
      deprecated_legacy_labels: ['Coordinator', 'Analyst', 'Runner', 'TDDDriver'],
      dynamic_spoke_materialisation_active: true,
      legacy_static_files_remaining: 0,
      promotion_gates_passed: true,
      rollback_ready: true,
    });

    expect(ready.ready_for_full_cutover).toBe(true);
    expect(ready.blockers).toHaveLength(0);
    expect(ready.milestones.every((milestone) => milestone.status === 'complete')).toBe(true);
  });

  it('builds fixed-window alias deprecation workflow and removes deprecated static files', async () => {
    const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'hub-deprecation-'));
    const agentsDir = path.join(tempRoot, '.github', 'agents');
    await fs.mkdir(agentsDir, { recursive: true });

    await fs.writeFile(path.join(agentsDir, 'hub.agent.md'), 'hub', 'utf-8');
    await fs.writeFile(path.join(agentsDir, 'prompt-analyst.agent.md'), 'pa', 'utf-8');
    await fs.writeFile(path.join(agentsDir, 'coordinator.agent.md'), 'coord', 'utf-8');
    await fs.writeFile(path.join(agentsDir, 'analyst.agent.md'), 'analyst', 'utf-8');
    await fs.writeFile(path.join(agentsDir, 'executor.agent.md'), 'exec', 'utf-8');

    const report = await buildLegacyDeprecationWorkflowReport(tempRoot, {
      current_window_index: 2,
      apply_legacy_static_removal: true,
    });

    const coordinatorWindow = report.alias_windows.find((window) => window.label === 'Coordinator');
    const analystWindow = report.alias_windows.find((window) => window.label === 'Analyst');

    expect(coordinatorWindow?.status).toBe('deprecated_removed');
    expect(coordinatorWindow?.alias_allowed).toBe(false);
    expect(analystWindow?.status).toBe('deprecating_active');
    expect(analystWindow?.alias_allowed).toBe(true);

    expect(report.removed_files).toContain('coordinator.agent.md');
    expect(report.legacy_static_files_after).not.toContain('coordinator.agent.md');
    expect(report.legacy_static_files_after).toContain('analyst.agent.md');
    expect(report.legacy_static_files_after).toContain('executor.agent.md');

    const remaining = await fs.readdir(agentsDir);
    expect(remaining).toContain('hub.agent.md');
    expect(remaining).toContain('prompt-analyst.agent.md');
  });
});