import { describe, it, expect, beforeEach, vi } from 'vitest';
import { memoryWorkspace } from '../../tools/consolidated/memory_workspace.js';
import type { MemoryWorkspaceParams } from '../../tools/consolidated/memory_workspace.js';
import * as workspaceTools from '../../tools/workspace.tools.js';
import * as store from '../../storage/db-store.js';
import * as validation from '../../tools/consolidated/workspace-validation.js';
import * as hierarchy from '../../storage/workspace-hierarchy.js';
import * as identityMod from '../../storage/workspace-identity.js';
import * as opsMod from '../../storage/workspace-operations.js';
import type { WorkspaceMeta } from '../../types/index.js';
import type { WorkspaceHierarchyInfo } from '../../storage/workspace-hierarchy.js';

vi.mock('../../tools/workspace.tools.js');
vi.mock('../../storage/db-store.js');
vi.mock('../../tools/consolidated/workspace-validation.js');
vi.mock('../../storage/workspace-identity.js');
vi.mock('../../storage/workspace-operations.js');
vi.mock('../../storage/workspace-hierarchy.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const PARENT_ID = 'parent-ws-aabbcc112233';
const CHILD_ID = 'child-ws-ddeeff445566';

function makeMeta(overrides: Partial<WorkspaceMeta> = {}): WorkspaceMeta {
  return {
    workspace_id: 'ws-default',
    name: 'Default Workspace',
    path: '/projects/default',
    workspace_path: '/projects/default',
    created_at: '2026-02-14T10:00:00Z',
    active_plans: [],
    archived_plans: [],
    ...overrides,
  };
}

// ===========================================================================
// Link Action Tests
// ===========================================================================
describe('Workspace Link Action', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default validation: passes and returns the same workspace_id
    vi.mocked(validation.validateAndResolveWorkspaceId).mockImplementation(
      async (id: string) => ({
        success: true as const,
        workspace_id: id,
      })
    );

    // Default: ensureIdentityFile is a no-op
    vi.mocked(identityMod.ensureIdentityFile).mockResolvedValue(undefined);
  });

  // -------------------------------------------------------------------------
  // (1) link action with mode='link' creates bidirectional references
  // -------------------------------------------------------------------------
  describe('link mode', () => {
    it('creates bidirectional references and returns hierarchy', async () => {
      const expectedHierarchy: WorkspaceHierarchyInfo = {
        children: [{ id: CHILD_ID, name: 'child-project', path: '/projects/parent/child' }],
      };

      vi.mocked(hierarchy.linkWorkspaces).mockResolvedValue(undefined);
      vi.mocked(hierarchy.getWorkspaceHierarchy).mockResolvedValue(expectedHierarchy);

      const params: MemoryWorkspaceParams = {
        action: 'link',
        workspace_id: PARENT_ID,
        child_workspace_id: CHILD_ID,
        mode: 'link',
      };

      const result = await memoryWorkspace(params);

      expect(result.success).toBe(true);
      expect(hierarchy.linkWorkspaces).toHaveBeenCalledWith(PARENT_ID, CHILD_ID);
      expect(hierarchy.unlinkWorkspaces).not.toHaveBeenCalled();

      if (result.data && result.data.action === 'link') {
        expect(result.data.data.mode).toBe('link');
        expect(result.data.data.parent_id).toBe(PARENT_ID);
        expect(result.data.data.child_id).toBe(CHILD_ID);
        expect(result.data.data.hierarchy.children).toHaveLength(1);
        expect(result.data.data.hierarchy.children[0].id).toBe(CHILD_ID);
      }
    });

    it('defaults to link mode when mode is not specified', async () => {
      vi.mocked(hierarchy.linkWorkspaces).mockResolvedValue(undefined);
      vi.mocked(hierarchy.getWorkspaceHierarchy).mockResolvedValue({ children: [] });

      await memoryWorkspace({
        action: 'link',
        workspace_id: PARENT_ID,
        child_workspace_id: CHILD_ID,
        // mode omitted — should default to 'link'
      });

      expect(hierarchy.linkWorkspaces).toHaveBeenCalledWith(PARENT_ID, CHILD_ID);
      expect(hierarchy.unlinkWorkspaces).not.toHaveBeenCalled();
    });

    it('requires workspace_id (parent)', async () => {
      const result = await memoryWorkspace({
        action: 'link',
        child_workspace_id: CHILD_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('workspace_id');
    });

    it('requires child_workspace_id', async () => {
      const result = await memoryWorkspace({
        action: 'link',
        workspace_id: PARENT_ID,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('child_workspace_id');
    });

    it('returns error when linkWorkspaces throws', async () => {
      vi.mocked(hierarchy.linkWorkspaces).mockRejectedValue(
        new Error('Parent workspace not found: nonexistent')
      );

      const result = await memoryWorkspace({
        action: 'link',
        workspace_id: 'nonexistent',
        child_workspace_id: CHILD_ID,
        mode: 'link',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Parent workspace not found');
    });
  });

  // -------------------------------------------------------------------------
  // (2) link action with mode='unlink' removes references
  // -------------------------------------------------------------------------
  describe('unlink mode', () => {
    it('removes references and returns updated hierarchy', async () => {
      const expectedHierarchy: WorkspaceHierarchyInfo = {
        children: [], // No children after unlink
      };

      vi.mocked(hierarchy.unlinkWorkspaces).mockResolvedValue(undefined);
      vi.mocked(hierarchy.getWorkspaceHierarchy).mockResolvedValue(expectedHierarchy);

      const result = await memoryWorkspace({
        action: 'link',
        workspace_id: PARENT_ID,
        child_workspace_id: CHILD_ID,
        mode: 'unlink',
      });

      expect(result.success).toBe(true);
      expect(hierarchy.unlinkWorkspaces).toHaveBeenCalledWith(PARENT_ID, CHILD_ID);
      expect(hierarchy.linkWorkspaces).not.toHaveBeenCalled();

      if (result.data && result.data.action === 'link') {
        expect(result.data.data.mode).toBe('unlink');
        expect(result.data.data.hierarchy.children).toHaveLength(0);
      }
    });

    it('returns error when unlinkWorkspaces throws', async () => {
      vi.mocked(hierarchy.unlinkWorkspaces).mockRejectedValue(
        new Error('Child workspace not found: missing-child')
      );

      const result = await memoryWorkspace({
        action: 'link',
        workspace_id: PARENT_ID,
        child_workspace_id: 'missing-child',
        mode: 'unlink',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('Child workspace not found');
    });
  });
});

// ===========================================================================
// Info Action — Hierarchy Data
// ===========================================================================
describe('Info Action: Hierarchy Data', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(validation.validateAndResolveWorkspaceId).mockImplementation(
      async (id: string) => ({
        success: true as const,
        workspace_id: id,
      })
    );

    vi.mocked(identityMod.ensureIdentityFile).mockResolvedValue(undefined);
  });

  it('info action returns hierarchy data (parent + children)', async () => {
    const parentMeta = makeMeta({
      workspace_id: PARENT_ID,
      name: 'parent-project',
      path: '/projects/parent',
      workspace_path: '/projects/parent',
      child_workspace_ids: [CHILD_ID],
    });

    const expectedHierarchy: WorkspaceHierarchyInfo = {
      children: [{ id: CHILD_ID, name: 'child-project', path: '/projects/parent/child' }],
    };

    vi.mocked(store.getWorkspace).mockResolvedValue(parentMeta);
    vi.mocked(workspaceTools.getWorkspacePlans).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(hierarchy.getWorkspaceHierarchy).mockResolvedValue(expectedHierarchy);

    const result = await memoryWorkspace({
      action: 'info',
      workspace_id: PARENT_ID,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      expect(result.data.data.hierarchy).toBeDefined();
      expect(result.data.data.hierarchy!.children).toHaveLength(1);
      expect(result.data.data.hierarchy!.children[0].id).toBe(CHILD_ID);
    }
  });

  it('info action returns empty hierarchy for standalone workspace', async () => {
    const standaloneMeta = makeMeta({
      workspace_id: 'standalone-ws-112233',
      name: 'standalone',
    });

    vi.mocked(store.getWorkspace).mockResolvedValue(standaloneMeta);
    vi.mocked(workspaceTools.getWorkspacePlans).mockResolvedValue({
      success: true,
      data: [],
    });
    vi.mocked(hierarchy.getWorkspaceHierarchy).mockResolvedValue({ children: [] });

    const result = await memoryWorkspace({
      action: 'info',
      workspace_id: 'standalone-ws-112233',
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'info') {
      expect(result.data.data.hierarchy).toBeDefined();
      expect(result.data.data.hierarchy!.parent).toBeUndefined();
      expect(result.data.data.hierarchy!.children).toHaveLength(0);
    }
  });
});

// ===========================================================================
// List Action — Hierarchical grouping
// ===========================================================================
describe('List Action: Hierarchical Grouping', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(identityMod.ensureIdentityFile).mockResolvedValue(undefined);
  });

  it('list with hierarchical=true groups children under parents', async () => {
    const parentMeta = makeMeta({
      workspace_id: PARENT_ID,
      name: 'parent-project',
      path: '/projects/parent',
      child_workspace_ids: [CHILD_ID],
    });
    const childMeta = makeMeta({
      workspace_id: CHILD_ID,
      name: 'child-project',
      path: '/projects/parent/child',
      parent_workspace_id: PARENT_ID,
    });
    const standaloneMeta = makeMeta({
      workspace_id: 'standalone-ws-112233',
      name: 'standalone',
      path: '/projects/standalone',
    });

    vi.mocked(workspaceTools.listWorkspaces).mockResolvedValue({
      success: true,
      data: [parentMeta, childMeta, standaloneMeta],
    });

    const result = await memoryWorkspace({
      action: 'list',
      hierarchical: true,
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'list') {
      const list = result.data.data as Array<WorkspaceMeta & { children?: WorkspaceMeta[] }>;

      // Child should NOT appear at top level
      const topLevelIds = list.map(w => w.workspace_id);
      expect(topLevelIds).not.toContain(CHILD_ID);
      expect(topLevelIds).toContain(PARENT_ID);
      expect(topLevelIds).toContain('standalone-ws-112233');

      // Child should be nested under parent
      const parentEntry = list.find(w => w.workspace_id === PARENT_ID);
      expect(parentEntry?.children).toHaveLength(1);
      expect(parentEntry!.children![0].workspace_id).toBe(CHILD_ID);

      // Standalone should have no children
      const standaloneEntry = list.find(w => w.workspace_id === 'standalone-ws-112233');
      expect(standaloneEntry?.children).toBeUndefined();
    }
  });

  it('list without hierarchical returns flat list', async () => {
    const parentMeta = makeMeta({ workspace_id: PARENT_ID, child_workspace_ids: [CHILD_ID] });
    const childMeta = makeMeta({ workspace_id: CHILD_ID, parent_workspace_id: PARENT_ID });

    vi.mocked(workspaceTools.listWorkspaces).mockResolvedValue({
      success: true,
      data: [parentMeta, childMeta],
    });

    const result = await memoryWorkspace({
      action: 'list',
      // hierarchical not set
    });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'list') {
      const list = result.data.data as WorkspaceMeta[];
      // Both should appear at top level in flat mode
      expect(list).toHaveLength(2);
      expect(list.map(w => w.workspace_id).sort()).toEqual([CHILD_ID, PARENT_ID].sort());
    }
  });
});

// ===========================================================================
// Scan Ghosts — Hierarchy Overlaps
// ===========================================================================
describe('Scan Ghosts: Hierarchy Overlaps', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(opsMod.scanGhostFolders).mockResolvedValue([]);
  });

  it('includes hierarchy_overlaps for unlinked overlapping workspaces', async () => {
    // Two workspaces: one is a subdirectory of the other, NOT linked
    const parentMeta = makeMeta({
      workspace_id: PARENT_ID,
      name: 'parent',
      path: '/projects/parent',
      workspace_path: '/projects/parent',
      // No child_workspace_ids — not linked yet
    });
    const childMeta = makeMeta({
      workspace_id: CHILD_ID,
      name: 'child',
      path: '/projects/parent/child',
      workspace_path: '/projects/parent/child',
      // No parent_workspace_id — not linked yet
    });

    vi.mocked(store.getAllWorkspaces).mockResolvedValue([parentMeta, childMeta]);

    // checkRegistryForOverlaps is unmocked (vi.mock'd), so we need to provide an implementation
    vi.mocked(hierarchy.checkRegistryForOverlaps).mockImplementation(
      (workspacePath: string, _registry: Record<string, string>) => {
        // Simulate overlap detection based on path containment
        if (workspacePath.includes('parent/child')) {
          // child is inside parent
          return [{
            overlap_detected: true,
            relationship: 'parent' as const,
            existing_workspace_id: PARENT_ID,
            existing_workspace_path: '/projects/parent',
            existing_workspace_name: 'parent',
            suggested_action: 'link' as const,
            message: 'Directory is inside existing workspace "parent".',
          }];
        }
        if (workspacePath === '/projects/parent') {
          return [{
            overlap_detected: true,
            relationship: 'child' as const,
            existing_workspace_id: CHILD_ID,
            existing_workspace_path: '/projects/parent/child',
            existing_workspace_name: 'child',
            suggested_action: 'link' as const,
            message: 'Directory contains existing workspace "child".',
          }];
        }
        return [];
      }
    );

    const result = await memoryWorkspace({ action: 'scan_ghosts' });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'scan_ghosts') {
      expect(result.data.data.hierarchy_overlaps).toBeDefined();
      // At least one overlap should be reported (deduped: only one pair)
      expect(result.data.data.hierarchy_overlaps!.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('does not include hierarchy_overlaps when all overlapping workspaces are linked', async () => {
    // Two workspaces that ARE linked — AND both appear as children of something,
    // so both IDs end up in the linkedIds set. The scan_ghosts handler only
    // filters an overlap pair when BOTH workspace IDs are in linkedIds.
    const grandparentId = 'grandparent-ws-000000000000';
    const parentMeta = makeMeta({
      workspace_id: PARENT_ID,
      path: '/projects/parent',
      workspace_path: '/projects/parent',
      child_workspace_ids: [CHILD_ID],
      parent_workspace_id: grandparentId, // parent is also a child (linked)
    });
    const childMeta = makeMeta({
      workspace_id: CHILD_ID,
      path: '/projects/parent/child',
      workspace_path: '/projects/parent/child',
      parent_workspace_id: PARENT_ID,
    });
    const grandparentMeta = makeMeta({
      workspace_id: grandparentId,
      path: '/projects',
      workspace_path: '/projects',
      child_workspace_ids: [PARENT_ID],
    });

    vi.mocked(store.getAllWorkspaces).mockResolvedValue([grandparentMeta, parentMeta, childMeta]);

    // checkRegistryForOverlaps returns overlap between parent and child
    vi.mocked(hierarchy.checkRegistryForOverlaps).mockImplementation(
      (workspacePath: string, _registry: Record<string, string>) => {
        if (workspacePath === '/projects/parent') {
          return [{
            overlap_detected: true,
            relationship: 'child' as const,
            existing_workspace_id: CHILD_ID,
            existing_workspace_path: '/projects/parent/child',
            existing_workspace_name: 'child',
            suggested_action: 'link' as const,
            message: 'Already linked.',
          }];
        }
        return [];
      }
    );

    const result = await memoryWorkspace({ action: 'scan_ghosts' });

    expect(result.success).toBe(true);
    if (result.data && result.data.action === 'scan_ghosts') {
      // The parent-child pair should be filtered because both IDs are in linkedIds:
      // - PARENT_ID is in linkedIds (it has parent_workspace_id)
      // - CHILD_ID is in linkedIds (it has parent_workspace_id AND appears in parent's child_workspace_ids)
      expect(result.data.data.hierarchy_overlaps ?? []).toHaveLength(0);
    }
  });
});
