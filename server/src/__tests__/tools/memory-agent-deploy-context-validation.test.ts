import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/consolidated/workspace-validation.js', () => ({
  validateAndResolveWorkspaceId: vi.fn(),
}));

vi.mock('../../storage/db-store.js', () => ({
  getWorkspace: vi.fn(),
  getPlanState: vi.fn(),
  getAgentDeployDir: vi.fn(),
  getContextBundlePath: vi.fn(),
  getInitContextPath: vi.fn(),
  getManifestPath: vi.fn(),
}));

vi.mock('../../tools/orchestration/hub-alias-routing.js', () => ({
  resolveHubAliasRouting: vi.fn(),
}));

vi.mock('../../tools/orchestration/hub-policy-enforcement.js', () => ({
  hasHubPolicyContext: vi.fn(),
  validateHubPolicy: vi.fn(),
}));

vi.mock('../../tools/orchestration/hub-rollout-controls.js', () => ({
  resolveHubRolloutDecision: vi.fn(),
  restoreLegacyStaticAgentsFromBackup: vi.fn(),
}));

vi.mock('../../tools/agent-materialise.js', () => ({
  materialiseAgent: vi.fn(),
}));

vi.mock('../../db/workspace-session-registry-db.js', () => ({
  completeRegistrySession: vi.fn(),
  getRegistryRow: vi.fn(),
  getActivePeerSessions: vi.fn(),
}));

vi.mock('../../events/event-emitter.js', () => ({
  events: {
    hubRoutingDecision: vi.fn().mockResolvedValue(undefined),
    hubPolicyBlocked: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock('../../db/agent-definition-db.js', () => ({
  getRequiredContextKeys: vi.fn(),
}));

vi.mock('../../tools/preflight/index.js', () => ({
  preflightValidate: vi.fn(() => ({ valid: true })),
}));

vi.mock('../../tools/session-stats.js', () => ({
  incrementStat: vi.fn(),
}));

vi.mock('../../tools/session-live-store.js', () => ({
  registerLiveSession: vi.fn(),
  clearLiveSession: vi.fn(),
  serverSessionIdForPrepId: vi.fn(),
}));

import { memoryAgent } from '../../tools/consolidated/memory_agent.js';
import { validateAndResolveWorkspaceId } from '../../tools/consolidated/workspace-validation.js';
import { getWorkspace } from '../../storage/db-store.js';
import { resolveHubAliasRouting } from '../../tools/orchestration/hub-alias-routing.js';
import { hasHubPolicyContext } from '../../tools/orchestration/hub-policy-enforcement.js';
import { resolveHubRolloutDecision } from '../../tools/orchestration/hub-rollout-controls.js';
import { materialiseAgent } from '../../tools/agent-materialise.js';
import { getRegistryRow, getActivePeerSessions } from '../../db/workspace-session-registry-db.js';
import { getRequiredContextKeys } from '../../db/agent-definition-db.js';

const mockValidateWorkspace = vi.mocked(validateAndResolveWorkspaceId);
const mockGetWorkspace = vi.mocked(getWorkspace);
const mockResolveAlias = vi.mocked(resolveHubAliasRouting);
const mockHasHubPolicyContext = vi.mocked(hasHubPolicyContext);
const mockResolveRollout = vi.mocked(resolveHubRolloutDecision);
const mockMaterialiseAgent = vi.mocked(materialiseAgent);
const mockGetRegistryRow = vi.mocked(getRegistryRow);
const mockGetActivePeerSessions = vi.mocked(getActivePeerSessions);
const mockGetRequiredContextKeys = vi.mocked(getRequiredContextKeys);

describe('memory_agent deploy required-context validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockValidateWorkspace.mockResolvedValue({
      success: true,
      workspace_id: 'ws1',
    } as any);

    mockGetWorkspace.mockResolvedValue({
      id: 'ws1',
      workspace_path: '/tmp/ws1',
    } as any);

    mockResolveAlias.mockReturnValue({
      requested_hub_label: 'Hub',
      resolved_mode: 'standard_orchestration',
      alias_resolution_applied: false,
      deprecation_phase: 'active',
    } as any);

    mockHasHubPolicyContext.mockReturnValue(false);

    mockResolveRollout.mockReturnValue({
      routing: 'dynamic_session_scoped',
      reason_code: 'dynamic_enabled',
      feature_flag_enabled: true,
      canary_percent: 100,
      canary_bucket: 12,
      deprecation_window_active: false,
      backup_directory: '/tmp/backup',
    } as any);

    mockGetRegistryRow.mockReturnValue(null as any);
    mockGetActivePeerSessions.mockReturnValue([]);
  });

  it('blocks deploy when required context keys are unresolved', async () => {
    mockGetRequiredContextKeys.mockReturnValue(['task_id', 'analysis.summary']);

    const result = await memoryAgent({
      action: 'deploy_agent_to_workspace',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
      session_id: 'sess1',
      context_payload: { task_id: 'T-123' },
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('CONTEXT_KEYS_UNRESOLVED');
    expect(result.error).toContain('analysis.summary');
    expect(mockMaterialiseAgent).not.toHaveBeenCalled();
  });

  it('merges prompt analyst payload before required-key validation', async () => {
    mockGetRequiredContextKeys.mockReturnValue(['task_id', 'analysis.summary']);
    mockMaterialiseAgent.mockResolvedValue({
      filePath: '/tmp/ws1/.github/agents/sessions/sess1/executor.agent.md',
      sessionId: 'sess1',
      peerSessionsCount: 0,
      injectedSections: {
        tool_surface_restrictions: { included: false, source: null },
        step_context: { included: false, source: null },
        peer_sessions: { included: true, source: 'workspace_session_registry' },
        hub_customisation_zone: { included: true, source: 'deploy_template' },
      },
      warnings: [],
    });

    const result = await memoryAgent({
      action: 'deploy_agent_to_workspace',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
      session_id: 'sess1',
      context_payload: { task_id: 'T-123' },
      prompt_analyst_payload: {
        analysis: {
          summary: 'Context present',
        },
      },
    });

    expect(result.success).toBe(true);
    expect(mockMaterialiseAgent).toHaveBeenCalledTimes(1);
    const call = mockMaterialiseAgent.mock.calls[0]?.[0] as any;
    expect(call.contextPayload).toEqual({
      task_id: 'T-123',
      analysis: {
        summary: 'Context present',
      },
    });
  });
});
