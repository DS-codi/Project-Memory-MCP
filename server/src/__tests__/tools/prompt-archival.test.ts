/**
 * Tests for prompt archival — addArchivalHeader in prompt-writer.ts
 *
 * Covers:
 * 1. Archival adds header with exact format
 * 2. Original body content is preserved after header
 * 3. Archived frontmatter sets archived: true and archived_at
 * 4. Archived prompts remain parseable by parsePromptFile
 * 5. archivePlanPrompts skips already-archived prompts
 * 6. archivePlanPrompts returns count of newly archived prompts
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

import {
  addArchivalHeader,
  parsePromptFile,
} from '../../tools/prompt-writer.js';

import { archivePlanPrompts } from '../../tools/prompt-storage.js';
import { exists } from '../../storage/file-store.js';

// =============================================================================
// Fixtures
// =============================================================================

const SAMPLE_PROMPT = [
  '---',
  'agent: "Executor"',
  'description: "A test prompt"',
  'version: "1.0.0"',
  'plan_id: "plan_test"',
  'step_indices: [0, 1]',
  '---',
  '',
  '# Setup Prompt',
  '',
  'Do the setup steps.',
].join('\n');

const ALREADY_ARCHIVED_PROMPT = [
  '---',
  'agent: "Executor"',
  'description: "Already archived"',
  'version: "1.0.0"',
  'archived: true',
  'archived_at: "2026-01-01T00:00:00.000Z"',
  '---',
  '',
  '### ARCHIVED PROMPT: Used for plan "Old Plan", Related Steps "0, 1"',
  '',
  '# Old Prompt',
].join('\n');

// =============================================================================
// addArchivalHeader
// =============================================================================

describe('addArchivalHeader', () => {
  it('adds header with exact format: ARCHIVED PROMPT: Used for plan "X", Related Steps "Y"', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'My Plan', '0, 1');

    expect(result).toContain(
      '### ARCHIVED PROMPT: Used for plan "My Plan", Related Steps "0, 1"',
    );
  });

  it('sets archived: true in frontmatter', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'My Plan', '0, 1');
    const parsed = parsePromptFile(result);

    expect(parsed.frontmatter['archived']).toBe(true);
  });

  it('sets archived_at timestamp in frontmatter', () => {
    const before = Date.now();
    const result = addArchivalHeader(SAMPLE_PROMPT, 'Plan', '0');
    const parsed = parsePromptFile(result);

    const archivedAt = parsed.frontmatter['archived_at'] as string;
    expect(archivedAt).toBeTruthy();
    const archivedTime = new Date(archivedAt).getTime();
    expect(archivedTime).toBeGreaterThanOrEqual(before - 1000);
    expect(archivedTime).toBeLessThanOrEqual(Date.now() + 1000);
  });

  it('preserves original body content after the archival header', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'My Plan', '0, 1');

    expect(result).toContain('# Setup Prompt');
    expect(result).toContain('Do the setup steps.');
  });

  it('preserves original frontmatter fields (agent, version, plan_id)', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'My Plan', '0, 1');
    const parsed = parsePromptFile(result);

    expect(parsed.frontmatter['agent']).toBe('Executor');
    expect(parsed.frontmatter['version']).toBe('1.0.0');
    expect(parsed.frontmatter['plan_id']).toBe('plan_test');
  });

  it('archived prompt is still parseable by parsePromptFile', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'Plan X', '2, 3');
    const parsed = parsePromptFile(result);

    expect(parsed.frontmatter).toBeDefined();
    expect(parsed.body).toBeTruthy();
    expect(parsed.body).toContain('ARCHIVED PROMPT');
    expect(parsed.body).toContain('# Setup Prompt');
  });

  it('handles N/A for related steps', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'Plan', 'N/A');
    expect(result).toContain('Related Steps "N/A"');
  });

  it('handles plan title with special characters', () => {
    const result = addArchivalHeader(SAMPLE_PROMPT, 'Plan: "Test" & More', '0');
    expect(result).toContain('ARCHIVED PROMPT');
    // The plan title should appear in the header
    expect(result).toContain('Plan: "Test" & More');
  });
});

// =============================================================================
// archivePlanPrompts (integration-style with mocks)
// =============================================================================

describe('archivePlanPrompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('archives all non-archived prompts and returns count', async () => {
    // listPlanPrompts: exists + readdir
    vi.mocked(exists).mockResolvedValueOnce(true); // promptsDir exists
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'setup.prompt.md',
      'deploy.prompt.md',
    ] as any);

    // loadPlanPrompt for 'setup' — not archived
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(SAMPLE_PROMPT as any);

    // loadPlanPrompt for 'deploy' — not archived
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(
      '---\nagent: "Builder"\ndescription: "deploy"\nversion: "1.0.0"\nstep_indices: [2]\n---\n# Deploy\nDeploy steps.' as any,
    );

    const count = await archivePlanPrompts('ws_test', 'plan_abc', 'Test Plan');

    expect(count).toBe(2);
    expect(fs.writeFile).toHaveBeenCalledTimes(2);

    // Verify the written content includes archival header
    const firstCallContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(firstCallContent).toContain('ARCHIVED PROMPT');
    expect(firstCallContent).toContain('Test Plan');
  });

  it('skips already-archived prompts', async () => {
    // listPlanPrompts
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readdir).mockResolvedValueOnce([
      'old.prompt.md',
      'new.prompt.md',
    ] as any);

    // loadPlanPrompt for 'old' — already archived
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(ALREADY_ARCHIVED_PROMPT as any);

    // loadPlanPrompt for 'new' — not archived
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(SAMPLE_PROMPT as any);

    const count = await archivePlanPrompts('ws_test', 'plan_abc', 'My Plan');

    expect(count).toBe(1); // Only 'new' was archived
    expect(fs.writeFile).toHaveBeenCalledTimes(1);
  });

  it('returns 0 when no prompts exist', async () => {
    vi.mocked(exists).mockResolvedValueOnce(false); // promptsDir doesn't exist

    const count = await archivePlanPrompts('ws_test', 'plan_abc', 'Empty');
    expect(count).toBe(0);
    expect(fs.writeFile).not.toHaveBeenCalled();
  });

  it('includes step_indices as related steps in archival header', async () => {
    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readdir).mockResolvedValueOnce(['step-prompt.prompt.md'] as any);

    vi.mocked(exists).mockResolvedValueOnce(true);
    vi.mocked(fs.readFile).mockResolvedValueOnce(SAMPLE_PROMPT as any);

    await archivePlanPrompts('ws_test', 'plan_abc', 'Plan With Steps');

    const writtenContent = vi.mocked(fs.writeFile).mock.calls[0][1] as string;
    expect(writtenContent).toContain('Related Steps "0, 1"');
  });
});
