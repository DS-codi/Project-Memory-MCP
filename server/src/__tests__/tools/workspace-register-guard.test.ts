import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import type { MemoryWorkspaceParams } from '../../tools/consolidated/memory_workspace.js';
import * as workspaceTools from '../../tools/workspace.tools.js';
import * as store from '../../storage/file-store.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import type { WorkspaceOverlapInfo, WorkspaceMeta } from '../../types/index.js';

vi.mock('../../tools/workspace.tools.js');
vi.mock('../../storage/file-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeOverlap(overrides: Partial<WorkspaceOverlapInfo> = {}): WorkspaceOverlapInfo {
  return {
    overlap_detected: true,
    relationship: 'child',
    existing_workspace_id: 'existing-ws-aabbcc112233',
    existing_workspace_path: '/projects/existing-workspace',
    existing_workspace_name: 'existing-workspace',
    suggested_action: 'link',
    message: 'Directory overlaps with an existing workspace.',
    ...overrides,
  };
}

function makeWorkspaceMeta(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    workspace_id: 'new-ws-aabbcc112233',
    name: 'New Workspace',
    path: '/projects/new-workspace',
    created_at: '2026-02-14T10:00:00Z',
    active_plans: [],
    archived_plans: [],
    ...overrides,
  };
}

// ===========================================================================
// Registration Guard — overlap detection at tool handler level
// ===========================================================================
describe('Registration Guard: Overlap Detection', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default: validation passes
    vi.spyOn(validation, 'validateAndResolveWorkspaceId').mockResolvedValue({
      success: true,
      workspace_id: 'new-ws-aabbcc112233',
    });
  });

  // -------------------------------------------------------------------------
  // (1) Registering a subdirectory of an existing workspace
  // -------------------------------------------------------------------------
  it('returns overlap with relationship=child when registering a subdirectory', async () => {
    const childOverlap = makeOverlap({
      relationship: 'child',
      existing_workspace_id: 'parent-ws-aabbcc112233',
      existing_workspace_path: '/projects/monorepo',
      existing_workspace_name: 'monorepo',
      message: 'Directory is inside existing workspace "monorepo".',
    });

    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: true,
      data: {
        workspace: null as unknown as WorkspaceMeta,
        first_time: false,
        indexed: false,
        overlap_detected: true,
        overlaps: [childOverlap],
        message: 'Workspace registration blocked: directory overlaps with existing workspace(s). Use force=true to override.',
      },
    });

    const params: MemoryWorkspaceParams = {
      action: 'register',
      workspace_path: '/projects/monorepo/packages/api',
    };

    const result = await memoryWorkspace(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'register') {
      expect(result.data.data.overlap_detected).toBe(true);
      expect(result.data.data.overlaps).toHaveLength(1);
      expect(result.data.data.overlaps![0].relationship).toBe('child');
      expect(result.data.data.overlaps![0].existing_workspace_id).toBe('parent-ws-aabbcc112233');
      expect(result.data.data.message).toContain('force=true');
    }
  });

  // -------------------------------------------------------------------------
  // (2) Registering a parent directory of an existing workspace
  // -------------------------------------------------------------------------
  it('returns overlap with relationship=parent when registering a parent directory', async () => {
    const parentOverlap = makeOverlap({
      relationship: 'parent',
      existing_workspace_id: 'child-ws-ddeeff445566',
      existing_workspace_path: '/projects/monorepo/packages/api',
      existing_workspace_name: 'api',
      message: 'Directory contains existing workspace "api".',
    });

    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: true,
      data: {
        workspace: null as unknown as WorkspaceMeta,
        first_time: false,
        indexed: false,
        overlap_detected: true,
        overlaps: [parentOverlap],
        message: 'Workspace registration blocked: directory overlaps with existing workspace(s). Use force=true to override.',
      },
    });

    const params: MemoryWorkspaceParams = {
      action: 'register',
      workspace_path: '/projects/monorepo',
    };

    const result = await memoryWorkspace(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'register') {
      expect(result.data.data.overlap_detected).toBe(true);
      expect(result.data.data.overlaps).toHaveLength(1);
      expect(result.data.data.overlaps![0].relationship).toBe('parent');
      expect(result.data.data.overlaps![0].existing_workspace_id).toBe('child-ws-ddeeff445566');
    }
  });

  // -------------------------------------------------------------------------
  // (3) force=true bypasses the guard and creates the workspace
  // -------------------------------------------------------------------------
  it('force=true bypasses the guard and creates the workspace', async () => {
    const newMeta = makeWorkspaceMeta();

    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: true,
      data: {
        workspace: newMeta,
        first_time: true,
        indexed: true,
        profile: { total_files: 10, total_lines: 500, languages: ['typescript'], frameworks: [] },
      },
    });

    const params: MemoryWorkspaceParams = {
      action: 'register',
      workspace_path: '/projects/monorepo/packages/api',
      force: true,
    };

    const result = await memoryWorkspace(params);

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'register') {
      expect(result.data.data.workspace.workspace_id).toBe('new-ws-aabbcc112233');
      expect(result.data.data.first_time).toBe(true);
      expect(result.data.data.overlap_detected).toBeUndefined();
    }

    // Verify force was passed through
    expect(workspaceTools.registerWorkspace).toHaveBeenCalledWith(
      expect.objectContaining({ force: true })
    );
  });

  // -------------------------------------------------------------------------
  // (4) Registering a non-overlapping path works normally
  // -------------------------------------------------------------------------
  it('registers normally when no overlaps exist', async () => {
    const newMeta = makeWorkspaceMeta({
      workspace_id: 'standalone-ws-112233',
      name: 'standalone-project',
      path: '/projects/standalone',
    });

    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: true,
      data: {
        workspace: newMeta,
        first_time: true,
        indexed: true,
        profile: { total_files: 5, total_lines: 200, languages: ['python'], frameworks: [] },
      },
    });

    const result = await memoryWorkspace({
      action: 'register',
      workspace_path: '/projects/standalone',
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'register') {
      expect(result.data.data.workspace.workspace_id).toBe('standalone-ws-112233');
      expect(result.data.data.first_time).toBe(true);
      expect(result.data.data.overlap_detected).toBeUndefined();
      expect(result.data.data.overlaps).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // (5) Same-path registration does not flag as overlap (handled by existing)
  // -------------------------------------------------------------------------
  it('does not flag overlap for identical path (already registered)', async () => {
    const existingMeta = makeWorkspaceMeta({
      workspace_id: 'same-ws-aabbcc112233',
      name: 'existing-project',
      path: '/projects/existing-project',
    });

    // When the same path is registered again, createWorkspace finds the
    // existing workspace and returns it without overlap (created=false)
    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: true,
      data: {
        workspace: existingMeta,
        first_time: false,
        indexed: true,
      },
    });

    const result = await memoryWorkspace({
      action: 'register',
      workspace_path: '/projects/existing-project',
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'register') {
      expect(result.data.data.workspace.workspace_id).toBe('same-ws-aabbcc112233');
      expect(result.data.data.first_time).toBe(false);
      // No overlap fields — this is a normal re-registration
      expect(result.data.data.overlap_detected).toBeUndefined();
      expect(result.data.data.overlaps).toBeUndefined();
    }
  });

  // -------------------------------------------------------------------------
  // Error case: registerWorkspace returns error
  // -------------------------------------------------------------------------
  it('propagates error from registerWorkspace', async () => {
    vi.spyOn(workspaceTools, 'registerWorkspace').mockResolvedValue({
      success: false,
      error: 'Permission denied: cannot access /root/secret',
    });

    const result = await memoryWorkspace({
      action: 'register',
      workspace_path: '/root/secret',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Permission denied');
  });
});
