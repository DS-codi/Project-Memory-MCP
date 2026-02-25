import { describe, it, expect, beforeEach, vi } from 'vitest';
import { validateReviewer } from '../../tools/agent-validation.tools.js';
import * as store from '../../storage/db-store.js';
import type { PlanState } from '../../types/index.js';

vi.mock('../../storage/db-store.js');

const mockWorkspaceId = 'ws_reviewer_123';
const mockPlanId = 'plan_reviewer_456';

const basePlanState: PlanState = {
  id: mockPlanId,
  workspace_id: mockWorkspaceId,
  title: 'Build Plan',
  description: 'Plan requiring build scripts',
  priority: 'medium',
  status: 'active',
  category: 'feature',
  current_phase: 'build',
  current_agent: 'Reviewer',
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

describe('Agent validation: Reviewer build-script enforcement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('warns Reviewer when build steps exist and no scripts are registered', async () => {
    vi.spyOn(store, 'getPlanState').mockResolvedValue(basePlanState);
    vi.spyOn(store, 'getBuildScripts').mockResolvedValue([]);

    const result = await validateReviewer({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId
    });

    expect(result.success).toBe(true);
    expect(result.data?.warnings).toBeDefined();
    const warnings = result.data?.warnings ?? [];
    const buildWarning = warnings.find((w: string) => w.includes('build scripts'));
    expect(buildWarning).toBeDefined();
  });

  it('allows Reviewer when build scripts are registered', async () => {
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

    const result = await validateReviewer({
      workspace_id: mockWorkspaceId,
      plan_id: mockPlanId
    });

    expect(result.success).toBe(true);
    expect(result.data?.action).toBe('continue');
  });
});
