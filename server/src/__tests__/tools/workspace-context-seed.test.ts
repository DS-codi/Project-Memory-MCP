/**
 * Tests for auto-seeding workspace context on first registration.
 * Validates that registerWorkspace() populates workspace.context.json
 * from codebase profile data on first-time registrations.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerWorkspace } from '../../tools/workspace.tools.js';

// Mock dependencies
vi.mock('../../storage/db-store.js', () => ({
  resolveWorkspaceIdForPath: vi.fn(),
  getWorkspace: vi.fn(),
  createWorkspace: vi.fn(),
  writeWorkspaceIdentityFile: vi.fn(),
  getWorkspaceContextFromDb: vi.fn(),
  saveWorkspaceContextToDb: vi.fn(),
  nowISO: vi.fn().mockReturnValue('2026-02-10T00:00:00.000Z'),
}));

vi.mock('../../indexing/workspace-indexer.js', () => ({
  indexWorkspace: vi.fn(),
  needsIndexing: vi.fn(),
}));

import * as store from '../../storage/db-store.js';
import { indexWorkspace } from '../../indexing/workspace-indexer.js';
import type { WorkspaceProfile, WorkspaceContext } from '../../types/index.js';

const WORKSPACE_PATH = '/home/user/my-project';
const WORKSPACE_ID = 'my-project-abc123';

const mockProfile: WorkspaceProfile = {
  indexed_at: '2026-02-10T00:00:00.000Z',
  languages: [
    { name: 'TypeScript', percentage: 70, file_count: 50, extensions: ['.ts', '.tsx'] },
    { name: 'JavaScript', percentage: 30, file_count: 20, extensions: ['.js'] },
  ],
  frameworks: ['React', 'Express'],
  build_system: { type: 'npm', config_file: 'package.json', build_command: 'npm run build' },
  test_framework: { name: 'vitest', config_file: 'vitest.config.ts', test_command: 'npx vitest' },
  package_manager: 'npm',
  key_directories: [],
  conventions: {} as any,
  total_files: 70,
  total_lines: 15000,
};

const mockMeta = {
  workspace_id: WORKSPACE_ID,
  name: 'my-project',
  path: WORKSPACE_PATH,
  created_at: '2026-02-10T00:00:00.000Z',
  last_accessed: '2026-02-10T00:00:00.000Z',
  indexed: true,
};

describe('workspace context auto-seeding', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: new workspace, indexing succeeds, no existing context
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue('');
    vi.mocked(store.getWorkspace).mockResolvedValue(null);
    vi.mocked(store.createWorkspace).mockResolvedValue({
      meta: mockMeta as any,
      created: true,
      migration: { action: 'none', canonical_workspace_id: WORKSPACE_ID, legacy_workspace_ids: [], notes: [] },
    });
    vi.mocked(store.writeWorkspaceIdentityFile).mockResolvedValue(undefined as any);
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue(null);
    vi.mocked(store.saveWorkspaceContextToDb).mockResolvedValue(undefined);
    vi.mocked(indexWorkspace).mockResolvedValue(mockProfile);
  });

  it('seeds workspace.context.json on first registration with profile', async () => {
    const result = await registerWorkspace({ workspace_path: WORKSPACE_PATH });
    expect(result.success).toBe(true);
    expect(result.data?.first_time).toBe(true);

    // saveWorkspaceContextToDb should have been called with the context
    expect(store.saveWorkspaceContextToDb).toHaveBeenCalledTimes(1);
    const [wsId, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    expect(wsId).toBe(WORKSPACE_ID);

    const ctx = context as WorkspaceContext;
    expect(ctx.schema_version).toBe('1.0');
    expect(ctx.workspace_id).toBe(WORKSPACE_ID);
    expect(ctx.sections.project_details).toBeDefined();
    expect(ctx.sections.project_details.summary).toContain('TypeScript');
    expect(ctx.sections.project_details.summary).toContain('React');
    expect(ctx.sections.dependencies).toBeDefined();
    expect(ctx.sections.dependencies.items).toHaveLength(2); // React, Express
  });

  it('includes build system and test framework in project_details items', async () => {
    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    const [, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    const ctx = context as WorkspaceContext;
    const items = ctx.sections.project_details.items!;

    const titles = items.map(i => i.title);
    expect(titles).toContain('TypeScript');
    expect(titles).toContain('JavaScript');
    expect(titles).toContain('Build: npm');
    expect(titles).toContain('Tests: vitest');
    expect(titles).toContain('Package Manager: npm');
  });

  it('does not overwrite existing context', async () => {
    // Simulate existing context
    vi.mocked(store.getWorkspaceContextFromDb).mockResolvedValue({
      schema_version: '1.0',
      workspace_id: WORKSPACE_ID,
      sections: { project_details: { summary: 'Existing' } },
    } as never);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    // saveWorkspaceContextToDb should NOT have been called (context already exists)
    expect(store.saveWorkspaceContextToDb).not.toHaveBeenCalled();
  });

  it('does not seed context for re-registrations (not first time)', async () => {
    // Existing workspace
    vi.mocked(store.getWorkspace).mockResolvedValue(mockMeta as any);
    vi.mocked(store.createWorkspace).mockResolvedValue({
      meta: mockMeta as any,
      created: false, // Not first time
      migration: { action: 'none', canonical_workspace_id: WORKSPACE_ID, legacy_workspace_ids: [], notes: [] },
    });
    // Needs re-indexing
    const { needsIndexing } = await import('../../indexing/workspace-indexer.js');
    vi.mocked(needsIndexing).mockResolvedValue(true);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    // Should not seed because isFirstTime is false
    expect(store.saveWorkspaceContextToDb).not.toHaveBeenCalled();
  });

  it('does not seed context when indexing fails (no profile)', async () => {
    vi.mocked(indexWorkspace).mockRejectedValue(new Error('indexing failed'));

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    // No profile means no seeding
    expect(store.saveWorkspaceContextToDb).not.toHaveBeenCalled();
  });

  it('handles seeding failure gracefully (non-fatal)', async () => {
    vi.mocked(store.saveWorkspaceContextToDb).mockRejectedValue(new Error('disk full'));

    const result = await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    // Registration should still succeed even if seeding fails
    expect(result.success).toBe(true);
    expect(result.data?.first_time).toBe(true);
  });

  it('omits dependencies section when no frameworks detected', async () => {
    const profileNoFrameworks = { ...mockProfile, frameworks: [] };
    vi.mocked(indexWorkspace).mockResolvedValue(profileNoFrameworks);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    const [, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    const ctx = context as WorkspaceContext;
    expect(ctx.sections.dependencies).toBeUndefined();
  });

  it('seeds with minimal profile (no build_system, test_framework, or package_manager)', async () => {
    const minimalProfile: WorkspaceProfile = {
      ...mockProfile,
      languages: [{ name: 'Python', percentage: 100, file_count: 10, extensions: ['.py'] }],
      frameworks: [],
      build_system: undefined as any,
      test_framework: undefined as any,
      package_manager: undefined as any,
    };
    vi.mocked(indexWorkspace).mockResolvedValue(minimalProfile);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    const [, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    const ctx = context as WorkspaceContext;
    expect(ctx.sections.project_details.summary).toContain('Python');
    // Only language items, no build/test/package manager items
    const items = ctx.sections.project_details.items!;
    expect(items).toHaveLength(1);
    expect(items[0].title).toBe('Python');
    expect(ctx.sections.dependencies).toBeUndefined();
  });

  it('seeds with empty languages array (no languages detected)', async () => {
    const emptyLangsProfile: WorkspaceProfile = {
      ...mockProfile,
      languages: [],
      frameworks: ['Docker'],
      build_system: undefined as any,
      test_framework: undefined as any,
      package_manager: undefined as any,
    };
    vi.mocked(indexWorkspace).mockResolvedValue(emptyLangsProfile);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    const [, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    const ctx = context as WorkspaceContext;
    // Summary should still mention Docker framework
    expect(ctx.sections.project_details.summary).toContain('Docker');
    // No language items
    expect(ctx.sections.project_details.items).toHaveLength(0);
    // Dependencies section should exist with Docker
    expect(ctx.sections.dependencies).toBeDefined();
    expect(ctx.sections.dependencies.items).toHaveLength(1);
  });

  it('seeds with completely empty profile (no languages, no frameworks)', async () => {
    const emptyProfile: WorkspaceProfile = {
      ...mockProfile,
      languages: [],
      frameworks: [],
      build_system: undefined as any,
      test_framework: undefined as any,
      package_manager: undefined as any,
    };
    vi.mocked(indexWorkspace).mockResolvedValue(emptyProfile);

    await registerWorkspace({ workspace_path: WORKSPACE_PATH });

    const [, context] = vi.mocked(store.saveWorkspaceContextToDb).mock.calls[0];
    const ctx = context as WorkspaceContext;
    expect(ctx.sections.project_details.summary).toContain('no specific stack detected');
    expect(ctx.sections.project_details.items).toHaveLength(0);
    expect(ctx.sections.dependencies).toBeUndefined();
  });
});
