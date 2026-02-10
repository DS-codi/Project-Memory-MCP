/**
 * Tests for workspace context injection in agent init.
 *
 * Tests buildWorkspaceContextSummary() from workspace-context-summary.ts:
 * 1. include_workspace_context=true adds workspace_context_summary
 * 2. Summary contains correct section names/counts
 * 3. include_workspace_context=false does NOT include the field
 * 4. Graceful handling when workspace.context.json doesn't exist
 * 5. Staleness warning when context is >30 days old
 * 6. No staleness warning for recently updated context
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  buildWorkspaceContextSummary,
  daysOld,
  KNOWLEDGE_STALE_DAYS,
} from '../../utils/workspace-context-summary.js';
import * as store from '../../storage/file-store.js';

vi.mock('../../storage/file-store.js');

const WORKSPACE_ID = 'test-workspace-abc123';

const mockContextWithSections = {
  schema_version: '1.0.0',
  workspace_id: WORKSPACE_ID,
  workspace_path: '/some/path',
  name: 'Test Project',
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-02-09T00:00:00.000Z', // Recent
  sections: {
    project_details: {
      summary: 'A TypeScript MCP server project',
      items: [
        { title: 'Language', description: 'TypeScript' },
        { title: 'Runtime', description: 'Node.js' },
      ],
    },
    dependencies: {
      summary: 'Key dependencies for the project',
      items: [
        { title: '@modelcontextprotocol/sdk' },
        { title: 'vitest' },
        { title: 'zod' },
      ],
    },
    architecture: {
      summary: 'Modular architecture with tools, storage, and types',
    },
    empty_section: {},
  },
};

const mockStaleContext = {
  ...mockContextWithSections,
  updated_at: '2025-12-01T00:00:00.000Z', // ~70 days old from Feb 10 2026
};

describe('buildWorkspaceContextSummary', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // enrichWithKnowledgeFiles calls store.getWorkspacePath for listing
    vi.mocked(store.getWorkspacePath).mockReturnValue(`/data/${WORKSPACE_ID}`);
  });

  it('returns summary with correct section names and item counts', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue(mockContextWithSections);

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.sections).toHaveProperty('project_details');
    expect(result!.sections).toHaveProperty('dependencies');
    expect(result!.sections).toHaveProperty('architecture');
    expect(result!.sections).toHaveProperty('empty_section');

    expect(result!.sections.project_details).toEqual({
      summary: 'A TypeScript MCP server project',
      item_count: 2,
    });
    expect(result!.sections.dependencies).toEqual({
      summary: 'Key dependencies for the project',
      item_count: 3,
    });
    expect(result!.sections.architecture).toEqual({
      summary: 'Modular architecture with tools, storage, and types',
      item_count: 0,
    });
    expect(result!.sections.empty_section).toEqual({
      summary: undefined,
      item_count: 0,
    });
  });

  it('includes updated_at from the context', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue(mockContextWithSections);

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.updated_at).toBe('2026-02-09T00:00:00.000Z');
  });

  it('returns undefined when context file does not exist', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue(null);

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeUndefined();
  });

  it('returns undefined when context has no sections', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      sections: undefined,
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeUndefined();
  });

  it('does NOT include stale_context_warning for recent context', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue(mockContextWithSections);

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeUndefined();
  });

  it('includes stale_context_warning when context is older than 30 days', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue(mockStaleContext);

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeDefined();
    expect(result!.stale_context_warning).toContain('days ago');
    expect(result!.stale_context_warning).toContain('consider refreshing');
  });

  it('handles context with empty sections record', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      sections: {},
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(Object.keys(result!.sections)).toHaveLength(0);
  });

  it('handles missing updated_at gracefully (no staleness warning)', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      updated_at: undefined,
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeUndefined();
    expect(result!.updated_at).toBeUndefined();
  });

  it('skips null section entries', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      sections: {
        valid: { summary: 'Valid', items: [{ title: 'A' }] },
        null_section: null,
      },
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.sections).toHaveProperty('valid');
    expect(result!.sections).not.toHaveProperty('null_section');
  });

  it('triggers staleness warning at exactly 30 days (boundary)', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    const exactly30DaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      updated_at: exactly30DaysAgo,
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeDefined();
    expect(result!.stale_context_warning).toContain('30 days ago');
  });

  it('does NOT trigger staleness at 29 days (just under threshold)', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    const twentyNineDaysAgo = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000).toISOString();
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      updated_at: twentyNineDaysAgo,
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeUndefined();
  });

  it('handles invalid updated_at string without producing a false warning', async () => {
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue('/data/test/workspace.context.json');
    vi.mocked(store.readJson).mockResolvedValue({
      ...mockContextWithSections,
      updated_at: 'not-a-valid-date',
    });

    const result = await buildWorkspaceContextSummary(WORKSPACE_ID);

    expect(result).toBeDefined();
    expect(result!.stale_context_warning).toBeUndefined();
    expect(result!.updated_at).toBe('not-a-valid-date');
  });
});

describe('daysOld', () => {
  it('calculates correct age for a recent date', () => {
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(daysOld(yesterday)).toBe(1);
  });

  it('returns 0 for today', () => {
    const today = new Date().toISOString();
    expect(daysOld(today)).toBe(0);
  });

  it('returns NaN for invalid date string', () => {
    expect(daysOld('not-a-date')).toBeNaN();
  });

  it('handles empty string', () => {
    expect(daysOld('')).toBeNaN();
  });
});

describe('KNOWLEDGE_STALE_DAYS', () => {
  it('is set to 60', () => {
    expect(KNOWLEDGE_STALE_DAYS).toBe(60);
  });
});
