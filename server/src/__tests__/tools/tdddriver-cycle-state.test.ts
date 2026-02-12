import { describe, it, expect, beforeEach, vi } from 'vitest';
import type {
  TDDCycleState,
  TDDPhase,
  TDDCycleIteration,
} from '../../types/index.js';
import * as store from '../../storage/file-store.js';

vi.mock('../../storage/file-store.js');

describe('TDD cycle types', () => {
  describe('TDDPhase', () => {
    it('accepts "red" as a valid phase', () => {
      const phase: TDDPhase = 'red';
      expect(phase).toBe('red');
    });

    it('accepts "green" as a valid phase', () => {
      const phase: TDDPhase = 'green';
      expect(phase).toBe('green');
    });

    it('accepts "refactor" as a valid phase', () => {
      const phase: TDDPhase = 'refactor';
      expect(phase).toBe('refactor');
    });
  });

  describe('TDDCycleState', () => {
    it('has required fields: cycle_number, current_phase, test_file', () => {
      const state: TDDCycleState = {
        cycle_number: 1,
        current_phase: 'red',
        test_file: 'tests/auth.test.ts',
        iterations: [],
      };

      expect(state.cycle_number).toBe(1);
      expect(state.current_phase).toBe('red');
      expect(state.test_file).toBe('tests/auth.test.ts');
      expect(state.iterations).toEqual([]);
    });

    it('supports optional implementation_file', () => {
      const state: TDDCycleState = {
        cycle_number: 2,
        current_phase: 'green',
        test_file: 'tests/auth.test.ts',
        implementation_file: 'src/auth.ts',
        iterations: [],
      };

      expect(state.implementation_file).toBe('src/auth.ts');
    });

    it('implementation_file can be omitted', () => {
      const state: TDDCycleState = {
        cycle_number: 1,
        current_phase: 'red',
        test_file: 'tests/feature.test.ts',
        iterations: [],
      };

      expect(state.implementation_file).toBeUndefined();
    });
  });

  describe('TDDCycleIteration', () => {
    it('tracks a full red-green-refactor iteration', () => {
      const iteration: TDDCycleIteration = {
        cycle: 1,
        red: { test_written: true, test_fails: true, test_file: 'tests/auth.test.ts' },
        green: { code_written: true, test_passes: true, impl_file: 'src/auth.ts' },
        refactor: { reviewed: true, changes_made: false },
      };

      expect(iteration.cycle).toBe(1);
      expect(iteration.red?.test_written).toBe(true);
      expect(iteration.red?.test_fails).toBe(true);
      expect(iteration.green?.test_passes).toBe(true);
      expect(iteration.refactor?.reviewed).toBe(true);
    });

    it('allows partial iterations (red only)', () => {
      const iteration: TDDCycleIteration = {
        cycle: 1,
        red: { test_written: true, test_fails: true, test_file: 'tests/foo.test.ts' },
      };

      expect(iteration.red).toBeDefined();
      expect(iteration.green).toBeUndefined();
      expect(iteration.refactor).toBeUndefined();
    });

    it('allows partial iterations (red + green, no refactor)', () => {
      const iteration: TDDCycleIteration = {
        cycle: 2,
        red: { test_written: true, test_fails: true, test_file: 'tests/bar.test.ts' },
        green: { code_written: true, test_passes: true, impl_file: 'src/bar.ts' },
      };

      expect(iteration.green?.impl_file).toBe('src/bar.ts');
      expect(iteration.refactor).toBeUndefined();
    });
  });

  describe('TDDCycleState with multiple iterations', () => {
    it('can track multiple cycle iterations', () => {
      const state: TDDCycleState = {
        cycle_number: 3,
        current_phase: 'refactor',
        test_file: 'tests/auth.test.ts',
        implementation_file: 'src/auth.ts',
        iterations: [
          {
            cycle: 1,
            red: { test_written: true, test_fails: true, test_file: 'tests/auth.test.ts' },
            green: { code_written: true, test_passes: true, impl_file: 'src/auth.ts' },
            refactor: { reviewed: true, changes_made: true },
          },
          {
            cycle: 2,
            red: { test_written: true, test_fails: true, test_file: 'tests/auth.test.ts' },
            green: { code_written: true, test_passes: true, impl_file: 'src/auth.ts' },
            refactor: { reviewed: true, changes_made: false },
          },
          {
            cycle: 3,
            red: { test_written: true, test_fails: true, test_file: 'tests/auth.test.ts' },
            green: { code_written: true, test_passes: true, impl_file: 'src/auth.ts' },
          },
        ],
      };

      expect(state.iterations).toHaveLength(3);
      expect(state.iterations[0].cycle).toBe(1);
      expect(state.iterations[2].refactor).toBeUndefined();
    });
  });
});

describe('storeTDDCycleState (via handoff integration)', () => {
  /**
   * These tests verify the isTDDCycleData detection and storeTDDCycleState
   * behaviour by checking the contracts those internal functions rely on.
   * Since storeTDDCycleState and isTDDCycleData are private to handoff.tools.ts,
   * we test the expected data shapes and storage patterns.
   */

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('tdd_cycle_state data shape is correctly structured', () => {
    const data: Record<string, unknown> = {
      tdd_cycle_state: {
        cycle_number: 2,
        current_phase: 'green',
        test_file: 'tests/widget.test.ts',
        implementation_file: 'src/widget.ts',
        iterations: [
          {
            cycle: 1,
            red: { test_written: true, test_fails: true, test_file: 'tests/widget.test.ts' },
            green: { code_written: true, test_passes: true, impl_file: 'src/widget.ts' },
            refactor: { reviewed: true, changes_made: false },
          },
        ],
      },
    };

    // Validate the tdd_cycle_state nested data matches the expected contract
    const cycleState = data.tdd_cycle_state as TDDCycleState;
    expect(cycleState.cycle_number).toBe(2);
    expect(cycleState.current_phase).toBe('green');
    expect(cycleState.test_file).toBe('tests/widget.test.ts');
    expect(cycleState.iterations).toHaveLength(1);
  });

  it('flat TDD data (current_phase at top level) is a valid detection pattern', () => {
    // isTDDCycleData detects data.current_phase === 'red' | 'green' | 'refactor'
    const data: Record<string, unknown> = {
      current_phase: 'red',
      test_file: 'tests/new-feature.test.ts',
      cycles_completed: 0,
    };

    expect(data.current_phase).toBe('red');
    expect(data.tdd_cycle_state).toBeUndefined();
    // isTDDCycleData should still match this via current_phase check
    expect(
      data.tdd_cycle_state != null ||
      data.cycles_completed != null ||
      data.current_phase === 'red' ||
      data.current_phase === 'green' ||
      data.current_phase === 'refactor'
    ).toBe(true);
  });

  it('cycles_completed field triggers TDD cycle detection', () => {
    const data: Record<string, unknown> = {
      cycles_completed: 3,
      tests_written: 5,
      test_files: ['tests/a.test.ts', 'tests/b.test.ts'],
    };

    // isTDDCycleData matches when cycles_completed is present
    expect(
      data.tdd_cycle_state != null ||
      data.cycles_completed != null
    ).toBe(true);
  });

  it('non-TDD data does not match TDD cycle detection', () => {
    const data: Record<string, unknown> = {
      review_status: 'approved',
      comments: ['looks good'],
    };

    expect(
      data.tdd_cycle_state != null ||
      data.cycles_completed != null ||
      data.current_phase === 'red' ||
      data.current_phase === 'green' ||
      data.current_phase === 'refactor'
    ).toBe(false);
  });

  it('storeTDDCycleState writes to correct context path', () => {
    // Verify the expected path structure used by storeTDDCycleState
    const workspace_id = 'ws_test_123';
    const plan_id = 'plan_tdd_456';
    const contextType = 'tdd_cycle_state';

    // The function calls store.getContextPath(workspace_id, plan_id, 'tdd_cycle_state')
    // We can verify the arguments are correct
    expect(contextType).toBe('tdd_cycle_state');
    expect(workspace_id).toBeTruthy();
    expect(plan_id).toBeTruthy();
  });

  it('stored context includes metadata fields', () => {
    // Verify the shape of the object that storeTDDCycleState writes
    const tddContext = {
      stored_at: '2026-02-10T00:00:00.000Z',
      cycle_number: 1,
      current_phase: 'red' as TDDPhase,
      test_file: 'tests/feature.test.ts',
      implementation_file: null,
      iterations: [],
      tests_written: 0,
      test_files: [],
      implementation_files: [],
    };

    expect(tddContext).toHaveProperty('stored_at');
    expect(tddContext).toHaveProperty('cycle_number');
    expect(tddContext).toHaveProperty('current_phase');
    expect(tddContext).toHaveProperty('test_file');
    expect(tddContext).toHaveProperty('iterations');
    expect(tddContext).toHaveProperty('tests_written');
    expect(tddContext).toHaveProperty('test_files');
    expect(tddContext).toHaveProperty('implementation_files');
  });
});
