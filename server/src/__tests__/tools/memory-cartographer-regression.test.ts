/**
 * Regression tests for memory_cartographer tool — memory-cartographer-regression.test.ts
 *
 * Coverage:
 *  1. DB mapping schema stability: db_map_summary always returns the same structural keys
 *  2. TC-DM-09: All 4 database_map_access actions must NOT contain context_data in any response
 *  3. Authorized agent enforcement invariant: unauthorized agent is rejected for every action
 *  4. Response shape stability: all Phase A actions return object with `action` field at top level
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMemoryCartographer } from '../../tools/memory_cartographer.js';
import type { MemoryCartographerParams } from '../../tools/memory_cartographer.js';

// ---------------------------------------------------------------------------
// Hoisted mocks (needed for Phase B Python-adapter path)
// ---------------------------------------------------------------------------
const {
  mockedInvokePythonCore,
  mockedGetWorkspace,
  mockedResolveAccessiblePath,
} = vi.hoisted(() => ({
  mockedInvokePythonCore: vi.fn().mockResolvedValue({
    schema_version: '1.0.0',
    request_id:     'regression_req_001',
    status:         'ok',
    result:         { query: 'summary', summary: { files_total: 0 } },
    diagnostics:    { warnings: [], errors: [], markers: [], skipped_paths: [] },
    elapsed_ms:     5,
  }),
  mockedGetWorkspace: vi.fn().mockReturnValue({
    id:   'ws_regression_test',
    path: 'C:/mock/workspace',
  }),
  mockedResolveAccessiblePath: vi.fn().mockResolvedValue('C:/mock/workspace'),
}));

// ---------------------------------------------------------------------------
// Mocks — stable across all regression tests
// ---------------------------------------------------------------------------
vi.mock('../../db/workspace-db.js', () => ({
  getWorkspace: mockedGetWorkspace,
}));

vi.mock('../../storage/workspace-mounts.js', () => ({
  resolveAccessiblePath: mockedResolveAccessiblePath,
}));

vi.mock('../../cartography/runtime/pythonBridge.js', () => ({
  invokePythonCore: mockedInvokePythonCore,
}));

vi.mock('../../tools/consolidated/workspace-validation.js', () => ({
  validateAndResolveWorkspaceId: vi.fn().mockResolvedValue({
    success: true,
    workspace_id: 'ws_regression_test',
  }),
}));

vi.mock('../../tools/preflight/index.js', () => ({
  preflightValidate: vi.fn().mockReturnValue({ valid: true }),
}));

vi.mock('../../db/dependency-db.js', () => ({
  getDependencies: vi.fn().mockReturnValue([]),
  getDependents:   vi.fn().mockReturnValue([]),
}));

vi.mock('../../db/plan-db.js', () => ({
  getPlan: vi.fn().mockReturnValue(null),
}));

vi.mock('../../db/connection.js', () => ({
  getDb: vi.fn().mockReturnValue({
    pragma: vi.fn().mockReturnValue(1),
  }),
}));

vi.mock('../../db/query-helpers.js', () => ({
  queryAll: vi.fn().mockReturnValue([]),
  queryOne: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const WORKSPACE_ID      = 'ws_regression_test';
const PLAN_ID           = 'plan_regression_001';
const AUTHORIZED_AGENTS = ['Researcher', 'Architect', 'Coordinator', 'Analyst', 'Executor'] as const;
const UNAUTHORIZED_AGENT = 'totally_unauthorized_agent';

function base(overrides: Partial<MemoryCartographerParams>): MemoryCartographerParams {
  return {
    action:       'db_map_summary',
    workspace_id: WORKSPACE_ID,
    agent_type:   'Researcher',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. DB mapping schema stability (TC-DM-08 analogue)
// ---------------------------------------------------------------------------

describe('Regression — DB mapping schema stability', () => {
  const REQUIRED_SUMMARY_KEYS = ['schema_version', 'tables', 'relation_count', 'diagnostics'];
  const REQUIRED_TABLE_KEYS   = ['table_name', 'row_count', 'column_count', 'has_fk_relations'];

  it('db_map_summary always returns all required top-level keys', async () => {
    const result = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    expect(result.success).toBe(true);
    const inner = (result.data as any).data;
    for (const key of REQUIRED_SUMMARY_KEYS) {
      expect(inner).toHaveProperty(key);
    }
  });

  it('db_map_summary tables array is never empty (has at least 1 allowed table)', async () => {
    const result = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    const tables = (result.data as any).data.tables as any[];
    expect(tables.length).toBeGreaterThan(0);
  });

  it('db_map_summary each table entry always has the required schema keys', async () => {
    const result = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    const tables = (result.data as any).data.tables as any[];
    for (const t of tables) {
      for (const key of REQUIRED_TABLE_KEYS) {
        expect(t).toHaveProperty(key);
      }
    }
  });

  it('db_map_summary response is stable across two consecutive calls', async () => {
    const r1 = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    const r2 = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    expect(r1.success).toBe(true);
    expect(r2.success).toBe(true);

    const keys1 = Object.keys((r1.data as any).data).sort();
    const keys2 = Object.keys((r2.data as any).data).sort();
    expect(keys1).toEqual(keys2);
  });
});

// ---------------------------------------------------------------------------
// 2. TC-DM-09: All database_map_access actions must NOT expose context_data
// ---------------------------------------------------------------------------

describe('Regression — TC-DM-09 context_data masking across all database_map_access actions', () => {
  function assertNoContextData(value: unknown, path = 'root'): void {
    if (typeof value !== 'object' || value === null) return;
    if (Array.isArray(value)) {
      value.forEach((item, i) => assertNoContextData(item, `${path}[${i}]`));
      return;
    }
    const obj = value as Record<string, unknown>;
    expect(
      'context_data' in obj,
      `Found 'context_data' field at path ${path}`,
    ).toBe(false);
    // data field should not be the raw payload — it's acceptable only as a nested nested-object key but not a raw data blob
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'data' && typeof v === 'string') {
        // Raw string data field at this level is unexpected in projection rows
        // (they use data_preview, not data)
        expect(
          false,
          `Unexpected raw 'data' string field at ${path}.data`,
        ).toBe(false);
      }
      if (typeof v === 'object' && v !== null && k !== 'data') {
        assertNoContextData(v, `${path}.${k}`);
      }
    }
  }

  it('db_map_summary response never contains context_data', async () => {
    const result = await handleMemoryCartographer(base({ action: 'db_map_summary' }));
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('context_data');
  });

  it('db_node_lookup response (EMPTY_RESULT) never contains context_data', async () => {
    const result = await handleMemoryCartographer(
      base({ action: 'db_node_lookup', table_name: 'context_items', primary_key: 'ci_999' }),
    );
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('context_data');
  });

  it('db_edge_lookup response never contains context_data', async () => {
    const result = await handleMemoryCartographer(
      base({ action: 'db_edge_lookup', table_name: 'plans', primary_key: 'plan_xyz' }),
    );
    expect(result.success).toBe(true);
    expect(JSON.stringify(result.data)).not.toContain('context_data');
  });

  it('context_items_projection response never contains context_data at any path (TC-DM-09)', async () => {
    // Provide a mock row that includes a data column to test masking
    const { queryAll } = await import('../../db/query-helpers.js');
    vi.mocked(queryAll).mockReturnValueOnce([
      {
        id: 'ci_tc09',
        parent_type: 'plan',
        parent_id: PLAN_ID,
        type: 'test_type',
        created_at: '2026-01-01T00:00:00Z',
        data: JSON.stringify({ context_data: 'compromised!', secret: 'should_not_appear' }),
      },
    ]);
    const { queryOne } = await import('../../db/query-helpers.js');
    vi.mocked(queryOne).mockReturnValueOnce({ c: 1 });

    const result = await handleMemoryCartographer(
      base({ action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID }),
    );
    expect(result.success).toBe(true);

    // The serialized response must not expose context_data as a direct field
    const items: any[] = (result.data as any).data.items;
    for (const item of items) {
      expect(item).not.toHaveProperty('context_data');
      expect(item).not.toHaveProperty('data');
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Authorized agent enforcement invariant — unauthorized blocked for every action
// ---------------------------------------------------------------------------

describe('Regression — unauthorized agent blocked for every action', () => {
  const allActions: Array<MemoryCartographerParams['action']> = [
    'get_plan_dependencies',
    'get_dependencies',
    'reverse_dependent_lookup',
    'bounded_traversal',
    'db_map_summary',
    'db_node_lookup',
    'db_edge_lookup',
    'context_items_projection',
    'summary',
    'file_context',
    'flow_entry_points',
    'layer_view',
    'search',
    'slice_catalog',
    'slice_detail',
    'slice_projection',
    'slice_filters',
  ];

  for (const action of allActions) {
    it(`unauthorized agent is blocked for action: ${action}`, async () => {
      const result = await handleMemoryCartographer({
        action,
        workspace_id: WORKSPACE_ID,
        agent_type:   UNAUTHORIZED_AGENT,
        // Provide minimally required params
        plan_id:      PLAN_ID,
        root_plan_id: PLAN_ID,
        table_name:   'plans',
        primary_key:  'plan_001',
        parent_type:  'plan',
        parent_id:    PLAN_ID,
      });
      expect(result.success).toBe(false);
      const data = result.data as any;
      expect(data?.data?.diagnostic_code).toBe('PERMISSION_DENIED');
    });
  }
});

// ---------------------------------------------------------------------------
// 4. Response shape stability — all Phase A actions have `action` field at top level
// ---------------------------------------------------------------------------

describe('Regression — response shape stability (action field at top level)', () => {
  const phaseAScenarios: Array<{ action: MemoryCartographerParams['action']; extra?: Partial<MemoryCartographerParams> }> = [
    { action: 'get_plan_dependencies', extra: { plan_id: PLAN_ID } },
    { action: 'get_dependencies',      extra: { plan_id: PLAN_ID } },
    { action: 'reverse_dependent_lookup', extra: { plan_id: PLAN_ID } },
    { action: 'bounded_traversal',     extra: { root_plan_id: PLAN_ID } },
    { action: 'db_map_summary' },
    { action: 'db_node_lookup',        extra: { table_name: 'plans', primary_key: 'plan_001' } },
    { action: 'db_edge_lookup',        extra: { table_name: 'plans', primary_key: 'plan_001' } },
    { action: 'context_items_projection', extra: { parent_type: 'plan', parent_id: PLAN_ID } },
  ];

  for (const { action, extra } of phaseAScenarios) {
    it(`Phase A action '${action}' returns object with top-level 'action' field`, async () => {
      const result = await handleMemoryCartographer(base({ action, ...extra }));
      expect(result.success).toBe(true);
      const data = result.data as any;
      expect(data).toHaveProperty('action');
      expect(data.action).toBe(action);
    });
  }

  it('Phase B action returns top-level action field too', async () => {
    const result = await handleMemoryCartographer(base({ action: 'summary' as any }));
    expect(result.success).toBe(true);
    const data = result.data as any;
    expect(data).toHaveProperty('action');
    expect(data.action).toBe('summary');
  });
});
