/**
 * Cross-machine workspace context validation tests.
 *
 * Verifies that:
 * 1. Context CRUD succeeds when workspace exists by ID, even if path differs.
 * 2. readWorkspaceIdentityFile() accepts workspace_id match despite path mismatch.
 * 3. Non-existent workspace_id still fails.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as workspaceContextTools from '../../tools/workspace-context.tools.js';
import * as store from '../../storage/file-store.js';
import { promises as fs } from 'fs';

// Mock the storage layer so we can simulate cross-machine scenarios
vi.mock('../../storage/file-store.js');
vi.mock('../../security/sanitize.js', () => ({
  sanitizeJsonData: (data: unknown) => data,
}));
vi.mock('../../logging/workspace-update-log.js', () => ({
  appendWorkspaceFileUpdate: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('fs', async () => {
  const actual = await vi.importActual<typeof import('fs')>('fs');
  return {
    ...actual,
    promises: {
      ...actual.promises,
      unlink: vi.fn().mockResolvedValue(undefined),
    },
  };
});

const WORKSPACE_ID = 'project-memory-mcp-ed224621605f';
const DIFFERENT_MACHINE_PATH = '/mnt/remote/my-project';
const ORIGINAL_PATH = 'c:\\Users\\User\\my-project';

const mockWorkspace = {
  workspace_id: WORKSPACE_ID,
  workspace_path: ORIGINAL_PATH,
  path: ORIGINAL_PATH,
  name: 'Test Project',
  indexed: true,
};

const mockContext = {
  schema_version: '1.0.0',
  workspace_id: WORKSPACE_ID,
  workspace_path: ORIGINAL_PATH,
  name: 'Test Project',
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  sections: {
    project_details: {
      summary: 'A test project',
      items: [{ title: 'Language', description: 'TypeScript' }],
    },
  },
};

describe('Cross-machine workspace context validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Simulate: workspace exists by ID
    vi.mocked(store.getWorkspace).mockResolvedValue(mockWorkspace as any);

    // Simulate: path resolves to a DIFFERENT ID (different machine)
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue('different-machine-id');

    vi.mocked(store.getWorkspaceContextPath).mockReturnValue(
      `/data/${WORKSPACE_ID}/workspace.context.json`
    );

    vi.mocked(store.nowISO).mockReturnValue('2026-02-10T00:00:00Z');
  });

  describe('getWorkspaceContext', () => {
    it('should succeed when workspace exists by ID even if path resolves to different ID', async () => {
      vi.mocked(store.readJson).mockResolvedValue(mockContext);

      const result = await workspaceContextTools.getWorkspaceContext({
        workspace_id: WORKSPACE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data?.context).toEqual(mockContext);
      // The key assertion: path mismatch did NOT block the operation
      expect(store.getWorkspace).toHaveBeenCalledWith(WORKSPACE_ID);
    });

    it('should still fail when workspace_id does not exist', async () => {
      vi.mocked(store.getWorkspace).mockResolvedValue(null);

      const result = await workspaceContextTools.getWorkspaceContext({
        workspace_id: 'non-existent-workspace',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace not found');
    });
  });

  describe('setWorkspaceContext', () => {
    it('should succeed with cross-machine path mismatch', async () => {
      vi.mocked(store.readJson).mockResolvedValue(null); // No existing context
      vi.mocked(store.writeJsonLocked).mockResolvedValue(undefined);
      vi.mocked(store.getWorkspaceIdentityPath).mockReturnValue(
        `${DIFFERENT_MACHINE_PATH}/.projectmemory/identity.json`
      );

      const result = await workspaceContextTools.setWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          sections: {
            project_details: {
              summary: 'Cross-machine update',
              items: [{ title: 'Updated from', description: 'different machine' }],
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.project_details.summary).toBe(
        'Cross-machine update'
      );
    });
  });

  describe('updateWorkspaceContext', () => {
    it('should succeed with cross-machine path mismatch', async () => {
      vi.mocked(store.readJson).mockResolvedValue(mockContext);
      vi.mocked(store.writeJsonLocked).mockResolvedValue(undefined);
      vi.mocked(store.getWorkspaceIdentityPath).mockReturnValue(
        `${DIFFERENT_MACHINE_PATH}/.projectmemory/identity.json`
      );

      const result = await workspaceContextTools.updateWorkspaceContext({
        workspace_id: WORKSPACE_ID,
        data: {
          sections: {
            project_details: {
              summary: 'Updated summary from remote',
            },
          },
        },
      });

      expect(result.success).toBe(true);
      expect(result.data?.context.sections.project_details.summary).toBe(
        'Updated summary from remote'
      );
    });
  });

  describe('deleteWorkspaceContext', () => {
    it('should succeed with cross-machine path mismatch', async () => {
      vi.mocked(store.exists).mockResolvedValue(true);

      const result = await workspaceContextTools.deleteWorkspaceContext({
        workspace_id: WORKSPACE_ID,
      });

      expect(result.success).toBe(true);
      expect(result.data?.deleted).toBe(true);
    });

    it('should still fail when workspace_id does not exist', async () => {
      vi.mocked(store.getWorkspace).mockResolvedValue(null);

      const result = await workspaceContextTools.deleteWorkspaceContext({
        workspace_id: 'non-existent-workspace',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Workspace not found');
    });
  });
});

describe('loadWorkspace edge cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(store.getWorkspace).mockResolvedValue(mockWorkspace as any);
    vi.mocked(store.getWorkspaceContextPath).mockReturnValue(
      `/data/${WORKSPACE_ID}/workspace.context.json`
    );
    vi.mocked(store.nowISO).mockReturnValue('2026-02-10T00:00:00Z');
  });

  it('should succeed even when resolveWorkspaceIdForPath throws (unreachable path)', async () => {
    // Simulates a workspace path that cannot be resolved on this machine
    vi.mocked(store.resolveWorkspaceIdForPath).mockRejectedValue(
      new Error('ENOENT: path not found')
    );
    vi.mocked(store.readJson).mockResolvedValue(mockContext);

    const result = await workspaceContextTools.getWorkspaceContext({
      workspace_id: WORKSPACE_ID,
    });

    expect(result.success).toBe(true);
    expect(result.data?.context).toEqual(mockContext);
  });

  it('should fail with empty workspace_id', async () => {
    const result = await workspaceContextTools.getWorkspaceContext({
      workspace_id: '',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('required');
  });

  it('should succeed when workspace has no workspace_path (only path)', async () => {
    // Some legacy workspaces might only have 'path' but not 'workspace_path'
    const legacyWorkspace = {
      workspace_id: WORKSPACE_ID,
      path: ORIGINAL_PATH,
      name: 'Legacy Workspace',
      indexed: true,
      // workspace_path intentionally omitted
    };
    vi.mocked(store.getWorkspace).mockResolvedValue(legacyWorkspace as any);
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue(WORKSPACE_ID);
    vi.mocked(store.readJson).mockResolvedValue(mockContext);

    const result = await workspaceContextTools.getWorkspaceContext({
      workspace_id: WORKSPACE_ID,
    });

    expect(result.success).toBe(true);
  });

  it('should return context not found when context file does not exist', async () => {
    vi.mocked(store.resolveWorkspaceIdForPath).mockResolvedValue(WORKSPACE_ID);
    vi.mocked(store.readJson).mockResolvedValue(null);

    const result = await workspaceContextTools.getWorkspaceContext({
      workspace_id: WORKSPACE_ID,
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('not found');
  });
});
