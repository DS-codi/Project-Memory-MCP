import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import path from 'path';
import os from 'os';
import { promises as fs } from 'fs';
import { normalizeWorkspacePath, getWorkspace } from '../../storage/db-store.js';
import * as mod from '../../storage/workspace-hierarchy.js';
import { _resetConnectionForTesting, getDb } from '../../db/connection.js';
import { runMigrations } from '../../db/migration-runner.js';
import { createWorkspace as dbCreateWorkspace } from '../../db/workspace-db.js';

// ---------------------------------------------------------------------------
// Test-data root & workspace paths — isolated per test run
// Use OS temp directory so scanUpForParent doesn't find the real project's
// identity.json above the test workspace.
// ---------------------------------------------------------------------------
const TEST_BASE = path.join(os.tmpdir(), '__pm_hierarchy_test__');
const TEST_DATA_ROOT = path.join(TEST_BASE, 'data');
const TEST_WORKSPACE_PATH = path.join(TEST_BASE, 'ws');

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------
beforeAll(async () => {
  await fs.mkdir(TEST_DATA_ROOT, { recursive: true });
  await fs.mkdir(TEST_WORKSPACE_PATH, { recursive: true });
  process.env.MBS_DATA_ROOT = TEST_DATA_ROOT;
  process.env.PM_DATA_ROOT = TEST_DATA_ROOT;
  _resetConnectionForTesting();
  await runMigrations();
});

afterAll(async () => {
  delete process.env.MBS_DATA_ROOT;
  delete process.env.PM_DATA_ROOT;
  _resetConnectionForTesting();
  await fs.rm(TEST_BASE, { recursive: true, force: true }).catch(() => {});
});

beforeEach(async () => {
  // Delete subdirs inside TEST_DATA_ROOT but skip SQLite DB files
  try {
    const entries = await fs.readdir(TEST_DATA_ROOT, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name.startsWith('project-memory.db')) continue;
      await fs.rm(path.join(TEST_DATA_ROOT, entry.name), { recursive: true, force: true });
    }
  } catch { /* directory may not exist yet */ }
  // Reset workspace directory
  await fs.rm(TEST_WORKSPACE_PATH, { recursive: true, force: true }).catch(() => {});
  await fs.mkdir(TEST_WORKSPACE_PATH, { recursive: true });
  // Clear all workspace rows for test isolation
  getDb().exec('DELETE FROM workspaces');
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a `.projectmemory/identity.json` in the given directory */
async function createIdentityFile(
  workspacePath: string,
  workspaceId: string,
  overrides: Record<string, unknown> = {}
) {
  const identityDir = path.join(workspacePath, '.projectmemory');
  await fs.mkdir(identityDir, { recursive: true });
  const identity = {
    schema_version: '1.0.0',
    workspace_id: workspaceId,
    workspace_path: workspacePath,
    data_root: TEST_DATA_ROOT,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
  await fs.writeFile(
    path.join(identityDir, 'identity.json'),
    JSON.stringify(identity, null, 2),
    'utf-8'
  );
  return identity;
}

/** Create a fake workspace.meta.json in the test data root and register in DB */
async function createFakeWorkspaceMeta(
  workspaceId: string,
  workspacePath: string,
  overrides: Record<string, unknown> = {}
) {
  const wsDir = path.join(TEST_DATA_ROOT, workspaceId);
  await fs.mkdir(wsDir, { recursive: true });
  const meta = {
    schema_version: '1.0.0',
    workspace_id: workspaceId,
    name: path.basename(workspacePath),
    path: workspacePath,
    workspace_path: workspacePath,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    active_plans: [],
    archived_plans: [],
    ...overrides,
  };
  await fs.writeFile(
    path.join(wsDir, 'workspace.meta.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  );
  await dbCreateWorkspace({ id: workspaceId, path: workspacePath, name: path.basename(workspacePath) });
  return meta;
}

// ===========================================================================
// scanUpForParent
// ===========================================================================
describe('scanUpForParent', () => {
  it('finds parent identity.json above startPath', async () => {
    // Create a parent workspace one level up from the child
    const parentPath = TEST_WORKSPACE_PATH;
    const childPath = path.join(TEST_WORKSPACE_PATH, 'packages', 'child-project');
    await fs.mkdir(childPath, { recursive: true });

    const parentId = 'parent-workspace-aabbcc112233';
    await createIdentityFile(parentPath, parentId);

    const result = await mod.scanUpForParent(childPath);

    expect(result).not.toBeNull();
    expect(result!.workspaceId).toBe(parentId);
    expect(result!.workspacePath).toBe(parentPath);
  });

  it('returns null when no parent exists', async () => {
    // The child directory has no identity.json anywhere above it
    const childPath = path.join(TEST_WORKSPACE_PATH, 'isolated-project');
    await fs.mkdir(childPath, { recursive: true });

    const result = await mod.scanUpForParent(childPath);

    expect(result).toBeNull();
  });

  it('skips identity.json with mismatched workspace_path', async () => {
    // Create an identity.json that points to a different path (stale copy)
    const parentPath = TEST_WORKSPACE_PATH;
    const childPath = path.join(TEST_WORKSPACE_PATH, 'subdir');
    await fs.mkdir(childPath, { recursive: true });

    await createIdentityFile(parentPath, 'stale-id-000000000000', {
      workspace_path: '/some/totally/different/path',
    });

    const result = await mod.scanUpForParent(childPath);

    // readWorkspaceIdentityFile should reject the mismatched-path identity
    expect(result).toBeNull();
  });
});

// ===========================================================================
// scanDownForChildren
// ===========================================================================
describe('scanDownForChildren', () => {
  it('finds child identity.json files in subdirectories', async () => {
    const childAPath = path.join(TEST_WORKSPACE_PATH, 'projects', 'child-a');
    const childBPath = path.join(TEST_WORKSPACE_PATH, 'projects', 'child-b');
    await fs.mkdir(childAPath, { recursive: true });
    await fs.mkdir(childBPath, { recursive: true });

    await createIdentityFile(childAPath, 'child-a-aabb11223344');
    await createIdentityFile(childBPath, 'child-b-ccdd55667788');

    const results = await mod.scanDownForChildren(TEST_WORKSPACE_PATH);

    expect(results).toHaveLength(2);
    const ids = results.map(r => r.workspaceId).sort();
    expect(ids).toEqual(['child-a-aabb11223344', 'child-b-ccdd55667788']);
  });

  it('respects maxDepth parameter', async () => {
    // Child at depth 1 (should be found even with maxDepth=1)
    const shallowChild = path.join(TEST_WORKSPACE_PATH, 'shallow');
    await fs.mkdir(shallowChild, { recursive: true });
    await createIdentityFile(shallowChild, 'shallow-aabbcc112233');

    // Child at depth 3 (should NOT be found with maxDepth=1)
    const deepChild = path.join(TEST_WORKSPACE_PATH, 'a', 'b', 'deep');
    await fs.mkdir(deepChild, { recursive: true });
    await createIdentityFile(deepChild, 'deep-ddeeff445566');

    const results = await mod.scanDownForChildren(TEST_WORKSPACE_PATH, 1);

    expect(results).toHaveLength(1);
    expect(results[0].workspaceId).toBe('shallow-aabbcc112233');
  });

  it('skips node_modules, .git, dist directories', async () => {
    // Create identity.json in directories that should be skipped
    const nodeModulesChild = path.join(TEST_WORKSPACE_PATH, 'node_modules', 'some-pkg');
    const gitChild = path.join(TEST_WORKSPACE_PATH, '.git', 'hooks');
    const distChild = path.join(TEST_WORKSPACE_PATH, 'dist', 'output');
    const validChild = path.join(TEST_WORKSPACE_PATH, 'valid-project');

    await fs.mkdir(nodeModulesChild, { recursive: true });
    await fs.mkdir(gitChild, { recursive: true });
    await fs.mkdir(distChild, { recursive: true });
    await fs.mkdir(validChild, { recursive: true });

    await createIdentityFile(nodeModulesChild, 'should-skip-nm');
    await createIdentityFile(gitChild, 'should-skip-git');
    await createIdentityFile(distChild, 'should-skip-dist');
    await createIdentityFile(validChild, 'valid-child-aabbcc112233');

    const results = await mod.scanDownForChildren(TEST_WORKSPACE_PATH);

    expect(results).toHaveLength(1);
    expect(results[0].workspaceId).toBe('valid-child-aabbcc112233');
  });

  it('does not recurse into child workspace subtrees', async () => {
    // Child workspace at depth 1
    const childPath = path.join(TEST_WORKSPACE_PATH, 'child-ws');
    await fs.mkdir(childPath, { recursive: true });
    await createIdentityFile(childPath, 'child-ws-aabbcc112233');

    // Grandchild inside the child workspace
    const grandchildPath = path.join(childPath, 'packages', 'grandchild');
    await fs.mkdir(grandchildPath, { recursive: true });
    await createIdentityFile(grandchildPath, 'grandchild-ddeeff445566');

    const results = await mod.scanDownForChildren(TEST_WORKSPACE_PATH);

    // Should only find the child, not the grandchild
    expect(results).toHaveLength(1);
    expect(results[0].workspaceId).toBe('child-ws-aabbcc112233');
  });
});

// ===========================================================================
// detectOverlaps
// ===========================================================================
describe('detectOverlaps', () => {
  it('combines both scan directions into WorkspaceOverlapInfo[]', async () => {
    // Set up a parent directory with identity
    const parentPath = path.dirname(TEST_WORKSPACE_PATH);
    // Only create the identity if we can write to the parent
    // Instead, create a child in the workspace path
    const childPath = path.join(TEST_WORKSPACE_PATH, 'sub-project');
    await fs.mkdir(childPath, { recursive: true });
    await createIdentityFile(childPath, 'child-overlap-aabb11');

    const overlaps = await mod.detectOverlaps(TEST_WORKSPACE_PATH);

    // Should detect at least the child overlap
    expect(overlaps.length).toBeGreaterThanOrEqual(1);

    const childOverlap = overlaps.find(o => o.existing_workspace_id === 'child-overlap-aabb11');
    expect(childOverlap).toBeDefined();
    expect(childOverlap!.relationship).toBe('child');
    expect(childOverlap!.overlap_detected).toBe(true);
    expect(childOverlap!.suggested_action).toBe('link');
  });

  it('returns empty array when no overlaps exist', async () => {
    // No identity files anywhere near the workspace
    const overlaps = await mod.detectOverlaps(TEST_WORKSPACE_PATH);
    expect(overlaps).toEqual([]);
  });

  it('detects parent overlap when parent identity exists', async () => {
    // Create identity in the workspace root
    const parentPath = TEST_WORKSPACE_PATH;
    await createIdentityFile(parentPath, 'parent-ws-aabbcc112233');

    // Create a child directory to scan from
    const childPath = path.join(TEST_WORKSPACE_PATH, 'packages', 'child');
    await fs.mkdir(childPath, { recursive: true });

    const overlaps = await mod.detectOverlaps(childPath);

    const parentOverlap = overlaps.find(o => o.relationship === 'parent');
    expect(parentOverlap).toBeDefined();
    expect(parentOverlap!.existing_workspace_id).toBe('parent-ws-aabbcc112233');
    expect(parentOverlap!.overlap_detected).toBe(true);
  });
});

// ===========================================================================
// checkRegistryForOverlaps
// ===========================================================================
describe('checkRegistryForOverlaps', () => {
  it('detects path containment — child directory of registered workspace', async () => {
    // Registry keys must be pre-normalized (matching normalizeWorkspacePath output)
    const monoPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'monorepo'));
    const registry: Record<string, string> = {
      [monoPath]: 'monorepo-aabbcc112233',
    };

    const overlaps = mod.checkRegistryForOverlaps(
      path.join(TEST_WORKSPACE_PATH, 'monorepo', 'packages', 'api'),
      registry
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].relationship).toBe('parent');
    expect(overlaps[0].existing_workspace_id).toBe('monorepo-aabbcc112233');
  });

  it('detects path containment — parent directory of registered workspace', async () => {
    const apiPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'monorepo', 'packages', 'api'));
    const registry: Record<string, string> = {
      [apiPath]: 'api-pkg-aabbcc112233',
    };

    const overlaps = mod.checkRegistryForOverlaps(
      path.join(TEST_WORKSPACE_PATH, 'monorepo'),
      registry
    );

    expect(overlaps).toHaveLength(1);
    expect(overlaps[0].relationship).toBe('child');
    expect(overlaps[0].existing_workspace_id).toBe('api-pkg-aabbcc112233');
  });

  it('ignores exact same path (not an overlap)', () => {
    const wsPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'my-workspace'));
    const registry: Record<string, string> = {
      [wsPath]: 'same-ws-aabbcc112233',
    };

    const overlaps = mod.checkRegistryForOverlaps(
      path.join(TEST_WORKSPACE_PATH, 'my-workspace'),
      registry
    );

    expect(overlaps).toHaveLength(0);
  });

  it('returns empty for non-overlapping paths', () => {
    const alphaPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'alpha'));
    const betaPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'beta'));
    const registry: Record<string, string> = {
      [alphaPath]: 'alpha-aabbcc112233',
      [betaPath]: 'beta-ddeeff445566',
    };

    const overlaps = mod.checkRegistryForOverlaps(
      path.join(TEST_WORKSPACE_PATH, 'gamma'),
      registry
    );

    expect(overlaps).toHaveLength(0);
  });

  it('detects multiple overlaps (parent + child)', () => {
    const rootPath = normalizeWorkspacePath(TEST_WORKSPACE_PATH);
    const apiPath = normalizeWorkspacePath(path.join(TEST_WORKSPACE_PATH, 'monorepo', 'packages', 'api'));
    const registry: Record<string, string> = {
      [rootPath]: 'root-aabbcc112233',
      [apiPath]: 'api-ddeeff445566',
    };

    // TEST_WORKSPACE_PATH/monorepo is INSIDE TEST_WORKSPACE_PATH (parent overlap)
    // and CONTAINS TEST_WORKSPACE_PATH/monorepo/packages/api (child overlap)
    const overlaps = mod.checkRegistryForOverlaps(
      path.join(TEST_WORKSPACE_PATH, 'monorepo'),
      registry
    );

    expect(overlaps).toHaveLength(2);

    const parentOverlap = overlaps.find(o => o.relationship === 'parent');
    const childOverlap = overlaps.find(o => o.relationship === 'child');

    expect(parentOverlap).toBeDefined();
    expect(parentOverlap!.existing_workspace_id).toBe('root-aabbcc112233');

    expect(childOverlap).toBeDefined();
    expect(childOverlap!.existing_workspace_id).toBe('api-ddeeff445566');
  });
});
// ===========================================================================
// linkWorkspaces
// ===========================================================================
describe('linkWorkspaces', () => {
  it('creates bidirectional references in workspace metas', async () => {
    const parentId   = 'parent-ws-aabbcc112233';
    const childId    = 'child-ws-ddeeff445566';
    const parentPath = path.join(TEST_WORKSPACE_PATH, 'parent');
    const childPath  = path.join(TEST_WORKSPACE_PATH, 'parent', 'child');
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(childPath,  { recursive: true });
    await createIdentityFile(childPath, childId);
    await dbCreateWorkspace({ id: parentId, path: parentPath, name: 'parent' });
    await dbCreateWorkspace({ id: childId,  path: childPath,  name: 'child' });

    await mod.linkWorkspaces(parentId, childId);

    const parentMeta = await getWorkspace(parentId);
    const childMeta  = await getWorkspace(childId);
    expect(parentMeta!.child_workspace_ids).toContain(childId);
    expect(parentMeta!.hierarchy_linked_at).toBeDefined();
    expect(childMeta!.parent_workspace_id).toBe(parentId);
    expect(childMeta!.hierarchy_linked_at).toBeDefined();
  });

  it('deduplicates child IDs on repeated link calls', async () => {
    const parentId   = 'parent-dedup-aabbcc112233';
    const childId    = 'child-dedup-ddeeff445566';
    const parentPath = path.join(TEST_WORKSPACE_PATH, 'parent-dd');
    const childPath  = path.join(TEST_WORKSPACE_PATH, 'parent-dd', 'child-dd');
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(childPath,  { recursive: true });
    await createIdentityFile(childPath, childId);
    await dbCreateWorkspace({ id: parentId, path: parentPath, name: 'parent-dd' });
    await dbCreateWorkspace({ id: childId,  path: childPath,  name: 'child-dd' });

    await mod.linkWorkspaces(parentId, childId);
    await mod.linkWorkspaces(parentId, childId);

    const parentMeta = await getWorkspace(parentId);
    expect((parentMeta!.child_workspace_ids ?? []).filter((id: string) => id === childId)).toHaveLength(1);
  });

  it('throws when parent workspace not found', async () => {
    await expect(
      mod.linkWorkspaces('nonexistent-parent-000', 'some-child-111')
    ).rejects.toThrow(/Parent workspace not found/);
  });

  it('throws when child workspace not found', async () => {
    const parentId = 'existing-parent-aabbcc112233';
    await dbCreateWorkspace({ id: parentId, path: path.join(TEST_WORKSPACE_PATH, 'p'), name: 'p' });

    await expect(
      mod.linkWorkspaces(parentId, 'nonexistent-child-000')
    ).rejects.toThrow(/Child workspace not found/);
  });
});

// ===========================================================================
// unlinkWorkspaces
// ===========================================================================
describe('unlinkWorkspaces', () => {
  it('removes references cleanly', async () => {
    const parentId   = 'unlink-parent-aabbcc112233';
    const childId    = 'unlink-child-ddeeff445566';
    const parentPath = path.join(TEST_WORKSPACE_PATH, 'unlink-parent');
    const childPath  = path.join(TEST_WORKSPACE_PATH, 'unlink-parent', 'unlink-child');
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(childPath,  { recursive: true });
    await createIdentityFile(childPath, childId);
    await dbCreateWorkspace({ id: parentId, path: parentPath, name: 'unlink-parent' });
    await dbCreateWorkspace({ id: childId,  path: childPath,  name: 'unlink-child' });

    await mod.linkWorkspaces(parentId, childId);
    await mod.unlinkWorkspaces(parentId, childId);

    const parentMeta = await getWorkspace(parentId);
    const childMeta  = await getWorkspace(childId);
    expect(parentMeta!.child_workspace_ids ?? []).not.toContain(childId);
    expect(childMeta!.parent_workspace_id).toBeUndefined();
  });

  it('clears hierarchy_linked_at when no links remain', async () => {
    const parentId   = 'unlink-clr-parent-aabb11';
    const childId    = 'unlink-clr-child-ddee22';
    const parentPath = path.join(TEST_WORKSPACE_PATH, 'unlink-clr-p');
    const childPath  = path.join(TEST_WORKSPACE_PATH, 'unlink-clr-p', 'unlink-clr-c');
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(childPath,  { recursive: true });
    await createIdentityFile(childPath, childId);
    await dbCreateWorkspace({ id: parentId, path: parentPath, name: 'unlink-clr-p' });
    await dbCreateWorkspace({ id: childId,  path: childPath,  name: 'unlink-clr-c' });

    await mod.linkWorkspaces(parentId, childId);
    await mod.unlinkWorkspaces(parentId, childId);

    const parentMeta = await getWorkspace(parentId);
    const childMeta  = await getWorkspace(childId);
    expect(parentMeta!.hierarchy_linked_at).toBeUndefined();
    expect(childMeta!.hierarchy_linked_at).toBeUndefined();
  });
});

// ===========================================================================
// getWorkspaceHierarchy
// ===========================================================================
describe('getWorkspaceHierarchy', () => {
  it('returns correct parent/children structure', async () => {
    const parentId = 'hier-parent-aabbcc112233';
    const child1Id = 'hier-child1-ddeeff445566';
    const child2Id = 'hier-child2-aabb99887766';
    const parentPath = path.join(TEST_WORKSPACE_PATH, 'hier-parent');
    const child1Path = path.join(TEST_WORKSPACE_PATH, 'hier-parent', 'child1');
    const child2Path = path.join(TEST_WORKSPACE_PATH, 'hier-parent', 'child2');
    await fs.mkdir(parentPath, { recursive: true });
    await fs.mkdir(child1Path, { recursive: true });
    await fs.mkdir(child2Path, { recursive: true });
    await createIdentityFile(child1Path, child1Id);
    await createIdentityFile(child2Path, child2Id);
    await dbCreateWorkspace({ id: parentId, path: parentPath, name: 'hier-parent' });
    await dbCreateWorkspace({ id: child1Id, path: child1Path, name: 'child1' });
    await dbCreateWorkspace({ id: child2Id, path: child2Path, name: 'child2' });

    await mod.linkWorkspaces(parentId, child1Id);
    await mod.linkWorkspaces(parentId, child2Id);

    const parentHierarchy = await mod.getWorkspaceHierarchy(parentId);
    expect(parentHierarchy.parent).toBeUndefined();
    expect(parentHierarchy.children).toHaveLength(2);
    const childIds = parentHierarchy.children.map((c: { id: string }) => c.id).sort();
    expect(childIds).toEqual([child1Id, child2Id].sort());

    const childHierarchy = await mod.getWorkspaceHierarchy(child1Id);
    expect(childHierarchy.parent).toBeDefined();
    expect(childHierarchy.parent!.id).toBe(parentId);
    expect(childHierarchy.children).toHaveLength(0);
  });

  it('returns empty children array when workspace not found', async () => {
    const hierarchy = await mod.getWorkspaceHierarchy('nonexistent-ws-000');
    expect(hierarchy.children).toEqual([]);
    expect(hierarchy.parent).toBeUndefined();
  });

  it('returns empty hierarchy for standalone workspace', async () => {
    const standaloneId   = 'standalone-ws-aabbcc112233';
    const standalonePath = path.join(TEST_WORKSPACE_PATH, 'solo');
    await fs.mkdir(standalonePath, { recursive: true });
    await dbCreateWorkspace({ id: standaloneId, path: standalonePath, name: 'solo' });

    const hierarchy = await mod.getWorkspaceHierarchy(standaloneId);
    expect(hierarchy.parent).toBeUndefined();
    expect(hierarchy.children).toHaveLength(0);
  });
});
