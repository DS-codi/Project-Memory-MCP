import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateBuilder } from '../../tools/agent-validation.tools.js';
import * as store from '../../storage/file-store.js';
import type { PlanState } from '../../types/index.js';

vi.mock('../../storage/file-store.js');

const mockWorkspaceId = 'ws_builder_123';
const mockPlanId = 'plan_builder_456';

const basePlanState: PlanState = {
  id: mockPlanId,
  workspace_id: mockWorkspaceId,
  title: 'Build Plan',
  description: 'Plan requiring build scripts',
  priority: 'medium',
  status: 'active',
  category: 'feature',
  current_phase: 'build',
  current_agent: 'Builder',
  created_at: '2026-02-01T00:00:00Z',
  updated_at: '2026-02-01T00:00:00Z',
  agent_sessions: [],
  lineage: [],
  steps: [
    {
      index: 0,
      phase: 'build',
      task: 'Run build scripts',
      status: 'pending',
      type: 'build'
    }
  ]
};

describe('Agent validation: Builder build-script enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('blocks Builder when build steps exist and no scripts are registered', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(basePlanState);
    vi.spyOn(store, 'getBuildScripts').mockResolvedValue([]);

    const result = await validateBuilder({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('requires build scripts');
  });

  it('allows Builder when build scripts are registered', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(basePlanState);
    vi.spyOn(store, 'getBuildScripts').mockResolvedValue([
      {
        id: 'script_1',
        name: 'Build Server',
        description: 'Build server',
        command: 'npm run build',
        directory: '/workspace/server',
        workspace_id: mockWorkspaceId,
        created_at: '2026-02-01T00:00:00Z'
      }
    ]);

    const result = await validateBuilder({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId
    });

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('continue');
  });
});
