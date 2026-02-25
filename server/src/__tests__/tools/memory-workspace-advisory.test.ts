import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import * as workspaceTools from '../../tools/workspace.tools.js';
import * as store from '../../storage/db-store.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';

/**
 * memory_workspace Advisory Injection Tests
 *
 * Verifies that the 'info' and 'list' actions of memory_workspace correctly
 * inject `migration_advisories` when legacy program plans are detected, and
 * that the key is completely absent (not an empty array) for clean workspaces.
 */

vi.mock('../../tools/workspace.tools.js');
vi.mock('../../storage/db-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');
vi.mock('../../storage/workspace-hierarchy.js');

const mockWorkspaceId = 'ws_advisory_test_123';

// ===========================================================================
// Fixtures
// ===========================================================================

function makePlanState(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'plan_ordinary',
    workspace_id: mockWorkspaceId,
    title: 'Ordinary Plan',
    description: 'desc',
    category: 'feature',
    priority: 'medium',
    status: 'active',
    current_phase: 'Phase 1',
    current_agent: null,
    created_at: '2026-02-01T00:00:00Z',
    updated_at: '2026-02-01T00:00:00Z',
    steps: [],
    agent_sessions: [],
    lineage: [],
    notes: [],
    schema_version: '2.0', // clean by default
    ...overrides,
  };
}

function makeWorkspaceMeta(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspace_id: mockWorkspaceId,
    name: 'Advisory Test Workspace',
    path: '/test/advisory',
    workspace_path: '/test/advisory',
    created_at: '2026-02-01T00:00:00Z',
    active_plans: [],
    archived_plans: [],
    ...overrides,
  };
}

// ===========================================================================
// Tests: info action — migration_advisories injection
// ===========================================================================

describe("memory_workspace 'info' — migration_advisories injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: mockWorkspaceId,
    } as any);
  });

  it('includes migration_advisories with one entry when one legacy program plan is present', async () => {
    vi.spyOn(store, 'getWorkspace').mockResolvedValue(makeWorkspaceMeta() as any);
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [
        makePlanState({ id: 'plan_legacy_001', is_program: true, schema_version: '1.0' }) as any,
        makePlanState({ id: 'plan_normal_001' }) as any,
        makePlanState({ id: 'plan_normal_002' }) as any,
      ],
    });

    const result = await memoryWorkspace({ action: 'info', workspace_id: mockWorkspaceId });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      const advisories = (result.data.data as any).migration_advisories;
      expect(advisories).toBeDefined();
      expect(advisories).toHaveLength(1);
      expect(advisories[0].plan_id).toBe('plan_legacy_001');
      expect(typeof advisories[0].suggested_action).toBe('string');
      expect(advisories[0].suggested_action.length).toBeGreaterThan(0);
    }
  });

  it('includes the correct plan_id and severity in the advisory', async () => {
    vi.spyOn(store, 'getWorkspace').mockResolvedValue(makeWorkspaceMeta() as any);
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [
        makePlanState({ id: 'plan_legacy_xyz', is_program: true, schema_version: '1.0' }) as any,
      ],
    });

    const result = await memoryWorkspace({ action: 'info', workspace_id: mockWorkspaceId });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      const advisories = (result.data.data as any).migration_advisories;
      expect(advisories).toBeDefined();
      expect(advisories[0].plan_id).toBe('plan_legacy_xyz');
      expect(advisories[0].severity).toBe('critical');
    }
  });

  it('omits migration_advisories key entirely when all plans are clean (no empty array)', async () => {
    vi.spyOn(store, 'getWorkspace').mockResolvedValue(makeWorkspaceMeta() as any);
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [
        makePlanState({ id: 'plan_clean_a' }) as any,
        makePlanState({ id: 'plan_clean_b' }) as any,
      ],
    });

    const result = await memoryWorkspace({ action: 'info', workspace_id: mockWorkspaceId });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      expect(result.data.data).not.toHaveProperty('migration_advisories');
    }
  });

  it('includes multiple advisories when multiple legacy plans are detected', async () => {
    vi.spyOn(store, 'getWorkspace').mockResolvedValue(makeWorkspaceMeta() as any);
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [
        makePlanState({ id: 'plan_leg_1', is_program: true, schema_version: '1.0' }) as any,
        makePlanState({ id: 'plan_leg_2', is_program: true, schema_version: '1.0' }) as any,
        makePlanState({ id: 'plan_clean' }) as any,
      ],
    });

    const result = await memoryWorkspace({ action: 'info', workspace_id: mockWorkspaceId });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      const advisories = (result.data.data as any).migration_advisories;
      expect(advisories).toBeDefined();
      expect(advisories).toHaveLength(2);
    }
  });
});

// ===========================================================================
// Tests: list action — migration_advisories injection
// ===========================================================================

describe("memory_workspace 'list' — migration_advisories injection", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('includes top-level migration_advisories when a workspace contains a legacy program plan', async () => {
    vi.spyOn(workspaceTools, 'listWorkspaces').mockResolvedValue({
      success: true,
      data: [makeWorkspaceMeta({ workspace_id: 'ws_list_1' }) as any],
    });
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [
        makePlanState({
          id: 'plan_legacy_list',
          is_program: true,
          schema_version: '1.0',
          workspace_id: 'ws_list_1',
        }) as any,
      ],
    });

    const result = await memoryWorkspace({ action: 'list' });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'list') {
      const advisories = (result.data as any).migration_advisories;
      expect(advisories).toBeDefined();
      expect(advisories.length).toBeGreaterThan(0);
      expect(advisories[0].plan_id).toBe('plan_legacy_list');
    }
  });

  it('omits top-level migration_advisories key entirely when all plans are clean (no empty array)', async () => {
    vi.spyOn(workspaceTools, 'listWorkspaces').mockResolvedValue({
      success: true,
      data: [makeWorkspaceMeta() as any],
    });
    vi.spyOn(workspaceTools, 'getWorkspacePlans').mockResolvedValue({
      success: true,
      data: [makePlanState() as any],
    });

    const result = await memoryWorkspace({ action: 'list' });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'list') {
      expect(result.data).not.toHaveProperty('migration_advisories');
    }
  });

  it('aggregates advisories across multiple workspaces', async () => {
    vi.spyOn(workspaceTools, 'listWorkspaces').mockResolvedValue({
      success: true,
      data: [
        makeWorkspaceMeta({ workspace_id: 'ws_a' }) as any,
        makeWorkspaceMeta({ workspace_id: 'ws_b' }) as any,
      ],
    });
    // getWorkspacePlans is called once per workspace — alternate between legacy and clean
    vi.spyOn(workspaceTools, 'getWorkspacePlans')
      .mockResolvedValueOnce({
        success: true,
        data: [makePlanState({ id: 'plan_ws_a_legacy', is_program: true, schema_version: '1.0' }) as any],
      })
      .mockResolvedValueOnce({
        success: true,
        data: [makePlanState({ id: 'plan_ws_b_clean' }) as any],
      });

    const result = await memoryWorkspace({ action: 'list' });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'list') {
      const advisories = (result.data as any).migration_advisories;
      expect(advisories).toBeDefined();
      expect(advisories).toHaveLength(1);
      expect(advisories[0].plan_id).toBe('plan_ws_a_legacy');
    }
  });
});
