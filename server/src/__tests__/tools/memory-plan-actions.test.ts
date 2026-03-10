import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import type { MemoryPlanParams } from '../../tools/consolidated/memory_plan.js';
import * as planTools from '../../tools/plan/index.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as fileStore from '../../storage/db-store.js';
import * as approvalGateRouting from '../../tools/orchestration/approval-gate-routing.js';
import * as supervisorClient from '../../tools/orchestration/supervisor-client.js';

vi.mock('../../tools/plan.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');
vi.mock('../../tools/orchestration/approval-gate-routing.js', async () => {
  const actual = await vi.importActual<typeof import('../../tools/orchestration/approval-gate-routing.js')>(
    '../../tools/orchestration/approval-gate-routing.js',
  );
  return {
    ...actual,
    routeApprovalGate: vi.fn(),
    pausePlanAtApprovalGate: vi.fn(),
  };
});
vi.mock('../../tools/orchestration/supervisor-client.js', async () => {
  const actual = await vi.importActual<typeof import('../../tools/orchestration/supervisor-client.js')>(
    '../../tools/orchestration/supervisor-client.js',
  );
  return {
    ...actual,
    checkGuiAvailability: vi.fn(),
    launchFormApp: vi.fn(),
  };
});

const mockWorkspaceId = 'ws_plan_actions_123';
const mockPlanId = 'plan_actions_456';
const mockRouteApprovalGate = vi.mocked(approvalGateRouting.routeApprovalGate);
const mockPausePlanAtApprovalGate = vi.mocked(approvalGateRouting.pausePlanAtApprovalGate);
const mockCheckGuiAvailability = vi.mocked(supervisorClient.checkGuiAvailability);
const mockLaunchFormApp = vi.mocked(supervisorClient.launchFormApp);

function makePlanState() {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Plan',
    description: 'Plan desc',
    category: 'feature' as const,
    priority: 'medium' as const,
    status: 'active' as const,
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-02-04T10:00:00Z',
    updated_at: '2026-02-04T10:00:00Z',
    steps: [
      {
        index: 0,
        phase: 'Phase 1',
        task: 'Task 1',
        status: 'pending' as const,
      },
    ],
    agent_sessions: [],
    lineage: [],
    notes: [],
  };
}

function makeCleanupApprovalBatch(workspaceId: string = mockWorkspaceId) {
  return {
    form_request: {
      type: 'form_request',
      version: 1,
      request_id: 'req_cleanup_001',
      form_type: 'approval',
      metadata: {
        plan_id: mockPlanId,
        workspace_id: workspaceId,
        session_id: 'sess_cleanup_001',
        agent: 'FolderCleanupShell',
        title: 'Stale Active Plan Review',
      },
      timeout: {
        duration_seconds: 300,
        on_timeout: 'defer',
        fallback_mode: 'chat',
      },
      window: {
        title: 'Stale Active Plan Review',
      },
      questions: [
        {
          type: 'confirm_reject',
          id: 'stale_active__plan_A',
          label: 'Plan A',
        },
        {
          type: 'confirm_reject',
          id: 'stale_active__plan_B',
          label: 'Plan B',
        },
      ],
    },
    response_mapping: [
      {
        question_id: 'stale_active__plan_A',
        plan_id: 'plan_A',
        on_approve: {
          mcp_action: 'memory_plan',
          mcp_params: {
            action: 'pause_plan',
            plan_id: 'plan_A',
            pause_reason: 'deferred',
            workspace_id: workspaceId,
          },
        },
        on_reject: {
          action: 'no_mutation',
        },
      },
      {
        question_id: 'stale_active__plan_B',
        plan_id: 'plan_B',
        on_approve: {
          mcp_action: 'memory_plan',
          mcp_params: {
            action: 'pause_plan',
            plan_id: 'plan_B',
            pause_reason: 'deferred',
            workspace_id: workspaceId,
          },
        },
        on_reject: {
          action: 'no_mutation',
        },
      },
    ],
  };
}

describe('MCP Tool: memory_plan Core Actions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  describe('list action', () => {
    it('should require workspace_id or workspace_path', async () => {
      const result = await memoryPlan({ action: 'list' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id or workspace_path');
    });

    it('should list plans when valid', async () => {
      vi.spyOn(planTools, 'listPlans').mockResolvedValue({
        success: true,
        data: {
          workspace_id: mockWorkspaceId,
          workspace_name: 'Test Workspace',
          workspace_path: '/test/workspace',
          active_plans: [],
          archived_plans: [],
          message: 'ok'
        }
      });

      const result = await memoryPlan({
        action: 'list',
        workspace_id: mockWorkspaceId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list') {
        expect(result.data.data.workspace_id).toBe(mockWorkspaceId);
      }
    });
  });

  describe('get action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryPlan({ action: 'get', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should return plan state when valid', async () => {
      vi.spyOn(planTools, 'getPlanState').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'get',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'get') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('create action', () => {
    it('should require workspace_id, title, description, and category', async () => {
      const result = await memoryPlan({
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Plan'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('description');
    });

    it('should create plan when valid', async () => {
      vi.spyOn(planTools, 'createPlan').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'create',
        workspace_id: mockWorkspaceId,
        title: 'Plan',
        description: 'Plan desc',
        category: 'feature'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'create') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('update action', () => {
    it('should require workspace_id, plan_id, and steps', async () => {
      const result = await memoryPlan({
        action: 'update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('steps');
    });

    it('should update plan steps when valid', async () => {
      vi.spyOn(planTools, 'modifyPlan').mockResolvedValue({
        success: true,
        data: {
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          role_boundaries: {
            agent_type: 'Executor',
            can_implement: true,
            can_finalize: true,
            must_handoff_to: [],
            forbidden_actions: [],
            primary_responsibility: 'Implement changes'
          },
          next_action: {
            should_handoff: false,
            message: 'ok'
          }
        }
      });

      const result = await memoryPlan({
        action: 'update',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        steps: [{ phase: 'Phase 1', task: 'Task 1', status: 'pending' }]
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'update') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('archive action', () => {
    it('should require workspace_id and plan_id', async () => {
      const result = await memoryPlan({ action: 'archive', workspace_id: mockWorkspaceId });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should archive plan when valid', async () => {
      vi.spyOn(planTools, 'archivePlan').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Plan',
          description: 'Plan desc',
          category: 'feature',
          priority: 'medium',
          status: 'archived',
          current_phase: 'complete',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'archive',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'archive') {
        expect(result.data.data.status).toBe('archived');
      }
    });
  });

  describe('import action', () => {
    it('should require workspace_id, plan_file_path, and category', async () => {
      const result = await memoryPlan({
        action: 'import',
        workspace_id: mockWorkspaceId,
        plan_file_path: '/tmp/plan.md'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('category');
    });

    it('should import plan when valid', async () => {
      vi.spyOn(planTools, 'importPlan').mockResolvedValue({
        success: true,
        data: {
          plan_id: mockPlanId,
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Imported Plan',
            description: 'Imported',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          warnings: []
        }
      });

      const result = await memoryPlan({
        action: 'import',
        workspace_id: mockWorkspaceId,
        plan_file_path: '/tmp/plan.md',
        category: 'feature'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'import') {
        expect(result.data.data.plan_id).toBe(mockPlanId);
      }
    });
  });

  describe('find action', () => {
    it('should require plan_id', async () => {
      const result = await memoryPlan({ action: 'find' });

      expect(result.success).toBe(false);
      expect(result.error).toContain('plan_id');
    });

    it('should find plan when valid', async () => {
      vi.spyOn(planTools, 'findPlan').mockResolvedValue({
        success: true,
        data: {
          workspace_id: mockWorkspaceId,
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          workspace_path: '/test/workspace',
          resume_instruction: 'resume'
        }
      });

      const result = await memoryPlan({
        action: 'find',
        plan_id: mockPlanId
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'find') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('add_note action', () => {
    it('should require workspace_id, plan_id, and note', async () => {
      const result = await memoryPlan({
        action: 'add_note',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('note');
    });

    it('should add plan note when valid', async () => {
      vi.spyOn(planTools, 'addPlanNote').mockResolvedValue({
        success: true,
        data: {
          plan_id: mockPlanId,
          notes_count: 1
        }
      });

      const result = await memoryPlan({
        action: 'add_note',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        note: 'Note'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'add_note') {
        expect(result.data.data.notes_count).toBe(1);
      }
    });
  });

  describe('delete action', () => {
    it('should require confirm=true', async () => {
      const result = await memoryPlan({
        action: 'delete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirm');
    });

    it('should delete plan when confirm=true', async () => {
      vi.spyOn(planTools, 'deletePlan').mockResolvedValue({
        success: true,
        data: {
          deleted: true,
          plan_id: mockPlanId
        }
      });

      const result = await memoryPlan({
        action: 'delete',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        confirm: true
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'delete') {
        expect(result.data.data.deleted).toBe(true);
      }
    });
  });

  describe('consolidate action', () => {
    it('should require workspace_id, plan_id, step_indices, and consolidated_task', async () => {
      const result = await memoryPlan({
        action: 'consolidate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('step_indices');
    });

    it('should consolidate steps when valid', async () => {
      vi.spyOn(planTools, 'consolidateSteps').mockResolvedValue({
        success: true,
        data: {
          plan_state: {
            id: mockPlanId,
            workspace_id: mockWorkspaceId,
            title: 'Plan',
            description: 'Plan desc',
            category: 'feature',
            priority: 'medium',
            status: 'active',
            current_phase: 'Phase 1',
            current_agent: null,
            created_at: '2026-02-04T10:00:00Z',
            updated_at: '2026-02-04T10:00:00Z',
            steps: [],
            agent_sessions: [],
            lineage: [],
            notes: []
          },
          role_boundaries: {
            agent_type: 'Executor',
            can_implement: true,
            can_finalize: true,
            must_handoff_to: [],
            forbidden_actions: [],
            primary_responsibility: 'Implement changes'
          },
          next_action: {
            should_handoff: false,
            message: 'ok'
          }
        }
      });

      const result = await memoryPlan({
        action: 'consolidate',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_indices: [0, 1],
        consolidated_task: 'Merged'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'consolidate') {
        expect(result.data.data.plan_state.id).toBe(mockPlanId);
      }
    });
  });

  describe('create_from_template action', () => {
    it('should require workspace_id, template, title, and description', async () => {
      const result = await memoryPlan({
        action: 'create_from_template',
        workspace_id: mockWorkspaceId,
        template: 'feature'
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('title');
    });

    it('should create plan from template when valid', async () => {
      vi.spyOn(planTools, 'createPlanFromTemplate').mockResolvedValue({
        success: true,
        data: {
          id: mockPlanId,
          workspace_id: mockWorkspaceId,
          title: 'Template Plan',
          description: 'From template',
          category: 'feature',
          priority: 'medium',
          status: 'active',
          current_phase: 'Phase 1',
          current_agent: null,
          created_at: '2026-02-04T10:00:00Z',
          updated_at: '2026-02-04T10:00:00Z',
          steps: [],
          agent_sessions: [],
          lineage: [],
          notes: []
        }
      });

      const result = await memoryPlan({
        action: 'create_from_template',
        workspace_id: mockWorkspaceId,
        template: 'feature',
        title: 'Template Plan',
        description: 'From template',
        category: 'feature'
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'create_from_template') {
        expect(result.data.data.id).toBe(mockPlanId);
      }
    });
  });

  describe('confirm action', () => {
    it('should require workspace_id, plan_id, and confirmation_scope', async () => {
      const result = await memoryPlan({
        action: 'confirm',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
      } as MemoryPlanParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('confirmation_scope');
    });

    it('should append Coordinator handoff guidance when confirmStep reports GUI-unavailable fallback', async () => {
      vi.spyOn(planTools, 'confirmStep').mockResolvedValue({
        success: false,
        error: 'Approval GUI unavailable; fallback_to_chat',
      });

      const result = await memoryPlan({
        action: 'confirm',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        confirmation_scope: 'step',
        confirm_step_index: 2,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('memory_agent(action: "handoff"');
      expect(result.error).toContain('to_agent: "Coordinator"');
    });
  });

  describe('list_templates action', () => {
    it('should list templates', async () => {
      vi.spyOn(planTools, 'getTemplates').mockReturnValue([
        { template: 'feature', steps: [] }
      ]);

      const result = await memoryPlan({ action: 'list_templates' });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'list_templates') {
        expect(result.data.data).toHaveLength(1);
        expect(result.data.data[0].template).toBe('feature');
      }
    });
  });

  describe('summon_approval action', () => {
    it('should require workspace_id, plan_id, and approval_step_index', async () => {
      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
      } as MemoryPlanParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('approval_step_index');
    });

    it('records approval by confirming the target step when GUI approves', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(makePlanState() as any);
      mockRouteApprovalGate.mockResolvedValue({
        approved: true,
        path: 'gui',
        outcome: 'approved',
        elapsed_ms: 12,
      } as any);
      vi.spyOn(planTools, 'confirmStep').mockResolvedValue({
        success: true,
        data: {
          plan_state: makePlanState(),
          confirmation: {
            confirmed: true,
            confirmed_by: 'approval_gui',
            confirmed_at: '2026-02-04T10:00:12Z',
          },
        },
      } as any);

      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        approval_step_index: 0,
        approval_session_id: 'sess_approval_001',
      });

      expect(result.success).toBe(true);
      expect(mockRouteApprovalGate).toHaveBeenCalledWith(
        expect.any(Object),
        0,
        'sess_approval_001',
      );
      expect(planTools.confirmStep).toHaveBeenCalledWith({
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        step_index: 0,
        confirmed_by: 'approval_gui',
      });
      if (result.data && result.data.action === 'summon_approval') {
        expect(result.data.data.approved).toBe(true);
        expect(result.data.data.confirmation_recorded).toBe(true);
      }
    });

    it('pauses the plan when GUI rejects', async () => {
      const baseState = makePlanState();
      const pausedSnapshot = {
        paused_at: '2026-02-04T10:01:00Z',
        step_index: 0,
        phase: 'Phase 1',
        step_task: 'Task 1',
        reason: 'rejected' as const,
        user_notes: 'Needs revision',
        session_id: 'sess_approval_002',
      };

      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(baseState as any);
      mockRouteApprovalGate.mockResolvedValue({
        approved: false,
        path: 'gui',
        outcome: 'rejected',
        user_notes: 'Needs revision',
        paused_snapshot: pausedSnapshot,
        elapsed_ms: 33,
      } as any);
      mockPausePlanAtApprovalGate.mockResolvedValue({
        ...baseState,
        status: 'paused',
        paused_at_snapshot: pausedSnapshot,
      } as any);

      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        approval_step_index: 0,
        approval_session_id: 'sess_approval_002',
      });

      expect(result.success).toBe(true);
      expect(mockPausePlanAtApprovalGate).toHaveBeenCalledOnce();
      if (result.data && result.data.action === 'summon_approval') {
        expect(result.data.data.approved).toBe(false);
        expect(result.data.data.paused).toBe(true);
        expect(result.data.data.outcome).toBe('rejected');
      }
    });

    it('pauses the plan and returns deferred outcome when GUI defers', async () => {
      const baseState = makePlanState();
      const pausedSnapshot = {
        paused_at: '2026-02-04T10:02:00Z',
        step_index: 0,
        phase: 'Phase 1',
        step_task: 'Task 1',
        reason: 'deferred' as const,
        user_notes: 'Waiting for requirement clarification',
        session_id: 'sess_approval_003',
      };

      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(baseState as any);
      mockRouteApprovalGate.mockResolvedValue({
        approved: false,
        path: 'gui',
        outcome: 'deferred',
        user_notes: 'Waiting for requirement clarification',
        paused_snapshot: pausedSnapshot,
        elapsed_ms: 27,
      } as any);
      mockPausePlanAtApprovalGate.mockResolvedValue({
        ...baseState,
        status: 'paused',
        paused_at_snapshot: pausedSnapshot,
      } as any);

      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        approval_step_index: 0,
        approval_session_id: 'sess_approval_003',
      });

      expect(result.success).toBe(true);
      expect(mockPausePlanAtApprovalGate).toHaveBeenCalledOnce();
      if (result.data && result.data.action === 'summon_approval') {
        expect(result.data.data.approved).toBe(false);
        expect(result.data.data.paused).toBe(true);
        expect(result.data.data.outcome).toBe('deferred');
      }
    });

    it('fails closed when approval response mode parsing fails', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(makePlanState() as any);
      mockRouteApprovalGate.mockResolvedValue({
        approved: false,
        path: 'gui',
        outcome: 'error',
        error: 'Approval decision parsing failed (unknown_mode): Unknown approval_decision_v2 mode "legacy_unknown". Fallback behavior "blocked".',
        elapsed_ms: 5,
      } as any);

      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        approval_step_index: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('unknown_mode');
      expect(result.error).toContain('Fallback behavior "blocked"');
      expect(mockPausePlanAtApprovalGate).not.toHaveBeenCalled();
    });

    it('returns an error when approval GUI is unavailable', async () => {
      vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(makePlanState() as any);
      mockRouteApprovalGate.mockResolvedValue({
        approved: false,
        path: 'fallback',
        outcome: 'fallback_to_chat',
        error: 'Approval GUI unavailable; fallback_to_chat',
        elapsed_ms: 4,
        requires_handoff_to_coordinator: true,
      } as any);

      const result = await memoryPlan({
        action: 'summon_approval',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        approval_step_index: 0,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Approval GUI unavailable');
      expect(mockPausePlanAtApprovalGate).not.toHaveBeenCalled();
    });
  });

  describe('summon_cleanup_approval action', () => {
    it('requires workspace_id and cleanup payload source', async () => {
      const result = await memoryPlan({
        action: 'summon_cleanup_approval',
        workspace_id: mockWorkspaceId,
      } as MemoryPlanParams);

      expect(result.success).toBe(false);
      expect(result.error).toContain('cleanup_report_path');
    });

    it('returns approved cleanup actions from confirm/reject answers', async () => {
      const batch = makeCleanupApprovalBatch();
      mockCheckGuiAvailability.mockResolvedValue({
        supervisor_running: true,
        brainstorm_gui: true,
        approval_gui: true,
        capabilities: ['approval_gui'],
        message: 'Supervisor running',
      } as any);
      mockLaunchFormApp.mockResolvedValue({
        app_name: 'approval_gui',
        success: true,
        elapsed_ms: 41,
        timed_out: false,
        response_payload: {
          type: 'form_response',
          version: 1,
          request_id: 'req_cleanup_001',
          form_type: 'approval',
          status: 'completed',
          metadata: {
            plan_id: mockPlanId,
            workspace_id: mockWorkspaceId,
            session_id: 'sess_cleanup_001',
          },
          answers: [
            {
              question_id: 'stale_active__plan_A',
              value: {
                type: 'confirm_reject_answer',
                action: 'approve',
                notes: 'Pause this one',
              },
            },
            {
              question_id: 'stale_active__plan_B',
              value: {
                type: 'confirm_reject_answer',
                action: 'reject',
                notes: 'Keep active',
              },
            },
          ],
        },
      } as any);

      const result = await memoryPlan({
        action: 'summon_cleanup_approval',
        workspace_id: mockWorkspaceId,
        cleanup_form_request: batch.form_request,
        cleanup_response_mapping: batch.response_mapping,
      });

      expect(result.success).toBe(true);
      expect(mockLaunchFormApp).toHaveBeenCalledOnce();
      if (result.data && result.data.action === 'summon_cleanup_approval') {
        expect(result.data.data.approved_action_count).toBe(1);
        expect(result.data.data.no_mutation_count).toBe(1);
        expect(result.data.data.form_status).toBe('completed');
        expect(result.data.data.approved_actions[0].question_id).toBe('stale_active__plan_A');
        expect(result.data.data.approved_actions[0].mcp_params.action).toBe('pause_plan');
      }
    });

    it('fails when payload workspace does not match tool workspace_id', async () => {
      const batch = makeCleanupApprovalBatch('different-workspace-id');

      const result = await memoryPlan({
        action: 'summon_cleanup_approval',
        workspace_id: mockWorkspaceId,
        cleanup_form_request: batch.form_request,
        cleanup_response_mapping: batch.response_mapping,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace mismatch');
      expect(mockLaunchFormApp).not.toHaveBeenCalled();
    });

    it('maps unanswered items to no mutation when timed out', async () => {
      const batch = makeCleanupApprovalBatch();
      mockCheckGuiAvailability.mockResolvedValue({
        supervisor_running: true,
        brainstorm_gui: true,
        approval_gui: true,
        capabilities: ['approval_gui'],
        message: 'Supervisor running',
      } as any);
      mockLaunchFormApp.mockResolvedValue({
        app_name: 'approval_gui',
        success: true,
        elapsed_ms: 28,
        timed_out: true,
        response_payload: {
          type: 'form_response',
          version: 1,
          request_id: 'req_cleanup_001',
          form_type: 'approval',
          status: 'timed_out',
          metadata: {
            plan_id: mockPlanId,
            workspace_id: mockWorkspaceId,
            session_id: 'sess_cleanup_001',
          },
          answers: [],
        },
      } as any);

      const result = await memoryPlan({
        action: 'summon_cleanup_approval',
        workspace_id: mockWorkspaceId,
        cleanup_form_request: batch.form_request,
        cleanup_response_mapping: batch.response_mapping,
      });

      expect(result.success).toBe(true);
      if (result.data && result.data.action === 'summon_cleanup_approval') {
        expect(result.data.data.form_status).toBe('timed_out');
        expect(result.data.data.approved_action_count).toBe(0);
        expect(result.data.data.no_mutation_count).toBe(2);
        expect(result.data.data.decisions.every((item) => item.decision === 'defer')).toBe(true);
      }
    });
  });
});
