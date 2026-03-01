import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/orchestration/supervisor-client.js', () => ({
  isSupervisorRunning: vi.fn(),
}));

vi.mock('../../storage/db-store.js', () => ({
  getWorkspace: vi.fn().mockResolvedValue(undefined),
  getPlanState: vi.fn().mockResolvedValue(undefined),
  getWorkspacePlans: vi.fn().mockResolvedValue([]),
}));

vi.mock('../../tools/agent-deploy.js', () => ({
  deployForTask: vi.fn().mockResolvedValue({
    deployed: true,
    agent_dir: '/tmp/agent',
    manifest: {},
    context_bundle: {},
    warnings: [],
  }),
}));

vi.mock('../../events/event-emitter.js', () => ({
  events: {
    hubPolicyBlocked: vi.fn().mockResolvedValue(undefined),
    promptAnalystEnrichment: vi.fn().mockResolvedValue(undefined),
  },
}));

import { isSupervisorRunning } from '../../tools/orchestration/supervisor-client.js';
import { getWorkspace } from '../../storage/db-store.js';
import { deployForTask } from '../../tools/agent-deploy.js';
import { events } from '../../events/event-emitter.js';
import { memorySession } from '../../tools/consolidated/memory_session.js';

const mockIsSupervisorRunning = vi.mocked(isSupervisorRunning);
const mockGetWorkspace = vi.mocked(getWorkspace);
const mockDeployForTask = vi.mocked(deployForTask);
const mockEvents = vi.mocked(events);

describe('memory_session launch routing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.PM_SPECIALIZED_HOST_MODE_ENABLED;
    delete process.env.PM_SPECIALIZED_HOST_CONTROL_PARITY_OK;
    delete process.env.PM_SPECIALIZED_HOST_PROBE_HOST;
    delete process.env.PM_SPECIALIZED_HOST_PROBE_PORT;
  });

  it('uses specialized_host when supervisor is running', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
    expect(mockEvents.promptAnalystEnrichment).toHaveBeenCalledWith(
      'ws_test',
      'plan_test',
      expect.objectContaining({
        outcome_label: 'rerun',
      }),
    );
  });

  it('does not use legacy fallback when supervisor is unavailable', async () => {
    mockIsSupervisorRunning.mockResolvedValue(false);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
  });

  it('keeps specialized_host routing even when feature gate env is disabled', async () => {
    process.env.PM_SPECIALIZED_HOST_MODE_ENABLED = 'false';

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
    expect(mockIsSupervisorRunning).not.toHaveBeenCalled();
  });

  it('keeps specialized_host routing when control-plane parity env is not ready', async () => {
    process.env.PM_SPECIALIZED_HOST_CONTROL_PARITY_OK = 'false';
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
  });

  it('blocks prep when PromptAnalyst enrichment is missing and no explicit unavailable fallback is provided', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      transition_event: 'new_prompt',
      prompt_analyst_enrichment_applied: false,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toContain('POLICY_PROMPT_ANALYST_REQUIRED');
  });

  it('allows prep without fresh PromptAnalyst rerun for in-scope continuation', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'continue same in-scope work',
      prompt_analyst_enrichment_applied: false,
    });

    expect(result.success).toBe(true);
    expect(mockEvents.promptAnalystEnrichment).toHaveBeenCalledWith(
      'ws_test',
      'plan_test',
      expect.objectContaining({
        outcome_label: 'reuse',
      }),
    );
  });

  it('allows explicit PromptAnalyst unavailable fallback for deploy_and_prep', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      bypass_prompt_analyst_policy: true,
      transition_reason_code: 'prompt_analyst_unavailable',
      prompt_analyst_enrichment_applied: false,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toContain('Workspace not found: ws_test');
    expect(mockEvents.promptAnalystEnrichment).toHaveBeenCalledWith(
      'ws_test',
      'plan_test',
      expect.objectContaining({
        outcome_label: 'fallback',
      }),
    );
  });

  it('blocks bypass fallback when PromptAnalyst is not explicitly unavailable', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      bypass_prompt_analyst_policy: true,
      transition_reason_code: 'scope_change',
      prompt_analyst_enrichment_applied: false,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toContain('POLICY_PROMPT_ANALYST_FALLBACK_REQUIRES_UNAVAILABLE');
  });

  it('blocks deploy_and_prep when strict bundle resolution is requested without a hub decision payload', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
      strict_bundle_resolution: true,
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toContain('POLICY_BUNDLE_DECISION_REQUIRED');
  });

  it('does not allow legacy toggle to bypass strict bundle-decision requirements', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
      strict_bundle_resolution: true,
      allow_legacy_always_on: true,
      fallback_policy: {
        fallback_allowed: true,
        fallback_mode: 'compat_dynamic',
      },
    });

    expect(result.success).toBe(false);
    expect((result as any).error).toContain('POLICY_BUNDLE_DECISION_REQUIRED');
  });

  it('passes explicit bundle payload fields through deploy_and_prep to deployForTask', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);
    mockGetWorkspace.mockResolvedValueOnce({
      workspace_path: '/tmp/ws_test',
      path: '/tmp/ws_test',
    } as any);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
      prompt_analyst_enrichment_applied: true,
      prompt_analyst_output: {
        provisioning_contract_version: '1.0',
        hub_skill_bundle_id: 'hub-bundle',
      },
      hub_decision_payload: {
        bundle_decision_id: 'decision-1',
        bundle_decision_version: 'v1',
        spoke_instruction_bundle: {
          bundle_id: 'instr-bundle',
          instruction_ids: ['executor-phase4-build-guidance-20260217'],
          resolution_mode: 'strict',
        },
      },
      provisioning_mode: 'on_demand',
      allow_legacy_always_on: false,
      allow_ambient_instruction_scan: false,
      allow_include_skills_all: false,
      fallback_policy: {
        fallback_allowed: false,
        fallback_mode: 'none',
      },
      telemetry_context: {
        trace_id: 'trace-1',
      },
      requested_scope: 'task',
      strict_bundle_resolution: true,
    });

    expect(result.success).toBe(true);
    expect(mockDeployForTask).toHaveBeenCalledWith(expect.objectContaining({
      prompt_analyst_output: expect.objectContaining({
        provisioning_contract_version: '1.0',
      }),
      hub_decision_payload: expect.objectContaining({
        bundle_decision_id: 'decision-1',
      }),
      provisioning_mode: 'on_demand',
      allow_legacy_always_on: false,
      allow_ambient_instruction_scan: false,
      allow_include_skills_all: false,
      requested_scope: 'task',
      strict_bundle_resolution: true,
    }));
  });

  it('passes explicit compat fallback controls through deploy_and_prep', async () => {
    mockIsSupervisorRunning.mockResolvedValue(true);
    mockGetWorkspace.mockResolvedValueOnce({
      workspace_path: '/tmp/ws_test',
      path: '/tmp/ws_test',
    } as any);

    const result = await memorySession({
      action: 'deploy_and_prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
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
