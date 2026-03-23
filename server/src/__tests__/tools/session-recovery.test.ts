import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryAgent } from '../../tools/consolidated/memory_agent.js';
import type { MemoryAgentParams } from '../../tools/consolidated/memory_agent.js';
import * as handoffTools from '../../tools/handoff.tools.js';
import * as agentTools from '../../tools/agent.tools.js';
import * as validationTools from '../../tools/agent-validation.tools.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as agentDeploy from '../../tools/agent-deploy.js';
import * as fileStore from '../../storage/db-store.js';
import * as sessionLiveStore from '../../tools/session-live-store.js';
import * as staleRunRecovery from '../../tools/orchestration/stale-run-recovery.js';

vi.mock('../../tools/handoff.tools.js');
vi.mock('../../tools/agent.tools.js');
vi.mock('../../tools/agent-validation.tools.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../tools/agent-deploy.js');
vi.mock('../../storage/db-store.js');
vi.mock('../../storage/workspace-identity.js');
vi.mock('../../tools/session-live-store.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    registerLiveSession: vi.fn(),
    clearLiveSession: vi.fn(),
    serverSessionIdForPrepId: vi.fn(),
  };
});
vi.mock('../../tools/orchestration/stale-run-recovery.js', async (importOriginal) => {
  const original = await importOriginal() as Record<string, unknown>;
  return {
    ...original,
    acquireActiveRun: vi.fn().mockResolvedValue({ acquired: true, reason: 'acquired' }),
    writeActiveRun: vi.fn().mockResolvedValue(undefined),
  };
});

const mockWorkspaceId = 'ws_recovery_test_123';
const mockPlanId = 'plan_recovery_test_456';

function buildMockPlanState(sessions: Record<string, unknown>[]) {
  return {
    id: mockPlanId,
    workspace_id: mockWorkspaceId,
    title: 'Test Plan',
    status: 'active',
    current_phase: 'Implementation',
    agent_sessions: sessions,
    steps: [],
    handoffs: [],
  };
}

describe('MCP Tool: memory_agent recover action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
    vi.spyOn(fileStore, 'getWorkspace').mockResolvedValue({
      id: mockWorkspaceId,
      workspace_path: '/test/workspace',
    } as any);
    vi.spyOn(fileStore, 'savePlanState').mockResolvedValue(undefined);
    vi.spyOn(fileStore, 'nowISO').mockReturnValue('2026-03-24T10:00:00.000Z');
    vi.spyOn(agentDeploy, 'cleanupAgent').mockResolvedValue(undefined);
  });

  it('should require session_id, workspace_id, plan_id, and agent_type', async () => {
    const result = await memoryAgent({
      action: 'recover' as any,
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('session_id');
    expect(result.error).toContain('agent_type');
  });

  it('should recover a valid active session', async () => {
    const mockSession = {
      session_id: 'sess_existing_001',
      agent_type: 'Executor',
      started_at: '2026-03-24T08:00:00.000Z',
      context: { run_id: 'run_sess_existing_001' },
    };
    const planState = buildMockPlanState([mockSession]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_existing_001',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    if (result.data && (result.data as any).action === 'recover') {
      const data = (result.data as any).data;
      expect(data.session.session_id).toBe('sess_existing_001');
      expect(data.plan_id).toBe(mockPlanId);
      expect(data.workspace_id).toBe(mockWorkspaceId);
      expect(data.role_boundaries).toBeDefined();
      expect(data.recovered_at).toBe('2026-03-24T10:00:00.000Z');
    }

    // Verify live store was updated
    expect(sessionLiveStore.registerLiveSession).toHaveBeenCalledWith(
      'sess_existing_001',
      undefined,
      {
        agentType: 'Executor',
        planId: mockPlanId,
        workspaceId: mockWorkspaceId,
      }
    );

    // Verify plan state was saved
    expect(fileStore.savePlanState).toHaveBeenCalled();

    // Verify active run lane was acquired (non-Coordinator)
    expect(staleRunRecovery.acquireActiveRun).toHaveBeenCalledWith(
      mockWorkspaceId,
      mockPlanId,
      expect.objectContaining({
        run_id: 'run_sess_existing_001',
        status: 'active',
        owner_agent: 'Executor',
      })
    );
  });

  it('should return error for nonexistent session', async () => {
    const planState = buildMockPlanState([
      {
        session_id: 'sess_other_001',
        agent_type: 'Researcher',
        started_at: '2026-03-24T08:00:00.000Z',
        context: {},
      },
    ]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_does_not_exist',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("No session found with ID 'sess_does_not_exist'");
  });

  it('should return error for completed session (terminal state)', async () => {
    const mockSession = {
      session_id: 'sess_completed_001',
      agent_type: 'Executor',
      started_at: '2026-03-24T08:00:00.000Z',
      completed_at: '2026-03-24T09:00:00.000Z',
      context: {},
    };
    const planState = buildMockPlanState([mockSession]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_completed_001',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('terminal state');
    expect(result.error).toContain('sess_completed_001');
  });

  it('should return error for agent type mismatch', async () => {
    const mockSession = {
      session_id: 'sess_researcher_001',
      agent_type: 'Researcher',
      started_at: '2026-03-24T08:00:00.000Z',
      context: {},
    };
    const planState = buildMockPlanState([mockSession]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_researcher_001',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain("belongs to agent type 'Researcher', not 'Executor'");
  });

  it('should clear duplicate live sessions for same agent type', async () => {
    const sessions = [
      {
        session_id: 'sess_old_executor',
        agent_type: 'Executor',
        started_at: '2026-03-24T06:00:00.000Z',
        context: {},
      },
      {
        session_id: 'sess_target_executor',
        agent_type: 'Executor',
        started_at: '2026-03-24T08:00:00.000Z',
        context: { run_id: 'run_target' },
      },
    ];
    const planState = buildMockPlanState(sessions);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_target_executor',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(true);
    // The old executor session should have been cleared
    expect(sessionLiveStore.clearLiveSession).toHaveBeenCalledWith('sess_old_executor');
    // The recovered session should be registered
    expect(sessionLiveStore.registerLiveSession).toHaveBeenCalledWith(
      'sess_target_executor',
      undefined,
      expect.objectContaining({ agentType: 'Executor' })
    );
  });

  it('should return error when active run lane cannot be acquired', async () => {
    const mockSession = {
      session_id: 'sess_blocked_001',
      agent_type: 'Executor',
      started_at: '2026-03-24T08:00:00.000Z',
      context: { run_id: 'run_blocked' },
    };
    const planState = buildMockPlanState([mockSession]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);
    vi.mocked(staleRunRecovery.acquireActiveRun).mockResolvedValue({
      acquired: false,
      active_run: {
        run_id: 'run_other',
        workspace_id: mockWorkspaceId,
        plan_id: mockPlanId,
        status: 'active',
        started_at: '2026-03-24T07:00:00.000Z',
        last_updated_at: '2026-03-24T09:50:00.000Z',
        owner_agent: 'Architect',
      },
      reason: 'already_active',
    });

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_blocked_001',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('already has an active subagent lane');
    expect(result.error).toContain('Architect');
  });

  it('should return error for session with failed status', async () => {
    const mockSession = {
      session_id: 'sess_failed_001',
      agent_type: 'Executor',
      started_at: '2026-03-24T08:00:00.000Z',
      status: 'failed',
      context: {},
    };
    const planState = buildMockPlanState([mockSession]);
    vi.spyOn(fileStore, 'getPlanState').mockResolvedValue(planState as any);

    const result = await memoryAgent({
      action: 'recover' as any,
      session_id: 'sess_failed_001',
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId,
      agent_type: 'Executor',
    } as MemoryAgentParams);

    expect(result.success).toBe(false);
    expect(result.error).toContain('terminal state');
  });
});
