/**
 * Tests for Phase 8 dashboard types — Program, Skill, and Worker session types.
 * Validates type shape at runtime using object factories and structural checks.
 */
import { describe, it, expect } from 'vitest';
import type {
  ProgramSummary,
  ProgramDetail,
  ProgramPlanRef,
  AggregateProgress,
  SkillInfo,
  WorkerSession,
  AgentType,
  PlanStatus,
} from '../../types';

// ─── Helper: assert an object has a specific set of keys ─────────────────────

function assertHasKeys(obj: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    expect(obj).toHaveProperty(key);
  }
}

function makeAgg(overrides: Partial<AggregateProgress> = {}): AggregateProgress {
  return {
    total_plans: 0, active_plans: 0, completed_plans: 0, archived_plans: 0, failed_plans: 0,
    total_steps: 0, done_steps: 0, active_steps: 0, pending_steps: 0, blocked_steps: 0,
    completion_percentage: 0,
    ...overrides,
  };
}

function makeRef(overrides: Partial<ProgramPlanRef> = {}): ProgramPlanRef {
  return {
    plan_id: 'p', title: 't', status: 'active', priority: 'medium',
    current_phase: '', progress: { done: 0, total: 0 }, depends_on_plans: [],
    ...overrides,
  };
}

// ─── Program Types ───────────────────────────────────────────────────────────

describe('Program types', () => {
  describe('ProgramPlanRef', () => {
    it('has required fields: plan_id, title, status, priority, progress, depends_on_plans', () => {
      const ref: ProgramPlanRef = makeRef({
        plan_id: 'plan_001',
        title: 'Auth Flow',
        status: 'active',
        progress: { done: 3, total: 10 },
      });

      assertHasKeys(ref as unknown as Record<string, unknown>, [
        'plan_id',
        'title',
        'status',
        'priority',
        'progress',
        'depends_on_plans',
      ]);
      expect(ref.progress).toHaveProperty('done');
      expect(ref.progress).toHaveProperty('total');
    });

    it('status accepts all PlanStatus values', () => {
      const statuses: PlanStatus[] = ['active', 'paused', 'completed', 'archived', 'failed'];
      statuses.forEach((s) => {
        const ref: ProgramPlanRef = makeRef({ status: s });
        expect(ref.status).toBe(s);
      });
    });
  });

  describe('ProgramSummary', () => {
    it('has required fields', () => {
      const summary: ProgramSummary = {
        program_id: 'prog_001',
        name: 'Test Program',
        description: 'desc',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [],
        aggregate_progress: makeAgg(),
      };

      assertHasKeys(summary as unknown as Record<string, unknown>, [
        'program_id',
        'name',
        'description',
        'created_at',
        'updated_at',
        'workspace_id',
        'plans',
        'aggregate_progress',
      ]);
    });

    it('plans array can contain ProgramPlanRef items', () => {
      const summary: ProgramSummary = {
        program_id: 'prog_002',
        name: 'Multi-Plan',
        description: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [
          makeRef({ plan_id: 'p1', title: 'Plan 1', status: 'active', progress: { done: 1, total: 5 } }),
          makeRef({ plan_id: 'p2', title: 'Plan 2', status: 'completed', progress: { done: 8, total: 8 } }),
        ],
        aggregate_progress: makeAgg({ total_plans: 2, done_steps: 9, total_steps: 13, completion_percentage: 69 }),
      };

      expect(summary.plans).toHaveLength(2);
      expect(summary.plans[0].plan_id).toBe('p1');
      expect(summary.plans[1].status).toBe('completed');
    });

    it('aggregate_progress has full breakdown', () => {
      const summary: ProgramSummary = {
        program_id: 'prog_003',
        name: 'Sum Test',
        description: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [
          makeRef({ plan_id: 'p1', title: 'P1', progress: { done: 3, total: 5 } }),
          makeRef({ plan_id: 'p2', title: 'P2', progress: { done: 4, total: 7 } }),
        ],
        aggregate_progress: makeAgg({ total_plans: 2, done_steps: 7, total_steps: 12, completion_percentage: 58 }),
      };

      expect(summary.aggregate_progress.done_steps).toBe(7);
      expect(summary.aggregate_progress.total_steps).toBe(12);
      expect(summary.aggregate_progress.completion_percentage).toBe(58);
    });
  });

  describe('ProgramDetail', () => {
    it('extends ProgramSummary with optional goals and notes', () => {
      const detail: ProgramDetail = {
        program_id: 'prog_d1',
        name: 'Detail Program',
        description: 'With goals',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [],
        aggregate_progress: makeAgg(),
        goals: ['Ship v1', 'Pass all tests'],
        notes: [
          {
            note: 'Important note',
            type: 'info',
            added_at: '2026-01-15T00:00:00Z',
            added_by: 'agent',
          },
        ],
      };

      expect(detail.goals).toHaveLength(2);
      expect(detail.notes).toHaveLength(1);
      expect(detail.notes![0].type).toBe('info');
    });

    it('goals and notes are optional', () => {
      const detail: ProgramDetail = {
        program_id: 'prog_d2',
        name: 'Minimal Detail',
        description: '',
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-02-01T00:00:00Z',
        workspace_id: 'ws_123',
        plans: [],
        aggregate_progress: makeAgg(),
      };

      expect(detail.goals).toBeUndefined();
      expect(detail.notes).toBeUndefined();
    });
  });
});

// ─── Skill Types ─────────────────────────────────────────────────────────────

describe('Skill types', () => {
  describe('SkillInfo', () => {
    it('has required fields', () => {
      const skill: SkillInfo = {
        name: 'pyside6-qml-arch',
        description: 'Architecture patterns',
        file_path: '/skills/pyside6-qml-arch/SKILL.md',
        deployed: true,
        workspace_id: 'ws_skill_test',
      };

      assertHasKeys(skill as unknown as Record<string, unknown>, [
        'name',
        'description',
        'file_path',
        'deployed',
        'workspace_id',
      ]);
    });

    it('deployed_at is optional', () => {
      const skill: SkillInfo = {
        name: 'no-deploy-date',
        description: '',
        file_path: '/skills/x/SKILL.md',
        deployed: false,
        workspace_id: 'ws_123',
      };

      expect(skill.deployed_at).toBeUndefined();
    });

    it('deployed_at is present when deployed', () => {
      const skill: SkillInfo = {
        name: 'deployed-skill',
        description: 'Deployed',
        file_path: '/skills/d/SKILL.md',
        deployed: true,
        deployed_at: '2026-02-10T08:00:00Z',
        workspace_id: 'ws_123',
      };

      expect(skill.deployed_at).toBe('2026-02-10T08:00:00Z');
    });

    it('content is optional', () => {
      const skillWithContent: SkillInfo = {
        name: 'with-content',
        description: '',
        file_path: '/skills/c/SKILL.md',
        deployed: true,
        workspace_id: 'ws_123',
        content: '# Skill markdown',
      };

      expect(skillWithContent.content).toBe('# Skill markdown');

      const skillWithout: SkillInfo = {
        name: 'no-content',
        description: '',
        file_path: '/skills/c/SKILL.md',
        deployed: true,
        workspace_id: 'ws_123',
      };

      expect(skillWithout.content).toBeUndefined();
    });
  });
});

// ─── Worker Session Types ────────────────────────────────────────────────────

describe('Worker session types', () => {
  describe('WorkerSession', () => {
    it('extends AgentSession with agent_type Worker', () => {
      const session: WorkerSession = {
        session_id: 'sess_w1',
        agent_type: 'Worker',
        started_at: '2026-02-05T10:00:00Z',
        parent_hub_agent: 'Coordinator',
        context: {},
      };

      expect(session.agent_type).toBe('Worker');
    });

    it('has required parentAgent (parent_hub_agent) field', () => {
      const session: WorkerSession = {
        session_id: 'sess_w2',
        agent_type: 'Worker',
        started_at: '2026-02-05T10:00:00Z',
        parent_hub_agent: 'Analyst',
        context: {},
      };

      assertHasKeys(session as unknown as Record<string, unknown>, [
        'session_id',
        'agent_type',
        'started_at',
        'parent_hub_agent',
        'context',
      ]);
      expect(session.parent_hub_agent).toBe('Analyst');
    });

    it('parent_hub_agent accepts all hub agent types', () => {
      const hubs: AgentType[] = ['Coordinator', 'Analyst', 'Runner'];
      hubs.forEach((hub) => {
        const session: WorkerSession = {
          session_id: `sess_${hub}`,
          agent_type: 'Worker',
          started_at: '2026-02-05T10:00:00Z',
          parent_hub_agent: hub,
          context: {},
        };
        expect(session.parent_hub_agent).toBe(hub);
      });
    });

    it('task_scope is optional', () => {
      const withScope: WorkerSession = {
        session_id: 'sess_ws1',
        agent_type: 'Worker',
        started_at: '2026-02-05T10:00:00Z',
        parent_hub_agent: 'Coordinator',
        task_scope: 'Implement auth module',
        context: {},
      };

      expect(withScope.task_scope).toBe('Implement auth module');

      const withoutScope: WorkerSession = {
        session_id: 'sess_ws2',
        agent_type: 'Worker',
        started_at: '2026-02-05T10:00:00Z',
        parent_hub_agent: 'Runner',
        context: {},
      };

      expect(withoutScope.task_scope).toBeUndefined();
    });

    it('inherits AgentSession optional fields (completed_at, summary, artifacts)', () => {
      const session: WorkerSession = {
        session_id: 'sess_w_full',
        agent_type: 'Worker',
        started_at: '2026-02-05T10:00:00Z',
        completed_at: '2026-02-05T11:00:00Z',
        parent_hub_agent: 'Coordinator',
        summary: 'Completed auth implementation',
        artifacts: ['src/auth.ts', 'src/auth.test.ts'],
        context: { mode: 'WRITE' },
      };

      expect(session.completed_at).toBeDefined();
      expect(session.summary).toBe('Completed auth implementation');
      expect(session.artifacts).toHaveLength(2);
    });
  });

  describe('Worker in AgentType union', () => {
    it('Worker is a valid AgentType value', () => {
      const agentType: AgentType = 'Worker';
      expect(agentType).toBe('Worker');
    });
  });
});
