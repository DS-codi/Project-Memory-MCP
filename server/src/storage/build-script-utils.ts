/**
 * Build Script Utilities
 * 
 * Extracted from file-store.ts to enable proper mocking in tests.
 * ES module internal calls bypass vi.spyOn, so findBuildScript needs
 * to be in a separate module that imports from file-store.
 */

import type { BuildScript } from '../types/index.js';
import { getBuildScripts, getWorkspace, getPlanState } from './file-store.js';

/**
 * Find a build script by ID, optionally scoped to a plan.
 * Falls back to searching all plans when planId is omitted.
 */
export async function findBuildScript(
  workspaceId: string,
  scriptId: string,
  planId?: string
): Promise<BuildScript | null> {
  const scripts = await getBuildScripts(workspaceId, planId);
  const directMatch = scripts.find(script => script.id === scriptId);

  if (directMatch || planId) {
    return directMatch ?? null;
  }

  const workspace = await getWorkspace(workspaceId);
  if (!workspace) {
    return null;
  }

  const planIds = new Set<string>();
  for (const id of workspace.active_plans ?? []) {
    planIds.add(id);
  }
  for (const id of workspace.archived_plans ?? []) {
    planIds.add(id);
  }

  for (const id of planIds) {
    const plan = await getPlanState(workspaceId, id);
    const match = plan?.build_scripts?.find(script => script.id === scriptId);
    if (match) {
      return match;
    }
  }

  return null;
}
