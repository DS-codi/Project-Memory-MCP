/**
 * Benchmark harness for memory_cartographer tool — memory-cartographer-benchmark.test.ts
 *
 * Phase A baseline: mock-response timing.
 * Real production benchmarks with live SQLite are deferred to Phase B.
 *
 * Coverage:
 *  1. Timing harness wrapper captures elapsed_ms per Phase A action
 *  2. Mock latency baseline: db_map_summary, get_plan_dependencies, context_items_projection
 *     must complete in < 50 ms with mock DB (generous mock-overhead baseline)
 *  3. Benchmark metadata structure: { action, elapsed_ms, is_mock: true, phase: "A" }
 *  4. Phase B placeholder describe block with it.todo() for each Phase B action
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleMemoryCartographer } from '../../tools/memory_cartographer.js';
import type { MemoryCartographerParams } from '../../tools/memory_cartographer.js';

// ---------------------------------------------------------------------------
// Hoisted mocks (used by Phase B tests)
// ---------------------------------------------------------------------------
const {
  mockedGetWorkspace,
  mockedResolveAccessiblePath,
  mockedInvokePythonCore,
} = vi.hoisted(() => ({
  mockedGetWorkspace:         vi.fn(),
  mockedResolveAccessiblePath: vi.fn(),
  mockedInvokePythonCore:     vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock('../../tools/consolidated/workspace-validation.js', () => ({
  validateAndResolveWorkspaceId: vi.fn().mockResolvedValue({
    success: true,
    workspace_id: 'ws_benchmark_test',
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
    pragma: vi.fn().mockReturnValue(0),
  }),
}));

vi.mock('../../db/query-helpers.js', () => ({
  queryAll: vi.fn().mockReturnValue([]),
  queryOne: vi.fn().mockReturnValue(null),
}));

vi.mock('../../db/workspace-db.js', () => ({
  getWorkspace: mockedGetWorkspace,
}));

vi.mock('../../storage/workspace-mounts.js', () => ({
  resolveAccessiblePath: mockedResolveAccessiblePath,
}));

vi.mock('../../cartography/runtime/pythonBridge.js', () => ({
  invokePythonCore: mockedInvokePythonCore,
}));

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const WORKSPACE_ID        = 'ws_benchmark_test';
const PLAN_ID             = 'plan_benchmark_001';
const MOCK_LATENCY_BUDGET = 50; // ms — generous for mock overhead

// ---------------------------------------------------------------------------
// Benchmark utility
// ---------------------------------------------------------------------------

interface BenchmarkResult {
  action:     string;
  elapsed_ms: number;
  is_mock:    true;
  phase:      'A';
}

async function runBenchmark(
  params: MemoryCartographerParams,
): Promise<BenchmarkResult> {
  const start   = Date.now();
  await handleMemoryCartographer(params);
  const elapsed = Date.now() - start;
  return {
    action:     params.action,
    elapsed_ms: elapsed,
    is_mock:    true,
    phase:      'A',
  };
}

function base(overrides: Partial<MemoryCartographerParams>): MemoryCartographerParams {
  return {
    action:       'db_map_summary',
    workspace_id: WORKSPACE_ID,
    agent_type:   'Researcher',
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// 1. Timing harness — captures elapsed_ms for all Phase A actions
// ---------------------------------------------------------------------------

describe('Benchmark — timing harness captures elapsed_ms for Phase A actions', () => {
  const phaseAScenarios: Array<{ label: string; params: Partial<MemoryCartographerParams> }> = [
    { label: 'get_plan_dependencies',    params: { action: 'get_plan_dependencies',    plan_id: PLAN_ID } },
    { label: 'get_dependencies',         params: { action: 'get_dependencies',         plan_id: PLAN_ID } },
    { label: 'reverse_dependent_lookup', params: { action: 'reverse_dependent_lookup', plan_id: PLAN_ID } },
    { label: 'bounded_traversal',        params: { action: 'bounded_traversal',        root_plan_id: PLAN_ID } },
    { label: 'db_map_summary',           params: { action: 'db_map_summary' } },
    { label: 'db_node_lookup',           params: { action: 'db_node_lookup',           table_name: 'plans', primary_key: 'plan_001' } },
    { label: 'db_edge_lookup',           params: { action: 'db_edge_lookup',           table_name: 'plans', primary_key: 'plan_001' } },
    { label: 'context_items_projection', params: { action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID } },
  ];

  for (const { label, params } of phaseAScenarios) {
    it(`${label}: benchmark result has correct metadata structure`, async () => {
      const bench = await runBenchmark(base(params));

      expect(bench.action).toBe(label);
      expect(typeof bench.elapsed_ms).toBe('number');
      expect(bench.elapsed_ms).toBeGreaterThanOrEqual(0);
      expect(bench.is_mock).toBe(true);
      expect(bench.phase).toBe('A');
    });
  }
});

// ---------------------------------------------------------------------------
// 2. Mock latency checks — Phase A actions complete within budget with mocked DB
// ---------------------------------------------------------------------------

describe('Benchmark — mock latency baseline < 50ms per action', () => {
  it(`db_map_summary completes in < ${MOCK_LATENCY_BUDGET}ms with mock DB`, async () => {
    const bench = await runBenchmark(base({ action: 'db_map_summary' }));
    expect(bench.elapsed_ms).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it(`get_plan_dependencies completes in < ${MOCK_LATENCY_BUDGET}ms with mock DB`, async () => {
    const bench = await runBenchmark(
      base({ action: 'get_plan_dependencies', plan_id: PLAN_ID }),
    );
    expect(bench.elapsed_ms).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it(`context_items_projection completes in < ${MOCK_LATENCY_BUDGET}ms with mock DB`, async () => {
    const bench = await runBenchmark(
      base({ action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID }),
    );
    expect(bench.elapsed_ms).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it(`get_dependencies completes in < ${MOCK_LATENCY_BUDGET}ms with mock DB`, async () => {
    const bench = await runBenchmark(
      base({ action: 'get_dependencies', plan_id: PLAN_ID }),
    );
    expect(bench.elapsed_ms).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it(`bounded_traversal completes in < ${MOCK_LATENCY_BUDGET}ms with mock DB`, async () => {
    const bench = await runBenchmark(
      base({ action: 'bounded_traversal', root_plan_id: PLAN_ID }),
    );
    expect(bench.elapsed_ms).toBeLessThan(MOCK_LATENCY_BUDGET);
  });
});

// ---------------------------------------------------------------------------
// 3. Benchmark metadata structure validation
// ---------------------------------------------------------------------------

describe('Benchmark — metadata structure { action, elapsed_ms, is_mock, phase }', () => {
  it('benchmark result has all required keys', async () => {
    const bench = await runBenchmark(base({ action: 'db_map_summary' }));
    expect(bench).toMatchObject({
      action:     'db_map_summary',
      is_mock:    true,
      phase:      'A',
    });
    expect('elapsed_ms' in bench).toBe(true);
  });

  it('elapsed_ms is finite non-negative number', async () => {
    const bench = await runBenchmark(
      base({ action: 'get_plan_dependencies', plan_id: PLAN_ID }),
    );
    expect(Number.isFinite(bench.elapsed_ms)).toBe(true);
    expect(bench.elapsed_ms).toBeGreaterThanOrEqual(0);
  });

  it('is_mock is always true for mock-DB benchmark runs', async () => {
    const actions: Array<Partial<MemoryCartographerParams>> = [
      { action: 'db_map_summary' },
      { action: 'get_plan_dependencies', plan_id: PLAN_ID },
      { action: 'context_items_projection', parent_type: 'plan', parent_id: PLAN_ID },
    ];
    for (const params of actions) {
      const bench = await runBenchmark(base(params));
      expect(bench.is_mock).toBe(true);
    }
  });

  it('phase is "A" for all Phase A benchmarks', async () => {
    const bench = await runBenchmark(
      base({ action: 'reverse_dependent_lookup', plan_id: PLAN_ID }),
    );
    expect(bench.phase).toBe('A');
  });

  it('action field matches the requested action', async () => {
    const actions: MemoryCartographerParams['action'][] = [
      'db_map_summary',
      'db_node_lookup',
      'db_edge_lookup',
    ];
    for (const action of actions) {
      const bench = await runBenchmark(
        base({ action, table_name: 'plans', primary_key: 'plan_001' }),
      );
      expect(bench.action).toBe(action);
    }
  });
});

// ---------------------------------------------------------------------------
// 4. Phase B benchmarks — Python adapter via mock
// ---------------------------------------------------------------------------

describe('Phase B benchmarks — deferred', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockedGetWorkspace.mockReturnValue({
      id:   WORKSPACE_ID,
      path: 'C:/mock/workspace',
    });
    mockedResolveAccessiblePath.mockResolvedValue('C:/mock/workspace');
    mockedInvokePythonCore.mockResolvedValue({
      schema_version: '1.0.0',
      request_id:     'benchmark_req_001',
      status:         'ok',
      result:         { query: 'summary', summary: { files_total: 2 } },
      diagnostics:    { warnings: [], errors: [], markers: [], skipped_paths: [] },
      elapsed_ms:     10,
    });
  });

  it('summary: benchmark latency once Python runtime is connected', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'summary' }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('file_context: benchmark latency once Python runtime is connected', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'file_context' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('flow_entry_points: benchmark latency once Python runtime is connected', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'flow_entry_points' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('layer_view: benchmark latency once Python runtime is connected', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'layer_view' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('search: benchmark end-to-end latency once Python runtime is connected', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'search' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('slice_catalog: benchmark catalog listing latency', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'slice_catalog' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    // slice_catalog is SQLite-backed — Python adapter not called
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('slice_detail: benchmark slice detail retrieval latency', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(
      base({ action: 'slice_detail' as any, slice_id: 'sl_bench_001' } as any),
    );
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('slice_projection: benchmark slice projection rendering latency', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(
      base({ action: 'slice_projection' as any, slice_id: 'sl_bench_001' } as any),
    );
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('slice_filters: benchmark filter evaluation latency', async () => {
    const start = Date.now();
    const result = await handleMemoryCartographer(base({ action: 'slice_filters' as any }));
    const elapsed = Date.now() - start;
    expect(result.success).toBe(true);
    expect(mockedInvokePythonCore).toHaveBeenCalled();
    expect(elapsed).toBeLessThan(MOCK_LATENCY_BUDGET);
  });

  it('Phase B P95 latency baseline: all actions < 2000ms under mock Python adapter', async () => {
    const scenarios: Array<Partial<MemoryCartographerParams>> = [
      { action: 'summary' },
      { action: 'file_context'    as any },
      { action: 'flow_entry_points' as any },
      { action: 'layer_view'      as any },
      { action: 'search'          as any },
      { action: 'slice_catalog'   as any },
      { action: 'slice_detail'    as any, slice_id: 'sl_bench_001' } as any,
      { action: 'slice_projection' as any, slice_id: 'sl_bench_001' } as any,
      { action: 'slice_filters'   as any },
    ];
    for (const params of scenarios) {
      const start  = Date.now();
      const result = await handleMemoryCartographer(base(params));
      const elapsed = Date.now() - start;
      expect(result.success).toBe(true);
      expect(elapsed).toBeLessThan(2000);
    }
  });

  it('Phase B throughput baseline: 10 concurrent summary calls within 5s', async () => {
    const start = Date.now();
    const calls = Array.from({ length: 10 }, () =>
      handleMemoryCartographer(base({ action: 'summary' })),
    );
    const results = await Promise.all(calls);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(5000);
    for (const result of results) {
      expect(result.success).toBe(true);
    }
  });
});
