/**
 * Tests for prompt-storage.ts — Plan-scoped prompt CRUD
 *
 * Covers:
 * 1. savePlanPrompt creates file in correct directory
 * 2. loadPlanPrompt returns content
 * 3. loadPlanPrompt returns null when prompt doesn't exist
 * 4. listPlanPrompts returns all prompt slugs for a plan
 * 5. listPlanPrompts returns empty array when directory doesn't exist
 * 6. deletePlanPrompt removes file and returns true
 * 7. deletePlanPrompt returns false when file doesn't exist
 * 8. incrementVersion increments patch version
 * 9. resolveNextVersion auto-increments on update
 * 10. checkPromptStaleness detects stale prompts
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { promises as fs } from 'fs';

vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      readdir: vi.fn(),
      readFile: vi.fn(),
      writeFile: vi.fn().mockResolvedValue(undefined),
      unlink: vi.fn().mockResolvedValue(undefined),
      mkdir: vi.fn().mockResolvedValue(undefined),
    },
  };
});

vi.mock('../../storage/file-store.js', () => ({
  getPlanPath: vi.fn(
    (wsId: string, planId: string) => `/data/${wsId}/plans/${planId}`,
  ),
  ensureDir: vi.fn().mockResolvedValue(undefined),
  exists: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../tools/prompt-writer.js', async () => {
  const actual = await vi.importActual<typeof import('../../tools/prompt-writer.js')>(
    '../../tools/prompt-writer.js',
  );
  return {
    ...actual,
  };
});

import {
  savePlanPrompt,
  loadPlanPrompt,
  listPlanPrompts,
  deletePlanPrompt,
  getPlanPromptsPath,
  incrementVersion,
  resolveNextVersion,
  getPromptVersion,
  checkPromptStaleness,
  checkAllPromptsStaleness,
} from '../../tools/prompt-storage.js';

import { exists } from '../../storage/file-store.js';

const WORKSPACE_ID = 'ws_test';
const PLAN_ID = 'plan_abc';

// =============================================================================
// getPlanPromptsPath
// =============================================================================

describe('getPlanPromptsPath', () => {
  it('returns the prompts subdirectory under the plan path', () => {
    const result = getPlanPromptsPath(WORKSPACE_ID, PLAN_ID);
    expect(result).toContain(WORKSPACE_ID);
    expect(result).toContain(PLAN_ID);
    expect(result).toMatch(/prompts$/);
  });
});

// =============================================================================
// savePlanPrompt
// =============================================================================

describe('savePlanPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('writes file to the plan prompts directory', async () => {
    const content = '---\nagent: "Executor"\n---\n# Hello\n';
    const result = await savePlanPrompt(WORKSPACE_ID, PLAN_ID, 'my-prompt', content);

    expect(result).toContain('my-prompt.prompt.md');
    expect(fs.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('my-prompt.prompt.md'),
      content,
      'utf-8',
    );
  });

  it('returns the file path', async () => {
    const result = await savePlanPrompt(WORKSPACE_ID, PLAN_ID, 'test', 'content');
    expect(typeof result).toBe('string');
    expect(result).toContain('test.prompt.md');
  });
});

// =============================================================================
// loadPlanPrompt
// =============================================================================

describe('loadPlanPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns file content when prompt exists', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nagent: "Executor"\n---\n# Prompt\n' as any,
    );

    const result = await loadPlanPrompt(WORKSPACE_ID, PLAN_ID, 'my-prompt');
    expect(result).toContain('# Prompt');
  });

  it('returns null when prompt does not exist', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    const result = await loadPlanPrompt(WORKSPACE_ID, PLAN_ID, 'missing');
    expect(result).toBeNull();
  });
});

// =============================================================================
// listPlanPrompts
// =============================================================================

describe('listPlanPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns slugs of all .prompt.md files', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'setup.prompt.md',
      'deploy.prompt.md',
      'notes.txt',
    ] as any);

    const result = await listPlanPrompts(WORKSPACE_ID, PLAN_ID);
    expect(result).toEqual(['setup', 'deploy']);
  });

  it('returns empty array when prompts directory does not exist', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    const result = await listPlanPrompts(WORKSPACE_ID, PLAN_ID);
    expect(result).toEqual([]);
  });

  it('returns empty array when no .prompt.md files exist', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readdir).mockResolvedValueOnce(['readme.md', 'config.json'] as any);

    const result = await listPlanPrompts(WORKSPACE_ID, PLAN_ID);
    expect(result).toEqual([]);
  });
});

// =============================================================================
// deletePlanPrompt
// =============================================================================

describe('deletePlanPrompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes file and returns true when prompt exists', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);

    const result = await deletePlanPrompt(WORKSPACE_ID, PLAN_ID, 'old-prompt');
    expect(result).toBe(true);
    expect(fs.unlink).toHaveBeenCalledWith(
      expect.stringContaining('old-prompt.prompt.md'),
    );
  });

  it('returns false when prompt does not exist', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    const result = await deletePlanPrompt(WORKSPACE_ID, PLAN_ID, 'nonexistent');
    expect(result).toBe(false);
    expect(fs.unlink).not.toHaveBeenCalled();
  });
});

// =============================================================================
// incrementVersion
// =============================================================================

describe('incrementVersion', () => {
  it('increments patch version (1.0.0 → 1.0.1)', () => {
    expect(incrementVersion('1.0.0')).toBe('1.0.1');
  });

  it('increments patch version (2.3.5 → 2.3.6)', () => {
    expect(incrementVersion('2.3.5')).toBe('2.3.6');
  });

  it('increments patch version (0.0.9 → 0.0.10)', () => {
    expect(incrementVersion('0.0.9')).toBe('0.0.10');
  });

  it('returns 1.0.1 for invalid version string', () => {
    expect(incrementVersion('not-a-version')).toBe('1.0.1');
  });

  it('returns 1.0.1 for version with wrong part count', () => {
    expect(incrementVersion('1.0')).toBe('1.0.1');
  });
});

// =============================================================================
// resolveNextVersion
// =============================================================================

describe('resolveNextVersion', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 1.0.0 when no existing prompt', async () => {
    // No existing prompt → getPromptVersion returns null
    vi.mocked(exists).mockResolvedValueOnce(false);

    const version = await resolveNextVersion(WORKSPACE_ID, PLAN_ID, 'new-prompt');
    expect(version).toBe('1.0.0');
  });

  it('returns requested version when no existing prompt', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    const version = await resolveNextVersion(WORKSPACE_ID, PLAN_ID, 'new', '3.0.0');
    expect(version).toBe('3.0.0');
  });

  it('auto-increments when existing version matches requested', async () => {
    // Existing prompt has version 1.0.0
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nversion: "1.0.0"\nagent: "X"\n---\nBody' as any,
    );

    const version = await resolveNextVersion(WORKSPACE_ID, PLAN_ID, 'existing', '1.0.0');
    expect(version).toBe('1.0.1');
  });

  it('uses requested version when it differs from existing', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nversion: "1.0.0"\nagent: "X"\n---\nBody' as any,
    );

    const version = await resolveNextVersion(WORKSPACE_ID, PLAN_ID, 'slug', '2.0.0');
    expect(version).toBe('2.0.0');
  });
});

// =============================================================================
// checkPromptStaleness
// =============================================================================

describe('checkPromptStaleness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns stale when prompt file not found', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false);

    const result = await checkPromptStaleness(WORKSPACE_ID, PLAN_ID, 'missing');
    expect(result.isStale).toBe(true);
    expect(result.reasons).toContain('Prompt file not found');
  });

  it('returns stale when prompt is already archived', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\narchived: true\nversion: "1.0.0"\n---\nBody' as any,
    );

    const result = await checkPromptStaleness(WORKSPACE_ID, PLAN_ID, 'archived-prompt');
    expect(result.isStale).toBe(true);
    expect(result.reasons).toContain('Prompt is already archived');
  });

  it('returns stale when plan_updated_at is older than current plan date', async () => {
    const oldDate = '2025-01-01T00:00:00Z';
    const newDate = '2026-02-01T00:00:00Z';

    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      `---\nversion: "1.0.0"\nplan_updated_at: "${oldDate}"\nagent: "X"\n---\nBody` as any,
    );

    const result = await checkPromptStaleness(
      WORKSPACE_ID, PLAN_ID, 'old-prompt', newDate,
    );
    expect(result.isStale).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('older plan state'),
      ]),
    );
  });

  it('returns stale when all referenced steps are complete', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nversion: "1.0.0"\nstep_indices: [0, 1, 2]\nagent: "X"\n---\nBody' as any,
    );

    const result = await checkPromptStaleness(
      WORKSPACE_ID, PLAN_ID, 'done-steps',
      undefined,
      [0, 1, 2, 3],
    );
    expect(result.isStale).toBe(true);
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        expect.stringContaining('All referenced steps are complete'),
      ]),
    );
  });

  it('returns not stale for a fresh prompt with no issues', async () => {
    const recentDate = new Date().toISOString();

    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      `---\nversion: "1.0.0"\nplan_updated_at: "${recentDate}"\nstep_indices: [0, 1]\nagent: "X"\n---\nBody` as any,
    );

    const result = await checkPromptStaleness(
      WORKSPACE_ID, PLAN_ID, 'fresh-prompt',
      recentDate,
      [0],  // Only step 0 is complete, step 1 is not
    );
    expect(result.isStale).toBe(false);
    expect(result.reasons).toHaveLength(0);
  });
});

// =============================================================================
// checkAllPromptsStaleness
// =============================================================================

describe('checkAllPromptsStaleness', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns staleness info for all prompts in a plan', async () => {
    // listPlanPrompts needs exists + readdir
    vi.mocked(exists).mockResolvedValueOnce(true); // promptsDir exists
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'prompt-a.prompt.md',
      'prompt-b.prompt.md',
    ] as any);

    // checkPromptStaleness for prompt-a
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nversion: "1.0.0"\nagent: "X"\n---\nBody A' as any,
    );

    // checkPromptStaleness for prompt-b
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nversion: "2.0.0"\narchived: true\nagent: "X"\n---\nBody B' as any,
    );

    const results = await checkAllPromptsStaleness(WORKSPACE_ID, PLAN_ID);
    expect(results).toHaveLength(2);
    expect(results[0].slug).toBe('prompt-a');
    expect(results[1].slug).toBe('prompt-b');
    expect(results[1].isStale).toBe(true); // archived
  });
});
