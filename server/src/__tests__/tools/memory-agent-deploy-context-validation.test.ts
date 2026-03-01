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
  evaluateHubDispatchPolicy: vi.fn(),
}));

vi.mock('../../tools/agent-deploy.js', () => ({
  deployForTask: vi.fn(),
  cleanupAgent: vi.fn(),
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
    promptAnalystEnrichment: vi.fn().mockResolvedValue(undefined),
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
import { evaluateHubDispatchPolicy } from '../../tools/orchestration/hub-policy-enforcement.js';
import { resolveHubRolloutDecision } from '../../tools/orchestration/hub-rollout-controls.js';
import { materialiseAgent } from '../../tools/agent-materialise.js';
import { getRegistryRow, getActivePeerSessions } from '../../db/workspace-session-registry-db.js';
import { getRequiredContextKeys } from '../../db/agent-definition-db.js';
import { deployForTask } from '../../tools/agent-deploy.js';

const mockValidateWorkspace = vi.mocked(validateAndResolveWorkspaceId);
const mockGetWorkspace = vi.mocked(getWorkspace);
const mockResolveAlias = vi.mocked(resolveHubAliasRouting);
const mockEvaluateHubDispatchPolicy = vi.mocked(evaluateHubDispatchPolicy);
const mockResolveRollout = vi.mocked(resolveHubRolloutDecision);
const mockMaterialiseAgent = vi.mocked(materialiseAgent);
const mockGetRegistryRow = vi.mocked(getRegistryRow);
const mockGetActivePeerSessions = vi.mocked(getActivePeerSessions);
const mockGetRequiredContextKeys = vi.mocked(getRequiredContextKeys);
const mockDeployForTask = vi.mocked(deployForTask);

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

    mockEvaluateHubDispatchPolicy.mockReturnValue({
      alias_routing: {
        requested_hub_label: 'Hub',
        resolved_mode: 'standard_orchestration',
        alias_resolution_applied: false,
        deprecation_phase: 'active',
      },
      normalized_input: {
        target_agent_type: 'Executor',
        current_hub_mode: 'standard_orchestration',
        requested_hub_mode: 'standard_orchestration',
        requested_hub_label: 'Hub',
        prompt_analyst_enrichment_applied: true,
      },
      fallback: {
        requested: false,
        used: false,
      },
      policy: {
        valid: true,
        details: {
          target_agent_type: 'Executor',
          current_hub_mode: 'standard_orchestration',
          requested_hub_mode: 'standard_orchestration',
          requested_hub_label: 'Hub',
          prompt_analyst_enrichment_applied: true,
        },
      },
      telemetry: {
        prompt_analyst_outcome: 'rerun',
      },
    } as any);

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
    mockDeployForTask.mockResolvedValue({ deployed: ['Executor.agent.md'] } as any);
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

  it('blocks deploy_for_task when centralized policy check fails', async () => {
    mockEvaluateHubDispatchPolicy.mockReturnValueOnce({
      alias_routing: {
        requested_hub_label: 'Hub',
        resolved_mode: 'standard_orchestration',
        alias_resolution_applied: false,
        deprecation_phase: 'active',
      },
      normalized_input: {
        target_agent_type: 'Executor',
        current_hub_mode: 'standard_orchestration',
        requested_hub_mode: 'standard_orchestration',
        requested_hub_label: 'Hub',
        prompt_analyst_enrichment_applied: false,
      },
      fallback: {
        requested: false,
        used: false,
      },
      policy: {
        valid: false,
        code: 'POLICY_PROMPT_ANALYST_REQUIRED',
        reason: 'Prompt Analyst pre-dispatch enrichment is required before deploying non-Analyst agents.',
        details: {
          target_agent_type: 'Executor',
          current_hub_mode: 'standard_orchestration',
          requested_hub_mode: 'standard_orchestration',
          requested_hub_label: 'Hub',
          prompt_analyst_enrichment_applied: false,
        },
      },
      telemetry: {
        prompt_analyst_outcome: 'reuse',
      },
    } as any);

    const result = await memoryAgent({
      action: 'deploy_for_task',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('POLICY_PROMPT_ANALYST_REQUIRED');
    expect(mockDeployForTask).not.toHaveBeenCalled();
  });

  it('allows deploy_for_task with explicit PromptAnalyst unavailable fallback', async () => {
    mockEvaluateHubDispatchPolicy.mockReturnValueOnce({
      alias_routing: {
        requested_hub_label: 'Hub',
        resolved_mode: 'standard_orchestration',
        alias_resolution_applied: false,
        deprecation_phase: 'active',
      },
      normalized_input: {
        target_agent_type: 'Executor',
        current_hub_mode: 'standard_orchestration',
        requested_hub_mode: 'standard_orchestration',
        requested_hub_label: 'Hub',
        transition_reason_code: 'prompt_analyst_unavailable',
        prompt_analyst_enrichment_applied: false,
      },
      fallback: {
        requested: true,
        used: true,
        reason_code: 'prompt_analyst_unavailable',
      },
      policy: {
        valid: true,
        details: {
          target_agent_type: 'Executor',
          current_hub_mode: 'standard_orchestration',
          requested_hub_mode: 'standard_orchestration',
          requested_hub_label: 'Hub',
          transition_reason_code: 'prompt_analyst_unavailable',
          prompt_analyst_enrichment_applied: false,
        },
      },
      telemetry: {
        prompt_analyst_outcome: 'fallback',
      },
    } as any);

    const result = await memoryAgent({
      action: 'deploy_for_task',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
      bypass_prompt_analyst_policy: true,
      transition_reason_code: 'prompt_analyst_unavailable',
      prompt_analyst_output: {
        provisioning_contract_version: '1.0',
        hub_skill_bundle_id: 'hub-bundle',
      },
      hub_decision_payload: {
        bundle_decision_id: 'decision-1',
        spoke_instruction_bundle: {
          bundle_id: 'instr-bundle',
          instruction_ids: ['executor-phase4-build-guidance-20260217'],
          resolution_mode: 'strict',
        },
        spoke_skill_bundle: {
          bundle_id: 'skill-bundle',
          skill_ids: ['bugfix'],
          resolution_mode: 'strict',
        },
      },
      provisioning_mode: 'on_demand',
      allow_ambient_instruction_scan: false,
      allow_include_skills_all: false,
      allow_legacy_always_on: false,
      fallback_policy: {
        fallback_allowed: true,
        fallback_mode: 'compat_dynamic',
        fallback_reason_code: 'PROMPTANALYST_UNAVAILABLE',
      },
      telemetry_context: {
        trace_id: 'trace-1',
      },
      requested_scope: 'task',
      strict_bundle_resolution: true,
    });

    expect(result.success).toBe(true);
    expect(mockDeployForTask).toHaveBeenCalledTimes(1);
    expect(mockDeployForTask).toHaveBeenCalledWith(
      expect.objectContaining({
        prompt_analyst_output: expect.objectContaining({
          provisioning_contract_version: '1.0',
          hub_skill_bundle_id: 'hub-bundle',
        }),
        hub_decision_payload: expect.objectContaining({
          bundle_decision_id: 'decision-1',
        }),
        provisioning_mode: 'on_demand',
        allow_ambient_instruction_scan: false,
        allow_include_skills_all: false,
        allow_legacy_always_on: false,
        fallback_policy: expect.objectContaining({
          fallback_mode: 'compat_dynamic',
        }),
        telemetry_context: expect.objectContaining({
          trace_id: 'trace-1',
        }),
        requested_scope: 'task',
        strict_bundle_resolution: true,
      }),
    );
    expect(mockEvaluateHubDispatchPolicy).toHaveBeenCalledWith(expect.objectContaining({
      target_agent_type: 'Executor',
      prompt_analyst_output: expect.objectContaining({
        provisioning_contract_version: '1.0',
      }),
      hub_decision_payload: expect.objectContaining({
        bundle_decision_id: 'decision-1',
      }),
      provisioning_mode: 'on_demand',
      fallback_policy: expect.objectContaining({
        fallback_mode: 'compat_dynamic',
      }),
      requested_scope: 'task',
      strict_bundle_resolution: true,
    }));
  });

  it('blocks deploy_agent_to_workspace when centralized policy check fails', async () => {
    mockEvaluateHubDispatchPolicy.mockReturnValueOnce({
      alias_routing: {
        requested_hub_label: 'Hub',
        resolved_mode: 'standard_orchestration',
        alias_resolution_applied: false,
        deprecation_phase: 'active',
      },
      normalized_input: {
        target_agent_type: 'Executor',
        current_hub_mode: 'standard_orchestration',
        requested_hub_mode: 'standard_orchestration',
        requested_hub_label: 'Hub',
        prompt_analyst_enrichment_applied: false,
      },
      fallback: {
        requested: false,
        used: false,
      },
      policy: {
        valid: false,
        code: 'POLICY_PROMPT_ANALYST_REQUIRED',
        reason: 'Prompt Analyst pre-dispatch enrichment is required before deploying non-Analyst agents.',
        details: {
          target_agent_type: 'Executor',
          current_hub_mode: 'standard_orchestration',
          requested_hub_mode: 'standard_orchestration',
          requested_hub_label: 'Hub',
          prompt_analyst_enrichment_applied: false,
        },
      },
      telemetry: {
        prompt_analyst_outcome: 'reuse',
      },
    } as any);

    const result = await memoryAgent({
      action: 'deploy_agent_to_workspace',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
      session_id: 'sess1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('POLICY_PROMPT_ANALYST_REQUIRED');
    expect(mockMaterialiseAgent).not.toHaveBeenCalled();
  });

  it('passes explicit compat fallback controls through deploy_for_task', async () => {
    const result = await memoryAgent({
      action: 'deploy_for_task',
      workspace_id: 'ws1',
      plan_id: 'plan1',
      agent_type: 'Executor',
      prompt_analyst_enrichment_applied: true,
      provisioning_mode: 'compat',
      allow_legacy_always_on: true,
      allow_ambient_instruction_scan: true,
      allow_include_skills_all: true,
      fallback_policy: {
        fallback_allowed: true,
        fallback_mode: 'compat_dynamic',
      },
    });

    expect(result.success).toBe(true);
    expect(mockDeployForTask).toHaveBeenCalledWith(expect.objectContaining({
      provisioning_mode: 'compat',
      allow_legacy_always_on: true,
      allow_ambient_instruction_scan: true,
      allow_include_skills_all: true,
      fallback_policy: expect.objectContaining({
        fallback_allowed: true,
        fallback_mode: 'compat_dynamic',
      }),
    }));
  });
});
