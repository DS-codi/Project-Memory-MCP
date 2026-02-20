/**
 * Integration tests for program action routing through memory_plan handler.
 *
 * Verifies that memoryPlan correctly routes program-related actions
 * to the program tools module, validates required parameters, and
 * returns properly structured responses.
 *
 * Uses vi.mock to isolate from real storage — these are action-routing
 * tests, not end-to-end tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mocks — must be declared before importing the module under test
// ---------------------------------------------------------------------------

// Mock workspace validation to always succeed
vi.mock('../../tools/consolidated/workspace-validation.js', () => ({
  validateAndResolveWorkspaceId: vi.fn().mockResolvedValue({
    success: true,
    workspace_id: 'ws-test-integration',
  }),
}));

// Mock preflight validation
vi.mock('../../tools/preflight/index.js', () => ({
  preflightValidate: vi.fn().mockReturnValue({ valid: true }),
}));

// Mock file-store (getWorkspacePlans, savePlanState, etc.)
vi.mock('../../storage/file-store.js', () => ({
  getWorkspacePlans: vi.fn().mockResolvedValue([]),
  savePlanState: vi.fn().mockResolvedValue(undefined),
  parseCommandTokens: vi.fn((cmd: string) => cmd.split(' ')),
}));

// Mock plan tools (for non-program actions that share the handler)
vi.mock('../../tools/plan/index.js', () => ({
  createPlan: vi.fn().mockResolvedValue({ success: true, data: {} }),
  getPlanState: vi.fn().mockResolvedValue({ success: true, data: {} }),
  listPlans: vi.fn().mockResolvedValue({ success: true, data: [] }),
}));

// Mock program tools — the focus of these tests
vi.mock('../../tools/program/index.js', () => ({
  // Lifecycle
  createProgram: vi.fn().mockResolvedValue({
    success: true,
    data: {
      id: 'prog_test_abc',
      workspace_id: 'ws-test-integration',
      title: 'Test Program',
      description: 'Desc',
      priority: 'medium',
      category: 'feature',
      status: 'active',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    },
  }),
  // Manifest
  addPlanToProgram: vi.fn().mockResolvedValue({
    success: true,
    data: { program_id: 'prog_test_abc', plan_ids: ['plan_1'], updated_at: '2026-01-01T00:00:00.000Z' },
  }),
  upgradeToProgram: vi.fn().mockResolvedValue({
    success: true,
    data: {
      program: { id: 'prog_test_abc', workspace_id: 'ws-test-integration', title: 'Upgraded', description: 'D', priority: 'medium', category: 'feature', status: 'active', created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' },
      manifest: { program_id: 'prog_test_abc', plan_ids: ['plan_orig'], updated_at: '2026-01-01T00:00:00.000Z' },
    },
  }),
  listProgramPlans: vi.fn().mockResolvedValue({
    success: true,
    data: [{ plan_id: 'plan_1', title: 'Plan 1', status: 'active', steps_total: 5, steps_done: 2 }],
  }),
  // Risks
  addRisk: vi.fn().mockResolvedValue({
    id: 'risk_001',
    program_id: 'prog_test_abc',
    type: 'dependency_risk',
    severity: 'medium',
    status: 'identified',
    title: 'Test Risk',
    description: '',
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
  }),
  listRisks: vi.fn().mockResolvedValue([
    { id: 'risk_001', program_id: 'prog_test_abc', type: 'dependency_risk', severity: 'medium', status: 'identified', title: 'Risk A', description: '', created_at: '', updated_at: '' },
  ]),
  autoDetectRisks: vi.fn().mockResolvedValue({
    program_id: 'prog_test_abc',
    risks_detected: 2,
    risks_added: 1,
    risks_duplicate: 1,
    risks: [],
  }),
  // Dependencies
  setDependency: vi.fn().mockResolvedValue({
    dependency: { id: 'dep_001', source_plan_id: 'plan_a', target_plan_id: 'plan_b', type: 'blocks', status: 'pending', created_at: '' },
    created: true,
  }),
  getDependencies: vi.fn().mockResolvedValue([
    { id: 'dep_001', source_plan_id: 'plan_a', target_plan_id: 'plan_b', type: 'blocks', status: 'pending', created_at: '' },
  ]),
  // Migration
  migratePrograms: vi.fn().mockResolvedValue({
    workspace_id: 'ws-test-integration',
    plans_scanned: 5,
    programs_found: 1,
    programs_migrated: 1,
    programs_skipped: 0,
    entries: [],
  }),
}));

import { memoryPlan } from '../../tools/consolidated/memory_plan.js';
import * as programTools from '../../tools/program/index.js';

const WS = 'ws-test-integration';

beforeEach(() => {
  vi.clearAllMocks();
});

// =============================================================================
// Input validation tests — missing required params should return errors
// =============================================================================

describe('action routing — input validation', () => {
  it('create_program requires workspace_id, title, description', async () => {
    const result = await memoryPlan({ action: 'create_program' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_id');
    expect(result.error).toContain('title');
    expect(result.error).toContain('description');
  });

  it('add_plan_to_program requires workspace_id, program_id, plan_id', async () => {
    const result = await memoryPlan({ action: 'add_plan_to_program', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('program_id');
    expect(result.error).toContain('plan_id');
  });

  it('upgrade_to_program requires workspace_id, plan_id', async () => {
    const result = await memoryPlan({ action: 'upgrade_to_program', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('list_program_plans requires workspace_id, program_id', async () => {
    const result = await memoryPlan({ action: 'list_program_plans', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('program_id');
  });

  it('add_risk requires workspace_id, program_id, risk_title', async () => {
    const result = await memoryPlan({ action: 'add_risk', workspace_id: WS, program_id: 'prog_x' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('risk_title');
  });

  it('list_risks requires workspace_id, program_id', async () => {
    const result = await memoryPlan({ action: 'list_risks', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('program_id');
  });

  it('auto_detect_risks requires workspace_id, program_id', async () => {
    const result = await memoryPlan({ action: 'auto_detect_risks', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('program_id');
  });

  it('set_dependency requires workspace_id, program_id, source_plan_id, target_plan_id_dep', async () => {
    const result = await memoryPlan({
      action: 'set_dependency',
      workspace_id: WS,
      program_id: 'prog_x',
      source_plan_id: 'plan_a',
      // target_plan_id_dep missing
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('target_plan_id_dep');
  });

  it('get_dependencies requires workspace_id, program_id', async () => {
    const result = await memoryPlan({ action: 'get_dependencies', workspace_id: WS });
    expect(result.success).toBe(false);
    expect(result.error).toContain('program_id');
  });

  it('migrate_programs requires workspace_id', async () => {
    const result = await memoryPlan({ action: 'migrate_programs' });
    expect(result.success).toBe(false);
    expect(result.error).toContain('workspace_id');
  });
});

// =============================================================================
// Routing tests — valid params call the correct program tool function
// =============================================================================

describe('action routing — create_program', () => {
  it('routes to programTools.createProgram with correct params', async () => {
    const result = await memoryPlan({
      action: 'create_program',
      workspace_id: WS,
      title: 'My Program',
      description: 'Program description',
      priority: 'high',
      category: 'feature',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'create_program',
      data: expect.objectContaining({ id: 'prog_test_abc', title: 'Test Program' }),
    });
    expect(programTools.createProgram).toHaveBeenCalledWith({
      workspace_id: WS,
      title: 'My Program',
      description: 'Program description',
      priority: 'high',
      category: 'feature',
    });
  });
});

describe('action routing — add_plan_to_program', () => {
  it('routes to programTools.addPlanToProgram', async () => {
    const result = await memoryPlan({
      action: 'add_plan_to_program',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      plan_id: 'plan_1',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'add_plan_to_program',
      data: expect.objectContaining({ program_id: 'prog_test_abc' }),
    });
    expect(programTools.addPlanToProgram).toHaveBeenCalledWith(WS, 'prog_test_abc', 'plan_1');
  });
});

describe('action routing — upgrade_to_program', () => {
  it('routes to programTools.upgradeToProgram', async () => {
    const result = await memoryPlan({
      action: 'upgrade_to_program',
      workspace_id: WS,
      plan_id: 'plan_orig',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'upgrade_to_program',
      data: expect.objectContaining({
        program: expect.objectContaining({ id: 'prog_test_abc' }),
        manifest: expect.objectContaining({ plan_ids: ['plan_orig'] }),
      }),
    });
    expect(programTools.upgradeToProgram).toHaveBeenCalledWith(WS, 'plan_orig');
  });
});

describe('action routing — list_program_plans', () => {
  it('routes to programTools.listProgramPlans', async () => {
    const result = await memoryPlan({
      action: 'list_program_plans',
      workspace_id: WS,
      program_id: 'prog_test_abc',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'list_program_plans',
      data: expect.arrayContaining([
        expect.objectContaining({ plan_id: 'plan_1' }),
      ]),
    });
    expect(programTools.listProgramPlans).toHaveBeenCalledWith(WS, 'prog_test_abc');
  });
});

describe('action routing — add_risk', () => {
  it('routes to programTools.addRisk with mapped params', async () => {
    const result = await memoryPlan({
      action: 'add_risk',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      risk_title: 'Test Risk',
      risk_type: 'functional_conflict',
      risk_severity: 'high',
      risk_description: 'Something risky',
      risk_mitigation: 'Fix it',
      risk_detected_by: 'manual',
      risk_source_plan_id: 'plan_src',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'add_risk',
      data: expect.objectContaining({ id: 'risk_001', title: 'Test Risk' }),
    });
    expect(programTools.addRisk).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      expect.objectContaining({
        program_id: 'prog_test_abc',
        type: 'functional_conflict',
        severity: 'high',
        title: 'Test Risk',
        description: 'Something risky',
        mitigation: 'Fix it',
        detected_by: 'manual',
        source_plan_id: 'plan_src',
      }),
    );
  });

  it('applies default risk_type and risk_severity when not provided', async () => {
    await memoryPlan({
      action: 'add_risk',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      risk_title: 'Minimal Risk',
    });

    expect(programTools.addRisk).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      expect.objectContaining({
        type: 'dependency_risk',
        severity: 'medium',
        status: 'identified',
        detected_by: 'manual',
      }),
    );
  });
});

describe('action routing — list_risks', () => {
  it('routes to programTools.listRisks with optional filters', async () => {
    const result = await memoryPlan({
      action: 'list_risks',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      risk_severity: 'high',
      risk_status: 'mitigated',
      risk_type: 'behavioral_change',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'list_risks',
      data: expect.any(Array),
    });
    expect(programTools.listRisks).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      { severity: 'high', status: 'mitigated', type: 'behavioral_change' },
    );
  });

  it('passes undefined filters when none provided', async () => {
    await memoryPlan({
      action: 'list_risks',
      workspace_id: WS,
      program_id: 'prog_test_abc',
    });

    expect(programTools.listRisks).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      { severity: undefined, status: undefined, type: undefined },
    );
  });
});

describe('action routing — auto_detect_risks', () => {
  it('routes to programTools.autoDetectRisks', async () => {
    const result = await memoryPlan({
      action: 'auto_detect_risks',
      workspace_id: WS,
      program_id: 'prog_test_abc',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'auto_detect_risks',
      data: expect.objectContaining({ program_id: 'prog_test_abc', risks_detected: 2 }),
    });
    expect(programTools.autoDetectRisks).toHaveBeenCalledWith(WS, 'prog_test_abc');
  });
});

describe('action routing — set_dependency', () => {
  it('routes to programTools.setDependency with mapped params', async () => {
    const result = await memoryPlan({
      action: 'set_dependency',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      source_plan_id: 'plan_a',
      target_plan_id_dep: 'plan_b',
      source_phase: 'Phase 1',
      target_phase: 'Phase 2',
      dependency_type: 'informs',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'set_dependency',
      data: expect.objectContaining({ created: true }),
    });
    expect(programTools.setDependency).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      {
        source_plan_id: 'plan_a',
        source_phase: 'Phase 1',
        target_plan_id: 'plan_b',
        target_phase: 'Phase 2',
        type: 'informs',
      },
    );
  });

  it('defaults dependency_type to blocks when not provided', async () => {
    await memoryPlan({
      action: 'set_dependency',
      workspace_id: WS,
      program_id: 'prog_test_abc',
      source_plan_id: 'plan_a',
      target_plan_id_dep: 'plan_b',
    });

    expect(programTools.setDependency).toHaveBeenCalledWith(
      WS,
      'prog_test_abc',
      expect.objectContaining({ type: 'blocks' }),
    );
  });
});

describe('action routing — get_dependencies', () => {
  it('routes to programTools.getDependencies', async () => {
    const result = await memoryPlan({
      action: 'get_dependencies',
      workspace_id: WS,
      program_id: 'prog_test_abc',
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'get_dependencies',
      data: expect.arrayContaining([
        expect.objectContaining({ id: 'dep_001', type: 'blocks' }),
      ]),
    });
    expect(programTools.getDependencies).toHaveBeenCalledWith(WS, 'prog_test_abc');
  });
});

describe('action routing — migrate_programs', () => {
  it('routes to programTools.migratePrograms', async () => {
    const result = await memoryPlan({
      action: 'migrate_programs',
      workspace_id: WS,
    });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({
      action: 'migrate_programs',
      data: expect.objectContaining({
        workspace_id: WS,
        programs_migrated: 1,
      }),
    });
    expect(programTools.migratePrograms).toHaveBeenCalledWith(WS);
  });
});

// =============================================================================
// Error propagation tests
// =============================================================================

describe('action routing — error handling', () => {
  it('create_program propagates tool error', async () => {
    vi.mocked(programTools.createProgram).mockResolvedValueOnce({
      success: false,
      error: 'Workspace not found',
    });

    const result = await memoryPlan({
      action: 'create_program',
      workspace_id: WS,
      title: 'T',
      description: 'D',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Workspace not found');
  });

  it('add_plan_to_program propagates tool error', async () => {
    vi.mocked(programTools.addPlanToProgram).mockResolvedValueOnce({
      success: false,
      error: 'Program not found',
    });

    const result = await memoryPlan({
      action: 'add_plan_to_program',
      workspace_id: WS,
      program_id: 'prog_missing',
      plan_id: 'plan_1',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Program not found');
  });

  it('add_risk propagates thrown error', async () => {
    vi.mocked(programTools.addRisk).mockRejectedValueOnce(new Error('Disk full'));

    const result = await memoryPlan({
      action: 'add_risk',
      workspace_id: WS,
      program_id: 'prog_x',
      risk_title: 'R',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Disk full');
  });

  it('set_dependency propagates thrown error', async () => {
    vi.mocked(programTools.setDependency).mockRejectedValueOnce(new Error('Cycle detected'));

    const result = await memoryPlan({
      action: 'set_dependency',
      workspace_id: WS,
      program_id: 'prog_x',
      source_plan_id: 'plan_a',
      target_plan_id_dep: 'plan_b',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Cycle detected');
  });

  it('get_dependencies propagates thrown error', async () => {
    vi.mocked(programTools.getDependencies).mockRejectedValueOnce(new Error('Read error'));

    const result = await memoryPlan({
      action: 'get_dependencies',
      workspace_id: WS,
      program_id: 'prog_x',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Read error');
  });

  it('auto_detect_risks propagates thrown error', async () => {
    vi.mocked(programTools.autoDetectRisks).mockRejectedValueOnce(new Error('Scan failed'));

    const result = await memoryPlan({
      action: 'auto_detect_risks',
      workspace_id: WS,
      program_id: 'prog_x',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Scan failed');
  });

  it('migrate_programs propagates thrown error', async () => {
    vi.mocked(programTools.migratePrograms).mockRejectedValueOnce(new Error('Migration failure'));

    const result = await memoryPlan({
      action: 'migrate_programs',
      workspace_id: WS,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Migration failure');
  });

  it('upgrade_to_program propagates tool error', async () => {
    vi.mocked(programTools.upgradeToProgram).mockResolvedValueOnce({
      success: false,
      error: 'Plan not found',
    });

    const result = await memoryPlan({
      action: 'upgrade_to_program',
      workspace_id: WS,
      plan_id: 'plan_missing',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Plan not found');
  });

  it('list_program_plans propagates tool error', async () => {
    vi.mocked(programTools.listProgramPlans).mockResolvedValueOnce({
      success: false,
      error: 'Program does not exist',
    });

    const result = await memoryPlan({
      action: 'list_program_plans',
      workspace_id: WS,
      program_id: 'prog_gone',
    });

    expect(result.success).toBe(false);
    expect(result.error).toBe('Program does not exist');
  });
});
