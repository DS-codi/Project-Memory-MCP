/**
 * workspace-hierarchy.ts — Thin barrel shim.
 *
 * All implementations have been inlined into db-store.ts.
 * This file exists for backward compatibility with tests and
 * any remaining direct importers. Do not add new logic here.
 *
 * @deprecated Prefer importing from './db-store.js' directly.
 */
export type { WorkspaceHierarchyInfo } from './db-store.js';
export {
  linkWorkspaces,
  unlinkWorkspaces,
  getWorkspaceHierarchy,
  checkRegistryForOverlaps,
  scanUpForParent,
  scanDownForChildren,
  detectOverlaps,
} from './db-store.js';
