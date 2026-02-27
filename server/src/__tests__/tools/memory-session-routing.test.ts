import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../tools/orchestration/supervisor-client.js', () => ({
  isSupervisorRunning: vi.fn(),
}));

vi.mock('../../storage/db-store.js', () => ({
  getWorkspace: vi.fn().mockResolvedValue(undefined),
  getPlanState: vi.fn().mockResolvedValue(undefined),
  getWorkspacePlans: vi.fn().mockResolvedValue([]),
}));

import { isSupervisorRunning } from '../../tools/orchestration/supervisor-client.js';
import { memorySession } from '../../tools/consolidated/memory_session.js';

const mockIsSupervisorRunning = vi.mocked(isSupervisorRunning);

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
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
  });

  it('does not use legacy fallback when supervisor is unavailable', async () => {
    mockIsSupervisorRunning.mockResolvedValue(false);

    const result = await memorySession({
      action: 'prep',
      workspace_id: 'ws_test',
      plan_id: 'plan_test',
      agent_name: 'Executor',
      prompt: 'hello',
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
    });

    expect(result.success).toBe(true);
    const payload = (result as any).data?.data;
    expect(payload?.launch_routing?.selected_mode).toBe('specialized_host');
    expect(payload?.launch_routing?.fallback_used).toBe(false);
    expect(payload?.launch_routing?.fallback_reason).toBe('none');
  });
});
