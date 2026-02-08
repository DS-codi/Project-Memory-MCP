import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { getDeployDefaults, setDeployDefaults } from '../../utils/deployDefaults';

const STORAGE_KEY = 'pmd-deploy-defaults';

describe('deployDefaults storage', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-02-08T00:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('persists deploy defaults and rehydrates them', () => {
    const saved = setDeployDefaults({
      agents: ['executor'],
      prompts: ['prompt-1'],
      instructions: ['inst_general_001'],
    });

    expect(saved.updatedAt).toBe('2026-02-08T00:00:00.000Z');

    const rehydrated = getDeployDefaults();
    expect(rehydrated).toEqual(saved);
  });

  it('returns null when stored defaults are invalid', () => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ agents: [], prompts: [] }));

    expect(getDeployDefaults()).toBeNull();
  });
});
