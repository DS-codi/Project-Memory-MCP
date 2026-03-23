/**
 * Compatibility adapter — bridges DbRef to legacy synthetic path format.
 *
 * During the transition period (Phase 10–11), some consumers still expect
 * path-like strings for DB-backed artifacts. This module provides helpers
 * to produce those deprecated paths alongside the new `_ref` field.
 *
 * @deprecated This entire module is a transition bridge. All path-based
 * accessors will be removed in v2.0. New code must use `_ref` / `DbRef`.
 */

import { type DbRef, type ArtifactRef, isDbRef, makeDbRef } from '../types/db-ref.types.js';
import { getDataRoot } from '../storage/db-store.js';
import path from 'node:path';

// =============================================================================
// Table → path-segment mapping
// =============================================================================

const TABLE_PATH_SEGMENTS: Record<string, string> = {
  plans: 'plans',
  context_items: '',          // context items live at workspace root as <type>.json
  handoffs: 'plans',          // handoffs were stored alongside plan data
  knowledge: 'knowledge',
  workspaces: '',
  agent_sessions: 'plans',
  steps: 'plans',
};

// =============================================================================
// Deprecated path converters
// =============================================================================

/**
 * Convert a `DbRef` back to the legacy synthetic path format.
 *
 * This is a best-effort reverse mapping. The returned path is NOT a real
 * file — it's the format that the virtual-path layer intercepts and
 * redirects to SQLite.
 *
 * @deprecated Use `_ref` (DbRef) directly. Will be removed in v2.0.
 */
export function toDeprecatedPath(ref: DbRef, workspaceId?: string): string {
  const dataRoot = getDataRoot();
  const ws = workspaceId ?? 'unknown-workspace';

  switch (ref.table) {
    case 'plans':
      return path.join(dataRoot, ws, 'plans', ref.row_id, 'state.json');
    case 'context_items':
      return path.join(dataRoot, ws, 'plans', 'context', `${ref.row_id}.json`);
    case 'handoffs':
      return path.join(dataRoot, ws, 'plans', 'handoffs', `${ref.row_id}.json`);
    case 'knowledge':
      return path.join(dataRoot, ws, 'knowledge', `${ref.row_id}.json`);
    case 'workspaces':
      return path.join(dataRoot, ws, 'workspace.meta.json');
    case 'agent_sessions':
      return path.join(dataRoot, ws, 'plans', 'sessions', `${ref.row_id}.json`);
    default:
      return path.join(dataRoot, ws, ref.table, `${ref.row_id}.json`);
  }
}

/**
 * Augment a response object with a deprecated `path` field alongside `_ref`.
 *
 * Returns the same object with `path` added when `_ref` is a `DbRef`.
 * If `_ref` is a `FileRef`, the `path` from the ref is used directly.
 * If no `_ref` exists, the object is returned unchanged.
 *
 * @deprecated Provided for backward compatibility only. Will be removed in v2.0.
 */
export function withRefCompat<T extends Record<string, unknown>>(
  response: T & { _ref?: ArtifactRef },
  workspaceId?: string,
): T & { path?: string } {
  if (!response._ref) {
    return response as T & { path?: string };
  }

  if (isDbRef(response._ref)) {
    return {
      ...response,
      path: toDeprecatedPath(response._ref, workspaceId),
    };
  }

  // FileRef — path is already the real filesystem path
  return {
    ...response,
    path: response._ref.path,
  };
}
