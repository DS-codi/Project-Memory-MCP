/**
 * Integration tests for memory_cartographer tool — memory-cartographer-integration.test.ts
 *
 * Coverage:
 *  1. Happy path — Phase A actions return structured results
 *  2. Security gate TC-DM-05 — context_data absent from context_items_projection rows
 *  3. Auth gate — unauthorized agent_type returns PERMISSION_DENIED (not throw)
 *  4. Phase B summary is Python-backed while non-summary actions remain stubs
 *  5. Input validation — missing action / workspace_id return structured errors (not throw)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import path from 'node:path';
import { handleMemoryCartographer } from '../../tools/memory_cartographer.js';
import type { MemoryCartographerParams } from '../../tools/memory_cartographer.js';

const {
  mockedGetWorkspace,
  mockedResolveAccessiblePath,
  mockedInvokePythonCore,
  mockedFsMkdir,
  mockedFsWriteFile,
} = vi.hoisted(() => ({
  mockedGetWorkspace: vi.fn(),
  mockedResolveAccessiblePath: vi.fn(),
  mockedInvokePythonCore: vi.fn(),
  mockedFsMkdir: vi.fn(),
  mockedFsWriteFile: vi.fn(),
}));

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

vi.mock('../../db/workspace-db.js', () => ({
  getWorkspace: mockedGetWorkspace,
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

vi.mock('../../storage/workspace-mounts.js', () => ({
  resolveAccessiblePath: mockedResolveAccessiblePath,
}));

vi.mock('../../cartography/runtime/pythonBridge.js', () => ({
  invokePythonCore: mockedInvokePythonCore,
}));

vi.mock('node:fs/promises', () => ({
  mkdir: mockedFsMkdir,
  writeFile: mockedFsWriteFile,
}));

// ---------------------------------------------------------------------------
// Test constants
// ---------------------------------------------------------------------------
const WORKSPACE_ID = 'ws_test_integration';
const PLAN_ID      = 'plan_test_001';

beforeEach(() => {
  vi.clearAllMocks();

  mockedGetWorkspace.mockReturnValue({
    id: WORKSPACE_ID,
    path: 'C:/mock/workspace',
  });

  mockedResolveAccessiblePath.mockResolvedValue('C:/mock/workspace');

  mockedInvokePythonCore.mockResolvedValue({
    schema_version: '1.0.0',
    request_id: 'cartograph_summary_req_001',
    status: 'ok',
    result: {
      query: 'summary',
      summary: {
        files_total: 2,
      },
    },
    diagnostics: {
      warnings: [],
      errors: [],
      markers: [],
      skipped_paths: [],
    },
    elapsed_ms: 17,
  });

  mockedFsMkdir.mockResolvedValue(undefined);
  mockedFsWriteFile.mockResolvedValue(undefined);
});

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
// 3. Phase B summary live + non-summary stubs
// ---------------------------------------------------------------------------

describe('Phase B summary + stubs', () => {
  it('cartography_queries/summary returns Python-backed success envelope', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary' }),
    );

    expect(result.success).toBe(true);
    const payload = result.data as any;
    expect(payload.action).toBe('summary');

    const inner = payload.data;
    expect(inner.source).toBe('python_core');
    expect(inner.status).toBe('ok');
    expect(inner.schema_version).toBe('1.0.0');
    expect(inner.request_id).toBe('cartograph_summary_req_001');
    expect(inner.elapsed_ms).toBe(17);
    expect(inner.diagnostics).toEqual({
      warnings: [],
      errors: [],
      markers: [],
      skipped_paths: [],
    });
    expect(inner.result).toEqual(expect.objectContaining({ query: 'summary' }));
    expect(inner.diagnostic_code).toBeUndefined();

    expect(mockedInvokePythonCore).toHaveBeenCalledTimes(1);
    const request = mockedInvokePythonCore.mock.calls[0][0];
    expect(request.action).toBe('cartograph');
    expect(request.args).toEqual(expect.objectContaining({
      query: 'summary',
      workspace_path: 'C:/mock/workspace',
    }));
    expect(request.timeout_ms).toBe(60_000);
  });

  it('cartography_queries/summary narrows workspace scope to repo root when parent workspace is broader', async () => {
    mockedGetWorkspace.mockReturnValueOnce({
      id: WORKSPACE_ID,
      path: 'C:/Users/User/Project_Memory_MCP',
    });
    mockedResolveAccessiblePath.mockResolvedValueOnce('C:/Users/User/Project_Memory_MCP');

    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary' }),
    );

    expect(result.success).toBe(true);
    const request = mockedInvokePythonCore.mock.calls[0][0];
    expect(request.args).toEqual(expect.objectContaining({
      query: 'summary',
      workspace_path: path.join('C:/Users/User/Project_Memory_MCP', 'Project-Memory-MCP'),
    }));
  });

  it('cartography_queries/summary timeout is configurable via env var', async () => {
    process.env.PM_CARTOGRAPHER_SUMMARY_TIMEOUT_MS = '65000';

    try {
      const result = await handleMemoryCartographer(
        baseParams({ action: 'summary' }),
      );

      expect(result.success).toBe(true);
      const request = mockedInvokePythonCore.mock.calls[0][0];
      expect(request.timeout_ms).toBe(65_000);
    } finally {
      delete process.env.PM_CARTOGRAPHER_SUMMARY_TIMEOUT_MS;
    }
  });

  it('cartography_queries/summary failure surfaces launch context for module discoverability diagnostics', async () => {
    const runtimeError = Object.assign(
      new Error("ModuleNotFoundError: No module named 'memory_cartographer'"),
      {
        launchContext: {
          python_executable: 'python',
          module_name: 'memory_cartographer.runtime.entrypoint',
          cwd: 'C:/mock/workspace',
          workspace_path: 'C:/mock/workspace',
          module_search_paths: ['C:/mock/workspace/Project-Memory-MCP/python-core'],
          pythonpath: 'C:/mock/workspace/Project-Memory-MCP/python-core',
        },
      },
    );
    mockedInvokePythonCore.mockRejectedValueOnce(runtimeError);

    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary' }),
    );

    expect(result.success).toBe(false);
    const payload = result.data as any;
    expect(payload.action).toBe('summary');
    expect(payload.data.diagnostic_code).toBe('PYTHON_RUNTIME_UNAVAILABLE');
    expect(payload.data.message).toContain("ModuleNotFoundError: No module named 'memory_cartographer'");
    expect(payload.data.launch_context).toEqual(expect.objectContaining({
      module_name: 'memory_cartographer.runtime.entrypoint',
      module_search_paths: expect.arrayContaining(['C:/mock/workspace/Project-Memory-MCP/python-core']),
    }));
  });

  it('summary writes supervisor documentation into workspace docs path when called from supervisor', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary', caller_surface: 'supervisor', write_documentation: true }),
    );

    expect(result.success).toBe(true);
    expect(mockedFsMkdir).toHaveBeenCalledTimes(1);
    expect(mockedFsWriteFile).toHaveBeenCalledTimes(1);

    const [writtenPath, content] = mockedFsWriteFile.mock.calls[0] as [string, string];
    expect(writtenPath).toContain(path.join('docs', 'cartographer', 'supervisor-reports'));
    expect(content).toContain('# Cartographer Supervisor Report');
    expect(content).toContain('## Raw Cartographer Result');

    const payload = result.data as any;
    expect(payload.data.documentation).toEqual(expect.objectContaining({
      status: 'written',
    }));
    expect(payload.data.documentation.relative_path).toContain(path.join('docs', 'cartographer', 'supervisor-reports'));
  });

  it('summary does not write supervisor documentation for standard MCP calls', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary' }),
    );

    expect(result.success).toBe(true);
    expect(mockedFsMkdir).not.toHaveBeenCalled();
    expect(mockedFsWriteFile).not.toHaveBeenCalled();

    const payload = result.data as any;
    expect(payload.data.documentation).toBeUndefined();
  });

  it('summary remains successful when supervisor documentation write fails', async () => {
    mockedFsWriteFile.mockRejectedValueOnce(new Error('disk full'));

    const result = await handleMemoryCartographer(
      baseParams({ action: 'summary', caller_surface: 'supervisor', write_documentation: true }),
    );

    expect(result.success).toBe(true);
    const payload = result.data as any;
    expect(payload.data.documentation).toEqual(expect.objectContaining({
      status: 'failed',
      error: expect.stringContaining('disk full'),
    }));
  });

  it('non-summary actions write supervisor documentation when requested', async () => {
    mockedInvokePythonCore.mockResolvedValueOnce({
      schema_version: '1.0.0',
      request_id: 'cartograph_search_req_supervisor_doc',
      status: 'ok',
      result: {
        query: 'search',
        rows: [],
      },
      diagnostics: {
        warnings: [],
        errors: [],
        markers: [],
        skipped_paths: [],
      },
      elapsed_ms: 21,
    });

    const result = await handleMemoryCartographer(
      baseParams({
        action: 'search',
        query: 'supervisor report',
        caller_surface: 'supervisor',
        write_documentation: true,
      }),
    );

    expect(result.success).toBe(true);
    expect(mockedFsMkdir).toHaveBeenCalledTimes(1);
    expect(mockedFsWriteFile).toHaveBeenCalledTimes(1);

    const [writtenPath, content] = mockedFsWriteFile.mock.calls[0] as [string, string];
    expect(writtenPath).toContain(path.join('docs', 'cartographer', 'supervisor-reports'));
    expect(writtenPath).toContain('cartographer-supervisor-search-');
    expect(content).toContain('- Action: search');

    const payload = result.data as any;
    expect(payload.data.documentation).toEqual(expect.objectContaining({
      status: 'written',
    }));
  });

  it('non-summary Python status=error still returns supervisor documentation metadata', async () => {
    mockedInvokePythonCore.mockResolvedValueOnce({
      schema_version: '1.0.0',
      request_id: 'cartograph_search_req_supervisor_error_doc',
      status: 'error',
      result: {
        query: 'search',
      },
      diagnostics: {
        warnings: [],
        errors: ['search failed'],
        markers: [],
        skipped_paths: [],
      },
      elapsed_ms: 13,
    });

    const result = await handleMemoryCartographer(
      baseParams({
        action: 'search',
        query: 'will fail',
        caller_surface: 'supervisor',
        write_documentation: true,
      }),
    );

    expect(result.success).toBe(false);
    expect(mockedFsWriteFile).toHaveBeenCalledTimes(1);

    const payload = result.data as any;
    expect(payload.data.diagnostic_code).toBe('PYTHON_RUNTIME_ERROR');
    expect(payload.data.documentation).toEqual(expect.objectContaining({
      status: 'written',
    }));
  });

  const cartographyQueryActions = ['file_context', 'flow_entry_points', 'layer_view', 'search'] as const;
  const architectureSliceActions = ['slice_detail', 'slice_projection', 'slice_filters'] as const;
  type NonSummaryAction = (typeof cartographyQueryActions)[number] | (typeof architectureSliceActions)[number];

  const nonSummaryCases: Array<{
    action: NonSummaryAction;
    params: Partial<MemoryCartographerParams>;
    expectedTimeoutMs: number;
    expectedArgs: Record<string, unknown>;
    unexpectedArgKeys: string[];
  }> = [
    {
      action: 'file_context',
      params: {
        file_id: 'src/tools/memory_cartographer.ts',
        include_symbols: true,
        include_references: false,
      },
      expectedTimeoutMs: 60_000,
      expectedArgs: {
        query: 'file_context',
        workspace_path: 'C:/mock/workspace',
        file_id: 'src/tools/memory_cartographer.ts',
        include_symbols: true,
        include_references: false,
      },
      unexpectedArgKeys: ['workspace_id', 'search_query', 'projection_type'],
    },
    {
      action: 'flow_entry_points',
      params: {
        layer_filter: ['server', 'python-core'],
        language_filter: ['typescript', 'python'],
      },
      expectedTimeoutMs: 60_000,
      expectedArgs: {
        query: 'flow_entry_points',
        workspace_path: 'C:/mock/workspace',
        layer_filter: ['server', 'python-core'],
        language_filter: ['typescript', 'python'],
      },
      unexpectedArgKeys: ['workspace_id', 'file_id', 'search_query'],
    },
    {
      action: 'layer_view',
      params: {
        layers: ['orchestration', 'runtime'],
        depth_limit: 2,
        include_cross_layer_edges: true,
      },
      expectedTimeoutMs: 60_000,
      expectedArgs: {
        query: 'layer_view',
        workspace_path: 'C:/mock/workspace',
        layers: ['orchestration', 'runtime'],
        depth_limit: 2,
        include_cross_layer_edges: true,
      },
      unexpectedArgKeys: ['workspace_id', 'search_query', 'slice_id'],
    },
    {
      action: 'search',
      params: {
        query: 'memory cartographer',
        search_scope: 'symbols',
        layer_filter: ['server'],
        limit: 25,
      },
      expectedTimeoutMs: 60_000,
      expectedArgs: {
        query: 'search',
        workspace_path: 'C:/mock/workspace',
        search_query: 'memory cartographer',
        search_scope: 'symbols',
        layer_filter: ['server'],
        limit: 25,
      },
      unexpectedArgKeys: ['workspace_id', 'file_id', 'projection_type'],
    },
    {
      action: 'slice_detail',
      params: {
        slice_id: 'sl_test_001',
      },
      expectedTimeoutMs: 15_000,
      expectedArgs: {
        query: 'slice_detail',
        workspace_path: 'C:/mock/workspace',
        workspace_id: WORKSPACE_ID,
        slice_id: 'sl_test_001',
      },
      unexpectedArgKeys: ['search_query', 'layers', 'layer_filter'],
    },
    {
      action: 'slice_projection',
      params: {
        slice_id: 'sl_test_001',
        projection_type: 'module_level',
        filters: [{ type: 'layer', values: ['runtime'] }],
      },
      expectedTimeoutMs: 15_000,
      expectedArgs: {
        query: 'slice_projection',
        workspace_path: 'C:/mock/workspace',
        workspace_id: WORKSPACE_ID,
        slice_id: 'sl_test_001',
        projection_type: 'module_level',
        filters: [{ type: 'layer', values: ['runtime'] }],
      },
      unexpectedArgKeys: ['search_query', 'file_id'],
    },
    {
      action: 'slice_filters',
      params: {
        slice_id: 'sl_test_001',
      },
      expectedTimeoutMs: 15_000,
      expectedArgs: {
        query: 'slice_filters',
        workspace_path: 'C:/mock/workspace',
        workspace_id: WORKSPACE_ID,
        slice_id: 'sl_test_001',
      },
      unexpectedArgKeys: ['search_query', 'projection_type', 'filters'],
    },
  ];

  for (const testCase of nonSummaryCases) {
    const { action, params, expectedTimeoutMs, expectedArgs, unexpectedArgKeys } = testCase;

    it(`Phase B ${action} maps request args and returns normalized success envelope`, async () => {
      mockedInvokePythonCore.mockResolvedValueOnce({
        schema_version: '1.0.0',
        request_id: `cartograph_${action}_req_001`,
        status: 'ok',
        result: {
          query: action,
          rows: [],
        },
        diagnostics: {
          warnings: [],
          errors: [],
          markers: [],
          skipped_paths: [],
        },
        elapsed_ms: 19,
      });

      const result = await handleMemoryCartographer(
        baseParams({ action, ...params } as Partial<MemoryCartographerParams> as MemoryCartographerParams),
      );

      expect(result.success).toBe(true);
      const payload = result.data as any;
      expect(payload.action).toBe(action);

      const inner = payload.data;
      expect(inner).toEqual(expect.objectContaining({
        source: 'python_core',
        request_id: `cartograph_${action}_req_001`,
        schema_version: '1.0.0',
        status: 'ok',
        elapsed_ms: 19,
        diagnostics: {
          warnings: [],
          errors: [],
          markers: [],
          skipped_paths: [],
        },
      }));
      expect(inner.result).toEqual(expect.objectContaining({ query: action }));
      expect(inner.diagnostic_code).toBeUndefined();

      expect(mockedInvokePythonCore).toHaveBeenCalledTimes(1);
      const request = mockedInvokePythonCore.mock.calls[0][0];
      expect(request.action).toBe('cartograph');
      expect(request.timeout_ms).toBe(expectedTimeoutMs);
      expect(request.args).toEqual(expect.objectContaining(expectedArgs));
      for (const key of unexpectedArgKeys) {
        expect(request.args).not.toHaveProperty(key);
      }
    });
  }

  it('Phase B non-summary timeout can be overridden globally via PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS', async () => {
    process.env.PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS = '90000';

    try {
      mockedInvokePythonCore.mockResolvedValueOnce({
        schema_version: '1.0.0',
        request_id: 'cartograph_search_req_timeout_override',
        status: 'ok',
        result: {
          query: 'search',
          rows: [],
        },
        diagnostics: {
          warnings: [],
          errors: [],
          markers: [],
          skipped_paths: [],
        },
        elapsed_ms: 11,
      });

      const result = await handleMemoryCartographer(
        baseParams({ action: 'search', query: 'timeout override' }),
      );

      expect(result.success).toBe(true);
      const request = mockedInvokePythonCore.mock.calls[0][0];
      expect(request.timeout_ms).toBe(90_000);
    } finally {
      delete process.env.PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS;
    }
  });

  it('Phase B file_context timeout prefers action-specific env override over global non-summary override', async () => {
    process.env.PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS = '90000';
    process.env.PM_CARTOGRAPHER_FILE_CONTEXT_TIMEOUT_MS = '120000';

    try {
      mockedInvokePythonCore.mockResolvedValueOnce({
        schema_version: '1.0.0',
        request_id: 'cartograph_file_context_req_timeout_override',
        status: 'ok',
        result: {
          query: 'file_context',
          rows: [],
        },
        diagnostics: {
          warnings: [],
          errors: [],
          markers: [],
          skipped_paths: [],
        },
        elapsed_ms: 9,
      });

      const result = await handleMemoryCartographer(
        baseParams({ action: 'file_context', file_id: 'src/tools/memory_cartographer.ts' }),
      );

      expect(result.success).toBe(true);
      const request = mockedInvokePythonCore.mock.calls[0][0];
      expect(request.timeout_ms).toBe(120_000);
    } finally {
      delete process.env.PM_CARTOGRAPHER_FILE_CONTEXT_TIMEOUT_MS;
      delete process.env.PM_CARTOGRAPHER_NON_SUMMARY_TIMEOUT_MS;
    }
  });

  // TC-AS-10: slice_catalog is now SQLite-backed (not a stub)
  it('TC-AS-10: slice_catalog returns { slices: [], total: 0 } on empty DB', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'slice_catalog' as any }),
    );
    expect(result.success).toBe(true);
    const inner = (result.data as any).data;
    expect(Array.isArray(inner.slices)).toBe(true);
    expect(inner.slices).toHaveLength(0);
    expect(inner.total).toBe(0);
    expect(mockedInvokePythonCore).not.toHaveBeenCalled();
  });

  it('TC-AS-10: slice_catalog response has correct action field', async () => {
    const result = await handleMemoryCartographer(
      baseParams({ action: 'slice_catalog' as any }),
    );
    expect(result.success).toBe(true);
    const data = (result.data as any);
    expect(data.action).toBe('slice_catalog');
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
