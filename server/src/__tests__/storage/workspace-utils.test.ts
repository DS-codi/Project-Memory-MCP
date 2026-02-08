import { describe, it, expect, vi, afterEach } from 'vitest';
import path from 'path';

const originalDataRoot = process.env.MBS_DATA_ROOT;
const originalWorkspaceRoot = process.env.MBS_WORKSPACE_ROOT;

async function loadWorkspaceUtils() {
  vi.resetModules();
  return import('../../storage/workspace-utils.js');
}

afterEach(() => {
  if (originalDataRoot === undefined) {
    delete process.env.MBS_DATA_ROOT;
  } else {
    process.env.MBS_DATA_ROOT = originalDataRoot;
  }

  if (originalWorkspaceRoot === undefined) {
    delete process.env.MBS_WORKSPACE_ROOT;
  } else {
    process.env.MBS_WORKSPACE_ROOT = originalWorkspaceRoot;
  }

  vi.resetModules();
});

describe('workspace utils', () => {
  it('normalizes workspace paths consistently', async () => {
    const { normalizeWorkspacePath, getWorkspaceIdFromPath } = await loadWorkspaceUtils();
    const basePath = path.join(process.cwd(), 'Some', 'Repo');
    const variantPath = `${basePath}${path.sep}`.toUpperCase().replace(/\\/g, '/');

    const normalizedBase = normalizeWorkspacePath(basePath);
    const normalizedVariant = normalizeWorkspacePath(variantPath);

    expect(normalizedBase).toBe(normalizedVariant);

    const idA = getWorkspaceIdFromPath(basePath);
    const idB = getWorkspaceIdFromPath(variantPath);

    expect(idA).toBe(idB);
    expect(idA.startsWith('repo-')).toBe(true);
  });

  it('uses MBS_DATA_ROOT when provided', async () => {
    process.env.MBS_DATA_ROOT = path.join(process.cwd(), 'custom-data');
    const { getDataRoot } = await loadWorkspaceUtils();

    expect(getDataRoot()).toBe(path.resolve(process.env.MBS_DATA_ROOT));
  });

  it('defaults data root to workspace root data directory', async () => {
    delete process.env.MBS_DATA_ROOT;
    const { getDataRoot, resolveWorkspaceRoot } = await loadWorkspaceUtils();

    expect(getDataRoot()).toBe(path.resolve(resolveWorkspaceRoot(), 'data'));
  });
});
