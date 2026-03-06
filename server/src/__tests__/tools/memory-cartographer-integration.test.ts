/**
 * Integration tests for memory_cartographer tool — memory-cartographer-integration.test.ts
 *
 * Coverage:
 *  1. Happy path — Phase A actions return structured results
 *  2. Security gate TC-DM-05 — context_data absent from context_items_projection rows
 *  3. Auth gate — unauthorized agent_type returns PERMISSION_DENIED (not throw)
 *  4. Phase B stubs — return diagnostic_code FEATURE_NOT_AVAILABLE (not throw)
 *  5. Input validation — missing action / workspace_id return structured errors (not throw)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMemoryCartographer } from '../../tools/memory_cartographer.js';
import type { MemoryCartographerParams } from '../../tools/memory_cartographer.js';

// ---------------------------------------------------------------------------
// Mock workspace validation
// ---------------------------------------------------------------------------
vi.mock('../../tools/consolidated/workspace-validation.js', () => ({
  validateAndResolveWorkspaceId: vi.fn().mockResolvedValue({
    success: true,
    workspace_id: 'ws_test_integration',
  }),
}));

// ---------------------------------------------------------------------------
// Mock preflight validation — always pass for integration tests
// ---------------------------------------------------------------------------
vi.mock('../../tools/preflight/index.js', () => ({
  preflightValidate: vi.fn().mockReturnValue({ valid: true }),
}));

// ---------------------------------------------------------------------------
// Mock DB Layer
// ---------------------------------------------------------------------------
vi.mock('../../db/dependency-db.js', () => ({
  getDependencies: vi.fn().mockReturnValue([]),
  getDependents:   vi.fn().mockReturnValue([]),
}));

vi.mock('../../db/plan-db.js', () => ({
  getPlan: vi.fn().mockReturnValue(null),
}));

vi.mock('../../db/connection.js', () => ({
  getDb: vi.fn().mockReturnValue({
    pragma: vi.fn().mockReturnValue(42),
  }),
}));

vi.mock('../../db/query-helpers.js', () => ({
  queryAll: vi.fn().mockReturnValue([]),
  queryOne: vi.fn().mockReturnValue(null),
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const WORKSPACE_ID = 'ws_test_integration';
const PLAN_ID      = 'plan_test_001';

const baseParams = (extra: Partial<MemoryCartographerParams>): MemoryCartographerParams => ({
  action:       'db_map_summary',
  workspace_id: WORKSPACE_ID,
  agent_type:   'Researcher',
  ...extra,
});

// ---------------------------------------------------------------------------
// 1. Happy path — Phase A
// ---------------------------------------------------------------------------

describe('Phase A happy path', () => {

  describe('get_plan_dependencies', () => {
    it('returns structured dependency result for a valid plan_id', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'get_plan_dependencies', plan_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const data = (result.data as any);
      expect(data.action).toBe('get_plan_dependencies');
      expect(data.data).toBeDefined();
      expect(Array.isArray(data.data.nodes)).toBe(true);
      expect(Array.isArray(data.data.edges)).toBe(true);
    });

    it('includes has_cycles and depth_reached in response', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'get_plan_dependencies', plan_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('has_cycles');
      expect(inner).toHaveProperty('depth_reached');
    });
  });

  describe('get_dependencies', () => {
    it('returns dependency list for a valid plan_id', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'get_dependencies', plan_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('nodes');
      expect(inner).toHaveProperty('edges');
      expect(inner.plan_id).toBe(PLAN_ID);
    });
  });

  describe('reverse_dependent_lookup', () => {
    it('returns reverse dependents for a valid plan_id', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'reverse_dependent_lookup', plan_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('dependents');
      expect(Array.isArray(inner.dependents)).toBe(true);
      expect(inner.plan_id).toBe(PLAN_ID);
    });
  });

  describe('bounded_traversal', () => {
    it('returns traversal results for a valid root_plan_id', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'bounded_traversal', root_plan_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('nodes');
      expect(inner).toHaveProperty('edges');
      expect(inner.root_plan_id).toBe(PLAN_ID);
    });

    it('includes depth_reached and was_depth_capped fields', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'bounded_traversal', root_plan_id: PLAN_ID }),
      );
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('depth_reached');
      expect(inner).toHaveProperty('was_depth_capped');
    });
  });

  describe('db_map_summary', () => {
    it('returns summary struct with tables array', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_map_summary' }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('tables');
      expect(Array.isArray(inner.tables)).toBe(true);
    });

    it('returns relation_count as a number', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_map_summary' }),
      );
      const inner = (result.data as any).data;
      expect(typeof inner.relation_count).toBe('number');
    });

    it('each table entry has table_name, row_count, column_count, has_fk_relations', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_map_summary' }),
      );
      const tables: any[] = (result.data as any).data.tables;
      for (const t of tables) {
        expect(t).toHaveProperty('table_name');
        expect(t).toHaveProperty('row_count');
        expect(t).toHaveProperty('column_count');
        expect(t).toHaveProperty('has_fk_relations');
      }
    });
  });

  describe('db_node_lookup', () => {
    it('returns EMPTY_RESULT structured response when row not found (not a throw)', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_node_lookup', table_name: 'plans', primary_key: 'nonexistent_id' }),
      );
      // Must not throw — success:true with EMPTY_RESULT diagnostic
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner.diagnostic_code).toBe('EMPTY_RESULT');
    });

    it('action field matches in response', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_node_lookup', table_name: 'plans', primary_key: 'x' }),
      );
      expect((result.data as any).action).toBe('db_node_lookup');
    });
  });

  describe('db_edge_lookup', () => {
    it('returns edge lookup response for valid table + pk (with empty edges from mock)', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_edge_lookup', table_name: 'plans', primary_key: 'plan_xyz' }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('edges');
      expect(inner).toHaveProperty('source');
    });

    it('action field is db_edge_lookup in response', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'db_edge_lookup', table_name: 'plans', primary_key: 'plan_xyz' }),
      );
      expect((result.data as any).action).toBe('db_edge_lookup');
    });
  });

  describe('context_items_projection', () => {
    it('returns projection rows array (empty from mock DB)', async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID }),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner).toHaveProperty('items');
      expect(Array.isArray(inner.items)).toBe(true);
    });
  });
});

// ---------------------------------------------------------------------------
// 2. Security tests — TC-DM-05 (P0): context_data must be absent/masked
// ---------------------------------------------------------------------------

describe('Security gate TC-DM-05 — context_data masking', () => {
  it('TC-DM-05: context_items_projection rows do not have context_data field populated', async () => {
    // Seed mock to return a raw row with a data field (simulating real DB rows)
    const { queryAll } = await import('../../db/query-helpers.js');
    vi.mocked(queryAll).mockReturnValueOnce([
      {
        id: 'ci_001',
        parent_type: 'plan',
        parent_id: PLAN_ID,
        type: 'research',
        created_at: '2026-01-01T00:00:00Z',
        data: JSON.stringify({ secret: 'should_not_appear' }),
      },
    ]);
    const { queryOne } = await import('../../db/query-helpers.js');
    vi.mocked(queryOne).mockReturnValueOnce({ c: 1 });

    const result = await handleMemoryCartographer(
      baseParams({ action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID }),
    );

    expect(result.success).toBe(true);
    const items: any[] = (result.data as any).data.items;
    expect(items.length).toBeGreaterThan(0);

    for (const row of items) {
      // context_data must not be present as a field
      expect(row).not.toHaveProperty('context_data');
      // data must not be present as raw field
      expect(row).not.toHaveProperty('data');
    }
  });

  it('TC-DM-05: context_items_projection rows have data_size_bytes instead of raw data', async () => {
    const { queryAll } = await import('../../db/query-helpers.js');
    vi.mocked(queryAll).mockReturnValueOnce([
      {
        id: 'ci_002',
        parent_type: 'workspace',
        parent_id: 'ws_test_integration',
        type: 'architecture',
        created_at: '2026-01-02T00:00:00Z',
        data: '{"payload":"redacted_content"}',
      },
    ]);
    const { queryOne } = await import('../../db/query-helpers.js');
    vi.mocked(queryOne).mockReturnValueOnce({ c: 1 });

    const result = await handleMemoryCartographer(
      baseParams({
        action:      'context_items_projection',
        parent_type: 'workspace',
        parent_id:   'ws_test_integration',
      }),
    );

    expect(result.success).toBe(true);
    const items: any[] = (result.data as any).data.items;
    expect(items.length).toBe(1);
    expect(items[0]).toHaveProperty('data_size_bytes');
    expect(typeof items[0].data_size_bytes).toBe('number');
  });

  it('Auth gate: unauthorized agent_type returns PERMISSION_DENIED diagnostic (not throw)', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'db_map_summary', agent_type: 'unauthorized_type' }),
    );
    expect(result.success).toBe(false);
    const data = result.data as any;
    expect(data.data.diagnostic_code).toBe('PERMISSION_DENIED');
    expect(data.data.error).toBe('UNAUTHORIZED');
  });
});

// ---------------------------------------------------------------------------
// 3. Phase B stubs — FEATURE_NOT_AVAILABLE (not throw)
// ---------------------------------------------------------------------------

describe('Phase B stubs — FEATURE_NOT_AVAILABLE', () => {
  const cartographyQueryActions = ['summary', 'file_context', 'flow_entry_points', 'layer_view', 'search'] as const;
  const architectureSliceActions = ['slice_catalog', 'slice_detail', 'slice_projection', 'slice_filters'] as const;

  for (const action of cartographyQueryActions) {
    it(`cartography_queries/${action} returns FEATURE_NOT_AVAILABLE and does not throw`, async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action } as Partial<MemoryCartographerParams> as MemoryCartographerParams),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner.diagnostic_code).toBe('FEATURE_NOT_AVAILABLE');
      expect(inner.error).toBe('NOT_IMPLEMENTED');
    });
  }

  for (const action of architectureSliceActions) {
    it(`architecture_slices/${action} returns FEATURE_NOT_AVAILABLE and does not throw`, async () => {
      const result = await handleMemoryCartographer(
        baseParams({ action } as Partial<MemoryCartographerParams> as MemoryCartographerParams),
      );
      expect(result.success).toBe(true);
      const inner = (result.data as any).data;
      expect(inner.diagnostic_code).toBe('FEATURE_NOT_AVAILABLE');
    });
  }

  it('Phase B stub data includes domain field', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary' as any }),
    );
    const inner = (result.data as any).data;
    expect(inner.domain).toBe('cartography_queries');
  });

  it('Phase B architecture_slices stub includes correct domain', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'slice_catalog' as any }),
    );
    const inner = (result.data as any).data;
    expect(inner.domain).toBe('architecture_slices');
  });
});

// ---------------------------------------------------------------------------
// 4. Input validation — structured errors, not throws
// ---------------------------------------------------------------------------

describe('Input validation', () => {
  it('missing workspace_id returns structured error (success: false)', async () => {
    const result = await handleMemoryCartographer({
      action:       'db_map_summary',
      workspace_id: '',
    });
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('null-like workspace_id (undefined) returns structured error', async () => {
    const result = await handleMemoryCartographer({
      action:       'db_map_summary',
      workspace_id: undefined as unknown as string,
    });
    expect(result.success).toBe(false);
  });

  it('missing action returns structured error (success: false)', async () => {
    const result = await handleMemoryCartographer({
      action:       undefined as unknown as any,
      workspace_id: WORKSPACE_ID,
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('action');
  });

  it('get_plan_dependencies without plan_id returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'get_plan_dependencies', plan_id: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('get_dependencies without plan_id returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'get_dependencies', plan_id: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('reverse_dependent_lookup without plan_id returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'reverse_dependent_lookup', plan_id: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('plan_id');
  });

  it('bounded_traversal without root_plan_id returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'bounded_traversal', root_plan_id: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('root_plan_id');
  });

  it('db_node_lookup without table_name returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'db_node_lookup', table_name: undefined, primary_key: 'x' }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('table_name');
  });

  it('db_node_lookup without primary_key returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'db_node_lookup', table_name: 'plans', primary_key: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('primary_key');
  });

  it('context_items_projection without parent_type returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'context_items_projection', parent_type: undefined, parent_id: PLAN_ID }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('parent_type');
  });

  it('context_items_projection without parent_id returns structured error', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'context_items_projection', parent_type: 'plan', parent_id: undefined }),
    );
    expect(result.success).toBe(false);
    expect(result.error).toContain('parent_id');
  });

  it('unknown action returns structured error (success: false)', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'totally_unknown_action' as any }),
    );
    expect(result.success).toBe(false);
  });
});
