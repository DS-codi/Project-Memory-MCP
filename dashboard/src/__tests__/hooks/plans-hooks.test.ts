import { describe, it, expect } from 'vitest';
import { http, HttpResponse } from 'msw';
import { server } from '../../test/mocks/server';
import { fetchPlans, normalizePlanSummaries, partitionPlanSummaries } from '../../hooks/usePlans';

describe('usePlans relationship mapping', () => {
  it('normalizes relationship payload into UI-ready structures', () => {
    const normalized = normalizePlanSummaries([
      {
        id: 'program_1',
        title: 'Program 1',
        category: 'feature',
        priority: 'high',
        status: 'active',
        current_agent: null,
        progress: { done: 1, total: 2 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        is_program: true,
        child_plan_ids: ['plan_1'],
      },
      {
        id: 'plan_1',
        title: 'Child Plan',
        category: 'feature',
        priority: 'medium',
        status: 'active',
        current_agent: 'Executor',
        progress: { done: 1, total: 3 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        program_id: 'program_1',
        linked_plan_ids: ['plan_2', 'missing_plan'],
      },
      {
        id: 'plan_2',
        title: 'Linked Plan',
        category: 'bug',
        priority: 'low',
        status: 'paused',
        current_agent: null,
        progress: { done: 0, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const childPlan = normalized.find((plan) => plan.id === 'plan_1');
    const linkedPlan = normalized.find((plan) => plan.id === 'plan_2');

    expect(childPlan?.relationships?.kind).toBe('child');
    expect(childPlan?.relationships?.linked_plan_ids).toEqual(['plan_2', 'missing_plan']);
    expect(childPlan?.depends_on_plans).toEqual(['plan_2', 'missing_plan']);
    expect(childPlan?.linked_plan_ids).toEqual(['plan_2', 'missing_plan']);
    expect(childPlan?.relationships?.unresolved_linked_plan_ids).toEqual(['missing_plan']);
    expect(childPlan?.relationships?.state).toBe('partial');

    expect(linkedPlan?.relationships?.dependent_plan_ids).toEqual(['plan_1']);
    expect(linkedPlan?.relationships?.state).toBe('ready');
  });

  it('fetchPlans returns normalized relationship fields', async () => {
    server.use(
      http.get('/api/plans/workspace/ws_1', () =>
        HttpResponse.json({
          plans: [
            {
              id: 'plan_1',
              title: 'Plan',
              category: 'feature',
              priority: 'high',
              status: 'active',
              current_agent: null,
              progress: { done: 1, total: 2 },
              created_at: '2026-01-01T00:00:00.000Z',
              updated_at: '2026-01-01T00:00:00.000Z',
              child_plan_ids: ['plan_2'],
              linked_plan_ids: ['plan_3'],
            },
          ],
          total: 1,
        }),
      ),
    );

    const result = await fetchPlans('ws_1');
    expect(result.total).toBe(1);
    expect(result.plans[0].child_plan_ids).toEqual(['plan_2']);
    expect(result.plans[0].depends_on_plans).toEqual(['plan_3']);
    expect(result.plans[0].linked_plan_ids).toEqual(['plan_3']);
    expect(result.plans[0].program_id).toBeUndefined();
    expect(result.plans[0].relationships?.linked_plan_ids).toEqual(['plan_3']);
  });

  it('fetchPlans handles DB-style nested payload wrappers', async () => {
    server.use(
      http.get('/api/plans/workspace/ws_nested', () =>
        HttpResponse.json({
          success: true,
          data: {
            plans: [
              {
                id: 'plan_nested_1',
                title: 'Nested Plan',
                category: 'feature',
                priority: 'medium',
                status: 'active',
                current_agent: null,
                progress: { done: 2, total: 4 },
                created_at: '2026-01-01T00:00:00.000Z',
                updated_at: '2026-01-02T00:00:00.000Z',
              },
            ],
            total: 1,
          },
        }),
      ),
    );

    const result = await fetchPlans('ws_nested');
    expect(result.total).toBe(1);
    expect(result.plans).toHaveLength(1);
    expect(result.plans[0].id).toBe('plan_nested_1');
  });

  it('maps relationship payload fields when top-level fields are missing', () => {
    const [normalizedPlan] = normalizePlanSummaries([
      {
        id: 'plan_relationship_payload',
        title: 'Relationship Payload Plan',
        category: 'feature',
        priority: 'high',
        status: 'active',
        current_agent: null,
        progress: { done: 0, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
        relationships: {
          kind: 'child',
          parent_program_id: 'program_payload',
          child_plan_ids: ['child_payload'],
          linked_plan_ids: ['linked_payload'],
          dependent_plan_ids: [],
          unresolved_linked_plan_ids: [],
          state: 'ready',
        },
      },
    ]);

    expect(normalizedPlan.program_id).toBe('program_payload');
    expect(normalizedPlan.child_plan_ids).toEqual(['child_payload']);
    expect(normalizedPlan.depends_on_plans).toEqual(['linked_payload']);
    expect(normalizedPlan.linked_plan_ids).toEqual(['linked_payload']);
    expect(normalizedPlan.relationships?.kind).toBe('child');
    expect(normalizedPlan.relationships?.state).toBe('partial');
    expect(normalizedPlan.relationships?.unresolved_linked_plan_ids).toEqual(['linked_payload']);
  });

  it('partitions active and archived plans with deterministic ordering', () => {
    const plans = normalizePlanSummaries([
      {
        id: 'plan_b',
        title: 'Plan B',
        category: 'feature',
        priority: 'high',
        status: 'active',
        current_agent: null,
        progress: { done: 0, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'plan_a',
        title: 'Plan A',
        category: 'feature',
        priority: 'high',
        status: 'active',
        current_agent: null,
        progress: { done: 0, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-02T00:00:00.000Z',
      },
      {
        id: 'plan_z_archived',
        title: 'Plan Z Archived',
        category: 'bug',
        priority: 'low',
        status: 'archived',
        current_agent: null,
        progress: { done: 1, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-03T00:00:00.000Z',
      },
      {
        id: 'plan_y_archived',
        title: 'Plan Y Archived',
        category: 'bug',
        priority: 'low',
        status: 'archived',
        current_agent: null,
        progress: { done: 1, total: 1 },
        created_at: '2026-01-01T00:00:00.000Z',
        updated_at: '2026-01-01T00:00:00.000Z',
      },
    ]);

    const { activePlans, archivedPlans } = partitionPlanSummaries(plans);

    expect(activePlans.map((plan) => plan.id)).toEqual(['plan_a', 'plan_b']);
    expect(archivedPlans.map((plan) => plan.id)).toEqual(['plan_z_archived', 'plan_y_archived']);
  });
});
