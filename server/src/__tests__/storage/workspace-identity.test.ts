import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import path from 'path';
import { promises as fs } from 'fs';

// We use dynamic imports so we can control env/mocks per test
let mod: typeof import('../../storage/workspace-identity.js');

const TEST_DATA_ROOT = path.join(process.cwd(), '__test_data_identity__');
const TEST_WORKSPACE_PATH = path.join(process.cwd(), '__test_ws__');

beforeEach(async () => {
  // Ensure clean directories
  await fs.rm(TEST_DATA_ROOT, { recursive: true, force: true });
  await fs.rm(TEST_WORKSPACE_PATH, { recursive: true, force: true });
  await fs.mkdir(TEST_DATA_ROOT, { recursive: true });
  await fs.mkdir(TEST_WORKSPACE_PATH, { recursive: true });

  // Point workspace-utils at our test data root
  process.env.MBS_DATA_ROOT = TEST_DATA_ROOT;

  vi.resetModules();
  mod = await import('../../storage/workspace-identity.js');
});

afterEach(async () => {
  delete process.env.MBS_DATA_ROOT;
  await fs.rm(TEST_DATA_ROOT, { recursive: true, force: true });
  await fs.rm(TEST_WORKSPACE_PATH, { recursive: true, force: true });
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// Helper: create a fake registered workspace in the test data root
// ---------------------------------------------------------------------------
async function createFakeWorkspace(
  workspaceId: string,
  overrides: Record<string, unknown> = {}
) {
  const wsDir = path.join(TEST_DATA_ROOT, workspaceId);
  await fs.mkdir(wsDir, { recursive: true });
  const meta = {
    workspace_id: workspaceId,
    name: 'Test',
    path: TEST_WORKSPACE_PATH,
    workspace_path: TEST_WORKSPACE_PATH,
    created_at: new Date().toISOString(),
    active_plans: [],
    archived_plans: [],
    ...overrides,
  };
  await fs.writeFile(
    path.join(wsDir, 'workspace.meta.json'),
    JSON.stringify(meta, null, 2),
    'utf-8'
  );
  return meta;
}

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

// ===========================================================================
// resolveCanonicalWorkspaceId tests
// ===========================================================================
describe('resolveCanonicalWorkspaceId', () => {
  it('returns ID from identity.json when present', async () => {
    const canonicalId = 'test-workspace-abc123def456';
    await createIdentityFile(TEST_WORKSPACE_PATH, canonicalId);

    const result = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH);
    expect(result).toBe(canonicalId);
  });

  it('falls back to hash when identity.json is missing', async () => {
    const result = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH);
    // Should return a hash-based ID (format: {foldername}-{12hex})
    expect(result).toMatch(/^[a-z0-9_-]+-[a-f0-9]{12}$/);
  });

  it('handles corrupt identity.json gracefully (falls back to hash)', async () => {
    const identityDir = path.join(TEST_WORKSPACE_PATH, '.projectmemory');
    await fs.mkdir(identityDir, { recursive: true });
    await fs.writeFile(
      path.join(identityDir, 'identity.json'),
      'NOT VALID JSON {{{',
      'utf-8'
    );

    const result = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH);
    expect(result).toMatch(/^[a-z0-9_-]+-[a-f0-9]{12}$/);
  });

  it('ignores identity.json with mismatched workspace_path', async () => {
    // Identity file says a different path — should be ignored (guards against copies)
    await createIdentityFile(TEST_WORKSPACE_PATH, 'copied-id-000000000000', {
      workspace_path: '/some/other/path',
    });

    const result = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH);
    // Should NOT return the copied-id, should fall back to hash
    expect(result).not.toBe('copied-id-000000000000');
    expect(result).toMatch(/^[a-z0-9_-]+-[a-f0-9]{12}$/);
  });

  it('normalizes path variants to the same ID', async () => {
    // No identity.json → hash-based, but different path formatting
    const id1 = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH);
    const id2 = await mod.resolveCanonicalWorkspaceId(TEST_WORKSPACE_PATH + path.sep);
    expect(id1).toBe(id2);
  });
});

// ===========================================================================
// validateWorkspaceId tests
// ===========================================================================
describe('validateWorkspaceId', () => {
  it('returns true for registered workspaces', async () => {
    await createFakeWorkspace('myproject-aabbccddeeff');
    const result = await mod.validateWorkspaceId('myproject-aabbccddeeff');
    expect(result).toBe(true);
  });

  it('returns false for unregistered IDs', async () => {
    const result = await mod.validateWorkspaceId('nonexistent-000000000000');
    expect(result).toBe(false);
  });

  it('returns false when workspace.meta.json is missing workspace_id', async () => {
    const wsDir = path.join(TEST_DATA_ROOT, 'bad-meta-aabbccddeeff');
    await fs.mkdir(wsDir, { recursive: true });
    await fs.writeFile(
      path.join(wsDir, 'workspace.meta.json'),
      JSON.stringify({ name: 'no id' }),
      'utf-8'
    );
    const result = await mod.validateWorkspaceId('bad-meta-aabbccddeeff');
    expect(result).toBe(false);
  });
});

// ===========================================================================
// isCanonicalIdFormat tests
// ===========================================================================
describe('isCanonicalIdFormat', () => {
  it('accepts valid canonical IDs', () => {
    expect(mod.isCanonicalIdFormat('myproject-aabbccddeeff')).toBe(true);
    expect(mod.isCanonicalIdFormat('my-project-aabbccddeeff')).toBe(true);
    expect(mod.isCanonicalIdFormat('project_name-123456789abc')).toBe(true);
  });

  it('rejects IDs without the 12-hex suffix', () => {
    expect(mod.isCanonicalIdFormat('myproject')).toBe(false);
    expect(mod.isCanonicalIdFormat('myproject-short')).toBe(false);
    expect(mod.isCanonicalIdFormat('')).toBe(false);
  });

  it('rejects IDs with uppercase hex', () => {
    expect(mod.isCanonicalIdFormat('myproject-AABBCCDDEEFF')).toBe(false);
  });
});

// ===========================================================================
// findCanonicalForLegacyId tests
// ===========================================================================
describe('findCanonicalForLegacyId', () => {
  it('returns the canonical ID when legacy is in legacy_workspace_ids', async () => {
    await createFakeWorkspace('canonical-aabbccddeeff', {
      legacy_workspace_ids: ['old-name', 'another-old-name'],
    });

    const result = await mod.findCanonicalForLegacyId('old-name');
    expect(result).toBe('canonical-aabbccddeeff');
  });

  it('returns the ID itself when it IS canonical', async () => {
    await createFakeWorkspace('canonical-aabbccddeeff');

    const result = await mod.findCanonicalForLegacyId('canonical-aabbccddeeff');
    expect(result).toBe('canonical-aabbccddeeff');
  });

  it('returns null when no workspace claims the legacy ID', async () => {
    await createFakeWorkspace('canonical-aabbccddeeff');

    const result = await mod.findCanonicalForLegacyId('completely-unknown');
    expect(result).toBeNull();
  });
});

// ===========================================================================
// resolveOrReject tests
// ===========================================================================
describe('resolveOrReject', () => {
  it('returns meta for directly registered workspace', async () => {
    await createFakeWorkspace('direct-aabbccddeeff');

    const result = await mod.resolveOrReject('direct-aabbccddeeff');
    expect(result.meta.workspace_id).toBe('direct-aabbccddeeff');
    expect(result.redirected_from).toBeUndefined();
  });

  it('redirects legacy IDs to canonical workspace', async () => {
    await createFakeWorkspace('canonical-aabbccddeeff', {
      legacy_workspace_ids: ['legacy-name'],
    });

    const result = await mod.resolveOrReject('legacy-name');
    expect(result.meta.workspace_id).toBe('canonical-aabbccddeeff');
    expect(result.redirected_from).toBe('legacy-name');
  });

  it('throws WorkspaceNotRegisteredError for unknown IDs', async () => {
    await expect(
      mod.resolveOrReject('unknown-000000000000')
    ).rejects.toThrow(mod.WorkspaceNotRegisteredError);
  });
});

// ===========================================================================
// scanGhostFolders tests
// ===========================================================================
describe('scanGhostFolders', () => {
  it('returns empty array when all folders are canonical', async () => {
    await createFakeWorkspace('ws1-aabbccddeeff');
    await createFakeWorkspace('ws2-112233445566');

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(0);
  });

  it('detects folders without workspace.meta.json as ghosts', async () => {
    await createFakeWorkspace('ws1-aabbccddeeff');
    // Create a ghost folder (no workspace.meta.json)
    const ghostDir = path.join(TEST_DATA_ROOT, 'ghost-folder');
    await fs.mkdir(ghostDir, { recursive: true });

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].folder_name).toBe('ghost-folder');
  });

  it('ignores system directories (events, logs)', async () => {
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'events'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'logs'), { recursive: true });

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(0);
  });

  it('matches ghosts to canonicals by legacy_workspace_ids', async () => {
    await createFakeWorkspace('canonical-aabbccddeeff', {
      legacy_workspace_ids: ['old-ghost'],
    });
    const ghostDir = path.join(TEST_DATA_ROOT, 'old-ghost');
    await fs.mkdir(ghostDir, { recursive: true });

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].likely_canonical_match).toBe('canonical-aabbccddeeff');
    expect(ghosts[0].match_reason).toContain('legacy_workspace_ids');
  });

  it('matches ghosts to canonicals by plan overlap', async () => {
    const sharedPlanId = 'plan_shared_123';
    await createFakeWorkspace('canonical-aabbccddeeff', {
      active_plans: [sharedPlanId],
    });
    // Create a plan dir in canonical
    await fs.mkdir(
      path.join(TEST_DATA_ROOT, 'canonical-aabbccddeeff', 'plans', sharedPlanId),
      { recursive: true }
    );

    // Ghost has the same plan
    const ghostDir = path.join(TEST_DATA_ROOT, 'some-ghost');
    await fs.mkdir(path.join(ghostDir, 'plans', sharedPlanId), { recursive: true });

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].likely_canonical_match).toBe('canonical-aabbccddeeff');
    expect(ghosts[0].match_reason).toContain('Plan overlap');
  });
});

// ===========================================================================
// mergeWorkspace tests
// ===========================================================================
describe('mergeWorkspace', () => {
  it('dry-run produces correct report without side effects', async () => {
    await createFakeWorkspace('target-aabbccddeeff');
    // Create source ghost with a plan
    const ghostDir = path.join(TEST_DATA_ROOT, 'source-ghost');
    const planDir = path.join(ghostDir, 'plans', 'plan_test_1');
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify({ workspace_id: 'source-ghost', title: 'Test Plan' }),
      'utf-8'
    );

    const result = await mod.mergeWorkspace('source-ghost', 'target-aabbccddeeff', true);

    expect(result.merged_plans).toContain('plan_test_1');
    expect(result.source_deleted).toBe(false);
    expect(result.notes).toContain('DRY RUN — no changes were made.');

    // Source should still exist (dry run)
    const sourceExists = await fs.access(ghostDir).then(() => true).catch(() => false);
    expect(sourceExists).toBe(true);
  });

  it('actual merge moves plans, updates IDs, deletes source', async () => {
    await createFakeWorkspace('target-aabbccddeeff');
    // Create source ghost with a plan
    const ghostDir = path.join(TEST_DATA_ROOT, 'source-ghost');
    const planDir = path.join(ghostDir, 'plans', 'plan_merge_1');
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify({ workspace_id: 'source-ghost', title: 'Merge Test' }),
      'utf-8'
    );

    const result = await mod.mergeWorkspace('source-ghost', 'target-aabbccddeeff', false);

    expect(result.merged_plans).toContain('plan_merge_1');
    expect(result.source_deleted).toBe(true);

    // Plan should now exist in target
    const movedState = JSON.parse(
      await fs.readFile(
        path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', 'plan_merge_1', 'state.json'),
        'utf-8'
      )
    );
    expect(movedState.workspace_id).toBe('target-aabbccddeeff');

    // Source should be gone
    const sourceExists = await fs.access(ghostDir).then(() => true).catch(() => false);
    expect(sourceExists).toBe(false);

    // Target meta should have legacy ID
    const targetMeta = JSON.parse(
      await fs.readFile(
        path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'workspace.meta.json'),
        'utf-8'
      )
    );
    expect(targetMeta.legacy_workspace_ids).toContain('source-ghost');
  });

  it('refuses to merge when target has no workspace.meta.json', async () => {
    // Target is also a ghost (no meta)
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'bad-target'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'source'), { recursive: true });

    const result = await mod.mergeWorkspace('source', 'bad-target', false);

    expect(result.notes.some(n => n.includes('ERROR'))).toBe(true);
    expect(result.merged_plans).toHaveLength(0);
  });

  it('skips duplicate plans during merge', async () => {
    await createFakeWorkspace('target-aabbccddeeff');
    const sharedPlanId = 'plan_dup_1';

    // Create plan in target
    await fs.mkdir(
      path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', sharedPlanId),
      { recursive: true }
    );
    await fs.writeFile(
      path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', sharedPlanId, 'state.json'),
      JSON.stringify({ workspace_id: 'target-aabbccddeeff', title: 'Original' }),
      'utf-8'
    );

    // Create same plan in source
    const ghostDir = path.join(TEST_DATA_ROOT, 'dup-source');
    await fs.mkdir(path.join(ghostDir, 'plans', sharedPlanId), { recursive: true });
    await fs.writeFile(
      path.join(ghostDir, 'plans', sharedPlanId, 'state.json'),
      JSON.stringify({ workspace_id: 'dup-source', title: 'Duplicate' }),
      'utf-8'
    );

    const result = await mod.mergeWorkspace('dup-source', 'target-aabbccddeeff', false);

    expect(result.notes.some(n => n.includes('Skipped plan'))).toBe(true);
    // Original should remain unchanged
    const original = JSON.parse(
      await fs.readFile(
        path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', sharedPlanId, 'state.json'),
        'utf-8'
      )
    );
    expect(original.title).toBe('Original');
  });

  it('refuses to delete source when plan state.json still references it', async () => {
    await createFakeWorkspace('target-aabbccddeeff');
    const planId = 'plan_ref_1';

    // Put a plan directly in target that references the source (edge case)
    await fs.mkdir(
      path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', planId),
      { recursive: true }
    );
    await fs.writeFile(
      path.join(TEST_DATA_ROOT, 'target-aabbccddeeff', 'plans', planId, 'state.json'),
      JSON.stringify({ workspace_id: 'ref-source', title: 'Still references source' }),
      'utf-8'
    );

    // Source is empty (no plans to move)
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'ref-source'), { recursive: true });

    const result = await mod.mergeWorkspace('ref-source', 'target-aabbccddeeff', false);

    // Should warn about remaining references and NOT delete
    expect(result.notes.some(n => n.includes('WARNING') && n.includes('still reference'))).toBe(true);
    expect(result.source_deleted).toBe(false);
  });
});

// ===========================================================================
// WorkspaceNotRegisteredError tests
// ===========================================================================
describe('WorkspaceNotRegisteredError', () => {
  it('includes candidate ID and suggestions in message', () => {
    const err = new mod.WorkspaceNotRegisteredError('bad-id', ['good-id-1', 'good-id-2']);
    expect(err.message).toContain('bad-id');
    expect(err.message).toContain('good-id-1');
    expect(err.message).toContain('good-id-2');
    expect(err.candidateId).toBe('bad-id');
    expect(err.suggestions).toEqual(['good-id-1', 'good-id-2']);
  });

  it('works without suggestions', () => {
    const err = new mod.WorkspaceNotRegisteredError('bad-id');
    expect(err.message).toContain('bad-id');
    expect(err.message).not.toContain('Did you mean');
  });
});

// ===========================================================================
// Regression: No ghost folders after full registration + plan lifecycle
// ===========================================================================
describe('Regression: no ghost folders after lifecycle', () => {
  it('registration + plan creation + plan archive produces zero ghosts', async () => {
    const workspaceId = 'lifecycle-test-aabbccddeeff';

    // Step 1: Create a properly registered workspace (identity.json + workspace.meta.json)
    await createIdentityFile(TEST_WORKSPACE_PATH, workspaceId);
    await createFakeWorkspace(workspaceId, {
      workspace_path: TEST_WORKSPACE_PATH,
      active_plans: ['plan_lifecycle_1'],
    });

    // Step 2: Simulate plan creation — plans sit inside the workspace data dir
    const planDir = path.join(TEST_DATA_ROOT, workspaceId, 'plans', 'plan_lifecycle_1');
    await fs.mkdir(planDir, { recursive: true });
    await fs.writeFile(
      path.join(planDir, 'state.json'),
      JSON.stringify({
        workspace_id: workspaceId,
        plan_id: 'plan_lifecycle_1',
        title: 'Lifecycle test plan',
        status: 'active',
        steps: [{ task: 'Step 1', status: 'done', phase: 'Test' }],
      }),
      'utf-8'
    );

    // Step 3: Simulate plan archive — move plan to archived_plans
    const meta = JSON.parse(
      await fs.readFile(
        path.join(TEST_DATA_ROOT, workspaceId, 'workspace.meta.json'),
        'utf-8'
      )
    );
    meta.active_plans = [];
    meta.archived_plans = ['plan_lifecycle_1'];
    await fs.writeFile(
      path.join(TEST_DATA_ROOT, workspaceId, 'workspace.meta.json'),
      JSON.stringify(meta, null, 2),
      'utf-8'
    );

    // Step 4: Simulate logs directory (created during normal operation)
    const logsDir = path.join(TEST_DATA_ROOT, workspaceId, 'plans', 'plan_lifecycle_1', 'logs');
    await fs.mkdir(logsDir, { recursive: true });
    await fs.writeFile(
      path.join(logsDir, '2026-02-09.jsonl'),
      '{"event":"step_update","timestamp":"2026-02-09T10:00:00Z"}\n',
      'utf-8'
    );

    // Also add the system dirs that should be ignored
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'events'), { recursive: true });
    await fs.mkdir(path.join(TEST_DATA_ROOT, 'logs'), { recursive: true });

    // Verify: zero ghost folders
    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(0);
  });

  it('multiple registered workspaces with no ghosts', async () => {
    // Register two workspaces properly
    await createFakeWorkspace('project-a-111111111111', {
      active_plans: ['plan_a1'],
    });
    await createFakeWorkspace('project-b-222222222222', {
      active_plans: ['plan_b1'],
    });

    // Create plan data for both
    for (const [wsId, planId] of [
      ['project-a-111111111111', 'plan_a1'],
      ['project-b-222222222222', 'plan_b1'],
    ]) {
      const planDir = path.join(TEST_DATA_ROOT, wsId, 'plans', planId);
      await fs.mkdir(planDir, { recursive: true });
      await fs.writeFile(
        path.join(planDir, 'state.json'),
        JSON.stringify({ workspace_id: wsId, plan_id: planId, title: 'Test' }),
        'utf-8'
      );
    }

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(0);
  });

  it('detects ghost folder created by rogue ensureDir alongside registered workspaces', async () => {
    // One properly registered workspace
    await createFakeWorkspace('legit-ws-aabbccddeeff', {
      active_plans: [],
    });

    // A ghost folder (no workspace.meta.json) — simulates rogue ensureDir
    const ghostDir = path.join(TEST_DATA_ROOT, 'rogue-ws-ffeeddccbbaa');
    await fs.mkdir(path.join(ghostDir, 'plans', 'plan_orphan'), { recursive: true });
    await fs.writeFile(
      path.join(ghostDir, 'plans', 'plan_orphan', 'state.json'),
      JSON.stringify({ workspace_id: 'rogue-ws-ffeeddccbbaa', plan_id: 'plan_orphan' }),
      'utf-8'
    );

    const ghosts = await mod.scanGhostFolders();
    expect(ghosts).toHaveLength(1);
    expect(ghosts[0].folder_name).toBe('rogue-ws-ffeeddccbbaa');
  });
});

// ===========================================================================
// readWorkspaceIdentityFile cross-machine tests (Phase 1)
// ===========================================================================
describe('readWorkspaceIdentityFile cross-machine acceptance', () => {
  it('returns identity when path matches', async () => {
    const canonicalId = 'my-project-abc123def456';
    await createIdentityFile(TEST_WORKSPACE_PATH, canonicalId);

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe(canonicalId);
  });

  it('returns null when path differs and no expectedWorkspaceId is given', async () => {
    // Identity file says a different path
    await createIdentityFile(TEST_WORKSPACE_PATH, 'cross-machine-id-12345', {
      workspace_path: '/mnt/remote/different-machine/project',
    });

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).toBeNull();
  });

  it('accepts identity when path differs but expectedWorkspaceId matches', async () => {
    const canonicalId = 'cross-machine-id-12345';
    // Identity file has a path from a different machine
    await createIdentityFile(TEST_WORKSPACE_PATH, canonicalId, {
      workspace_path: '/mnt/remote/different-machine/project',
    });

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH, canonicalId);
    expect(result).not.toBeNull();
    expect(result!.workspace_id).toBe(canonicalId);
    // The workspace_path in the file is different, but we still accept it
    expect(result!.workspace_path).toBe('/mnt/remote/different-machine/project');
  });

  it('returns null when path differs and expectedWorkspaceId does not match', async () => {
    await createIdentityFile(TEST_WORKSPACE_PATH, 'actual-id-99999', {
      workspace_path: '/other/machine/path',
    });

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH, 'wrong-id-00000');
    expect(result).toBeNull();
  });

  it('returns null when identity.json is missing workspace_id', async () => {
    const identityDir = path.join(TEST_WORKSPACE_PATH, '.projectmemory');
    await fs.mkdir(identityDir, { recursive: true });
    await fs.writeFile(
      path.join(identityDir, 'identity.json'),
      JSON.stringify({ workspace_path: TEST_WORKSPACE_PATH }),
      'utf-8'
    );

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).toBeNull();
  });

  it('returns null when identity.json is missing workspace_path', async () => {
    const identityDir = path.join(TEST_WORKSPACE_PATH, '.projectmemory');
    await fs.mkdir(identityDir, { recursive: true });
    await fs.writeFile(
      path.join(identityDir, 'identity.json'),
      JSON.stringify({ workspace_id: 'some-id-12345' }),
      'utf-8'
    );

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).toBeNull();
  });

  it('returns null when identity.json does not exist', async () => {
    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).toBeNull();
  });

  it('returns null when identity.json is malformed JSON', async () => {
    const identityDir = path.join(TEST_WORKSPACE_PATH, '.projectmemory');
    await fs.mkdir(identityDir, { recursive: true });
    await fs.writeFile(
      path.join(identityDir, 'identity.json'),
      '{ bad json !!',
      'utf-8'
    );

    const result = await mod.readWorkspaceIdentityFile(TEST_WORKSPACE_PATH);
    expect(result).toBeNull();
  });
});
